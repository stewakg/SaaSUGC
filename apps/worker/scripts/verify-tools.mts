/**
 * Live verification for the three light-lane tools: image_ads (kie.ai → fal.ai
 * fallback → copy into our storage), enhance (fal Topaz upscale) and remove_text
 * (fal text removal).
 *
 * WHY THIS EXISTS: `verify-full-pipeline.mts` proved the matrix chain against
 * live providers, and the first thing it did was find a defect that would have
 * failed every customer job (an AWS concurrency limit). These three tools have
 * each been called by hand at some point, but never through `runPipeline` — the
 * function the worker's job processor actually invokes. The gap between "the
 * provider works" and "our pipeline works" is exactly where today's bugs have
 * been found, so this script closes it for the tools nobody has driven yet.
 *
 * It drives the SHIPPED `runPipeline`, not the providers directly, so a change
 * to the real dispatch changes what this measures. Nothing here is a copy of
 * production logic.
 *
 * WHAT A PASS PROVES, per tool: the provider call succeeded, the result was
 * copied into OUR storage (not left on the provider's expiring CDN), the asset
 * carries a storageKey (so retention can reach it), and our url actually serves
 * the bytes with an image content-type.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: no database, no BullMQ, no credits — the
 * provider chain only, same scope as the existing driver. The job state machine
 * has its own coverage in `processor.test.ts`.
 *
 * COSTS REAL MONEY — one provider call per tool (image generation ≈ cents,
 * Topaz upscale ≈ $0.08, text removal ≈ $0.04). Run it deliberately, never in
 * a loop, and never as part of any test suite:
 *
 *   pnpm --filter @adgen/worker exec tsx scripts/verify-tools.mts image_ads
 *   pnpm --filter @adgen/worker exec tsx scripts/verify-tools.mts enhance
 *   pnpm --filter @adgen/worker exec tsx scripts/verify-tools.mts remove_text
 *   pnpm --filter @adgen/worker exec tsx scripts/verify-tools.mts all
 *
 * With no argument this prints usage and exits non-zero. It never defaults to
 * `all`: every run costs the owner real money, and a mistyped argument must not
 * silently spend it.
 *
 * THE HARD-CODED SAMPLE IMAGE: the two media-edit tools need a real, publicly
 * fetchable image (fal fetches the source url itself). The repo has no sample
 * asset constant for stills, so this uses a small, stable, public w3schools
 * image — the same host the MockRenderer placeholder has relied on for months.
 * In a verification script a fixed input is a feature, not a shortcut: the only
 * variable a smoke test wants is the pipeline.
 */
import { runPipeline } from '../src/index.ts';
import { createProviders } from '@adgen/core';

const TOOLS = ['image_ads', 'enhance', 'remove_text'] as const;
type Tool = (typeof TOOLS)[number];

const SAMPLE_IMAGE_URL = 'https://www.w3schools.com/html/img_chania.jpg';

function usage(): never {
  console.error('usage: tsx scripts/verify-tools.mts <image_ads | enhance | remove_text | all>');
  console.error('each run makes one real, paid provider call — there is no default');
  process.exit(1);
}

