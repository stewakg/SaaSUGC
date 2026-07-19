/**
 * Worker entry — F2 BullMQ consumer.
 *
 * Consumes jobs enqueued by `POST /api/jobs` in apps/web: loads the `jobs`
 * row, runs the mock pipeline (real providers land per-tool in F3+), writes
 * `assets` + `jobs.result`, and charges credits ONLY on success via the
 * `charge_credits` RPC (INFRASTRUCTURE.md §3 — charge-on-success). On
 * failure the job is marked "error" and nothing is charged.
 *
 * Mock-first: with zero external keys, `createProviders()` resolves to mocks,
 * so the whole pipeline runs end-to-end locally (just needs Redis + Supabase).
 */
import { Worker, type Job } from 'bullmq';
import {
  createProviders,
  mockWordTimestamps,
  consoleLogger,
  MATRIX_FPS,
  MATRIX_OUTRO_SECONDS,
  MATRIX_TRANSITIONS,
  DEFAULT_BACKGROUND_VIDEO_URL,
  DEFAULT_MATRIX_CAPTION_STYLE,
  DEFAULT_MATRIX_OUTRO_TEXT,
  DEFAULT_VOICE_MODEL,
} from '@adgen/core';
import type { MatrixAdProps, MatrixTransition, VoiceProvider } from '@adgen/core';
import { JOB_COST } from '@adgen/core/pricing';
import { createRedisConnection, JOB_QUEUE_NAME, type JobQueueData } from '@adgen/core/queue';
import { LocalRemotionRenderer } from '@adgen/core/providers/renderer.local';
import { MockVoiceProvider } from '@adgen/core/providers/mocks';
import { createServiceClient } from '@adgen/db';
import type { AssetKind, JobType, Json } from '@adgen/db';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const providers = createProviders();
const matrixRenderer = new LocalRemotionRenderer(providers.storage);

/**
 * Matrix's tts() call is a placeholder that mirrors the pipeline shape real
 * audio muxing will need later (see runMatrixPipeline below) — its result
 * isn't muxed into the render yet. It MUST stay on MockVoiceProvider even
 * when a real ELEVENLABS_API_KEY is configured for the rest of the app:
 * otherwise every Matrix job silently spends real ElevenLabs credits
 * generating audio that gets discarded. Swap this for `providers.voice` only
 * once MatrixAd.tsx actually muxes the returned audioUrl into the video.
 */
const matrixVoiceTracker: VoiceProvider = new MockVoiceProvider();

interface PipelineAsset {
  kind: AssetKind;
  url: string;
  /** Null when the provider didn't upload to our Storage (mock/external URL) — never fabricated. */
  storageKey: string | null;
}

/** Builds the AI prompt for an `image_ads` job from the scraped/edited product info (F3). */
function buildImageAdsPrompt(params: Record<string, unknown>, index: number): string {
  const title = typeof params.productTitle === 'string' && params.productTitle.trim() ? params.productTitle.trim() : 'Proizvod';
  const price = typeof params.price === 'string' && params.price.trim() ? params.price.trim() : '';
  const notes = typeof params.offerNotes === 'string' && params.offerNotes.trim() ? params.offerNotes.trim() : '';
  const language = typeof params.language === 'string' && params.language.trim() ? params.language.trim() : 'sr';
  return [`AI SLIKA #${index + 1}`, title, price, notes, `[${language}]`].filter(Boolean).join(' · ');
}

/**
 * `matrix` job (F4, the differentiator): mock script (Claude) → mock TTS
 * (ElevenLabs, via `matrixVoiceTracker` — ALWAYS mock here, see its comment
 * above) per variant → real local Remotion render, one mp4 per variant.
 * Voice audio is tracked (the tts() call happens, matching the pipeline
 * shape real audio muxing will fill in later) but NOT muxed into the video
 * yet — captions still play out on mocked word timings. See MatrixAd.tsx.
 */
