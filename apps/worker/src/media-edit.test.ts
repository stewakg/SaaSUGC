/**
 * Unit tests for the two exported seams in the worker that move a provider
 * result into OUR storage and route the two fal-backed media-edit tools:
 * `persistRemoteAsset` and `runMediaEditPipeline`.
 *
 * Both take INJECTED dependencies (a `storage` for persist, a `{ mediaEdit,
 * persist }` pair for the pipeline), so nothing here opens a socket or calls
 * fal.ai. `persistRemoteAsset` reaches for the GLOBAL `fetch`, so it is swapped
 * for a `vi.fn` per test and restored afterwards — the same pattern
 * ai.kiefal.test.ts / poll-job.test.ts already use.
 *
 * The point of this file is the invariants a credit-charging tool must hold:
 * persist never uploads when the fetch fails (a dead provider link must not be
 * saved as if it were ours), and the pipeline refuses every un-routable input
 * (no source, no key, a localhost-only file, or text removal on a video) BEFORE
 * any provider call, so the job fails honestly and is never charged.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { consoleLogger } from '@adgen/core';
import {
  persistRemoteAsset,
  PERSIST_BUFFERED_FALLBACK_CAP_BYTES,
  runMediaEditPipeline,
} from './index.ts';

// ---------------------------------------------------------------------------
// The ACTIVE provider set. resolveStorageUrl reads `providers.storage` (no
// injection seam of its own — deliberate, see §1 of its comment), and the only
// way to exercise its two shapes from THIS suite is to mock createProviders.
// `@adgen/core` is imported statically above, so the mock's factory runs before
// any module-level const — hence vi.hoisted, the same discipline as
// jobs/route.test.ts and renderer.lambda.test.ts. The storage starts in the
// MockStorage shape (cannot sign); tests that need R2 attach `signedDownloadUrl`.
// ---------------------------------------------------------------------------

const { storageStandIn, signedDownloadUrl } = vi.hoisted(() => {
  const signedDownloadUrl = vi.fn(async (key: string) => `https://signed.test/${key}?sig=1`);
  const storageStandIn: {
    name: string;
    upload: () => Promise<{ url: string }>;
    signedDownloadUrl?: (key: string) => Promise<string>;
  } = {
    name: 'test-storage',
    upload: async () => ({ url: '/api/storage/x' }),
  };
  return { storageStandIn, signedDownloadUrl };
});

vi.mock('@adgen/core', async (importActual) => {
  const actual = await importActual<typeof import('@adgen/core')>();
  return {
    ...actual,
    createProviders: () => ({
      ai: { name: 'test-ai' },
      script: { name: 'test-script' },
      voice: { name: 'test-voice' },
      renderer: { name: 'test-renderer' },
      storage: storageStandIn,
      scraper: { name: 'test-scraper' },
      mediaEdit: null,
    }),
  };
});

// ---------------------------------------------------------------------------
// Global fetch — persistRemoteAsset reads the bare global, so the suite owns it
// here. One persistent mock (reset + reinstalled in beforeEach), restored in
// afterEach so later test files in the same vitest run get the real fetch back.
// ---------------------------------------------------------------------------
const fetchMock = vi.fn();
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

/**
 * A fetch Response with a REAL web ReadableStream body. persistRemoteAsset reads
 * `res.ok`, `res.status`, `res.headers.get('content-type')` /
 * `res.headers.get('content-length')`, `res.body` (piped via
 * `Readable.fromWeb`) and — on the no-content-length buffered fallback —
 * `res.arrayBuffer()`, so the body must be a genuine web stream for the pipe
 * to succeed, and arrayBuffer() must return the same bytes the stream carries
 * — `hasBody:false` yields null to exercise the guard.
 */
