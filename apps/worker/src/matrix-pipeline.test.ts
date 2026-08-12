/**
 * Tests for `runMatrixPipeline` — the matrix/revoice job pipeline, and the one
 * code path in this repo where a bug spends a customer's credits.
 *
 * It had no coverage at all until now, for a concrete reason: the renderer was
 * a module-level `new LocalRemotionRenderer(...)`, so calling the function meant
 * a real Remotion bundle, a real Chromium and real ffmpeg. `opts.renderer` is
 * the seam that made this file possible; the two `vi.mock` calls below close the
 * remaining ones (the provider set and the scene-detect binaries).
 *
 * What is deliberately NOT mocked: `approvedScripts`, `mockWordTimestamps`,
 * `buildMontage`, `toMatrixAspect` and the prop assembly. Those are the logic
 * under test — mocking them would leave a suite that asserts only that mocks
 * were called.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Renderer } from '@adgen/core';

/** Deterministic stand-ins for the provider set built at module load. */
const voiceTts = vi.fn(async ({ script }: { script: string }) => ({
  audioUrl: `/api/storage/voice/${encodeURIComponent(script.slice(0, 8))}.mp3`,
  // No `words`: this is the MockVoiceProvider case, which makes the pipeline
  // fall back to mockWordTimestamps — the branch worth exercising, because a
  // caption track that drifts from the audio is invisible until a customer sees it.
  durationSec: 12,
}));
const generateVariants = vi.fn(async () => {
  throw new Error('generateVariants must not be called when approved scripts are supplied');
});

vi.mock('@adgen/core', async (importActual) => {
  const actual = await importActual<typeof import('@adgen/core')>();
  return {
    ...actual,
    createProviders: () => ({
      ai: { name: 'test-ai' },
      script: { name: 'test-script', generateVariants },
      voice: {
        name: 'test-voice',
        tts: voiceTts,
        listVoices: async () => [{ id: 'voice-1', name: 'Voice One' }],
      },
      renderer: { name: 'test-renderer' },
      storage: { name: 'test-storage', upload: async () => ({ url: '/api/storage/x' }) },
      scraper: { name: 'test-scraper' },
      mediaEdit: null,
    }),
  };
});

// Scene detection shells out to ffmpeg and downloads the clip first. Mocked so
// the "did the revoice path skip it?" assertion is possible at all.
const downloadClip = vi.fn(async () => '/tmp/fake-clip.mp4');
const detectShots = vi.fn(() => [{ startSec: 0, playSec: 2 }]);
vi.mock('./scene-detect.ts', () => ({ downloadClip, detectShots }));

const { runMatrixPipeline } = await import('./index.ts');

/** A renderer that records what it was asked to draw. */
function recordingRenderer(overrides: { storageKey?: string } = {}): Renderer & {
  calls: { composition: string; props: Record<string, unknown> }[];
} {
  const calls: { composition: string; props: Record<string, unknown> }[] = [];
  return {
    name: 'recording-renderer',
    calls,
    async render(input) {
      calls.push(input);
      return { videoUrl: `https://example.test/out-${calls.length}.mp4`, ...overrides };
    },
  };
}

/** Two approved scripts, so the script provider is never reached. */
const SCRIPTS = [
  { angle: 'problem', script: 'Prvi tekst reklame.', estDurationSec: 12 },
  { angle: 'dokaz', script: 'Drugi tekst reklame.', estDurationSec: 14 },
];

beforeEach(() => {
  voiceTts.mockClear();
  generateVariants.mockClear();
  downloadClip.mockClear();
  detectShots.mockClear();
});

describe('runMatrixPipeline — variant count', () => {
  it('produces one video asset per approved script, capped by count', async () => {
    const renderer = recordingRenderer({ storageKey: 'renders/x.mp4' });
    const assets = await runMatrixPipeline({ scripts: SCRIPTS, count: 1 }, { renderer });

    expect(assets).toHaveLength(1);
    expect(assets[0].kind).toBe('video');
    expect(renderer.calls).toHaveLength(1);
  });

  it('renders every approved script when count allows it', async () => {
    const renderer = recordingRenderer({ storageKey: 'renders/x.mp4' });
    const assets = await runMatrixPipeline({ scripts: SCRIPTS, count: 5 }, { renderer });

    // count is a ceiling, not a target — two approved scripts means two videos,
    // which is exactly the bug fixed in cb3bcfb on the pricing side.
    expect(assets).toHaveLength(2);
    expect(voiceTts).toHaveBeenCalledTimes(2);
  });

  it('never calls the script provider when the user already approved scripts', async () => {
    const renderer = recordingRenderer();
    await runMatrixPipeline({ scripts: SCRIPTS, count: 2 }, { renderer });

    // Regenerating here would discard the text the user chose AND bill them for
    // a second generation they never asked for.
    expect(generateVariants).not.toHaveBeenCalled();
  });
});

