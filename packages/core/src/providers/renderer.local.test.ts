import { describe, it, expect, beforeEach, vi } from 'vitest';

const { bundle, selectComposition, renderMedia, mkdtemp, readFile, rm } = vi.hoisted(() => ({
  bundle: vi.fn(),
  selectComposition: vi.fn(),
  renderMedia: vi.fn(),
  mkdtemp: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
}));
vi.mock('@remotion/bundler', () => ({ bundle }));
vi.mock('@remotion/renderer', () => ({ selectComposition, renderMedia }));
vi.mock('node:fs/promises', () => ({ mkdtemp, readFile, rm }));

import { LocalRemotionRenderer } from './renderer.local.ts';
import type { Storage } from '../interfaces.ts';

const STORAGE_URL = 'https://cdn.example.invalid/renders/x.mp4';

const videoBuffer = Buffer.from('video-bytes');

/**
 * Build a fake Storage. `upload` resolves our STORAGE_URL; `getUrl` is required
 * by the Storage interface but never called by the renderer. Both are vi.fn()s
 * so call counts and args are assertable. Typed via `satisfies Storage` so the
 * shape is validated while the Mock methods stay available to the tests.
 */
function makeStorage() {
  return {
    name: 'fake',
    upload: vi.fn().mockResolvedValue({ url: STORAGE_URL }),
    getUrl: vi.fn(),
    // Interface completeness only — the local renderer never deletes. See the
    // same note in renderer.lambda.test.ts.
    delete: vi.fn(),
  } satisfies Storage;
}

let storage: ReturnType<typeof makeStorage>;
let renderer: LocalRemotionRenderer;

beforeEach(() => {
  vi.resetAllMocks();

  bundle.mockResolvedValue('serve-url');
  selectComposition.mockResolvedValue({ id: 'comp' });
  renderMedia.mockResolvedValue(undefined);
  mkdtemp.mockResolvedValue('/tmp/adgen-render-xyz');
  readFile.mockResolvedValue(videoBuffer);
  rm.mockResolvedValue(undefined);

  storage = makeStorage();
  renderer = new LocalRemotionRenderer(storage);
});

describe('LocalRemotionRenderer.render', () => {
  it('1. ownership: videoUrl is the Storage url, storageKey is renders/<name>.mp4', async () => {
    const result = await renderer.render({ composition: 'comp', props: { a: 1 } });

    expect(result.videoUrl).toBe(STORAGE_URL);
    expect(result.storageKey).toMatch(/^renders\/comp-\d+\.mp4$/);
    // The returned link is always ours, never the local temp path.
    expect(result.videoUrl).not.toContain('/tmp/adgen-render');
    expect(result.videoUrl).not.toBe(expect.stringContaining('/tmp/adgen-render-xyz'));
  });

  it('2. selectComposition gets the serveUrl, composition id and props', async () => {
    await renderer.render({ composition: 'comp', props: { a: 1 } });

    expect(selectComposition).toHaveBeenCalledWith({
      serveUrl: 'serve-url',
      id: 'comp',
      inputProps: { a: 1 },
    });
  });

  it('3. renderMedia gets codec h264, the serveUrl, the props, and an outputLocation under the temp dir', async () => {
    await renderer.render({ composition: 'comp', props: { a: 1 } });

    const arg = renderMedia.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(arg.codec).toBe('h264');
    expect(arg.serveUrl).toBe('serve-url');
    expect(arg.inputProps).toEqual({ a: 1 });
    const outputLocation = arg.outputLocation as string;
    // Path-separator agnostic: the module builds this with path.join, so on a
    // Windows dev box the separators are backslashes while the Linux worker uses
    // forward slashes. Assert membership in the mocked temp dir by the dir NAME
    // (which carries no separator) plus the file name, not a POSIX-literal prefix.
    expect(outputLocation).toContain('adgen-render-xyz');
    expect(outputLocation).toMatch(/comp-\d+\.mp4$/);
  });

  it('4. storage.upload gets the read buffer under the right key and content type', async () => {
    await renderer.render({ composition: 'comp', props: { a: 1 } });

    expect(storage.upload).toHaveBeenCalledTimes(1);
    const [key, data, contentType] = storage.upload.mock.calls[0] as [
      string,
      Buffer,
      string,
    ];
    expect(key).toMatch(/^renders\/comp-\d+\.mp4$/);
    expect(data).toBe(videoBuffer);
    expect(contentType).toBe('video/mp4');
  });

  it('5. temp dir is cleaned up on success', async () => {
    await renderer.render({ composition: 'comp', props: { a: 1 } });

    expect(rm).toHaveBeenCalledWith('/tmp/adgen-render-xyz', {
      recursive: true,
      force: true,
    });
  });

  it('6. temp dir is cleaned up even when renderMedia THROWS', async () => {
    renderMedia.mockRejectedValue(new Error('render boom'));

    await expect(renderer.render({ composition: 'comp', props: { a: 1 } })).rejects.toThrow(
      /render boom/,
    );
    expect(rm).toHaveBeenCalledTimes(1);
    expect(rm).toHaveBeenCalledWith('/tmp/adgen-render-xyz', {
      recursive: true,
      force: true,
    });
    expect(storage.upload).not.toHaveBeenCalled();
  });
});
