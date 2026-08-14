/**
 * Live verification for the WHOLE matrix chain: script → TTS → captions →
 * (optional) scene-detect montage → Lambda render → R2 → a url we own.
 *
 * WHY THIS EXISTS: `verify-lambda-presign.mts` proves the render step. Nothing
 * proved the chain. Every link has unit tests with fakes, and the pieces have
 * each been exercised individually at some point, but "OpenRouter writes a
 * Serbian script, ElevenLabs reads it, the words line up as captions, ffmpeg
 * cuts the clip, Lambda renders it and the mp4 ends up in our bucket" has only
 * ever happened by the owner clicking through the wizard. That is not something
 * a test suite can claim on its behalf.
 *
 * It drives the SHIPPED `runMatrixPipeline` — the same function the worker's
 * job processor calls — so a change to the real pipeline changes what this
 * measures. Nothing here is a copy of production logic.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: no database, no BullMQ, no credits. The
 * job state machine (charge on success, refund on failure, rollback) has real
 * coverage in `processor.test.ts` against a fake DB, and driving it here would
 * mean fabricating a user and a balance in the live Supabase — the exact
 * "cleanup on production data" move this project has a scar from. This script
 * covers the half that fakes cannot: the providers.
 *
 * COSTS REAL MONEY — one OpenRouter completion, one ElevenLabs synthesis, one
 * Lambda render. Tens of cents. Run it deliberately, not in a loop:
 *
 *   pnpm --filter @adgen/worker exec tsx scripts/verify-full-pipeline.mts
 *   pnpm --filter @adgen/worker exec tsx scripts/verify-full-pipeline.mts --no-montage
 *
 * `--no-montage` takes the `revoice` path: same chain minus scene detection,
 * which is faster and cheaper when all you want is a smoke test.
 */
import { runMatrixPipeline } from '../src/index.ts';
import { createProviders } from '@adgen/core';
import { DEFAULT_BACKGROUND_VIDEO_URL } from '@adgen/core/constants';

const montage = !process.argv.includes('--no-montage');

function fail(message: string): never {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

// Refuse to "pass" against mocks. A green run that proved nothing is worse than
// a red one, and this is the failure mode the whole script exists to avoid.
const providers = createProviders();
const modes = {
  script: providers.script.name,
  voice: providers.voice.name,
  renderer: providers.renderer.name,
  storage: providers.storage.name,
};
console.log('provider modes:', modes);
const mocked = Object.entries(modes).filter(([, name]) => name.startsWith('mock'));
if (mocked.length > 0) {
  fail(`these resolved to mocks: ${mocked.map(([k]) => k).join(', ')} — this run would prove nothing`);
}

console.log(`\nmode: ${montage ? 'matrix (scene-detect montage ON)' : 'revoice (montage OFF)'}`);
console.log('running the real pipeline — script, voice, captions, render, upload…\n');

const startedAt = Date.now();
const assets = await runMatrixPipeline(
  {
    count: 1,
    language: 'sr',
    targetSeconds: 10, // the shortest length the wizard offers
    sourceVideoUrls: [DEFAULT_BACKGROUND_VIDEO_URL],
    productTitle: 'Bežične slušalice',
    price: '3990 RSD',
    description: 'Bluetooth 5.3, 30h baterije, punjenje u kutiji.',
    offerNotes: 'Besplatna dostava, plaćanje pouzećem.',
    tone: 'energetic',
  },
  { montage },
);

const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`\ndone in ${seconds}s — ${assets.length} asset(s)`);

if (assets.length !== 1) {
  fail(`expected exactly 1 asset for count: 1, got ${assets.length}`);
}

const [asset] = assets;
console.log(JSON.stringify(asset, null, 2));

// 1. The url must be ours. An AWS or fal url here means the ownership transfer
//    silently did not happen, which looks exactly like success.
if (/amazonaws\.com|fal\.(media|run)/i.test(asset.url)) {
  fail(`the asset url is not ours: ${asset.url}`);
}
// 2. Without a storageKey nothing can ever find this file to delete it, which
//    is what the Terms' 30-day retention depends on.
if (!asset.storageKey) {
  fail('asset has no storageKey — retention could never reach this file');
}

// 3. It has to actually be a video, served, of plausible size.
const res = await fetch(asset.url);
if (!res.ok) {
  fail(`our own url did not serve the asset (${res.status} ${res.statusText}): ${asset.url}`);
}
const bytes = (await res.arrayBuffer()).byteLength;
const type = res.headers.get('content-type') ?? '(none)';
console.log(`\nfetched back: ${bytes} bytes, content-type ${type}`);
if (bytes < 10_000) {
  fail(`${bytes} bytes is not a ten-second video — something rendered empty`);
}
if (!/^video\//i.test(type)) {
  console.warn(`⚠ content-type is "${type}", expected video/* — check the storage upload headers`);
}

console.log(
  `\n✅ full chain verified live: script → voice → captions${montage ? ' → montage' : ''} → render → R2.`,
);
console.log(`   Watch it: ${asset.url}`);
