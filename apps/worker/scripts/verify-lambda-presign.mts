/**
 * Live verification for the Remotion Lambda render path (RELEASE_PLAN L2.3).
 *
 * WHY THIS EXISTS: `renderer.lambda.ts` is the module with the longest history
 * of being called "done" while having never executed. On 2026-08-14 it changed
 * from `privacy: 'public'` to a PRIVATE render fetched through a presigned url,
 * and that change is exactly the kind that passes every unit test and fails on
 * the first real call — a wrong object key or a bad signature is a 403 that no
 * mock can produce. So this drives the SHIPPED provider, resolved through the
 * real `createProviders()`, against real AWS and real R2.
 *
 * It is deliberately NOT a vitest test: it spends money, needs live credentials
 * and takes ~30s. Run it by hand after touching the renderer, from the repo
 * root:
 *
 *   pnpm --filter @adgen/worker exec tsx scripts/verify-lambda-presign.mts
 *
 * It lives under `apps/worker` rather than the repo-root `scripts/` for a dull
 * reason worth writing down: bare imports resolve from the FILE's location, and
 * the root has neither `tsx` nor `@adgen/core` in its node_modules. Here both
 * resolve, and `pnpm --filter` loads `apps/worker/.env` for free.
 *
 * WHAT A PASS PROVES: the render is written privately, the object key derived
 * from Remotion's `outputFile` is the real key, the presigned url is accepted
 * by S3, the bytes reach us, the file lands in OUR storage, and the url handed
 * back is ours rather than AWS's. If the presign were wrong the fetch would
 * 403 and this exits non-zero — that is the whole point.
 *
 * COST: one Lambda render of about one second of video. Fractions of a cent,
 * plus a negligible R2 write. Keep MINIMAL_PROPS short; there is no reason for
 * this to render a real ad.
 */
import { createProviders } from '@adgen/core';
import { MATRIX_FPS } from '@adgen/core/types';
import { DEFAULT_BACKGROUND_VIDEO_URL, DEFAULT_MATRIX_CAPTION_STYLE } from '@adgen/core/constants';

/** One second, one shot, two words. Enough to exercise the path, nothing more. */
const MINIMAL_PROPS = {
  shots: [{ url: DEFAULT_BACKGROUND_VIDEO_URL, startSec: 0, playSec: 1 }],
  captionWords: [
    { text: 'Provera', startSec: 0, endSec: 0.5 },
    { text: 'rendera', startSec: 0.5, endSec: 1 },
  ],
  captionStyle: DEFAULT_MATRIX_CAPTION_STYLE,
  captionScale: 1,
  transitionIn: 'zoom-punch',
  outroText: '',
  durationInFrames: MATRIX_FPS,
  fps: MATRIX_FPS,
};

function fail(message: string): never {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

const providers = createProviders();

if (providers.renderer.name !== 'remotion-lambda-renderer') {
  fail(
    `renderer resolved to "${providers.renderer.name}", not the Lambda one — ` +
      'this script proves nothing unless the real renderer is wired. Check the REMOTION_* env vars.',
  );
}
console.log(`renderer: ${providers.renderer.name}`);
console.log(`storage:  ${providers.storage.name}`);

const startedAt = Date.now();
console.log('\nrendering (private output + presigned ownership fetch)…');

const result = await providers.renderer.render({
  composition: 'matrix-ad',
  props: MINIMAL_PROPS,
});

const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`\ndone in ${seconds}s`);
console.log(`videoUrl:   ${result.videoUrl}`);
console.log(`storageKey: ${result.storageKey ?? '(none)'}`);

// 1. The url must be OURS. Returning the AWS one is the exact regression the
//    ownership transfer exists to prevent, and it looks like success.
if (/amazonaws\.com/i.test(result.videoUrl)) {
  fail(`the returned url is still AWS's: ${result.videoUrl} — ownership transfer did not happen`);
}
if (!result.storageKey) {
  fail('no storageKey came back — nothing could ever find this asset to delete it (30-day retention)');
}

// 2. The file must actually be there and be a video. A url that 404s is the
//    other way this "passes" while being broken.
const head = await fetch(result.videoUrl, { method: 'GET' });
if (!head.ok) {
  fail(`our own url did not serve the file (${head.status} ${head.statusText}): ${result.videoUrl}`);
}
const bytes = (await head.arrayBuffer()).byteLength;
const type = head.headers.get('content-type') ?? '(none)';
console.log(`fetched back: ${bytes} bytes, content-type ${type}`);

if (bytes < 1000) {
  fail(`the stored file is ${bytes} bytes — that is not a video`);
}
if (!/^video\//i.test(type)) {
  console.warn(`⚠ content-type is "${type}", expected video/* — check the storage upload headers`);
}

console.log('\n✅ private render + presigned ownership fetch verified end to end against live AWS + R2.');