function fail(message: string): never {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

const arg = process.argv[2];
if (!arg || arg === '-h' || arg === '--help') {
  usage();
}
if (arg !== 'all' && !TOOLS.includes(arg as Tool)) {
  console.error(`unknown tool "${arg}"`);
  usage();
}
const requested: Tool[] = arg === 'all' ? [...TOOLS] : [arg as Tool];

// Refuse to "pass" against mocks. A green run that proved nothing is worse than
// a red one — the exact failure mode this script exists to avoid. Storage is
// checked for everything (each tool copies into it); ai only matters for
// image_ads; mediaEdit is null (not mock) when FAL_API_KEY is unset.
const providers = createProviders();
const modes = {
  ai: providers.ai.name,
  mediaEdit: providers.mediaEdit?.name ?? '(unset — no FAL_API_KEY)',
  storage: providers.storage.name,
};
console.log('provider modes:', modes);
if (modes.storage.startsWith('mock')) {
  fail(`storage resolved to ${modes.storage} — the ownership copy would be fake, so this run would prove nothing`);
}
if (requested.includes('image_ads') && modes.ai.startsWith('mock')) {
  fail(`ai resolved to ${modes.ai} — image_ads would generate a placeholder, so this run would prove nothing`);
}
if ((requested.includes('enhance') || requested.includes('remove_text')) && !providers.mediaEdit) {
  fail('mediaEdit is unset — enhance/remove_text need FAL_API_KEY, and the runPipeline call would (correctly) refuse');
}

// The minimum each tool actually reads in runPipeline (apps/worker/src/index.ts):
// - image_ads: `count` (line 632) plus the four fields buildImageAdsPrompt
//   reads — productTitle, price, offerNotes, language (lines 239–244). The
//   wizard also sends `sourceImages`, but the pipeline never reads it.
// - enhance: `sourceUrl` (line 663) and `upscaleFactor` (line 580).
// - remove_text: `sourceUrl` only (lines 568–576).
// Every run is ONE output — this is a smoke test, not a batch.
function paramsFor(tool: Tool): Record<string, unknown> {
  switch (tool) {
    case 'image_ads':
      return {
        count: 1,
        productTitle: 'Bežične slušalice',
        price: '3990 RSD',
        offerNotes: 'Besplatna dostava, plaćanje pouzećem.',
        language: 'sr',
      };
    case 'enhance':
      return { sourceUrl: SAMPLE_IMAGE_URL, upscaleFactor: 2 };
    case 'remove_text':
      return { sourceUrl: SAMPLE_IMAGE_URL };
  }
}

/**
 * Run one tool through the shipped pipeline and assert everything the existing
 * driver asserts. Throws (with the tool's name in the message) instead of
 * exiting, so an `all` run can still report the tools after the failed one.
 */
async function verifyTool(tool: Tool): Promise<{ seconds: string; bytes: number; url: string }> {
  console.log(`\n=== ${tool} — running the real pipeline…`);
  const startedAt = Date.now();
  const assets = await runPipeline(tool, paramsFor(tool));
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`${tool}: done in ${seconds}s — ${assets.length} asset(s)`);

  // 1. At least one asset came back — and for count: 1 exactly one.
  if (assets.length !== 1) {
    throw new Error(`${tool}: expected exactly 1 asset for count: 1, got ${assets.length}`);
  }

  const [asset] = assets;
  console.log(`${tool}: ${JSON.stringify(asset)}`);

  // 2. The url must be ours. A provider url (AWS, fal or kie.ai) means the
  //    ownership transfer silently did not happen, which looks exactly like
  //    success — and those urls expire.
  if (/amazonaws\.com|fal\.(media|run)|kie\.ai/i.test(asset.url)) {
    throw new Error(`${tool}: the asset url is not ours: ${asset.url}`);
  }
  // 3. Without a storageKey nothing can ever find this file to delete it, which
  //    is what the Terms' 30-day retention depends on.
  if (!asset.storageKey) {
    throw new Error(`${tool}: asset has no storageKey — retention could never reach this file`);
  }

  // 4. It has to actually be served, of plausible size, as the right kind.
  const res = await fetch(asset.url);
  if (!res.ok) {
    throw new Error(
      `${tool}: our own url did not serve the asset (${res.status} ${res.statusText}): ${asset.url}`,
    );
  }
  const bytes = (await res.arrayBuffer()).byteLength;
  const type = res.headers.get('content-type') ?? '(none)';
  console.log(`${tool}: fetched back: ${bytes} bytes, content-type ${type}`);
  if (bytes < 10_000) {
    throw new Error(`${tool}: ${bytes} bytes is not a real image — something came back empty`);
  }
  // Every tool here is driven with an image input, so the output kind must be
  // image too (runPipeline tags an image-source enhance as kind: 'image').
  if (!/^image\//i.test(type)) {
    throw new Error(`${tool}: content-type is "${type}", expected image/* — check the storage upload headers`);
  }

  return { seconds, bytes, url: asset.url };
}

const results = new Map<Tool, { seconds: string; bytes: number; url: string }>();
const failed: Tool[] = [];
for (const tool of requested) {
  try {
    results.set(tool, await verifyTool(tool));
  } catch (error) {
    // No retry. If a provider is flaky, the run should say so, not paper over it.
    failed.push(tool);
    console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
  }
}

// An `all` run ends with one line per tool — including the ones that failed,
// because "1 of 3 failed" without naming the tool is useless at 2am.
if (requested.length > 1) {
  console.log('\nsummary:');
  for (const tool of requested) {
    const result = results.get(tool);
    console.log(
      result
        ? `  ${tool}: ${result.seconds}s, ${result.bytes} bytes, ${result.url}`
        : `  ${tool}: FAILED`,
    );
  }
}

if (failed.length > 0) {
  fail(`failed: ${failed.join(', ')}`);
}

console.log(
  `\n✅ ${requested.join(', ')} verified live through runPipeline: provider → ownership copy → our url serves real bytes.`,
);