function fetchResponse(opts: {
  ok?: boolean;
  status?: number;
  contentType?: string | null;
  /** Present ⇒ the response advertises exactly this content-length. */
  contentLength?: number;
  hasBody?: boolean;
  bytes?: Uint8Array;
}): Response {
  const bytes = opts.bytes ?? new Uint8Array([1, 2, 3]);
  const body =
    opts.hasBody === false
      ? null
      : new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(bytes);
            c.close();
          },
        });
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: {
      get: (h: string) => {
        const name = h.toLowerCase();
        if (name === 'content-type') return opts.contentType ?? null;
        if (name === 'content-length')
          return opts.contentLength === undefined ? null : String(opts.contentLength);
        return null;
      },
    },
    body,
    // The buffered fallback reads arrayBuffer() only when no content-length
    // was sent; it returns the same bytes the stream above would deliver.
    arrayBuffer: async () => bytes.slice().buffer,
  } as unknown as Response;
}

/** Fake Storage — only `upload` is read by persistRemoteAsset. */
function makeFakeStorage() {
  return {
    name: 'fake',
    upload: vi.fn().mockResolvedValue({ url: 'https://our.example/stored' }),
    getUrl: vi.fn(),
  };
}

/** The injected deps of runMediaEditPipeline — the 4th param has a default, so
 *  `Parameters` yields `... | undefined`; NonNullable strips that for indexing. */
type RunMediaEditDeps = NonNullable<Parameters<typeof runMediaEditPipeline>[3]>;

/**
 * The three mediaEdit methods runMediaEditPipeline actually calls, plus the
 * injected persist. FalMediaEditProvider is a CLASS with private members, so a
 * plain object is not structurally assignable to its type — the cast goes
 * through the function's own parameter type (RunMediaEditDeps above) so it
 * stays in lockstep with the source rather than naming the concrete class here.
 */
function makeDeps() {
  const mediaEdit = {
    removeTextFromImage: vi.fn().mockResolvedValue({ url: 'https://prov/rt' }),
    upscaleImage: vi.fn().mockResolvedValue({ url: 'https://prov/up' }),
    upscaleVideo: vi.fn().mockResolvedValue({ url: 'https://prov/uv' }),
  } as unknown as NonNullable<RunMediaEditDeps['mediaEdit']>;
  const persist = vi.fn().mockResolvedValue({ url: 'https://our/final', storageKey: 'enhance/final.png' });
  return { mediaEdit, persist };
}

