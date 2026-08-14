// @vitest-environment jsdom
/**
 * Tests for uploadFile.
 *
 * ENVIRONMENT: jsdom (first line above) — the module builds a real FormData
 * around a File and calls fetch; both need a DOM-flavoured global set. The
 * network itself is faked: globalThis.fetch is a vi.fn() restored in
 * afterEach, so no socket is ever opened.
 *
 * The contract under test:
 * - POSTs to /api/upload with a FormData whose field name is exactly 'file'
 *   (the route validates that name; a mismatch is an unexplained 400).
 * - Resolves with { url, name } built from the response body and the File.
 * - Rejects on a non-ok response, a body without url, and a network failure —
 *   never resolves a failed upload as a success.
 * - The fallback error copy is VERBATIM from the module.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { uploadFile } from './upload-file';

function fakeResponse(body: unknown, ok: boolean): Response {
  return { ok, json: async () => body } as unknown as Response;
}

afterEach(() => {
  // stubGlobal is undone by unstubAllGlobals (restoreAllMocks would leave the
  // fake fetch on globalThis for any test that runs after this file).
  vi.unstubAllGlobals();
});

describe('uploadFile', () => {
  it('posts the file as a FormData field named "file" to /api/upload', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => fakeResponse({ url: 'https://cdn.test/a.mp4' }, true),
    );
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['x'], 'klip.mp4', { type: 'video/mp4' });
    await uploadFile(file);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/upload');
    expect(init?.method).toBe('POST');
    const body = init?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBe(file);
  });

  it('resolves with { url, name } built from the response and the File', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse({ url: 'https://cdn.test/a.mp4' }, true)),
    );

    const result = await uploadFile(new File(['x'], 'snimak.mov', { type: 'video/quicktime' }));

    expect(result).toEqual({ url: 'https://cdn.test/a.mp4', name: 'snimak.mov' });
  });

  it('rejects with the server error message on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse({ error: 'Fajl je prevelik.' }, false)),
    );

    await expect(uploadFile(new File(['x'], 'klip.mp4'))).rejects.toThrow('Fajl je prevelik.');
  });

  it('rejects with the fallback copy when a non-ok response carries no error field', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({}, false)));

    await expect(uploadFile(new File(['x'], 'klip.mp4'))).rejects.toThrow(
      'Otpremanje fajla nije uspelo.',
    );
  });

  it('rejects when the response is ok but has no url — the server never stored the file', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ error: 'Nema URL-a.' }, true)));

    await expect(uploadFile(new File(['x'], 'klip.mp4'))).rejects.toThrow('Nema URL-a.');
  });

  it('rejects when fetch itself fails (network down)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));

    await expect(uploadFile(new File(['x'], 'klip.mp4'))).rejects.toThrow('Failed to fetch');
  });
});
