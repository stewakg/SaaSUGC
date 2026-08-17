/**
 * POST /api/import-clip — downloads a user-supplied video link from a SUPPORTED
 * PLATFORM (TikTok / YouTube / Instagram — see `ALLOWED_CLIP_HOSTS`; "any direct
 * URL" was true until 2026-08-17 and is what made the redirect SSRF below
 * possible) via yt-dlp (the `youtube-dl-exec` npm
 * package, which fetches the yt-dlp binary through its postinstall), stores
 * the result through the active Storage provider under
 * `uploads/<user id>/imported-...`, and returns `{ url }` — the SAME response
 * shape as /api/upload. The Matrix wizard (L2, a separate later task) will
 * call this and append the result to its `clips` list, so a link-imported
 * clip flows into the existing montage pool with ZERO worker changes.
 *
 * Server-only, and it runs TWO gates from `@/lib/safe-url`, in this order:
 *   1. `isAllowedClipHost` — the host must be a platform we advertise. This is
 *      what closes the redirect SSRF: yt-dlp follows redirects and has no flag
 *      to forbid them, so the only durable fix is never letting an
 *      attacker-owned host be the first hop.
 *   2. `assertPublicHost` — localhost / private ranges / cloud metadata, DNS
 *      resolved. The same guard /api/scrape uses, kept as the layer beneath.
 *
 * KNOWN LIMITATION — ffmpeg-free single-file mp4 (do not solve here):
 * apps/web ships no ffmpeg, so we ask yt-dlp for a *progressive* (already
 * multiplexed) https mp4 (`b[ext=mp4][protocol=https]`), which needs no
 * separate audio/video merge. The `[protocol=https]` part also keeps yt-dlp off
 * HLS formats, which maxFilesize would otherwise steer it onto — see the inline
 * comment on `format` below (runtime-verified 2026-08-05).
 * On YouTube that caps quality at the best progressive stream (~720p) rather
 * than a merged 1080p+. Fine for montage B-roll. TikTok / Instagram serve a
 * single file natively, so this isn't a downgrade there.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { runYtDlp } from '@/lib/yt-dlp';
import { createReadStream } from 'node:fs';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProviders } from '@adgen/core';
import { createServerClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';
import { assertPublicHost, isAllowedClipHost } from '@/lib/safe-url';

/** Hard cap on an imported clip, matching /api/upload's 200MB limit. */
const MAX_IMPORT_BYTES = 200 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // Imports are heavy (a full video download, not just a fetch) — tighter than
  // /api/upload's 15/60 window.
  const rl = await rateLimit(`import:${user.id}`, 10, 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'rate_limited', retryAfterSeconds: rl.resetSeconds }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { url?: unknown };
  if (typeof body.url !== 'string') {
    return NextResponse.json({ error: 'invalid_url' }, { status: 400 });
  }
  /*
   * TWO checks, and the platform whitelist is the one that closes the real hole.
   *
   * `assertPublicHost` only ever sees the host the USER typed. yt-dlp then
   * follows redirects itself, and no yt-dlp flag forbids that or pins the
   * resolved IP — so `http://evil.example/clip` used to pass this guard (that
   * host really is public) and its 302 to `http://169.254.169.254/…` or
   * `http://127.0.0.1:6379/` was then fetched from inside the VPS. /api/scrape
   * closes the same gap with `redirect: 'manual'`, which a spawned binary
   * cannot use.
   *
   * Requiring the first host to be a platform we actually support means the
   * attacker never gets to host the redirect hop at all. The whitelist is
   * exactly what the paste box advertises (TikTok / YouTube / Instagram), so
   * nothing the UI offers stops working.
   *
   * `assertPublicHost` is KEPT behind it rather than replaced: defence in depth
   * costs one DNS lookup, and it is what still catches a supported platform's
   * hostname resolving somewhere private (a poisoned resolver, a hosts-file
   * entry on the box, or a future addition to the list that turns out to be a
   * redirector).
   */
  if (!isAllowedClipHost(body.url)) {
    return NextResponse.json({ error: 'unsupported_host' }, { status: 400 });
  }
  if (!(await assertPublicHost(body.url))) {
    return NextResponse.json({ error: 'invalid_url' }, { status: 400 });
  }

  const dir = await mkdtemp(join(tmpdir(), 'import-clip-'));
  try {
    await runYtDlp(body.url, [
      '--output',
      join(dir, 'clip.%(ext)s'),
      // `[protocol=https]` FIRST is load-bearing: without it, passing
      // --max-filesize below makes yt-dlp skip the small progressive mp4 and
      // pick a ~561MiB 1080p60 HLS stream instead (verified 2026-08-05). The
      // later alternatives stay as fallbacks for sites with no
      // https-progressive form.
      '--format',
      'b[ext=mp4][protocol=https]/b[ext=mp4]/best[ext=mp4]/best',
      '--no-playlist',
      '--max-filesize',
      '200M', // matches upload's 200MB cap
      '--no-warnings',
      '--retries',
      '2',
    ]);
    const files = await readdir(dir);
    if (files.length === 0) throw new Error('yt-dlp produced no file');
    // Backstop: yt-dlp's own --max-filesize is unreliable (it does not abort on
    // formats whose size is only approximate, e.g. HLS), so re-check on disk
    // before reading the file into memory.
    const { size } = await stat(join(dir, files[0]));
    if (size > MAX_IMPORT_BYTES) {
      return NextResponse.json({ error: 'file_too_large', maxBytes: MAX_IMPORT_BYTES }, { status: 413 });
    }
    const ext = files[0].includes('.') ? files[0].slice(files[0].lastIndexOf('.')) : '.mp4';
    const key = `uploads/${user.id}/imported-${Date.now()}${ext}`;
    const { storage } = createProviders();
    // Streamed, not buffered: this file can be 200 MB and this process has ~3.7 GB
    // shared with everything else on the box. `size` comes from the stat() check
    // above — the same number, so nothing extra is read — and storage needs it
    // because SigV4 cannot sign a body whose length it cannot measure (see
    // S3CompatibleStorage.upload).
    const { url: storedUrl } = await storage.upload(
      key,
      createReadStream(join(dir, files[0])),
      'video/mp4',
      size,
    );
    return NextResponse.json({ url: storedUrl });
  } catch (err) {
    console.error('[import-clip] download failed:', err);
    return NextResponse.json({ error: 'import_failed' }, { status: 502 });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
