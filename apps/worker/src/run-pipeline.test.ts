/**
 * Unit tests for runPipeline — tool dispatch + the mock-renderer money guard
 * (see cline-prompt-runpipeline.md).
 *
 * runPipeline is injected with fakes (ai, renderer, persist, runMatrix,
 * runMediaEdit) so nothing real runs. The module under test is READ-ONLY here —
 * a failing test is a finding to report, never a reason to edit index.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { runPipeline } from './index.ts';

type Deps = NonNullable<Parameters<typeof runPipeline>[2]>;

/**
 * Build plain-object fakes for every injected dep. `ai` and `renderer` are
 * class-typed (private members), so the whole object is cast
 * `as unknown as Deps` at the call site rather than naming the concrete classes.
 */
function makeDeps(
  over: Partial<{ generated: { url: string; storageKey?: string }; rendererName: string }> = {},
) {
  const ai = {
    generateImage: vi.fn().mockResolvedValue(over.generated ?? { url: 'https://prov/img' }),
  };
  const renderer = {
    name: over.rendererName ?? 'mock-renderer',
    render: vi.fn().mockResolvedValue({ videoUrl: 'https://our/vid', storageKey: 'renders/v.mp4' }),
  };
  const persist = vi.fn().mockResolvedValue({ url: 'https://our/img', storageKey: 'image-ads/x.png' });
  const runMatrix = vi.fn().mockResolvedValue([{ kind: 'video', url: 'https://our/m', storageKey: 'm' }]);
  const runMediaEdit = vi.fn().mockResolvedValue([{ kind: 'image', url: 'https://our/e', storageKey: 'e' }]);
  return { ai, renderer, persist, runMatrix, runMediaEdit };
}

describe('image_ads', () => {
  it('loops count times, asking for 1080x1080 each time, and tags every asset as an image', async () => {
    const deps = makeDeps();
    const result = await runPipeline('image_ads', { count: 2 }, deps as unknown as Deps);

    expect(deps.ai.generateImage).toHaveBeenCalledTimes(2);
    for (const [arg] of deps.ai.generateImage.mock.calls) {
      expect(arg).toMatchObject({ size: '1080x1080' });
      expect(typeof arg.prompt).toBe('string');
    }
    expect(result).toHaveLength(2);
    expect(result.every((a) => a.kind === 'image')).toBe(true);
  });

  it('keeps the provider storageKey and never calls persist when the provider already owns the asset', async () => {
    const deps = makeDeps({ generated: { url: 'https://prov/img', storageKey: 'ai/owned.png' } });
    const result = await runPipeline('image_ads', { count: 1 }, deps as unknown as Deps);

    expect(deps.persist).not.toHaveBeenCalled();
    expect(result).toEqual([{ kind: 'image', url: 'https://prov/img', storageKey: 'ai/owned.png' }]);
  });

  it('copies a provider-hosted URL into our storage when no storageKey is set', async () => {
    const deps = makeDeps({ generated: { url: 'https://prov/img' } });
    const result = await runPipeline('image_ads', { count: 1 }, deps as unknown as Deps);

    expect(deps.persist).toHaveBeenCalledWith('https://prov/img', 'image-ads');
    expect(result).toEqual([
      { kind: 'image', url: 'https://our/img', storageKey: 'image-ads/x.png' },
    ]);
  });

  it('defaults count to 1 when count is missing, zero, or negative', async () => {
    for (const params of [{}, { count: 0 }, { count: -3 }]) {
      const deps = makeDeps();
      await runPipeline('image_ads', params, deps as unknown as Deps);
      expect(deps.ai.generateImage).toHaveBeenCalledTimes(1);
    }
  });
});

describe('routing — matrix / revoice / media-edit', () => {
  it('matrix delegates to runMatrix with only the params (no opts)', async () => {
    const deps = makeDeps();
    const result = await runPipeline('matrix', { a: 1 }, deps as unknown as Deps);

    expect(deps.runMatrix).toHaveBeenCalledWith({ a: 1 });
    expect(deps.runMatrix.mock.calls[0]).toHaveLength(1);
    expect(result).toEqual([{ kind: 'video', url: 'https://our/m', storageKey: 'm' }]);
  });

  it('revoice delegates to runMatrix with montage disabled', async () => {
    const deps = makeDeps();
    await runPipeline('revoice', { a: 1 }, deps as unknown as Deps);

    expect(deps.runMatrix).toHaveBeenCalledWith({ a: 1 }, { montage: false });
  });

  it('enhance delegates to runMediaEdit with the type, resolved sourceUrl and the full params', async () => {
    const deps = makeDeps();
    const params = { sourceUrl: 'https://cdn/x.png', b: 2 };
    const result = await runPipeline('enhance', params, deps as unknown as Deps);

    expect(deps.runMediaEdit).toHaveBeenCalledWith('enhance', 'https://cdn/x.png', {
      sourceUrl: 'https://cdn/x.png',
      b: 2,
    });
    expect(result).toEqual([{ kind: 'image', url: 'https://our/e', storageKey: 'e' }]);
  });

  it('remove_text likewise, and a missing sourceUrl becomes the empty string', async () => {
    const deps = makeDeps();
    await runPipeline('remove_text', {}, deps as unknown as Deps);

    expect(deps.runMediaEdit).toHaveBeenCalledWith('remove_text', '', {});
  });
});

describe('unknown tools + the mock-renderer money guard', () => {
  it('throws tool_not_implemented naming the tool and never renders when the renderer is the mock', async () => {
    const deps = makeDeps({ rendererName: 'mock-renderer' });
    const err = await runPipeline('quick_test', {}, deps as unknown as Deps).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/tool_not_implemented/);
    expect((err as Error).message).toMatch(/quick_test/);
    expect(deps.renderer.render).not.toHaveBeenCalled();
  });

  it('renders and returns a video asset when the renderer is real', async () => {
    const deps = makeDeps({ rendererName: 'remotion-lambda-renderer' });
    const result = await runPipeline('quick_test', { p: 1 }, deps as unknown as Deps);

    expect(deps.renderer.render).toHaveBeenCalledWith({
      composition: 'quick_test',
      props: { p: 1 },
    });
    expect(result).toEqual([
      { kind: 'video', url: 'https://our/vid', storageKey: 'renders/v.mp4' },
    ]);
  });

  it('falls back to a null storageKey when the renderer omits it', async () => {
    const deps = makeDeps({ rendererName: 'remotion-lambda-renderer' });
    deps.renderer.render.mockResolvedValueOnce({ videoUrl: 'https://our/vid' });

    const result = await runPipeline('quick_test', {}, deps as unknown as Deps);

    expect(result).toEqual([{ kind: 'video', url: 'https://our/vid', storageKey: null }]);
  });
});


