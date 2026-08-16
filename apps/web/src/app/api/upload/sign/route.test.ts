/**
 * Unit tests for POST /api/upload/sign — the presigned-PUT half of the upload
 * intake.
 *
 * Where /api/upload takes the file itself, this route takes only a declared
 * `{ contentType, size }` and answers a PUT url the browser sends straight to
 * Storage. That makes it the CHEAP door to the same bucket, so every gate it
 * skips is a hole: the tests below pin auth, the rate-limit bucket SHARED with
 * /api/upload (`upload:<uid>`, 15/60 — not a parallel allowance), the same
 * size ceiling and MIME allowlist, the `{ supported: false }` answer for
 * storage that cannot sign (MockStorage in dev), and the key shape —
 * `uploads/<userId>/<timestamp><ext>` with the extension derived from the
 * validated MIME type (there is no filename on this route at all).
 *
 * Everything external is mocked so the route runs with no Supabase, no Redis
 * and no Storage: the Supabase server client, the rate limiter and the provider
 * factory are replaced with vi.fn()s declared through vi.hoisted (vi.mock is
 * hoisted above every import, so its factory can only see hoisted bindings —
 * same discipline as ../route.test.ts). The storage the factory returns rides
 * in a mutable holder so one test can swap in a sign-incapable one.
 *
 * The shared constants themselves are imported REAL (from
 * @/lib/upload-constraints) — the whole point is that this route enforces the
 * same numbers /api/upload does.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { getUser, rateLimitMock, signedUploadUrl, storageForRoute } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rateLimitMock: vi.fn(),
  signedUploadUrl: vi.fn(),
  // Mutable holder, billingName.value-style: the vi.mock factory below closes
  // over this object once (hoisting), but which storage it yields is decided
  // per test.
  storageForRoute: { value: {} as Record<string, unknown> },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: rateLimitMock }));
vi.mock('@adgen/core', () => ({
  createProviders: () => ({ storage: storageForRoute.value }),
}));

import { POST } from './route.ts';
import { MAX_SIZE_BYTES } from '@/lib/upload-constraints';

/** Build a POST /api/upload/sign request carrying the given JSON body. */
function sign(body: Record<string, unknown> = {}) {
  return new Request('https://app.example/api/upload/sign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  // Reset every mock's call log and implementation, then reinstall the happy
  // path so each test starts from a known-good baseline and only overrides the
  // one behaviour it cares about.
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  rateLimitMock.mockResolvedValue({ allowed: true, resetSeconds: 0 });
  storageForRoute.value = { signedUploadUrl };
  signedUploadUrl.mockResolvedValue('https://r2.example/signed-put');
});

describe('POST /api/upload/sign — auth, rate limit, and body validation', () => {
  it('1. unauthenticated ⇒ 401, nothing signed', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(sign({ contentType: 'video/mp4', size: 1024 }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthenticated' });
    expect(signedUploadUrl).not.toHaveBeenCalled();
  });

  it('2. rate limited ⇒ 429 with retryAfterSeconds, nothing signed', async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, resetSeconds: 42 });

    const res = await POST(sign({ contentType: 'video/mp4', size: 1024 }));

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate_limited', retryAfterSeconds: 42 });
    expect(signedUploadUrl).not.toHaveBeenCalled();
  });

  const BAD_SIZES: Array<[string, Record<string, unknown>]> = [
    ['missing size', { contentType: 'video/mp4' }],
    ['zero size', { contentType: 'video/mp4', size: 0 }],
    ['negative size', { contentType: 'video/mp4', size: -1024 }],
    ['non-integer size', { contentType: 'video/mp4', size: 1024.5 }],
    ['non-numeric size', { contentType: 'video/mp4', size: '1024' }],
  ];
  it.each(BAD_SIZES)('3. %s ⇒ 400 invalid_size, nothing signed', async (_label, body) => {
    const res = await POST(sign(body));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_size' });
    expect(signedUploadUrl).not.toHaveBeenCalled();
  });

  it('4. size one byte over MAX_SIZE_BYTES ⇒ 413 file_too_large, nothing signed', async () => {
    // Derived from the shared constant, not a hardcoded 200 MB: the point is
    // that this route enforces the SAME ceiling /api/upload does.
    const res = await POST(sign({ contentType: 'video/mp4', size: MAX_SIZE_BYTES + 1 }));

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'file_too_large' });
    expect(signedUploadUrl).not.toHaveBeenCalled();
  });

  const BAD_TYPES: Array<[string, Record<string, unknown>]> = [
    // Deliberately excluded from ALLOWED_TYPES: svg can carry script.
    ['image/svg+xml', { contentType: 'image/svg+xml', size: 1024 }],
    ['text/html', { contentType: 'text/html', size: 1024 }],
    ['missing contentType', { size: 1024 }],
    ['non-string contentType', { contentType: 42, size: 1024 }],
  ];
  it.each(BAD_TYPES)('5. %s ⇒ 415 unsupported_type, nothing signed', async (_label, body) => {
    const res = await POST(sign(body));

    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: 'unsupported_type' });
    expect(signedUploadUrl).not.toHaveBeenCalled();
  });
});

describe('POST /api/upload/sign — capability probe and the signed answer', () => {
  it('6. storage that cannot sign ⇒ 200 { supported: false }, nothing signed', async () => {
    // MockStorage in dev has no signedUploadUrl; the client falls back to
    // POST /api/upload, so this is an ANSWER, not an error.
    storageForRoute.value = { upload: vi.fn() };

    const res = await POST(sign({ contentType: 'video/mp4', size: 1024 }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ supported: false });
    expect(signedUploadUrl).not.toHaveBeenCalled();
  });

  it('7. happy path ⇒ supported:true, the signer url, the route-form url; key/type/size passed to the signer', async () => {
    const res = await POST(sign({ contentType: 'video/mp4', size: 1234 }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      supported: boolean;
      uploadUrl: string;
      url: string;
      contentType: string;
    };
    expect(json.supported).toBe(true);
    expect(json.uploadUrl).toBe('https://r2.example/signed-put');
    expect(json.contentType).toBe('video/mp4');
    // The url the wizard will put in job params: the same ownership-checked
    // form upload() returns, carrying the key this route signed.
    expect(json.url).toMatch(/^\/api\/storage\/uploads\/u1\/\d+\.mp4$/);
    const key = json.url.slice('/api/storage/'.length);
    expect(signedUploadUrl).toHaveBeenCalledTimes(1);
    expect(signedUploadUrl).toHaveBeenCalledWith(key, 'video/mp4', undefined, 1234);
  });

  it('8. the extension follows the MIME type, not any filename — audio/x-m4a ⇒ .m4a', async () => {
    const res = await POST(sign({ contentType: 'audio/x-m4a', size: 2048 }));

    expect(res.status).toBe(200);
    const key = signedUploadUrl.mock.calls[0][0] as string;
    expect(key).toMatch(/^uploads\/u1\/\d+\.m4a$/);
  });

  it('9. the returned url is the app route, never an absolute/bucket url', async () => {
    const res = await POST(sign({ contentType: 'video/mp4', size: 1024 }));
    const { url } = (await res.json()) as { url: string };

    expect(url.startsWith('/api/storage/')).toBe(true);
    expect(url.startsWith('http')).toBe(false);
    // And it is NOT the value the signer produced — that one is for the
    // browser's PUT only.
    expect(url).not.toBe('https://r2.example/signed-put');
  });
});
