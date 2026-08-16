// @vitest-environment jsdom
/**
 * Tests for uploadFile.
 *
 * ENVIRONMENT: jsdom (first line above) — the module builds a real FormData
 * around a File and calls fetch; both need a DOM-flavoured global set. The
 * network itself is faked: globalThis.fetch is a vi.fn() restored in
 * afterEach, so no socket is ever opened.
 *
 * The contract under test — TWO paths behind one signature:
 * - DIRECT: POST /api/upload/sign with a `content-type: application/json`
 *   header and a JSON body { contentType, size } taken from the File; then a
 *   PUT to the returned uploadUrl whose body is the File itself and whose
 *   Content-Type header is the contentType the ROUTE returned (not file.type);
 *   resolves to the route's url (`/api/storage/<key>`) and the File's name.
 * - FALLBACK: when the sign route answers { supported: false } (MockStorage in
 *   dev), POST the file as a FormData field named exactly 'file' to /api/upload
 *   (the route validates that name; a mismatch is an unexplained 400) and
 *   build { url, name } from that response.
 * - A non-ok sign answer is a REFUSAL: it rejects with the Serbian copy for
 *   the route's error code (generic copy for anything else) after exactly ONE
 *   fetch — it never falls back, because /api/upload would only re-refuse
 *   after the whole file had crossed the server.
 * - A failed PUT likewise never retries through the server (CORS or a bad
 *   signature must not be hidden by shipping every byte twice).
 * - Rejects on a network failure at either step — never resolves a failed
 *   upload as a success.
 * - All error copy is VERBATIM from the module.
 *
 * The first six tests predate the direct path and describe the OLD multipart
 * route; since the sign probe now fires first, each of them makes that probe
 * answer { supported: false } (signUnsupported below) so it still exercises
 * the fallback path it was written for.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { uploadFile } from './upload-file';

function fakeResponse(body: unknown, ok: boolean): Response {
  return { ok, json: async () => body } as unknown as Response;
}

/** The sign route's answer when storage cannot sign — routes to the OLD path. */
function signUnsupported(): Response {
  return fakeResponse({ supported: false }, true);
}

/** A complete signed answer for the direct path; contentType is the ROUTE's word. */
function signSupported(contentType: string): Response {
  return fakeResponse(
    {
      supported: true,
      uploadUrl: 'https://r2.example/signed-put',
      url: '/api/storage/uploads/u1/123.mp4',
      contentType,
    },
    true,
  );
}

afterEach(() => {
  // stubGlobal is undone by unstubAllGlobals (restoreAllMocks would leave the
  // fake fetch on globalThis for any test that runs after this file).
  vi.unstubAllGlobals();
});

describe('uploadFile', () => {
  it('posts the file as a FormData field named "file" to /api/upload', async () => {
    // ADJUSTED for the sign probe: the first request is now /api/upload/sign —
    // answer supported:false so the multipart POST this test covers still runs.
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => fakeResponse({ url: 'https://cdn.test/a.mp4' }, true),
    );
    fetchMock.mockImplementationOnce(async () => signUnsupported());
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['x'], 'klip.mp4', { type: 'video/mp4' });
    await uploadFile(file);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/upload');
    expect(init?.method).toBe('POST');
    const body = init?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBe(file);
  });

  it('resolves with { url, name } built from the response and the File', async () => {
    // ADJUSTED for the sign probe (supported:false first — see test above).
    const fetchMock = vi.fn(async () => fakeResponse({ url: 'https://cdn.test/a.mp4' }, true));
    fetchMock.mockImplementationOnce(async () => signUnsupported());
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadFile(new File(['x'], 'snimak.mov', { type: 'video/quicktime' }));

    expect(result).toEqual({ url: 'https://cdn.test/a.mp4', name: 'snimak.mov' });
  });

  it('rejects with the server error message on a non-ok response', async () => {
    // ADJUSTED for the sign probe (supported:false first — see test above).
    const fetchMock = vi.fn(async () => fakeResponse({ error: 'Fajl je prevelik.' }, false));
    fetchMock.mockImplementationOnce(async () => signUnsupported());
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadFile(new File(['x'], 'klip.mp4'))).rejects.toThrow('Fajl je prevelik.');
  });

  it('rejects with the fallback copy when a non-ok response carries no error field', async () => {
    // ADJUSTED for the sign probe (supported:false first — see test above).
    const fetchMock = vi.fn(async () => fakeResponse({}, false));
    fetchMock.mockImplementationOnce(async () => signUnsupported());
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadFile(new File(['x'], 'klip.mp4'))).rejects.toThrow(
      'Otpremanje fajla nije uspelo.',
    );
  });

  it('rejects when the response is ok but has no url — the server never stored the file', async () => {
    // ADJUSTED for the sign probe (supported:false first — see test above).
    const fetchMock = vi.fn(async () => fakeResponse({ error: 'Nema URL-a.' }, true));
    fetchMock.mockImplementationOnce(async () => signUnsupported());
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadFile(new File(['x'], 'klip.mp4'))).rejects.toThrow('Nema URL-a.');
  });

  it('rejects when fetch itself fails (network down)', async () => {
    // Unadjusted: the very first request is now the sign probe, and it is the
    // one that throws here. The PUT-step variant lives in the direct-path
    // describe below.
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));

    await expect(uploadFile(new File(['x'], 'klip.mp4'))).rejects.toThrow('Failed to fetch');
  });
});

