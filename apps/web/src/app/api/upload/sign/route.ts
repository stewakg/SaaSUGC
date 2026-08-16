/**
 * POST /api/upload/sign — hand the browser a presigned PUT url so a customer's
 * file goes straight to R2 instead of through this process.
 *
 * `/api/upload` buffers the whole file in memory (200 MB ceiling) on a 2 vCPU /
 * 3 GB box: every large upload is memory pressure and bandwidth on a server
 * that is only relaying bytes. This route validates exactly what that one
 * validates — auth, the same rate-limit bucket, the same MIME allowlist, the
 * same size ceiling — and then signs a url instead of accepting a body.
 *
 * The validation must stay identical, because this route is now the cheaper way
 * to reach the same bucket: anything it lets through that `/api/upload` would
 * refuse is a hole, not a shortcut.
 *
 * Storage that cannot sign (MockStorage in dev) answers `{ supported: false }`
 * rather than an error, and the client falls back to `/api/upload`. That keeps
 * `pnpm dev` working with no R2 account.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createProviders } from '@adgen/core';
import { createServerClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';
import { ALLOWED_TYPES, EXT_BY_TYPE, MAX_SIZE_BYTES } from '@/lib/upload-constraints';

// Same numbers and the SAME `upload:` key prefix as /api/upload — deliberately
// the same Redis bucket, not a parallel one: signing a direct PUT and posting
// through /api/upload are two spellings of the same allowance, and separate
// buckets would hand every user double.
const RATE_LIMIT = { max: 15, windowSeconds: 60 };

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

  const body = (await request.json().catch(() => ({}))) as {
    contentType?: unknown;
    size?: unknown;
  };

  if (typeof body.size !== 'number' || !Number.isInteger(body.size) || body.size <= 0) {
    return NextResponse.json({ error: 'invalid_size' }, { status: 400 });
  }
  if (body.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 });
  }
  if (typeof body.contentType !== 'string' || !ALLOWED_TYPES.has(body.contentType)) {
    return NextResponse.json({ error: 'unsupported_type' }, { status: 415 });
  }

  const { storage } = createProviders();
  // The Storage interface has no signing member — MockStorage (dev) cannot
  // sign, S3CompatibleStorage (R2/S3) adds it. Probe rather than assume.
  const signable = storage as {
    signedUploadUrl?: (
      key: string,
      contentType: string,
      ttlSeconds?: number,
      contentLength?: number,
    ) => Promise<string>;
  };
  if (typeof signable.signedUploadUrl !== 'function') {
    return NextResponse.json({ supported: false });
  }

  const key = `uploads/${user.id}/${Date.now()}${EXT_BY_TYPE[body.contentType] ?? ''}`;
  const uploadUrl = await signable.signedUploadUrl(key, body.contentType, undefined, body.size);

  return NextResponse.json({
    supported: true,
    uploadUrl,
    url: `/api/storage/${key}`,
    contentType: body.contentType,
  });
}