async function runMatrixPipeline(params: Record<string, unknown>): Promise<PipelineAsset[]> {
  const count = typeof params.count === 'number' && params.count > 0 ? Math.floor(params.count) : 1;
  const language = typeof params.language === 'string' && params.language ? params.language : 'sr';

  // M2a: the wizard now uploads real source clips; use the first uploaded clip as the
  // background instead of the hardcoded placeholder. (Multi-clip scene-detected montage
  // lands in M2b/M2c.) Falls back to the placeholder when no clip was uploaded.
  const sourceVideoUrls = Array.isArray(params.sourceVideoUrls)
    ? params.sourceVideoUrls.filter((u): u is string => typeof u === 'string' && u.length > 0)
    : [];
  const firstClipUrl = sourceVideoUrls[0];

  // Build a richer product/benefits string from the wizard's imported product
  // data (title/price/description) + manual offer notes so the script generator
  // has real context — the ScriptProvider interface stays unchanged (product +
  // benefits), we just fill it with more than the bare title.
  const productTitle =
    typeof params.productTitle === 'string' && params.productTitle.trim() ? params.productTitle.trim() : 'Proizvod';
  const price = typeof params.price === 'string' ? params.price.trim() : '';
  const description = typeof params.description === 'string' ? params.description.trim() : '';
  const offerNotes = typeof params.offerNotes === 'string' ? params.offerNotes.trim() : '';
  const tone = typeof params.tone === 'string' && params.tone.trim() ? params.tone.trim() : 'energetic';

  const { variants } = await providers.script.generateVariants({
    product: price ? `${productTitle} (${price})` : productTitle,
    benefits: [description, offerNotes].filter(Boolean).join(' · '),
    tone,
    language,
    style: 'ugc',
    durations: [15],
    count,
  });

  const transitionIn = MATRIX_TRANSITIONS.some((t) => t.value === params.transitionIn)
    ? (params.transitionIn as MatrixTransition)
    : 'zoom-punch';

  const assets: PipelineAsset[] = [];
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];

    await matrixVoiceTracker.tts({
      script: variant.script,
      voiceId: typeof params.voiceId === 'string' && params.voiceId ? params.voiceId : 'voice_srp_f1',
      model: DEFAULT_VOICE_MODEL,
      stability: 0.5,
      speed: 1,
      language,
    });

    const captionWords = mockWordTimestamps(variant.script, variant.estDurationSec);
    const lastEnd = captionWords.length > 0 ? captionWords[captionWords.length - 1].endSec : 0;
    const durationInFrames = Math.round((lastEnd + MATRIX_OUTRO_SECONDS) * MATRIX_FPS);

    const matrixProps: MatrixAdProps = {
      backgroundVideoUrl: firstClipUrl ?? DEFAULT_BACKGROUND_VIDEO_URL,
      captionWords,
      captionStyle:
        typeof params.captionStyle === 'string' && params.captionStyle
          ? params.captionStyle
          : DEFAULT_MATRIX_CAPTION_STYLE,
      captionScale: typeof params.captionScale === 'number' ? params.captionScale : 1,
      transitionIn,
      outroText:
        typeof params.outroText === 'string' && params.outroText ? params.outroText : DEFAULT_MATRIX_OUTRO_TEXT,
      durationInFrames,
      fps: MATRIX_FPS,
    };

    const { videoUrl, storageKey } = await matrixRenderer.render({ composition: 'matrix-ad', props: matrixProps });
    assets.push({ kind: 'video', url: videoUrl, storageKey });
  }
  return assets;
}

/**
 * Generic mock pipeline: image_ads produces N images (prompted from the
 * scraped/edited product info); matrix does a real local Remotion render
 * (see runMatrixPipeline); every other job type (edit, mix, translate,
 * enhance, remove_text, quick_test) still produces one mock placeholder
 * video via the Renderer. Per-tool real pipelines replace this branch one
 * job type at a time starting F3.
 *
 * MOCK GAP: enhance/remove_text accept an image OR video upload (their
 * wizards' `sourceUrl` may point at either). In mock mode the OUTPUT kind
 * now follows the SOURCE kind — an image source is routed through
 * AIProvider (a placeholder image), a video/absent source through the
 * Renderer. The remaining gap is only that the mock result is NOT a real
 * transform of the source (the real image-in / image-out per-tool pipelines
 * land in F5); `assets.kind` is already honest so the wizard UIs render
 * <img> vs <video> correctly today.
 */
async function runPipeline(type: string, params: Record<string, unknown>): Promise<PipelineAsset[]> {
  const count = typeof params.count === 'number' && params.count > 0 ? Math.floor(params.count) : 1;

  if (type === 'image_ads') {
    const assets: PipelineAsset[] = [];
    for (let i = 0; i < count; i++) {
      const { url, storageKey } = await providers.ai.generateImage({
        prompt: buildImageAdsPrompt(params, i),
        size: '1080x1080',
      });
      assets.push({ kind: 'image', url, storageKey: storageKey ?? null });
    }
    return assets;
  }

  if (type === 'matrix') {
    return runMatrixPipeline(params);
  }

  // enhance/remove_text may hand us an image OR video source. Match the OUTPUT
  // kind to the source: an image source flows through AIProvider (mock:
  // placeholder image), a video/absent source through the Renderer. Mirrors how
  // the real per-tool pipelines (F5) will route image inputs, and keeps
  // assets.kind honest so the wizard UIs render <img> vs <video> correctly.
  const sourceUrl = typeof params.sourceUrl === 'string' ? params.sourceUrl : '';
  if (/\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(sourceUrl)) {
    const { url } = await providers.ai.generateImage({ prompt: `${type} result`, size: '1080x1080' });
    return [{ kind: 'image', url, storageKey: null }];
  }

  const { videoUrl, storageKey } = await providers.renderer.render({ composition: type, props: params });
  return [{ kind: 'video', url: videoUrl, storageKey: storageKey ?? null }];
}

