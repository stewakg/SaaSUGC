/**
 * Unit tests for POST /api/upload — the user-source-file intake door.
 *
 * Unlike /api/jobs (which renders from a scraped URL or generated script),
 * this route persists a file the customer already owns so the edit / mix /
 * translate / enhance / remove-text wizards can start from it. It is the
 * cheapest place a malicious upload can land on disk, so the gates exercised
 * here matter: auth, a tighter-than-jobs rate window, a File-type requirement,
 * the 200MB size cap, and an allow-list of MIME types.
 *
 * The storage key is built as `uploads/<userId>/<timestamp><ext>` where **ext
 * comes from EXT_BY_TYPE keyed by the VALIDATED file.type, never from the
 * filename** — `/api/storage` picks the response Content-Type by extension, so
 * letting the client filename choose it would let an upload be served as a type
 * it is not (the c25d4f7 fix). Cases 8–11 lock that guarantee down.
 *
 * Everything external is mocked so the route runs with no Supabase, no Redis
 * and no Storage: the Supabase server client, the rate limiter and the provider
 * factory are replaced with vi.fn()s declared through vi.hoisted (vi.mock is
 * hoisted above every import, so its factory can only see hoisted bindings —
 * same discipline as jobs/route.test.ts).
 *
 * The route module under test (apps/web/src/app/api/upload/route.ts) is
 * READ-ONLY. A failing test below is a finding to report, not a reason to edit
 * the route.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { getUser, rateLimitMock, uploadMock } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rateLimitMock: vi.fn(),
  uploadMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: rateLimitMock }));
vi.mock('@adgen/core', () => ({
  createProviders: () => ({ storage: { upload: uploadMock } }),
}));

import { POST } from './route.ts';

/** Build a POST request carrying a `file` form field, cast to the route's param. */
function upload(file?: File | string) {
  const fd = new FormData();
  if (file !== undefined) fd.set('file', file as never);
  return new Request('https://app.example/api/upload', {
    method: 'POST',
    body: fd,
  }) as unknown as Parameters<typeof POST>[0];
}
/** Small in-memory File of `bytes` zero-bytes with the given name + type. */
function fileOf(name: string, type: string, bytes = 3): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

beforeEach(() => {
  // Reset every mock's call log and implementation, then reinstall the happy
  // path so each test starts from a known-good baseline and only overrides the
  // one behaviour it cares about.
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  rateLimitMock.mockResolvedValue({ allowed: true, resetSeconds: 0 });
  uploadMock.mockResolvedValue({ url: 'https://cdn.example/stored' });
});

describe('POST /api/upload — auth, rate limit, and field validation', () => {
  it('1. unauthenticated ⇒ 401, nothing uploaded', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(upload(fileOf('clip.mp4', 'video/mp4')));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthenticated' });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('2. rate limited ⇒ 429 with retryAfterSeconds, nothing uploaded', async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, resetSeconds: 42 });

    const res = await POST(upload(fileOf('clip.mp4', 'video/mp4')));

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate_limited', retryAfterSeconds: 42 });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('3. no file field ⇒ 400 missing_file, nothing uploaded', async () => {
    const res = await POST(upload());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'missing_file' });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('4. a non-File value in the file field ⇒ 400 missing_file', async () => {
    const res = await POST(upload('not-a-file'));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'missing_file' });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('5. oversize ⇒ 413 file_too_large, nothing uploaded', async () => {
    // Report 200MB+1 without allocating it. NOTE: undici rebuilds the File from
    // its real bytes during Request.formData()'s multipart round-trip, which
    // would reset an overridden `size` back to the true byte count (3) and let
    // the route's MAX_SIZE_BYTES check pass — so we deliver the FormData
    // carrying the overridden File directly instead of letting it round-trip.
    const big = fileOf('big.mp4', 'video/mp4');
    Object.defineProperty(big, 'size', { value: 200 * 1024 * 1024 + 1 });
    const fd = new FormData();
    fd.set('file', big);
    const req = new Request('https://app.example/api/upload', {
      method: 'POST',
      body: fd,
    });
    (req as unknown as { formData: () => Promise<FormData> }).formData = async () => fd;

    const res = await POST(req as unknown as Parameters<typeof POST>[0]);

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'file_too_large' });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('6. disallowed type ⇒ 415 unsupported_type, nothing uploaded', async () => {
    const res = await POST(upload(fileOf('evil.html', 'text/html')));

    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: 'unsupported_type' });
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/upload — the stored object key', () => {
  it('7. happy path stores under the user prefix and returns the url', async () => {
    const res = await POST(upload(fileOf('clip.mp4', 'video/mp4')));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://cdn.example/stored' });
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [key, buffer, type] = uploadMock.mock.calls[0];
    expect(key).toMatch(/^uploads\/u1\/\d+\.mp4$/);
    expect(type).toBe('video/mp4');
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  it('8. extension comes from the VALIDATED type, never the filename', async () => {
    // A PNG that CLAIMS to be clip.mp4 by name must be stored as .png — the fix
    // from c25d4f7: the filename must not choose how the file is later served.
    const res = await POST(upload(fileOf('clip.mp4', 'image/png')));

    expect(res.status).toBe(200);
    const key = uploadMock.mock.calls[0][0] as string;
    expect(key.endsWith('.png')).toBe(true);
    expect(key.endsWith('.mp4')).toBe(false);
  });

  it('9. a filename with extra path segments cannot shape the key', async () => {
    const res = await POST(upload(fileOf('a.mp4/nested/evil', 'video/mp4')));

    expect(res.status).toBe(200);
    const key = uploadMock.mock.calls[0][0] as string;
    // Timestamp + type-derived ext only: no extra slashes beyond the user prefix.
    expect(key).toMatch(/^uploads\/u1\/\d+\.mp4$/);
  });

  it('10. a filename with no extension still gets one from the type', async () => {
    const res = await POST(upload(fileOf('noext', 'audio/mpeg')));

    expect(res.status).toBe(200);
    const key = uploadMock.mock.calls[0][0] as string;
    expect(key.endsWith('.mp3')).toBe(true);
  });

  // Every allowed MIME type must map to exactly one canonical extension. None
  // of these may 415, and the key's suffix must match EXT_BY_TYPE each time.
  const TYPE_EXT: Array<[string, string]> = [
    ['video/mp4', '.mp4'],
    ['video/quicktime', '.mov'],
    ['video/webm', '.webm'],
    ['image/png', '.png'],
    ['image/jpeg', '.jpg'],
    ['image/webp', '.webp'],
    ['audio/mpeg', '.mp3'],
    ['audio/wav', '.wav'],
    ['audio/x-wav', '.wav'],
    ['audio/ogg', '.ogg'],
    ['audio/mp4', '.m4a'],
    ['audio/x-m4a', '.m4a'],
  ];
  it.each(TYPE_EXT)('11. allowed type %s → key ends %s (never 415)', async (type, ext) => {
    const res = await POST(upload(fileOf('blob', type)));

    expect(res.status).toBe(200);
    const key = uploadMock.mock.calls[0][0] as string;
    expect(key.endsWith(ext)).toBe(true);
  });

  it('12. the key is namespaced per user', async () => {
    // One customer's upload must never land under another's prefix.
    getUser.mockResolvedValue({ data: { user: { id: 'other-user' } } });

    const res = await POST(upload(fileOf('clip.mp4', 'video/mp4')));

    expect(res.status).toBe(200);
    const key = uploadMock.mock.calls[0][0] as string;
    expect(key.startsWith('uploads/other-user/')).toBe(true);
  });
});