describe('persistRemoteAsset', () => {
  it('a non-ok fetch throws and never uploads', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ ok: false, status: 502 }));
    const storage = makeFakeStorage();
    await expect(persistRemoteAsset('https://x/y', 'enhance', storage)).rejects.toThrow(
      /could not fetch provider result for enhance \(502\)/,
    );
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('an ok response with no body throws and never uploads', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ contentType: 'image/png', hasBody: false }));
    const storage = makeFakeStorage();
    await expect(persistRemoteAsset('https://x/y', 'enhance', storage)).rejects.toThrow(
      /empty response body for enhance/,
    );
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('derives the extension from the content-type and uploads (key, stream, contentType)', async () => {
    // content-length present ⇒ this stays on the STREAMED path, as the title says.
    fetchMock.mockResolvedValue(fetchResponse({ contentType: 'image/png', contentLength: 3 }));
    const storage = makeFakeStorage();
    const result = await persistRemoteAsset('https://x/y', 'enhance', storage);

    expect(result.storageKey).toMatch(/^enhance\/\d+-[a-z0-9]{6}\.png$/);
    expect(result.url).toBe('https://our.example/stored');
    expect(storage.upload).toHaveBeenCalledTimes(1);

    const [key, body, contentType] = storage.upload.mock.calls[0];
    expect(key).toBe(result.storageKey);
    expect(body).toBeDefined();
    expect(contentType).toBe('image/png');
  });

  const CONTENT_TYPE_TO_EXT: Array<[string | null, string]> = [
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/jpeg', 'jpg'],
    ['video/mp4', 'mp4'],
    ['application/octet-stream', 'bin'],
    [null, 'bin'],
  ];

  it.each(CONTENT_TYPE_TO_EXT)('content-type %s maps to extension .%s', async (contentType, ext) => {
    fetchMock.mockResolvedValue(fetchResponse({ contentType }));
    const storage = makeFakeStorage();
    const result = await persistRemoteAsset('https://x/y', 'x', storage);
    expect(result.storageKey).toMatch(new RegExp(`^x/\\d+-[a-z0-9]{6}\\.${ext}$`));
  });

  it('a response WITH content-length streams and passes the exact number through to upload', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ contentType: 'video/mp4', contentLength: 1048576 }));
    const storage = makeFakeStorage();
    const result = await persistRemoteAsset('https://x/y', 'enhance', storage);

    expect(storage.upload).toHaveBeenCalledTimes(1);
    const [key, body, contentType, contentLength] = storage.upload.mock.calls[0];
    expect(key).toBe(result.storageKey);
    expect(Buffer.isBuffer(body)).toBe(false); // streamed, not buffered
    expect(contentType).toBe('video/mp4');
    expect(contentLength).toBe(1048576); // the exact value off the header
  });

  it('a response WITHOUT content-length still uploads via the buffered fallback, and the data arrives intact', async () => {
    const bytes = new Uint8Array([9, 8, 7, 6]);
    fetchMock.mockResolvedValue(fetchResponse({ contentType: 'image/png', bytes }));
    const warn = vi.spyOn(consoleLogger, 'warn').mockImplementation(() => {});
    const storage = makeFakeStorage();
    const result = await persistRemoteAsset('https://x/y', 'enhance', storage);

    const [key, body, contentType, contentLength] = storage.upload.mock.calls[0];
    expect(key).toBe(result.storageKey);
    expect(Buffer.isBuffer(body)).toBe(true); // buffered fallback
    expect((body as Buffer).equals(Buffer.from(bytes))).toBe(true); // bytes intact
    expect(contentType).toBe('image/png');
    expect(contentLength).toBeUndefined(); // nothing to state — length was unknown
    expect(result.url).toBe('https://our.example/stored');
    // The fallback must be visible in the logs, not silently slower.
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/no content-length/), expect.anything());
  });

  it('a response without content-length that exceeds the cap throws, names the prefix, and never uploads', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null }, // no content-type, no content-length
      // A body still exists (the empty-body guard must not fire)…
      body: new ReadableStream<Uint8Array>({ start(c) { c.close(); } }),
      // …but buffering it would demand more than the 200 MB cap.
      arrayBuffer: async () => new ArrayBuffer(PERSIST_BUFFERED_FALLBACK_CAP_BYTES + 1),
    } as unknown as Response);
    vi.spyOn(consoleLogger, 'warn').mockImplementation(() => {});
    const storage = makeFakeStorage();

    await expect(persistRemoteAsset('https://x/y', 'enhance', storage)).rejects.toThrow(
      /"enhance"[\s\S]*200 MB/,
    );
    expect(storage.upload).not.toHaveBeenCalled();
  });
});