function makeProcessor(db: ReturnType<typeof createServiceClient>) {
  return async function processJob(bullJob: Job<JobQueueData>) {
    const { jobId } = bullJob.data;

    const { data: job, error } = await db.from('jobs').select('*').eq('id', jobId).single();
    if (error || !job) {
      throw new Error(`[worker] job ${jobId} not found: ${error?.message ?? 'no row'}`);
    }

    await db.from('jobs').update({ status: 'running' }).eq('id', jobId);

    try {
      const params = (job.params ?? {}) as Record<string, unknown>;
      const assets = await runPipeline(job.type, params);

      if (assets.length > 0) {
        const { error: assetsError } = await db.from('assets').insert(
          assets.map((a) => ({
            job_id: jobId,
            user_id: job.user_id,
            kind: a.kind,
            storage_key: a.storageKey,
            url: a.url,
          })),
        );
        if (assetsError) throw new Error(`assets insert failed: ${assetsError.message}`);
      }

      // Charge for what was actually delivered, not what was requested —
      // some pipelines can produce fewer outputs than `count` asked for
      // (e.g. MockScriptProvider caps matrix variants at 3 canned scripts).
      // Charging job.cost (computed from the requested count at enqueue
      // time) would overbill in that case.
      const actualCost = JOB_COST[job.type as JobType] * assets.length;

      // Charge BEFORE marking the job done/visible — if this fails (e.g. a
      // concurrent job already spent the balance), the result must not be
      // delivered for free.
      const { error: chargeError } = await db.rpc('charge_credits', {
        p_user_id: job.user_id,
        p_job_id: jobId,
        p_amount: actualCost,
      });
      if (chargeError) {
        // The assets rows inserted above are now orphaned — an unpaid job
        // must not leave anything reachable via /api/storage (which
        // authorizes by asset-row ownership, not by job status). Delete
        // them; the underlying render file is cleaned up by F5's storage
        // lifecycle/auto-expire sweep, not here.
        if (assets.length > 0) {
          await db.from('assets').delete().eq('job_id', jobId);
        }
        await db
          .from('jobs')
          .update({ status: 'error', error: `charge_failed: ${chargeError.message}` })
          .eq('id', jobId);
        return;
      }

      // `assets` is a plain, JSON-serialisable array of strings — safe to
      // hand to the jsonb column despite PipelineAsset not structurally
      // matching TS's recursive `Json` index-signature check.
      await db
        .from('jobs')
        .update({ status: 'done', result: { assets } as unknown as Json, cost: actualCost })
        .eq('id', jobId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.from('jobs').update({ status: 'error', error: message }).eq('id', jobId);
      throw err;
    }
  };
}

async function main() {
  const providerModes = Object.fromEntries(
    Object.entries(providers).map(([k, v]) => [k, v.name]),
  );
  consoleLogger.info('provider modes', providerModes);

  if (!SERVICE_KEY) {
    consoleLogger.error(
      'SUPABASE_SERVICE_ROLE_KEY is not set — the worker cannot read/write jobs. ' +
        'Run `supabase start` and set it (see packages/db/src/seed.ts for the pattern). Exiting.',
    );
    process.exit(1);
  }
  const db = createServiceClient(SUPABASE_URL, SERVICE_KEY);

  const connection = createRedisConnection();
  const worker = new Worker<JobQueueData>(JOB_QUEUE_NAME, makeProcessor(db), {
    connection,
    concurrency: 4,
  });

  worker.on('completed', (bullJob) => consoleLogger.info('job done', { jobId: bullJob.data.jobId }));
  worker.on('failed', (bullJob, err) =>
    consoleLogger.error('job failed', { jobId: bullJob?.data.jobId ?? '?', error: err.message }),
  );
  worker.on('error', (err) => consoleLogger.error('connection error', { error: err.message }));

  consoleLogger.info('listening', { queue: JOB_QUEUE_NAME });

  process.on('SIGINT', async () => {
    consoleLogger.info('shutting down');
    await worker.close();
    process.exit(0);
  });
}

main().catch((err) => {
  consoleLogger.error('fatal', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});