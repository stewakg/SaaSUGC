/**
 * Renders one matrix-ad and prints how long it took.
 *
 * `pnpm --dir apps/worker exec tsx src/bench-render.ts [speechSeconds]`
 *
 * No providers are involved — no script generation, no TTS, no credits spent —
 * so it is safe to run anywhere, including on a production box. It exists
 * because render time is the number that decides hosting size, queue
 * concurrency and whether Remotion Lambda is worth it, and it had never been
 * measured. Run it FIRST on any new machine, before sizing anything.
 *
 * Measured 2026-08-11 on a 13th-gen i7-13620H (16 logical cores, 32 GB):
 *
 *   | video | frames | render | ms/frame |
 *   |-------|--------|--------|----------|
 *   |   18s |    540 |  44.0s |     81.5 |  ← FIRST run in a fresh process
 *   |    8s |    240 |   8.5s |     35.6 |
 *   |   30s |    900 |  21.2s |     23.5 |
 *
 * The first row is not slower hardware, it is the webpack bundle plus a cold
 * font fetch. Fitting the two warm runs gives ~3.9s fixed + ~19ms per frame,
 * so a cold start costs roughly 30 SECONDS extra. That is amortised by a
 * long-lived worker and by Lambda's pre-deployed site, but it dominates any
 * "just render one video" measurement — take the second run, not the first.
 *
 * Note: `rssPeakMB` is this Node process only and reads ~350 MB. The Chromium
 * children are not counted and are where the real memory goes; do not size a
 * machine from that field.
 */
import { performance } from 'node:perf_hooks';
import {
  DEFAULT_BACKGROUND_VIDEO_URL,
  DEFAULT_MATRIX_CAPTION_STYLE,
  MATRIX_FPS,
  MATRIX_OUTRO_SECONDS,
  createProviders,
  mockWordTimestamps,
} from '@adgen/core';
import type { MatrixAdProps } from '@adgen/core';
import { LocalRemotionRenderer } from '@adgen/core/providers/renderer.local';

const SCRIPT =
  'Ovaj proizvod rešava problem koji imaš svaki dan. Pogledaj kako radi i naruči odmah uz besplatnu dostavu.';

async function bench(speechSec: number) {
  const providers = createProviders();
  const renderer = new LocalRemotionRenderer(providers.storage);

  const captionWords = mockWordTimestamps(SCRIPT, speechSec);
  const targetSec = speechSec + MATRIX_OUTRO_SECONDS;

  const props: MatrixAdProps = {
    shots: [{ url: DEFAULT_BACKGROUND_VIDEO_URL, startSec: 0, playSec: targetSec }],
    voiceUrl: '', // no audio: keeps the run free of provider calls
    captionWords,
    captionStyle: DEFAULT_MATRIX_CAPTION_STYLE,
    captionScale: 1,
    transitionIn: 'zoom-punch',
    outroText: 'Naruči odmah',
    durationInFrames: Math.round(targetSec * MATRIX_FPS),
    fps: MATRIX_FPS,
    width: 1080,
    height: 1920,
  };

  const t0 = performance.now();
  await renderer.render({ composition: 'matrix-ad', props });
  const sec = (performance.now() - t0) / 1000;

  const frames = props.durationInFrames;
  console.log(
    JSON.stringify({
      videoSeconds: targetSec,
      frames,
      renderSeconds: +sec.toFixed(1),
      secondsOfRenderPerSecondOfVideo: +(sec / targetSec).toFixed(2),
      msPerFrame: +((sec * 1000) / frames).toFixed(1),
      rssPeakMB: Math.round(process.memoryUsage().rss / 2 ** 20),
    }),
  );
}

const speech = Number(process.argv[2] ?? 15);
await bench(speech);