describe('runMatrixPipeline — storageKey is never fabricated', () => {
  it('records the key the renderer returned', async () => {
    const renderer = recordingRenderer({ storageKey: 'renders/real-key.mp4' });
    const [asset] = await runMatrixPipeline({ scripts: [SCRIPTS[0]], count: 1 }, { renderer });

    expect(asset.storageKey).toBe('renders/real-key.mp4');
  });

  it('stores null — not undefined, not an invented key — when the renderer has none', async () => {
    const renderer = recordingRenderer(); // no storageKey
    const [asset] = await runMatrixPipeline({ scripts: [SCRIPTS[0]], count: 1 }, { renderer });

    expect(asset.storageKey).toBeNull();
    expect(asset.url).toBe('https://example.test/out-1.mp4');
  });
});

describe('runMatrixPipeline — montage flag is the whole revoice difference', () => {
  it('scene-detects the sources when montage is on', async () => {
    const renderer = recordingRenderer();
    await runMatrixPipeline(
      { scripts: [SCRIPTS[0]], count: 1, sourceVideoUrls: ['https://cdn.test/a.mp4'] },
      { renderer },
    );

    expect(downloadClip).toHaveBeenCalledTimes(1);
    expect(detectShots).toHaveBeenCalledTimes(1);
  });

  it('skips scene detection entirely on the revoice path', async () => {
    const renderer = recordingRenderer();
    await runMatrixPipeline(
      { scripts: [SCRIPTS[0]], count: 1, sourceVideoUrls: ['https://cdn.test/a.mp4'] },
      { renderer, montage: false },
    );

    expect(downloadClip).not.toHaveBeenCalled();
    expect(detectShots).not.toHaveBeenCalled();

    // The clip still plays — kept whole for the full duration, which is the
    // competitor's actual product.
    const shots = renderer.calls[0].props.shots as { url: string }[];
    expect(shots).toHaveLength(1);
    expect(shots[0].url).toBe('https://cdn.test/a.mp4');
  });
});

describe('runMatrixPipeline — output shape', () => {
  it.each([
    ['9:16', 1080, 1920],
    ['1:1', 1080, 1080],
    ['16:9', 1920, 1080],
  ])('renders %s at %ix%i', async (aspect, width, height) => {
    const renderer = recordingRenderer();
    await runMatrixPipeline({ scripts: [SCRIPTS[0]], count: 1, aspect }, { renderer });

    expect(renderer.calls[0].props.width).toBe(width);
    expect(renderer.calls[0].props.height).toBe(height);
  });

  it.each([[undefined], ['21:9'], [42], [null]])(
    'falls back to 9:16 for the unrecognised aspect %s',
    async (aspect) => {
      const renderer = recordingRenderer();
      await runMatrixPipeline({ scripts: [SCRIPTS[0]], count: 1, aspect }, { renderer });

      // A job enqueued before aspect existed must still render as it always did.
      expect(renderer.calls[0].props.width).toBe(1080);
      expect(renderer.calls[0].props.height).toBe(1920);
    },
  );
});

describe('runMatrixPipeline — the captions match the audio', () => {
  it('sends the same script to TTS that the caption track spells out', async () => {
    const renderer = recordingRenderer();
    await runMatrixPipeline({ scripts: [SCRIPTS[0]], count: 1 }, { renderer });

    expect(voiceTts).toHaveBeenCalledTimes(1);
    expect(voiceTts.mock.calls[0][0].script).toBe('Prvi tekst reklame.');

    const props = renderer.calls[0].props as {
      captionWords: { text: string }[];
      voiceUrl: string;
    };
    // Captions drifting from the audio is invisible in a test that only checks
    // that a render happened, and obvious to the first customer who watches.
    expect(props.captionWords.map((w) => w.text).join(' ')).toBe('Prvi tekst reklame.');
    expect(props.voiceUrl).toContain('/api/storage/voice/');
  });

  it('asks for the matrix-ad composition and absolutizes the voice url', async () => {
    const renderer = recordingRenderer();
    await runMatrixPipeline({ scripts: [SCRIPTS[0]], count: 1 }, { renderer });

    expect(renderer.calls[0].composition).toBe('matrix-ad');
    // MockStorage hands back a RELATIVE path and Remotion's <Audio> only mounts
    // on an absolute src — a relative one renders MUTE with no error at all.
    expect(renderer.calls[0].props.voiceUrl as string).toMatch(/^https?:\/\//);
  });
});

describe('runMatrixPipeline — an empty result is a FAILURE, not a success', () => {
  it('returns no assets when the script provider offers no variants', async () => {
    // Reachable in production: the model answers with an empty array, the
    // variant loop never runs, and every later step succeeds. The job handler
    // now treats this as a failure — before that it charged zero and marked the
    // job "Gotovo" with no video attached and no error to explain it.
    // No approved scripts, and the model answers with an empty list.
    generateVariants.mockResolvedValueOnce({ variants: [] } as never);

    const renderer = recordingRenderer();
    const assets = await runMatrixPipeline({ count: 3 }, { renderer, montage: false });

    expect(assets).toEqual([]);
    expect(renderer.calls).toHaveLength(0);
    expect(voiceTts).not.toHaveBeenCalled();
  });
});
