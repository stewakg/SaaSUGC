/**
 * GET /api/storage/:path* — serves files written by MockStorage (local disk,
 * F4+: real Remotion renders, later mock assets too). Real R2/S3 replaces
 * this route entirely in F5; this is dev-only local serving.
 *
 * NOTE: outside production the auth/ownership checks below are bypassed — see
 * the DEV-ONLY BYPASS comment in GET() for why (headless worker/renderer have
 * no session cookie).
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
import { resolveLocalStorageDir } from '@adgen/core/storage-path';
import { createServerClient } from '@/lib/supabase/server';

const ROOT = resolveLocalStorageDir(process.env.LOCAL_STORAGE_DIR ?? './storage');

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

export async function GET(_request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await context.params;
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

  return serveFile(resolved);
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
