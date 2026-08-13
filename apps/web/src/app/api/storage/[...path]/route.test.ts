/**
 * Unit tests for GET /api/storage/[...path] — the traversal guard + ownership
 * check that stand between a signed-in customer and anyone else's bytes.
 *
 * This route serves MockStorage's local files (renders/…, voice/…, uploads/…).
 * Two things keep one customer out of another customer's files:
 *  - a path-traversal guard that refuses anything resolving outside ROOT, and
 *  - in production an ownership check: a caller may read their own
 *    uploads/<their id>/… unconditionally, and any other path only when an
 *    `assets` row exists for that url (RLS scopes the lookup to their rows).
 *
 * Outside production the whole auth path is deliberately bypassed — the worker
 * and the Remotion renderer are headless processes with no session cookie, and
 * without the bypass every Matrix render 401s. Case 4 pins that bypass: if it
 * ever regresses, renders break silently.
 *
 * Everything external is mocked (readFile, resolveLocalStorageDir, the Supabase
 * server client) so the route runs with no disk, no env file and no network.
 * ROOT is computed by the route at MODULE LOAD from resolveLocalStorageDir, so
 * the mock returns a platform-native absolute path and the assertions build
 * expected paths with path.join(ROOT, …) so the suite passes on Windows and
 * Linux alike.
 *
 * The route module under test (apps/web/src/app/api/storage/[...path]/route.ts)
 * is READ-ONLY. A failing test below is a finding to report, not a reason to
 * edit the route.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';

const { getUser, maybeSingle, readFileMock, resolveDirMock, eqSpy } = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  readFileMock: vi.fn(),
  // ROOT is computed at module load; the mock must return a stable ABSOLUTE
  // path. path.resolve makes '/srv/storage' absolute on Windows (C:\srv\storage)
  // and Linux (/srv/storage) alike. The implementation closure only runs when
  // resolveDirMock() is called during route import, by which point `path` below
  // is already imported — so referencing it here is safe.
  resolveDirMock: vi.fn(() => path.resolve('/srv/storage')),
  // eqSpy records the (key, value) passed to .eq() so case 10 can assert the
  // asset lookup is keyed by the request url. It returns { maybeSingle }, set
  // up in beforeEach (maybeSingle itself is not in scope inside the hoisted
  // factory).
  eqSpy: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({ readFile: readFileMock }));
vi.mock('@adgen/core/storage-path', () => ({ resolveLocalStorageDir: resolveDirMock }));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser },
    from: (_t: string) => ({
      select: (_c: string) => ({ eq: eqSpy }),
    }),
  }),
}));

import { GET } from './route.ts';

// Same absolute root the route sees via resolveDirMock. Build expected file
// paths with path.join(ROOT, …) rather than '/' literals, so the suite is
// platform-agnostic.
const ROOT = path.resolve('/srv/storage');

/** Call GET with a given set of path segments. params is a Promise. */
function get(segments: string[]) {
  const req = new Request('https://app.example/api/storage/' + segments.join('/')) as unknown as Parameters<typeof GET>[0];
  return GET(req, { params: Promise.resolve({ path: segments }) });
}

beforeEach(() => {
  // Reset every mock's call log and implementation, then reinstall the happy
  // path so each test starts from a known-good baseline and overrides only the
  // one behaviour it cares about.
  vi.resetAllMocks();
  readFileMock.mockResolvedValue(Buffer.from('bytes'));
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  maybeSingle.mockResolvedValue({ data: null });
  eqSpy.mockReturnValue({ maybeSingle });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/storage/[...path] — the traversal guard (runs before any auth)', () => {
  it('1. ["..","..","etc","passwd"] ⇒ 400 invalid_path, nothing read', async () => {
    const res = await get(['..', '..', 'etc', 'passwd']);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_path' });
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('2. an absolute segment cannot escape (path.resolve treats it as a new root)', async () => {
    // path.resolve treats an absolute segment as a fresh root, so the resolved
    // file lands outside ROOT and must be rejected with no read.
    const res = await get([path.resolve('/etc/passwd')]);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_path' });
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('3. a legitimate nested path is allowed in dev ⇒ 200, reads the joined file', async () => {
    const res = await get(['renders', 'a', 'b.mp4']);

    expect(res.status).toBe(200);
    expect(readFileMock).toHaveBeenCalledTimes(1);
    expect(readFileMock).toHaveBeenCalledWith(path.join(ROOT, 'renders', 'a', 'b.mp4'));
  });
});

describe('GET /api/storage/[...path] — the dev bypass (no auth)', () => {
  it('4. outside production the file is served with NO authentication (getUser not called)', async () => {
    // No env stub: NODE_ENV is the test default, which !== 'production'. This
    // bypass is deliberate — the worker and renderer have no session cookie; if
    // getUser ever starts being called here every Matrix render breaks.
    const res = await get(['uploads', 'someone-else', 'x.mp4']);

    expect(res.status).toBe(200);
    expect(getUser).not.toHaveBeenCalled();
  });
});

describe('GET /api/storage/[...path] — production auth + ownership', () => {
  it('5. production + no session ⇒ 401, nothing read', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await get(['renders', 'x.mp4']);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthenticated' });
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('6. production + the caller OWN upload path is served without a DB lookup', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const res = await get(['uploads', 'u1', 'x.mp4']);

    expect(res.status).toBe(200);
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it('7. production + another user upload path ⇒ asset lookup, 404 when no row (the cross-customer guard)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    // maybeSingle defaults to { data: null } from beforeEach.

    const res = await get(['uploads', 'other', 'x.mp4']);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('8. production + a non-upload path WITH a matching asset row ⇒ 200', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    maybeSingle.mockResolvedValue({ data: { id: 'a1' } });

    const res = await get(['renders', 'job1.mp4']);

    expect(res.status).toBe(200);
  });

  it('9. production + a non-upload path with NO matching row ⇒ 404, nothing read', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    // maybeSingle defaults to { data: null }.

    const res = await get(['renders', 'nope.mp4']);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('10. the asset lookup is keyed by the request url (/api/storage/<segments>)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    maybeSingle.mockResolvedValue({ data: { id: 'a1' } });

    await get(['renders', 'job1.mp4']);

    expect(eqSpy).toHaveBeenCalledWith('url', '/api/storage/renders/job1.mp4');
  });
});

describe('GET /api/storage/[...path] — serveFile (content-type, nosniff, 404)', () => {
  it('11. Content-Type comes from the allowlist (.mp4 → video/mp4, .m4a → audio/mp4)', async () => {
    const video = await get(['renders', 'x.mp4']);
    expect(video.status).toBe(200);
    expect(video.headers.get('content-type')).toBe('video/mp4');

    // .m4a was added when nosniff landed — an allowed upload must not be served
    // as a download (the background music/SFX a Matrix ad depends on).
    const audio = await get(['uploads', 'u1', 'm.m4a']);
    expect(audio.status).toBe(200);
    expect(audio.headers.get('content-type')).toBe('audio/mp4');
  });

  it('12. an unknown extension falls back to application/octet-stream', async () => {
    const res = await get(['renders', 'x.bin']);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
  });

  it('13. X-Content-Type-Options: nosniff is present on a served file', async () => {
    const res = await get(['renders', 'x.mp4']);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('14. a read failure ⇒ 404 not_found', async () => {
    readFileMock.mockRejectedValue(new Error('ENOENT'));

    const res = await get(['renders', 'x.mp4']);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });
});