describe('runMediaEditPipeline', () => {
  it('throws missing_source when no source url is given', async () => {
    const { mediaEdit, persist } = makeDeps();
    await expect(runMediaEditPipeline('enhance', '', {}, { mediaEdit, persist })).rejects.toThrow(
      /missing_source/,
    );
  });

  it('throws provider_unavailable (and names FAL_API_KEY) when mediaEdit is null', async () => {
    const { persist } = makeDeps();
    await expect(
      runMediaEditPipeline('enhance', 'https://cdn.example.com/x.png', {}, { mediaEdit: null, persist }),
    ).rejects.toThrow(/provider_unavailable[\s\S]*FAL_API_KEY/);
  });

  it('throws source_not_public for a localhost-only source and calls nothing', async () => {
    const { mediaEdit, persist } = makeDeps();
    // A leading-slash url is resolved to http://localhost:3000/... which fal
    // cannot reach — the guard fires before any provider or persist call.
    await expect(
      runMediaEditPipeline('enhance', '/uploads/x.png', {}, { mediaEdit, persist }),
    ).rejects.toThrow(/source_not_public/);
    expect(persist).not.toHaveBeenCalled();
    expect(mediaEdit.upscaleImage).not.toHaveBeenCalled();
    expect(mediaEdit.upscaleVideo).not.toHaveBeenCalled();
    expect(mediaEdit.removeTextFromImage).not.toHaveBeenCalled();
  });

  it('throws video_not_supported for remove_text on a video', async () => {
    const { mediaEdit, persist } = makeDeps();
    await expect(
      runMediaEditPipeline('remove_text', 'https://cdn.example.com/clip.mp4', {}, { mediaEdit, persist }),
    ).rejects.toThrow(/video_not_supported/);
  });

  it('remove_text on an image calls removeTextFromImage then persist("remove-text")', async () => {
    const { mediaEdit, persist } = makeDeps();
    const result = await runMediaEditPipeline('remove_text', 'https://cdn.example.com/x.png', {}, {
      mediaEdit,
      persist,
    });

    expect(mediaEdit.removeTextFromImage).toHaveBeenCalledWith('https://cdn.example.com/x.png');
    expect(persist).toHaveBeenCalledWith('https://prov/rt', 'remove-text');
    expect(result).toEqual([{ kind: 'image', url: 'https://our/final', storageKey: 'enhance/final.png' }]);
  });

  it('enhance on an image calls upscaleImage with faceEnhancement:false and the upscaleFactor', async () => {
    const { mediaEdit, persist } = makeDeps();
    const result = await runMediaEditPipeline(
      'enhance',
      'https://cdn.example.com/x.png',
      { upscaleFactor: 4 },
      { mediaEdit, persist },
    );

    expect(mediaEdit.upscaleImage).toHaveBeenCalledWith('https://cdn.example.com/x.png', {
      upscaleFactor: 4,
      faceEnhancement: false,
    });
    expect(persist).toHaveBeenCalledWith('https://prov/up', 'enhance');
    expect(result[0].kind).toBe('image');
  });

  it('enhance on a video calls upscaleVideo and returns a kind:video asset', async () => {
    const { mediaEdit, persist } = makeDeps();
    const result = await runMediaEditPipeline('enhance', 'https://cdn.example.com/x.mp4', {}, {
      mediaEdit,
      persist,
    });

    expect(mediaEdit.upscaleVideo).toHaveBeenCalledWith('https://cdn.example.com/x.mp4', {
      upscaleFactor: undefined,
    });
    expect(persist).toHaveBeenCalledWith('https://prov/uv', 'enhance');
    expect(result).toEqual([{ kind: 'video', url: 'https://our/final', storageKey: 'enhance/final.png' }]);
  });
});

describe('runMediaEditPipeline — resolving the source url', () => {
  beforeEach(() => {
    signedDownloadUrl.mockClear();
    // Default: the MockStorage shape, exactly what this suite ran against
    // before this seam existed.
    delete storageStandIn.signedDownloadUrl;
  });

  it('signs a relative /api/storage source when the storage can (R2) and hands fal the SIGNED url', async () => {
    storageStandIn.signedDownloadUrl = signedDownloadUrl;
    const { mediaEdit, persist } = makeDeps();
    const result = await runMediaEditPipeline('enhance', '/api/storage/uploads/u1/a.png', {}, {
      mediaEdit,
      persist,
    });

    // The signer gets the BARE storage key — '/api/storage' is OUR route
    // prefix, not part of the bucket key.
    expect(signedDownloadUrl).toHaveBeenCalledWith('uploads/u1/a.png');
    // fal fetches the source itself over the public internet and has no session
    // cookie for our ownership-checked route — it must receive the signed url.
    expect(mediaEdit.upscaleImage).toHaveBeenCalledWith('https://signed.test/uploads/u1/a.png?sig=1', {
      upscaleFactor: undefined,
      faceEnhancement: false,
    });
    expect(result[0].kind).toBe('image');
  });

  it('falls back to WEB_PUBLIC_URL when the storage cannot sign (dev), where the localhost guard still fires', async () => {
    const { mediaEdit, persist } = makeDeps();
    await expect(
      runMediaEditPipeline('enhance', '/api/storage/uploads/u1/a.png', {}, { mediaEdit, persist }),
    ).rejects.toThrow(/source_not_public/);

    // Refused BEFORE any signing, provider call, or persist — the job fails
    // honestly and is never charged.
    expect(signedDownloadUrl).not.toHaveBeenCalled();
    expect(mediaEdit.upscaleImage).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });
});
