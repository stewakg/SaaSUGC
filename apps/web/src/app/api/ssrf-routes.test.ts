/**
 * Unit tests for the two SSRF-guarded POST routes: /api/scrape and
 * /api/import-clip.
 *
 * Both routes make the SERVER fetch an arbitrary, user-supplied URL — the
 * scraper does a raw `fetch`, import-clip points the yt-dlp binary at it.
 * Either one turns a signed-in account into a request proxy for whatever the
 * caller chose, so both sit behind the SAME guard: `assertPublicHost` from
 * @/lib/safe-url (string rules PLUS a DNS resolve, so a public-looking name
 * that actually points at 127.0.0.1 / 169.254.169.254 / an RFC-1918 range is
 * rejected before any socket opens). Cases 4 and 8 pin that gate: when
 * assertPublicHost resolves false, neither the fetch NOR the yt-dlp binary is
 * ever invoked. If either guard slips, those two fail — which is the point.
 *
 * Everything external is mocked so the routes run with no Supabase, no Redis,
 * no provider keys, no yt-dlp binary and no disk: the Supabase server client,
 * the rate limiter, assertPublicHost, runYtDlp, createProviders (scraper +
 * storage) and the exact node:fs functions import-clip calls — mkdtemp /
 * readdir / stat / rm from node:fs/promises, createReadStream from node:fs —
 * are all vi.fn()s declared through
 * vi.hoisted (vi.mock is hoisted above every import, so its factory can only
 * see hoisted bindings — same discipline as jobs/route.test.ts).
 *
 * The route modules under test are READ-ONLY. A failing test below is a
 * finding to report, not a reason to edit a route.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  getUser,
  rateLimitMock,
  assertPublicHostMock,
  runYtDlpMock,
  createProvidersMock,
  scraperMock,
  storageMock,
  mkdtempMock,
  readdirMock,
  statMock,
  rmMock,
  createReadStreamMock,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  rateLimitMock: vi.fn(),
  assertPublicHostMock: vi.fn(),
  runYtDlpMock: vi.fn(),
  createProvidersMock: vi.fn(),
  scraperMock: { scrape: vi.fn() },
  storageMock: { upload: vi.fn() },
  mkdtempMock: vi.fn(),
  readdirMock: vi.fn(),
  statMock: vi.fn(),
  rmMock: vi.fn(),
  createReadStreamMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser } }),
}));

vi.mock('@/lib/rate-limit', () => ({ rateLimit: rateLimitMock }));
vi.mock('@/lib/safe-url', () => ({ assertPublicHost: assertPublicHostMock }));
vi.mock('@/lib/yt-dlp', () => ({ runYtDlp: runYtDlpMock }));
vi.mock('@adgen/core', () => ({ createProviders: createProvidersMock }));
vi.mock('node:fs/promises', () => ({
  mkdtemp: mkdtempMock,
  readdir: readdirMock,
  stat: statMock,
  rm: rmMock,
}));
// node:fs keeps its real shape (spread from importOriginal) with only
// createReadStream replaced, so anything else in the graph importing node:fs
// is unaffected — the route hands the returned stream straight to the mocked
// storage.upload, which never reads it.
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  createReadStream: createReadStreamMock,
}));

import { POST as scrapePost } from './scrape/route.ts';
import { POST as importPost } from './import-clip/route.ts';

/** Build a POST Request with a JSON body, cast to the route's parameter type. */
function scrapeReq(body: unknown) {
  return new Request('https://app.example/api/scrape', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof scrapePost>[0];
}
function importReq(body: unknown) {
  return new Request('https://app.example/api/import-clip', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof importPost>[0];
}

beforeEach(() => {
  // Reset every mock's call log and implementation, then reinstall the happy
  // path so each test starts from a known-good baseline and only overrides the
  // one behaviour it cares about.
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  rateLimitMock.mockResolvedValue({ allowed: true, resetSeconds: 0 });
  assertPublicHostMock.mockResolvedValue(true);
  scraperMock.scrape.mockResolvedValue({
    title: 'Masažer za vrat',
    price: '2.499 RSD',
    images: ['https://shop.example/i/1.jpg'],
    description: 'opis',
  });
  storageMock.upload.mockResolvedValue({ url: 'https://cdn.example/stored' });
  createProvidersMock.mockReturnValue({ scraper: scraperMock, storage: storageMock });
  runYtDlpMock.mockResolvedValue('');
  // import-clip describes ONE small downloaded mp4 sitting in the temp dir.
  mkdtempMock.mockResolvedValue('/tmp/import-clip-xyz');
  readdirMock.mockResolvedValue(['clip.mp4']);
  statMock.mockResolvedValue({ size: 1024 });
  // A stand-in stream (a plain object with a pipe function): storage.upload
  // is mocked and never reads it — the tests pin that the route passes a
  // STREAM, not a Buffer, plus stat()'s size as the 4th upload argument.
  createReadStreamMock.mockReturnValue({ pipe: () => {} });
  rmMock.mockResolvedValue(undefined);
});

describe('POST /api/scrape', () => {
  it('1. unauthenticated ⇒ 401, and the scraper is never called', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await scrapePost(scrapeReq({ url: 'https://shop.example/p/1' }));

    expect(res.status).toBe(401);
    expect(scraperMock.scrape).not.toHaveBeenCalled();
  });

  it('2. rate limited ⇒ 429 with retryAfterSeconds, scraper never called', async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, resetSeconds: 42 });

    const res = await scrapePost(scrapeReq({ url: 'https://shop.example/p/1' }));

    expect(res.status).toBe(429);
    expect((await res.json()).retryAfterSeconds).toBe(42);
    expect(scraperMock.scrape).not.toHaveBeenCalled();
  });

  it('3. a non-string url ⇒ 400 invalid_url, scraper never called', async () => {
    const res = await scrapePost(scrapeReq({ url: 42 }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_url');
    expect(scraperMock.scrape).not.toHaveBeenCalled();
  });

  it('4. assertPublicHost rejecting ⇒ 400 invalid_url (SSRF gate — the fetch NEVER runs)', async () => {
    // A public-looking host whose DNS resolves private must not reach the fetch.
    assertPublicHostMock.mockResolvedValue(false);

    const res = await scrapePost(scrapeReq({ url: 'http://internal.attacker.example/' }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_url');
    expect(scraperMock.scrape).not.toHaveBeenCalled();
  });

  it('5. happy path ⇒ 200 with the scraper result, and assertPublicHost saw the submitted url', async () => {
    const product = {
      title: 'Masažer za vrat',
      price: '2.499 RSD',
      images: ['https://shop.example/i/1.jpg'],
      description: 'opis',
    };

    const res = await scrapePost(scrapeReq({ url: 'https://shop.example/p/1' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(product);
    expect(assertPublicHostMock).toHaveBeenCalledWith('https://shop.example/p/1');
  });
});

describe('POST /api/import-clip', () => {
  it('6. unauthenticated ⇒ 401, and yt-dlp is never run', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await importPost(importReq({ url: 'https://www.tiktok.com/@u/video/1' }));

    expect(res.status).toBe(401);
    expect(runYtDlpMock).not.toHaveBeenCalled();
  });

  it('7. rate limited ⇒ 429, yt-dlp never run', async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, resetSeconds: 7 });

    const res = await importPost(importReq({ url: 'https://www.tiktok.com/@u/video/1' }));

    expect(res.status).toBe(429);
    expect(runYtDlpMock).not.toHaveBeenCalled();
  });

  it('8. assertPublicHost rejecting ⇒ 400 invalid_url (SSRF gate — yt-dlp is NEVER pointed at an internal address)', async () => {
    assertPublicHostMock.mockResolvedValue(false);

    const res = await importPost(importReq({ url: 'http://169.254.169.254/latest/meta-data/' }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_url');
    expect(runYtDlpMock).not.toHaveBeenCalled();
  });

  it('9. happy path ⇒ 200 { url }; yt-dlp called with the submitted url; storage.upload gets uploads/u1/ + video/mp4', async () => {
    const res = await importPost(importReq({ url: 'https://www.tiktok.com/@u/video/1' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://cdn.example/stored' });

    expect(runYtDlpMock).toHaveBeenCalledTimes(1);
    expect(runYtDlpMock.mock.calls[0][0]).toBe('https://www.tiktok.com/@u/video/1');

    expect(storageMock.upload).toHaveBeenCalledTimes(1);
    const [key, , contentType] = storageMock.upload.mock.calls[0];
    expect(key.startsWith('uploads/u1/')).toBe(true);
    expect(contentType).toBe('video/mp4');
  });

  it('10. oversize download ⇒ 413 file_too_large with maxBytes, and nothing is uploaded', async () => {
    // Report a size ABOVE the 200 MiB cap (a number only — no buffer allocated).
    statMock.mockResolvedValue({ size: 250 * 1024 * 1024 });

    const res = await importPost(importReq({ url: 'https://www.tiktok.com/@u/video/1' }));

    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe('file_too_large');
    expect(body.maxBytes).toBe(200 * 1024 * 1024);
    expect(storageMock.upload).not.toHaveBeenCalled();
  });

  it('11. a yt-dlp failure ⇒ 502 import_failed, nothing uploaded', async () => {
    runYtDlpMock.mockRejectedValue(new Error('exit 1'));

    const res = await importPost(importReq({ url: 'https://www.tiktok.com/@u/video/1' }));

    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('import_failed');
    expect(storageMock.upload).not.toHaveBeenCalled();
  });

  it('12. the temp directory is always cleaned up — on the success path AND on the yt-dlp failure path', async () => {
    // Success path: rm runs in the `finally`.
    const ok = await importPost(importReq({ url: 'https://www.tiktok.com/@u/video/1' }));
    expect(ok.status).toBe(200);
    expect(rmMock).toHaveBeenCalledTimes(1);
    expect(rmMock).toHaveBeenLastCalledWith(expect.any(String), { recursive: true, force: true });

    // Failure path: yt-dlp throws → 502, but the `finally` still runs rm.
    runYtDlpMock.mockRejectedValueOnce(new Error('exit 1'));
    const fail = await importPost(importReq({ url: 'https://www.tiktok.com/@u/video/1' }));
    expect(fail.status).toBe(502);
    expect(rmMock).toHaveBeenCalledTimes(2);
    expect(rmMock).toHaveBeenLastCalledWith(expect.any(String), { recursive: true, force: true });
  });

  it('13. streamed, not buffered ⇒ storage.upload receives a readable stream (pipe-able), never a Buffer', async () => {
    const res = await importPost(importReq({ url: 'https://www.tiktok.com/@u/video/1' }));

    expect(res.status).toBe(200);
    expect(createReadStreamMock).toHaveBeenCalledTimes(1);
    expect(String(createReadStreamMock.mock.calls[0][0])).toContain('clip.mp4');

    const uploaded = storageMock.upload.mock.calls[0][1];
    expect(Buffer.isBuffer(uploaded)).toBe(false);
    expect(typeof uploaded.pipe).toBe('function');
  });

  it('14. the byte length rides along ⇒ the 4th storage.upload argument is the size stat() reported, which R2 cannot sign the PUT without', async () => {
    statMock.mockResolvedValue({ size: 123456 });

    const res = await importPost(importReq({ url: 'https://www.tiktok.com/@u/video/1' }));

    expect(res.status).toBe(200);
    expect(storageMock.upload).toHaveBeenCalledTimes(1);
    expect(storageMock.upload.mock.calls[0][3]).toBe(123456);
  });

  it('15. happy path ⇒ 200 { url } and the stored key keeps the uploads/<user id>/imported- prefix', async () => {
    const res = await importPost(importReq({ url: 'https://www.tiktok.com/@u/video/1' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://cdn.example/stored' });
    expect(storageMock.upload.mock.calls[0][0].startsWith('uploads/u1/imported-')).toBe(true);
  });
});