describe('uploadFile — sign-then-PUT (direct to storage)', () => {
  it('signs first, then PUTs the File itself with the ROUTE contentType, and returns the ROUTE url', async () => {
    // The route's contentType deliberately differs from file.type: a client
    // that sends file.type in the PUT header fails this test.
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      signSupported('video/quicktime'),
    );
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['x'], 'klip.mp4', { type: 'video/mp4' });
    const result = await uploadFile(file);

    // First request: the sign probe, JSON, carrying the File's own type and size.
    const [signUrl, signInit] = fetchMock.mock.calls[0];
    expect(signUrl).toBe('/api/upload/sign');
    expect(signInit?.method).toBe('POST');
    expect(signInit?.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(String(signInit?.body))).toEqual({ contentType: 'video/mp4', size: 1 });

    // Second request: the PUT — body is the File itself, header is what was signed.
    const [putUrl, putInit] = fetchMock.mock.calls[1];
    expect(putUrl).toBe('https://r2.example/signed-put');
    expect(putInit?.method).toBe('PUT');
    expect(putInit?.headers).toEqual({ 'Content-Type': 'video/quicktime' });
    expect(putInit?.body).toBe(file);

    // The url comes from the sign answer (`/api/storage/<key>`), the name from the File.
    expect(result).toEqual({ url: '/api/storage/uploads/u1/123.mp4', name: 'klip.mp4' });
  });

  it('makes exactly two requests — the file never also crosses /api/upload', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => signSupported('video/mp4'));
    vi.stubGlobal('fetch', fetchMock);

    await uploadFile(new File(['x'], 'klip.mp4', { type: 'video/mp4' }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/upload/sign',
      'https://r2.example/signed-put',
    ]);
  });

  it('falls back to the multipart POST when the sign route answers supported: false', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url === '/api/upload/sign'
        ? signUnsupported()
        : fakeResponse({ url: 'https://cdn.test/a.mp4' }, true),
    );
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['x'], 'klip.mp4', { type: 'video/mp4' });
    const result = await uploadFile(file);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [fallbackUrl, fallbackInit] = fetchMock.mock.calls[1];
    expect(fallbackUrl).toBe('/api/upload');
    expect(fallbackInit?.method).toBe('POST');
    expect(fallbackInit?.body).toBeInstanceOf(FormData);
    expect((fallbackInit?.body as FormData).get('file')).toBe(file);
    expect(result).toEqual({ url: 'https://cdn.test/a.mp4', name: 'klip.mp4' });
  });

  it.each([
    ['file_too_large', 'Fajl je prevelik.'],
    ['unsupported_type', 'Tip fajla nije podržan.'],
    ['rate_limited', 'Previše otpremanja u kratkom roku. Sačekaj malo.'],
  ])('a sign refusal (%s) rejects with its Serbian copy and never falls back', async (code, copy) => {
    const fetchMock = vi.fn(async () => fakeResponse({ error: code }, false));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadFile(new File(['x'], 'klip.mp4', { type: 'video/mp4' }))).rejects.toThrow(copy);
    // Exactly one request: the refusal is NOT retried through /api/upload.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('an unrecognized sign error code rejects with the generic copy', async () => {
    const fetchMock = vi.fn(async () => fakeResponse({ error: 'unauthenticated' }, false));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadFile(new File(['x'], 'klip.mp4'))).rejects.toThrow(
      'Otpremanje fajla nije uspelo.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a failed PUT rejects and does not retry through the server', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === '/api/upload/sign' ? signSupported('video/mp4') : fakeResponse({}, false),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadFile(new File(['x'], 'klip.mp4', { type: 'video/mp4' }))).rejects.toThrow(
      'Otpremanje fajla nije uspelo.',
    );
    // The sign happened and the PUT was attempted; nothing went to /api/upload.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('https://r2.example/signed-put');
  });

  it('rejects when the network throws at the PUT step (the sign step is covered above)', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === '/api/upload/sign'
        ? signSupported('video/mp4')
        : Promise.reject(new TypeError('Failed to fetch')),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadFile(new File(['x'], 'klip.mp4', { type: 'video/mp4' }))).rejects.toThrow(
      'Failed to fetch',
    );
  });
});
