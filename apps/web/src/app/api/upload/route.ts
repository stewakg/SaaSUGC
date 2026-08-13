/**
 * POST /api/upload — persist a user-uploaded source file for tools that
 * transform an existing asset (edit, mix, translate, enhance, remove_text —
 * unlike ai-slike/matrix, these start from a file the user already has, not
 * a scraped URL or a generated script). Auth required. Stored under the
 * active Storage provider (local disk in dev, R2/S3 once configured) under
 * `uploads/<user id>/...`; returns a URL the wizard passes through as a job
 * param when it enqueues.
 *
 * Not tracked in `assets` — that table is for JOB OUTPUTS (assets.job_id is
 * NOT NULL, and no job exists yet at upload time). See the `uploads/<uid>/`
 * fast-path in /api/storage/[...path] for how this stays servable locally
 * without an assets row.
 *
 * DEPLOYMENT CAVEAT (not fixed here — flagging so it isn't hit by surprise):
 * Next.js App Router route handlers have no equivalent of the old Pages API
 * `bodyParser.sizeLimit` — a route's own size check (MAX_SIZE_BYTES below)
 * only runs if the request body reaches the handler at all. On Vercel
 * specifically, Serverless Functions have a platform-level request body
 * limit (historically ~4.5MB) that sits in front of this code and isn't
 * configurable from here — a real video upload would 413 there well before
 * MAX_SIZE_BYTES is ever checked. This route works as written on a
 * self-hosted Node server (no such limit), which matches this project's
 * current plan (worker → Hetzner; web → Vercel is still TODO per
 * INFRASTRUCTURE.md F6). If web ends up on Vercel, the real fix is a
 * presigned-URL upload straight from the browser to Storage (bypassing this
 * route for the file bytes entirely) — not something to retrofit blind here.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createProviders } from '@adgen/core';
import { createServerClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';

const MAX_SIZE_BYTES = 200 * 1024 * 1024; // 200MB
// Uploads are unbilled (unlike /api/jobs, no credit check gates this) —
// tighter window than jobs so someone can't fill storage for free.
const RATE_LIMIT = { max: 15, windowSeconds: 60 };
const ALLOWED_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'image/png',
  'image/jpeg',
  'image/webp',
  // Audio: background music / CTA sound effects the user supplies for a Matrix ad.
  // `audio/mp4` and `audio/x-m4a` are both seen for .m4a depending on the browser.
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
]);

/**
 * Canonical extension per allowed MIME type. The stored key's extension is
 * derived from the type we validated, never from the client-supplied filename —
 * `/api/storage` picks the response Content-Type by extension, so letting the
 * filename choose it would let an upload be served as a type it is not.
 *
 * Keep this in lockstep with ALLOWED_TYPES above (every allowed type has exactly
 * one extension here) AND with CONTENT_TYPES in `/api/storage/[...path]`, which
 * must be able to serve every extension this can produce.
 */
const EXT_BY_TYPE: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
};

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const rl = await rateLimit(`upload:${user.id}`, RATE_LIMIT.max, RATE_LIMIT.windowSeconds);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'rate_limited', retryAfterSeconds: rl.resetSeconds }, { status: 429 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'missing_file' }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'unsupported_type' }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = EXT_BY_TYPE[file.type] ?? '';
  const key = `uploads/${user.id}/${Date.now()}${ext}`;

  const { storage } = createProviders();
  const { url } = await storage.upload(key, buffer, file.type);

  return NextResponse.json({ url });
}
