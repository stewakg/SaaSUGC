/**
 * GET /api/storage/:path* — serves what the active storage holds:
 *  - MockStorage (local disk, dev): reads the file and streams it (F4+: real
 *    Remotion renders, later mock assets too).
 *  - R2/S3 (real): authorises the caller, then 302-redirects to a short-lived
 *    signed url — the bytes go straight from the bucket to the browser.
 *
 * NOTE: outside production the auth/ownership checks below are bypassed on the
 * local-file branch only — see the DEV-ONLY BYPASS comment in GET() for why
 * (headless worker/renderer have no session cookie). The signing branch
 * authorises in every environment.
 *
 * Requires auth + ownership. Two cases:
 *  - Job OUTPUTS (renders/…, voice/…, etc.): the path must match the `url`
 *    of an `assets` row the caller can see (RLS scopes that to their own
 *    rows) — a bare path-traversal guard isn't enough, since storage keys
 *    are otherwise guessable (sequential suffixes like image-1.png) and
 *    would let any caller fetch anyone else's generated assets.
 *  - User UPLOADS (uploads/<user id>/…, from /api/upload — edit/mix/
 *    translate/enhance/remove_text start from a file, not a job output):
 *    these have no `assets` row (assets.job_id is NOT NULL and no job
 *    exists yet at upload time), so ownership is proven by the user id
 *    embedded in the path instead.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createProviders } from '@adgen/core';
import { resolveLocalStorageDir } from '@adgen/core/storage-path';
import { createServerClient } from '@/lib/supabase/server';

const ROOT = resolveLocalStorageDir(process.env.LOCAL_STORAGE_DIR ?? './storage');

/**
 * The active storage, memoised: `createProviders()` builds an S3 client, and
 * doing that per request would open a fresh connection pool every time.
 *
 * A provider that can sign urls (R2/S3) means the bytes are NOT on this disk —
 * this route then authorises the caller and redirects to a short-lived signed
 * url instead of reading a file that does not exist here.
 */
let signer: { signedDownloadUrl(key: string, ttl?: number): Promise<string> } | null | undefined;
function getSigner() {
  if (signer === undefined) {
    const { storage } = createProviders();
    const candidate = storage as unknown as { signedDownloadUrl?: unknown };
    signer =
      typeof candidate.signedDownloadUrl === 'function'
        ? (storage as unknown as { signedDownloadUrl(key: string, ttl?: number): Promise<string> })
        : null;
  }
  return signer;
}

/**
 * Response Content-Type per extension. This MUST cover every extension
 * `/api/upload`'s EXT_BY_TYPE can produce, or a legitimately uploaded file is
 * served as `application/octet-stream` — and now that the response also carries
 * `X-Content-Type-Options: nosniff`, the browser will not rescue it by sniffing.
 * That would silently break exactly the uploads a Matrix ad needs: .m4a/.ogg
 * background music and SFX. Keep the two lists in lockstep.
 */
const CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
};

/**
 * A storage key is a flat, literal object name — never a filesystem path. These
 * four shapes are the ones that mean something OTHER than themselves to anything
 * that normalises paths, so they are refused rather than passed on.
 *
 * This is defence in depth, not a live exploit today: R2 and S3 treat keys as
 * literal strings, so `uploads/<id>/../../renders/x` is a key that simply does
 * not exist rather than a path to someone else's render. It is refused anyway,
 * because `authorise()`'s upload branch only inspects the first two segments —
 * so the ownership decision is made on a prefix while the SIGNED key is the
 * whole string, and the only thing keeping those two in agreement is a storage
 * backend's behaviour we do not control.
 */
function hasUnsafeSegment(segments: string[]): boolean {
  return segments.some(
    (s) => s === '' || s === '.' || s === '..' || s.includes('\\') || s.includes('\0'),
  );
}

export async function GET(_request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await context.params;
  const key = segments.join('/');
  const signedStorage = getSigner();

  if (!signedStorage) {
    const resolved = path.resolve(ROOT, ...segments);

    // Path-traversal guard: the resolved file must stay inside ROOT.
    if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
      return NextResponse.json({ error: 'invalid_path' }, { status: 400 });
    }

    // DEV-ONLY BYPASS — do not remove the NODE_ENV condition.
    // The worker and the Remotion renderer are separate headless processes with
    // no Supabase session cookie; without this they get 401 here and every
    // Matrix render hard-fails (runtime-verified 2026-08-05). This route only
    // ever serves MockStorage's local files, which is a dev-only provider — in
    // production S3CompatibleStorage serves assets from its own public base url
    // and this route is not reached at all.
    if (process.env.NODE_ENV !== 'production') {
      return serveFile(resolved);
    }

    const denied = await authorise(segments);
    if (denied) return denied;
    return serveFile(resolved);
  }

  // Real storage: the caller is authorised the same way regardless of
  // NODE_ENV. The dev bypass above exists for the headless worker reading
  // MockStorage's local files; with R2 the worker signs keys itself and never
  // arrives here, so there is nothing to bypass and every caller is a browser.
  const denied = await authorise(segments);
  if (denied) return denied;

  // Checked AFTER authorise on purpose. Doing it first would answer an
  // UNAUTHENTICATED traversal probe with 400 instead of 401, which leaks that
  // the route exists — and it would also break the deploy check recorded in
  // TODO.md, where a traversal payload returning 401 rather than
  // 400 invalid_path is the discriminator proving the signing branch is live
  // and not the local-disk one.
  if (hasUnsafeSegment(segments)) {
    return NextResponse.json({ error: 'invalid_path' }, { status: 400 });
  }

  // A redirect, not a proxy: the bytes go straight from R2 to the customer
  // instead of through this process, and the url stops working within the hour.
  const url = await signedStorage.signedDownloadUrl(key);
  return NextResponse.redirect(url, 302);
}

/** Returns a response when the caller may NOT have this key, or null when they may. */
async function authorise(segments: string[]): Promise<NextResponse | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const isOwnUpload = segments[0] === 'uploads' && segments[1] === user.id;
  if (!isOwnUpload) {
    // RLS ("assets_select_own") scopes this to the caller's own rows, so a
    // path belonging to another user's asset simply comes back empty.
    const requestedUrl = `/api/storage/${segments.join('/')}`;
    const { data: asset } = await supabase.from('assets').select('id').eq('url', requestedUrl).maybeSingle();
    if (!asset) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
  }
  return null;
}

/** Reads the resolved local file and returns it with a guessed content type. */
async function serveFile(resolved: string) {
  try {
    const data = await readFile(resolved);
    const contentType = CONTENT_TYPES[path.extname(resolved).toLowerCase()] ?? 'application/octet-stream';
    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        // The type comes from a small allowlist and falls back to
        // application/octet-stream; nosniff stops a browser overriding that by
        // sniffing the bytes, which is what would turn an unexpected upload
        // into rendered content on our own origin.
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}
