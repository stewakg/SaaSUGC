/**
 * POST /api/import-clip — downloads a user-supplied video link (TikTok /
 * YouTube / Instagram / any direct URL) via yt-dlp (the `youtube-dl-exec` npm
 * package, which fetches the yt-dlp binary through its postinstall), stores
 * the result through the active Storage provider under
 * `uploads/<user id>/imported-...`, and returns `{ url }` — the SAME response
 * shape as /api/upload. The Matrix wizard (L2, a separate later task) will
 * call this and append the result to its `clips` list, so a link-imported
 * clip flows into the existing montage pool with ZERO worker changes.
 *
 * Server-only: yt-dlp fetches an arbitrary user URL, so it runs the shared SSRF
 * guard (`@/lib/safe-url` — localhost / private ranges / the cloud metadata
 * address), the same guard /api/scrape uses.
 *
 * KNOWN LIMITATION — ffmpeg-free single-file mp4 (do not solve here):
 * apps/web ships no ffmpeg, so we ask yt-dlp for a *progressive* (already
 * multiplexed) mp4 (`b[ext=mp4]`), which needs no separate audio/video merge.
 * On YouTube that caps quality at the best progressive stream (~720p) rather
 * than a merged 1080p+. Fine for montage B-roll. TikTok / Instagram serve a
 * single file natively, so this isn't a downgrade there.
 */
import { NextResponse, type NextRequest } from 'next/server';
import youtubedl from 'youtube-dl-exec';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProviders } from '@adgen/core';
import { createServerClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';
import { isSafeTargetUrl } from '@/lib/safe-url';

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
  if (typeof body.url !== 'string' || !isSafeTargetUrl(body.url)) {
    return NextResponse.json({ error: 'invalid_url' }, { status: 400 });
  }

  const dir = await mkdtemp(join(tmpdir(), 'import-clip-'));
  try {
    await youtubedl(body.url, {
      output: join(dir, 'clip.%(ext)s'),
      format: 'b[ext=mp4]/best[ext=mp4]/best',
      noPlaylist: true,
      maxFilesize: '200M', // matches upload's 200MB cap
      noWarnings: true,
      retries: 2,
    });
    const files = await readdir(dir);
    if (files.length === 0) throw new Error('yt-dlp produced no file');
    const buffer = await readFile(join(dir, files[0]));
    const ext = files[0].includes('.') ? files[0].slice(files[0].lastIndexOf('.')) : '.mp4';
    const key = `uploads/${user.id}/imported-${Date.now()}${ext}`;
    const { storage } = createProviders();
    const { url: storedUrl } = await storage.upload(key, buffer, 'video/mp4');
    return NextResponse.json({ url: storedUrl });
  } catch (err) {
    console.error('[import-clip] download failed:', err);
    return NextResponse.json({ error: 'import_failed' }, { status: 502 });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
