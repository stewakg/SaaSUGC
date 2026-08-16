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
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import {
  createProviders,
  mockProviderSlots,
  mockWordTimestamps,
  consoleLogger,
  MATRIX_ASPECTS,
  MATRIX_FPS,
  MATRIX_OUTRO_SECONDS,
  MATRIX_TRANSITIONS,
  toMatrixAspect,
  DEFAULT_BACKGROUND_VIDEO_URL,
  DEFAULT_MATRIX_CAPTION_STYLE,
  DEFAULT_MATRIX_OUTRO_TEXT,
  DEFAULT_VOICE_MODEL,
  MAX_AD_SECONDS,
  clampScriptForSpeech,
  scriptCharBudget,
  toAdSeconds,
} from '@adgen/core';
import type { MatrixAdProps, MatrixTransition, Renderer } from '@adgen/core';
import { JOB_COST } from '@adgen/core/pricing';
import {
  createRedisConnection,
  HEAVY_QUEUE_NAME,
  LIGHT_QUEUE_NAME,
  type JobQueueData,
} from '@adgen/core/queue';
import { LocalRemotionRenderer } from '@adgen/core/providers/renderer.local';
import { createServiceClient } from '@adgen/db';
import type { AssetKind, JobType, Json } from '@adgen/db';
import { detectShots, downloadClip } from './scene-detect.ts';
import { buildMontage, type PoolShot } from './montage.ts';
import { approvedScripts, speakerGenderOf } from './approved-scripts.ts';
import { alertJobFailed } from './alert.ts';
import { startHeartbeat } from './health.ts';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Set the moment shutdown begins. Docker can send a second signal while the
 * first `worker.close()` is still draining in-flight jobs, and a double close
 * would cut the very jobs the close is waiting for. Module-level because both
 * signal handlers must see the same flag.
 */
let shuttingDown = false;

const providers = createProviders();

/**
 * Which renderer draws a matrix/revoice video.
 *
 * This used to be a hardcoded `new LocalRemotionRenderer(...)`, which quietly
 * made Remotion Lambda unreachable: the factory would build a Lambda renderer
 * from REMOTION_* env and matrix would ignore it and render locally anyway. So
 * the documented "scale out to Lambda" path did not actually exist — it was a
 * code change pretending to be a config change.
 *
 * The rule is: use whatever the factory resolved, UNLESS it resolved to the
 * mock. A mock renderer would hand back a placeholder URL and mark the job
 * done, which for the one tool that renders real video is worse than useless —
 * so with no Lambda configured we still render locally, for real, exactly as
 * before. Nothing changes for anyone until REMOTION_* is set.
 */
const matrixRenderer =
  providers.renderer.name === 'mock-renderer'
    ? new LocalRemotionRenderer(providers.storage)
    : providers.renderer;

/**
 * Copy a provider's result into OUR storage and return our own url + key.
 *
 * Every external media provider hands back a URL on its own CDN, and those
 * expire: fal's are temporary by design, and kie.ai's live under
 * `tempfile.aiquickdraw.com` — the name says it. Writing one of those straight
 * into `assets.url` is what makes a paid asset turn into a dead link in "Moje
 * reklame" weeks later, which is exactly the state `image_ads` was in until
 * 2026-08-10.
 *
 * Failure here fails the job on purpose. Falling back to the provider url would
 * "succeed", charge the user, and quietly hand them the same expiring link.
 */

/**
 * Hard ceiling on persistRemoteAsset's buffered fallback, in bytes (200 MB).
 * Exported so the tests assert against the real number instead of a copy of
 * it drifting out of sync.
 */
export const PERSIST_BUFFERED_FALLBACK_CAP_BYTES = 200 * 1024 * 1024;

export async function persistRemoteAsset(
  remoteUrl: string,
  keyPrefix: string,
  // Injected for tests; defaults to the active storage so callers are unchanged.
  storage: Pick<typeof providers.storage, 'upload'> = providers.storage,
): Promise<{ url: string; storageKey: string }> {
  const res = await fetch(remoteUrl);
  if (!res.ok) {
    throw new Error(`could not fetch provider result for ${keyPrefix} (${res.status})`);
  }
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';

  // Extension from the content type, not from the url — provider urls carry
  // query strings and signed-token suffixes that make path parsing unreliable.
  const ext = contentType.includes('png')
    ? 'png'
    : contentType.includes('webp')
      ? 'webp'
      : contentType.includes('jpeg') || contentType.includes('jpg')
        ? 'jpg'
        : contentType.includes('mp4') || contentType.includes('video')
          ? 'mp4'
          : 'bin';

  const storageKey = `${keyPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  if (!res.body) throw new Error(`empty response body for ${keyPrefix}`);

  /**
   * Streamed when the provider tells us the size; buffered (bounded) when it
   * does not.
   *
   * Streaming is the default because `Buffer.from(await res.arrayBuffer())`
   * holds the WHOLE file in memory before a byte is written — fine for a 2 MB
   * image, a multi-hundred-megabyte spike for an upscaled video, and with
   * several jobs running at once that spike is what gets the worker killed by
   * the kernel rather than any single job failing.
   *
   * But a Node stream has no known length, and the AWS SDK cannot sign a
   * PutObject body it cannot measure — R2 rejects it with `Invalid value
   * "undefined" for header "x-amz-decoded-content-length"`, which is exactly
   * how image_ads / enhance / remove_text all died in production. So the
   * stream is only usable when the provider sent a `content-length`; it is
   * passed through as the 4th upload argument so storage can set
   * `ContentLength` on the command.
   */
  const contentLengthHeader = res.headers.get('content-length');
  const contentLength =
    contentLengthHeader !== null && Number.isFinite(Number(contentLengthHeader))
      ? Number(contentLengthHeader)
      : undefined;

  if (contentLength !== undefined) {
    const body = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
    const { url } = await storage.upload(storageKey, body, contentType, contentLength);
    return { url, storageKey };
  }

  /**
   * BUFFERED FALLBACK — exists because the provider answered with a CHUNKED
   * response (no content-length header). That is legal HTTP and some providers
   * do it, and a plain PutObject cannot stream a body of unknown length. So we
   * buffer after all — but bounded, so an unbounded provider response cannot
   * decide the worker's memory: anything over 200 MB is refused with an error
   * naming the key prefix instead of being pulled into RAM. The warn makes the
   * slower path visible in the logs rather than silently slower.
   *
   * Do not "simplify" this away: removing it brings back either the signing
   * failure (stream with no length) or the OOM kill (unbounded buffer).
   */
  consoleLogger.warn(
    `persistRemoteAsset: provider sent no content-length for ${keyPrefix} — taking the buffered fallback (chunked response), capped at ${
      PERSIST_BUFFERED_FALLBACK_CAP_BYTES / (1024 * 1024)
    } MB`,
    { keyPrefix, remoteUrl },
  );
  const raw = await res.arrayBuffer();
  if (raw.byteLength > PERSIST_BUFFERED_FALLBACK_CAP_BYTES) {
    throw new Error(
      `provider result for "${keyPrefix}" is ${Math.ceil(raw.byteLength / (1024 * 1024))} MB but arrived ` +
        `with no content-length (chunked response) — over the ${
          PERSIST_BUFFERED_FALLBACK_CAP_BYTES / (1024 * 1024)
        } MB buffered-fallback cap, refusing to hold it in worker memory`,
    );
  }
  const { url } = await storage.upload(storageKey, Buffer.from(raw), contentType);
  return { url, storageKey };
}

/** True when the source looks like a still image rather than a video. */
function isImageSource(sourceUrl: string): boolean {
  return /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(sourceUrl);
}

/** Must match S3CompatibleStorage.assetPath / MockStorage's publicPrefix. */
const STORAGE_PATH_PREFIX = '/api/storage/';

const WEB_PUBLIC_URL = process.env.WEB_PUBLIC_URL ?? 'http://localhost:3000';

/**
 * Turn a stored asset url into something this process (and the renderer, and
 * fal) can actually fetch.
 *
 * Storage urls are relative — `/api/storage/<key>` — for both providers. In dev
 * that path is served by the web app off local disk, so prefixing
 * WEB_PUBLIC_URL is enough. In production the bytes live in a PRIVATE R2 bucket
 * and that route requires a session cookie, which no headless process here has:
 * so the key is signed directly instead. The signature is computed locally from
 * the credentials — no network call — and the link expires within the hour.
 *
 * Absolute urls (a provider CDN link, the default background clip) are returned
 * untouched.
 */
async function resolveStorageUrl(
  url: string,
  storage: unknown = providers.storage,
): Promise<string> {
  if (!url.startsWith('/')) return url;

  const candidate = storage as { signedDownloadUrl?: (key: string) => Promise<string> };
  if (url.startsWith(STORAGE_PATH_PREFIX) && typeof candidate.signedDownloadUrl === 'function') {
    return candidate.signedDownloadUrl(url.slice(STORAGE_PATH_PREFIX.length));
  }

  return `${WEB_PUBLIC_URL}${url}`;
}

/**
 * Matrix now uses the REAL voice provider (`providers.voice`): MatrixAd.tsx muxes
 * the returned audio and drives captions off the provider's word timings, so the
 * generated speech is no longer discarded. That also means **every variant spends
 * real ElevenLabs credits** — a count=15 job makes 15 TTS calls. With no
 * ELEVENLABS_API_KEY configured the factory hands back MockVoiceProvider and the
 * render simply stays silent, exactly as before.
 */

/**
 * Resolve a requested voice id against what the ACTIVE provider actually offers.
 *
 * The Matrix wizard shipped a hardcoded copy of the MOCK provider's ids
 * (`voice_srp_f1`, …). That was harmless while Matrix forced MockVoiceProvider,
 * but the moment it moved to the real provider those ids became invalid —
 * ElevenLabs answers `404 voice_not_found` and the ENTIRE job dies. A stale or
 * unknown id must degrade to a working voice, never take the job down with it.
 *
 * If listVoices() itself fails we pass the id through untouched rather than
 * guessing: a transient catalogue outage shouldn't silently switch the voice on
 * a user who picked a valid one.
 */
export async function resolveVoiceId(
  requested?: string,
  // Injected for tests; defaults to the active provider so callers are unchanged.
  voice: Pick<typeof providers.voice, 'listVoices' | 'name'> = providers.voice,
): Promise<string> {
  try {
    const voices = await voice.listVoices();
    if (voices.length === 0) return requested ?? '';
    if (requested && voices.some((v) => v.id === requested)) return requested;
    consoleLogger.warn('voice id not offered by provider; falling back', {
      requested: requested ?? '(unset)',
      provider: voice.name,
      fallback: voices[0].id,
    });
    return voices[0].id;
  } catch (err) {
    consoleLogger.warn('listVoices failed; using the requested id as-is', {
      error: err instanceof Error ? err.message : String(err),
    });
    return requested ?? '';
  }
}

/**
 * Turn the first product image into a sentence the script model can use.
 *
 * The wizard has always collected `sourceImages`, and the script model has been
 * writing from a title and a price alone — so an ad for a "masažer za vrat"
 * never mentioned that the thing in the photo is worn over the shoulders. The
 * provider's `describeImage` is optional (it needs a vision-capable model), so
 * every failure path here degrades to "no extra context" rather than failing the
 * job: a worse script is bad, a dead job is worse.
 */
export async function describeProductImage(
  params: Record<string, unknown>,
  language: string,
  script: Pick<typeof providers.script, 'describeImage'> = providers.script,
): Promise<string> {
  const images = Array.isArray(params.sourceImages) ? params.sourceImages : [];
  const first = images.find((u): u is string => typeof u === 'string' && u.trim().length > 0);
  if (!first) return '';
  if (typeof script.describeImage !== 'function') return '';
  try {
    const described = await script.describeImage(first, language);
    return described.trim();
  } catch (err) {
    consoleLogger.warn('describeImage failed; writing the script without it', {
      error: err instanceof Error ? err.message : String(err),
    });
    return '';
  }
}

interface PipelineAsset {
  kind: AssetKind;
  url: string;
  /** Null when the provider didn't upload to our Storage (mock/external URL) — never fabricated. */
  storageKey: string | null;
}

/** Builds the AI prompt for an `image_ads` job from the scraped/edited product info (F3). */
export function buildImageAdsPrompt(params: Record<string, unknown>, index: number): string {
  const title = typeof params.productTitle === 'string' && params.productTitle.trim() ? params.productTitle.trim() : 'Proizvod';
  const price = typeof params.price === 'string' && params.price.trim() ? params.price.trim() : '';
  const notes = typeof params.offerNotes === 'string' && params.offerNotes.trim() ? params.offerNotes.trim() : '';
  const language = typeof params.language === 'string' && params.language.trim() ? params.language.trim() : 'sr';
  return [`AI SLIKA #${index + 1}`, title, price, notes, `[${language}]`].filter(Boolean).join(' · ');
}

/**
 * `matrix` job (F4, the differentiator): real script (Claude) → real TTS
 * (ElevenLabs via `providers.voice`, see the comment above the provider
 * block) per variant → real local Remotion render, one mp4 per variant.
 * The returned voice audio is muxed into the video, and captions play out
 * on the provider's real word timings when available (falling back to the
 * even-spread estimate otherwise). See MatrixAd.tsx.
 */
export async function runMatrixPipeline(
  params: Record<string, unknown>,
  opts: {
    montage?: boolean;
    /**
     * The seam that makes this function testable. It defaults to the real
     * `matrixRenderer`, so every production caller is unchanged — but a test
     * can pass a fake and drive the whole script → TTS → captions → render
     * chain without a Chromium bundle, ffmpeg, or a real file on disk.
     *
     * Without this, the module-level `new LocalRemotionRenderer(...)` made the
     * money path — the one place a bug costs credits — the only part of the
     * worker with no automated coverage at all.
     */
    renderer?: Renderer;
  } = {},
): Promise<PipelineAsset[]> {
  const renderer = opts.renderer ?? matrixRenderer;
  /**
   * `revoice` (migration 0006) is this same pipeline with scene detection off:
   * one clip, kept whole, re-voiced N times. Skipping the pool is the entire
   * difference — the shot fallback below already plays a single clip for the
   * full duration, so nothing else has to branch.
   *
   * This is the competitor's actual product. Matrix cuts BETWEEN clips, which
   * they do not do; keeping the two in one function makes that difference one
   * flag rather than a second copy of the TTS/caption/render chain that would
   * drift.
   */
  const montage = opts.montage !== false;
  const count = typeof params.count === 'number' && params.count > 0 ? Math.floor(params.count) : 1;
  const language = typeof params.language === 'string' && params.language ? params.language : 'sr';

  /**
   * How long the ad should be, chosen by the user (10/15/30s).
   *
   * It drives three things that used to be fixed or unbounded: the length the
   * SCRIPT is written for (previously hardcoded to 15s), how many characters
   * are sent to text-to-speech, and the render clamp. A 10-second ad therefore
   * costs about a third of a 30-second one, which is what makes the choice
   * meaningful rather than cosmetic.
   */
  const targetSeconds = toAdSeconds(params.targetSeconds);
  const charBudget = scriptCharBudget(targetSeconds);

  // M2a: the wizard now uploads real source clips; use the first uploaded clip as the
  // background instead of the hardcoded placeholder. (Multi-clip scene-detected montage
  // lands in M2b/M2c.) Falls back to the placeholder when no clip was uploaded.
  const sourceVideoUrls = await Promise.all(
    (Array.isArray(params.sourceVideoUrls)
      ? params.sourceVideoUrls.filter((u): u is string => typeof u === 'string' && u.length > 0)
      : []
    ).map((u) => resolveStorageUrl(u)),
  );
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

  // Scripts the user already reviewed in the wizard win over generating fresh
  // ones. This is what keeps script approval out of the job lifecycle: the
  // wizard calls /api/generate-scripts, the user edits and approves, and the
  // result rides in `params` — no extra job status, no worker state machine.
  //
  // Regenerating here when approved scripts exist would be worse than useless:
  // it would silently discard the text the user chose and bill them for a
  // second generation they never asked for.
  const approved = approvedScripts(params.scripts);
  // Free-form product context that reaches the script prompt. The image
  // description is appended to THIS field (not `product`) because `benefits` is
  // the one the model reads as "extra things to know about the product".
  const benefits = [description, offerNotes].filter(Boolean).join(' · ');
  // Show the script model the product photo, not just title + price. The
  // provider's `describeImage` is optional (needs a vision model) and every
  // failure path degrades to no extra context — a worse script is bad, a dead
  // job is worse. Resolved ONCE here (one network round trip) and shared by
  // every variant: never per-variant, since the pool shares one product. Skipped
  // when the user already approved scripts, since no generation happens then.
  const seen = approved ? '' : await describeProductImage(params, language);
  const benefitsWithImage = seen ? `${benefits}\nNa slici se vidi: ${seen}`.trim() : benefits;
  const { variants } = approved
    ? { variants: approved.slice(0, count) }
    : await providers.script.generateVariants({
        product: price ? `${productTitle} (${price})` : productTitle,
        benefits: benefitsWithImage,
        tone,
        language,
        style: 'ugc',
        durations: [targetSeconds],
        count,
        speakerGender: speakerGenderOf(params.speakerGender),
      });

  const transitionIn = MATRIX_TRANSITIONS.some((t) => t.value === params.transitionIn)
    ? (params.transitionIn as MatrixTransition)
    : 'zoom-punch';

  // M2c-C: scene-detect every uploaded source into a pool of shots, each tagged with
  // its ORIGINAL storage url (the render fetches clips by url; the temp download is only
  // needed to detect shot ranges, then cleaned up). buildMontage picks/orders per variant.
  const pool: PoolShot[] = [];
  const tempFiles: string[] = [];
  for (const url of montage ? sourceVideoUrls : []) {
    try {
      const localPath = await downloadClip(url);
      tempFiles.push(localPath);
      for (const shot of detectShots(localPath, { threshold: 0.3, minShotSec: 0.8 })) {
        pool.push({ ...shot, url }); // tag with the storage url, NOT the temp path
      }
    } catch (err) {
      console.warn(`[matrix] scene-detect skipped for ${url}:`, err);
    }
  }

  const assets: PipelineAsset[] = [];
  /**
   * What this job actually consumed, in UNITS rather than money.
   *
   * Units are a fact; rates are a contract that changes and differs per plan,
   * so the worker records characters and seconds and leaves the multiplication
   * to whoever holds the invoices. Without this, per-job margin was a guess —
   * see RELEASE_PLAN L2.5.
   */
  const spend = { targetSeconds, ttsCharacters: 0, variants: 0, renderSeconds: 0, videoSeconds: 0 };

  // Resolved ONCE per job (listVoices is a network call), not per variant.
  const voiceId = await resolveVoiceId(
    typeof params.voiceId === 'string' && params.voiceId ? params.voiceId : undefined,
  );

  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];

    // The single point where speech is paid for, so the single point the
    // length limit is enforced. The approved-scripts path had its own 2000-char
    // cap; a script straight from the model had none at all and was billed to
    // ElevenLabs verbatim.
    const spokenScript = clampScriptForSpeech(variant.script, charBudget);
    spend.ttsCharacters += spokenScript.length;
    spend.variants += 1;

    const voice = await providers.voice.tts({
      script: spokenScript,
      voiceId,
      model: DEFAULT_VOICE_MODEL,
      stability: 0.5,
      speed: 1,
      language,
    });

    // Real per-word timings when the provider reports them (ElevenLabs does);
    // otherwise fall back to the even-spread estimate. Never assume `words` is set —
    // MockVoiceProvider does not report alignment.
    const captionWords =
      voice.words && voice.words.length > 0
        ? voice.words
        : mockWordTimestamps(spokenScript, variant.estDurationSec);
    const lastEnd = captionWords.length > 0 ? captionWords[captionWords.length - 1].endSec : 0;
    // Clamped so a long TTS result cannot turn into an unbounded render. Render
    // time is roughly linear in frames, so without this one job could occupy the
    // renderer for as long as the model felt like talking.
    // The user's chosen length shapes the SCRIPT (via charBudget above); it must
    // not also clamp the render, or speech that runs a little long gets cut off
    // mid-sentence — the video would end while the voice is still talking. The
    // budget already keeps a 10s ad near 10s; MAX_AD_SECONDS is the only hard
    // stop, and it exists for a runaway, not for normal variation.
    const targetSec = Math.min(lastEnd + MATRIX_OUTRO_SECONDS, MAX_AD_SECONDS);
    const durationInFrames = Math.round(targetSec * MATRIX_FPS);
    const shots =
      pool.length > 0
        ? buildMontage(pool, { targetSec })
        : [{ url: firstClipUrl ?? DEFAULT_BACKGROUND_VIDEO_URL, startSec: 0, playSec: targetSec }];

    const musicUrl =
      typeof params.musicUrl === 'string' && params.musicUrl
        ? await resolveStorageUrl(params.musicUrl)
        : undefined;
    const sfxUrl =
      typeof params.sfxUrl === 'string' && params.sfxUrl
        ? await resolveStorageUrl(params.sfxUrl)
        : undefined;

    const matrixProps: MatrixAdProps = {
      shots,
      // Must be absolutized exactly like the clip urls: MockStorage hands back a
      // RELATIVE /api/storage/... path, and MatrixAd only mounts <Audio> for an
      // absolute http(s) src. Without this the ad renders MUTE with no error —
      // Remotion just finds no audio asset and writes a silent track.
      voiceUrl: await resolveStorageUrl(voice.audioUrl),
      captionWords,
      captionStyle:
        typeof params.captionStyle === 'string' && params.captionStyle
          ? params.captionStyle
          : DEFAULT_MATRIX_CAPTION_STYLE,
      captionScale: typeof params.captionScale === 'number' ? params.captionScale : 1,
      // Left undefined when the wizard didn't send them — the composition then
      // applies its own safe-zone defaults (0.5 / 0.46) and clamps either way.
      captionX: typeof params.captionX === 'number' ? params.captionX : undefined,
      captionY: typeof params.captionY === 'number' ? params.captionY : undefined,
      // Absolutized like every other storage url — MockStorage returns a relative
      // path and <Audio> only mounts on an absolute http(s) src.
      musicUrl,
      musicVolume: typeof params.musicVolume === 'number' ? params.musicVolume : undefined,
      sfxUrl,
      transitionIn,
      outroText:
        typeof params.outroText === 'string' && params.outroText ? params.outroText : DEFAULT_MATRIX_OUTRO_TEXT,
      durationInFrames,
      fps: MATRIX_FPS,
      // Output shape, chosen in the wizard. Anything unrecognised (or a job
      // enqueued before this existed) falls back to 9:16, so old jobs render
      // exactly as they did before. Width/height only — the entry's `label` is
      // UI copy and has no business inside composition props.
      width: MATRIX_ASPECTS[toMatrixAspect(params.aspect)].width,
      height: MATRIX_ASPECTS[toMatrixAspect(params.aspect)].height,
    };

    const renderStartedAt = Date.now();
    const { videoUrl, storageKey } = await renderer.render({ composition: 'matrix-ad', props: matrixProps });
    spend.renderSeconds += (Date.now() - renderStartedAt) / 1000;
    spend.videoSeconds += targetSec;
    // `Renderer.storageKey` is optional by interface — a renderer that hands
    // back someone else's URL has no key of ours. `?? null` keeps the "never
    // fabricated" promise on PipelineAsset.storageKey; it used to be implicit
    // because the concrete LocalRemotionRenderer always returns one.
    assets.push({ kind: 'video', url: videoUrl, storageKey: storageKey ?? null });
  }

  consoleLogger.info('job spend', {
    ...spend,
    renderSeconds: +spend.renderSeconds.toFixed(1),
    videoSeconds: +spend.videoSeconds.toFixed(1),
    voiceProvider: providers.voice.name,
    renderer: renderer.name,
  });

  await Promise.all(
    tempFiles.map((p) =>
      import('node:fs/promises').then((fs) => fs.unlink(p)).catch(() => {}),
    ),
  );

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
/**
 * `enhance` (upscale) and `remove_text`, both real as of 2026-08-10.
 *
 * Routing is per capability, not per provider — the cheapest option is not the
 * same vendor for every operation (`research/provider-decisions.md`). Today
 * everything here goes through fal because that is the provider that is written
 * and tested; kie.ai's `topaz/image-upscale` is $0.05 against fal's $0.08+ for
 * the same Topaz model, so the image path is worth revisiting once a kie client
 * exists. Recorded rather than silently ignored.
 *
 * ⚠️ There is no video path for `remove_text` and there deliberately never was:
 * the only video erasers on either platform run $0.14/s — $2.10 for a 15s clip
 * against the 6 credits (≈€1.20–1.80) this tool earns. That is negative margin
 * before a frame renders, so the job fails with an explanation instead.
 */
export async function runMediaEditPipeline(
  type: 'enhance' | 'remove_text',
  sourceUrl: string,
  params: Record<string, unknown>,
  // Injected for tests; defaults keep every caller unchanged.
  deps: { mediaEdit: typeof providers.mediaEdit; persist: typeof persistRemoteAsset } = {
    mediaEdit: providers.mediaEdit,
    persist: persistRemoteAsset,
  },
): Promise<PipelineAsset[]> {
  if (!sourceUrl) {
    throw new Error(`missing_source: ${type} zahteva otpremljeni fajl.`);
  }

  const mediaEdit = deps.mediaEdit;
  if (!mediaEdit) {
    // No FAL_API_KEY. Fail rather than substitute anything — see the guard at
    // the end of runPipeline for why a placeholder is worse than an error.
    throw new Error(
      `provider_unavailable: "${type}" traži FAL_API_KEY, koji nije podešen — posao nije naplaćen.`,
    );
  }

  // fal FETCHES the source url itself, so it must be reachable from the public
  // internet. In dev, Storage is MockStorage and every url points at
  // localhost:3000 (see resolveStorageUrl), which fal cannot see — the call
  // would fail deep inside the provider with an opaque message. Say it plainly
  // here instead: these two tools are blocked on R2 existing, not on code.
  const absoluteSource = await resolveStorageUrl(sourceUrl);
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(absoluteSource)) {
    throw new Error(
      `source_not_public: "${type}" šalje fajl provajderu preko interneta, a ovaj je samo lokalan ` +
        `(${absoluteSource}). Traži pravi Storage (R2) — posao nije naplaćen.`,
    );
  }

  const isImage = isImageSource(sourceUrl);

  if (type === 'remove_text') {
    if (!isImage) {
      throw new Error(
        'video_not_supported: uklanjanje teksta radi samo na slikama za sada — posao nije naplaćen.',
      );
    }
    const { url: remoteUrl } = await mediaEdit.removeTextFromImage(absoluteSource);
    const { url, storageKey } = await deps.persist(remoteUrl, 'remove-text');
    return [{ kind: 'image', url, storageKey }];
  }

  // enhance
  const upscaleFactor = typeof params.upscaleFactor === 'number' ? params.upscaleFactor : undefined;

  if (isImage) {
    // faceEnhancement is off deliberately: Topaz retouches faces by default,
    // which on a product photo is an edit the seller never asked for.
    const { url: remoteUrl } = await mediaEdit.upscaleImage(absoluteSource, {
      upscaleFactor,
      faceEnhancement: false,
    });
    const { url, storageKey } = await deps.persist(remoteUrl, 'enhance');
    return [{ kind: 'image', url, storageKey }];
  }

  const { url: remoteUrl } = await mediaEdit.upscaleVideo(absoluteSource, { upscaleFactor });
  const { url, storageKey } = await deps.persist(remoteUrl, 'enhance');
  return [{ kind: 'video', url, storageKey }];
}

/**
 * Job types that have a Remotion composition DEPLOYED and can therefore be
 * rendered by the generic fall-through at the end of `runPipeline`.
 *
 * Empty today, and that is the honest state: `remotion/src/Root.tsx` registers
 * exactly one composition, `matrix-ad`, and the two job types that use it
 * (`matrix`, `revoice`) return earlier through `runMatrixPipeline`. So nothing
 * reaches the generic render — every other tool is still unimplemented.
 *
 * Exported so a test can prove BOTH directions: a member renders, a non-member
 * is refused. Adding a tool here without deploying its composition would make
 * the worker call Lambda with an id that does not exist.
 */
export const RENDERABLE_COMPOSITIONS = new Set<string>([]);

export async function runPipeline(
  type: string,
  params: Record<string, unknown>,
  // Injected for tests; defaults are the real singletons/pipelines so processJob
  // and every other caller behave exactly as before.
  deps: {
    ai: typeof providers.ai;
    renderer: typeof providers.renderer;
    persist: typeof persistRemoteAsset;
    runMatrix: typeof runMatrixPipeline;
    runMediaEdit: typeof runMediaEditPipeline;
  } = {
    ai: providers.ai,
    renderer: providers.renderer,
    persist: persistRemoteAsset,
    runMatrix: runMatrixPipeline,
    runMediaEdit: runMediaEditPipeline,
  },
): Promise<PipelineAsset[]> {
  const count = typeof params.count === 'number' && params.count > 0 ? Math.floor(params.count) : 1;

  if (type === 'image_ads') {
    const assets: PipelineAsset[] = [];
    for (let i = 0; i < count; i++) {
      const generated = await deps.ai.generateImage({
        prompt: buildImageAdsPrompt(params, i),
        size: '1080x1080',
      });
      // kie.ai and fal.ai both answer with a url on their own temporary CDN and
      // neither persists anything for us, so until 2026-08-10 a paid image was
      // stored as a link that expires. Copy it into our storage unless the
      // provider already did (storageKey set means it is ours).
      const owned = generated.storageKey
        ? { url: generated.url, storageKey: generated.storageKey }
        : await deps.persist(generated.url, 'image-ads');
      assets.push({ kind: 'image', url: owned.url, storageKey: owned.storageKey });
    }
    return assets;
  }

  if (type === 'matrix') {
    return deps.runMatrix(params);
  }

  // Same chain, scene detection off: the clip is kept whole and re-voiced once
  // per variant. See the note on runMatrixPipeline.
  if (type === 'revoice') {
    return deps.runMatrix(params, { montage: false });
  }

  const sourceUrl = typeof params.sourceUrl === 'string' ? params.sourceUrl : '';

  if (type === 'enhance' || type === 'remove_text') {
    return deps.runMediaEdit(type, sourceUrl, params);
  }

  // ⚠️ Everything that reaches this line — quick_test, edit, mix, translate —
  // has no real pipeline. Only the branches above are implemented.
  //
  // Until 2026-08-10 this happily returned MockRenderer's placeholder — Big Buck
  // Bunny on w3schools.com — and the caller then charged for it, because
  // charge-on-success cannot tell a real asset from a fake one. Verified live:
  // Brzi test took 2 credits and delivered that clip.
  //
  // The guard used to ask `renderer.name === 'mock-renderer'`, which was true
  // for as long as no Remotion Lambda existed. Deploying Lambda on 2026-08-13
  // silently disarmed it: the renderer became `remotion-lambda-renderer`, the
  // guard stopped firing, and these four tools began calling Lambda with a
  // composition id that is not deployed — the site registers `matrix-ad` and
  // nothing else. That burns an invocation and answers the customer with an SDK
  // error instead of a sentence they can read. Caught by the functional audit
  // the same day, before any customer saw it.
  //
  // So the question the guard asks is now about the TOOL, not about which
  // renderer happens to be configured. A tool is renderable when a composition
  // for it is actually deployed; that list is here, next to the throw, so
  // adding a tool means adding it here on purpose.
  //
  // Throwing keeps the billing honest: the catch in the job handler marks the
  // job `error` and returns BEFORE charge_credits runs, so the user keeps their
  // credits and sees a failure rather than someone else's cartoon.
  if (!RENDERABLE_COMPOSITIONS.has(type)) {
    throw new Error(
      `tool_not_implemented: "${type}" još nema pravi renderer — posao nije naplaćen. ` +
        `Alat je u izradi; Video reklame, AI slike i Poboljšaj kvalitet rade.`,
    );
  }

  const { videoUrl, storageKey } = await deps.renderer.render({ composition: type, props: params });
  return [{ kind: 'video', url: videoUrl, storageKey: storageKey ?? null }];
}

/**
 * Error codes whose message was written FOR the customer and may be shown as-is.
 *
 * The worker's convention is `<code>: <poruka na srpskom>`, and the dashboard
 * (`job-display.ts`) strips the code and renders the rest. Anything without one
 * of these codes is an internal message — a Postgres constraint, a provider url
 * with a token in it, a stack-shaped string — and `GET /api/jobs/[id]` used to
 * hand it to the customer verbatim.
 */
const USER_FACING_ERROR_CODES = new Set([
  'missing_source',
  'provider_unavailable',
  'source_not_public',
  'video_not_supported',
  'tool_not_implemented',
]);

/** What the customer sees when the real reason is not theirs to read. */
export const GENERIC_JOB_ERROR =
  'internal_error: Obrada nije uspela. Posao nije naplaćen — pokušaj ponovo.';

/** Full text goes to the worker log; this is what may be stored on the row. */
export function jobErrorForUser(message: string): string {
  const separator = message.indexOf(':');
  if (separator > 0) {
    const code = message.slice(0, separator);
    if (/^[a-z0-9_]+$/.test(code) && USER_FACING_ERROR_CODES.has(code)) return message;
  }
  return GENERIC_JOB_ERROR;
}

/**
 * The job state machine, isolated from its two impure dependencies so it can be
 * tested without a database or a real render. `db` is the Supabase client;
 * `runPipelineFn` defaults to the real `runPipeline` and is only overridden by
 * tests, which pass a fake so the charge/refund/rollback logic can be exercised
 * without touching a provider. Behaviour with the default is identical to before
 * this seam existed — same pattern as `runMatrixPipeline`'s injected deps.
 */
export function makeProcessor(
  db: ReturnType<typeof createServiceClient>,
  runPipelineFn: (type: string, params: Record<string, unknown>) => Promise<PipelineAsset[]> = runPipeline,
) {
  return async function processJob(bullJob: Job<JobQueueData>) {
    const { jobId } = bullJob.data;

    const { data: job, error } = await db.from('jobs').select('*').eq('id', jobId).single();
    if (error || !job) {
      throw new Error(`[worker] job ${jobId} not found: ${error?.message ?? 'no row'}`);
    }

    await db.from('jobs').update({ status: 'running' }).eq('id', jobId);

    try {
      const params = (job.params ?? {}) as Record<string, unknown>;
      const assets = await runPipelineFn(job.type, params);

      /**
       * A pipeline that returns nothing has FAILED, even without throwing.
       *
       * Without this the job fell through to `actualCost = cost * 0`, charged
       * zero, and was marked `done` — so the customer saw "Gotovo" in Moje
       * reklame with no video attached and no error to explain it. Reachable
       * whenever the script provider answers with an empty variant list: the
       * loop below simply never runs and every later step succeeds.
       *
       * Throwing hands it to the catch, which marks the job `error` and returns
       * BEFORE charge_credits — nothing is charged, which is already the rule
       * for a failed job.
       */
      if (assets.length === 0) {
        throw new Error(
          `pipeline produced no assets for job type "${job.type}" — nothing to deliver`,
        );
      }

      {
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
        // The RPC's own message is a Postgres one — logged, never stored on a
        // row the customer reads.
        consoleLogger.error('charge failed', { jobId, error: chargeError.message });
        await db
          .from('jobs')
          .update({
            status: 'error',
            error: 'charge_failed: Naplata nije uspela. Posao nije naplaćen.',
          })
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
      // Keep the real text where the operator can read it, store only what the
      // customer should see. `err` is still rethrown unchanged, so BullMQ's
      // retry/stall behaviour is exactly as before.
      consoleLogger.error('job failed', { jobId, error: message });
      await db
        .from('jobs')
        .update({ status: 'error', error: jobErrorForUser(message) })
        .eq('id', jobId);
      throw err;
    }
  };
}

async function main() {
  // `mediaEdit` is the one slot that can be null — it has no mock counterpart,
  // so an absent FAL_API_KEY leaves it unset rather than mocked. Reading .name
  // off it crashed the worker on startup for any config without that key, which
  // is the default mock-first config: since the slot was added, a fresh clone
  // could not boot the worker at all.
  const providerModes = Object.fromEntries(
    Object.entries(providers).map(([k, v]) => [k, v?.name ?? 'not configured']),
  );
  // The factory's `renderer` is NOT what draws a matrix video — see the
  // matrixRenderer comment. Logging only the factory's choice would report
  // "mock-renderer" on a box that is in fact rendering for real locally, which
  // is precisely the kind of startup line someone would later trust.
  providerModes.matrixRenderer = matrixRenderer.name;
  consoleLogger.info('provider modes', providerModes);

  if (!SERVICE_KEY) {
    consoleLogger.error(
      'SUPABASE_SERVICE_ROLE_KEY is not set — the worker cannot read/write jobs. ' +
        'Run `supabase start` and set it (see packages/db/src/seed.ts for the pattern). Exiting.',
    );
    process.exit(1);
  }
  const db = createServiceClient(SUPABASE_URL, SERVICE_KEY);

  // A worker on mocks is worse than a worker that is down. A down worker leaves
  // the job queued; a mocked one marks it DONE, charges the credits, and hands
  // back canned text that looks like success. That exact thing was found
  // running on the VPS on 2026-08-10 against the shared queue. In production,
  // refuse to serve rather than lie.
  const mocked = mockProviderSlots(providers);
  if (mocked.length > 0) {
    const inProduction = process.env.NODE_ENV === 'production';
    const message = `provider slots resolved to MOCKS: ${mocked.join(', ')}`;
    if (inProduction && process.env.ALLOW_MOCK_PROVIDERS !== '1') {
      consoleLogger.error(
        `${message}. Refusing to start in production — a mocked worker answers paid jobs ` +
          'with canned output and still charges for it. Set the missing keys in the ' +
          "worker's .env, or set ALLOW_MOCK_PROVIDERS=1 if this really is a staging box.",
      );
      process.exit(1);
    }
    consoleLogger.warn(`${message} — fine for local development, never for production.`);
  }

  // Each Worker blocks on its connection while waiting for a job; sharing one
  // connection between two workers is a documented way to get a stuck
  // consumer. One connection per worker.
  const connection = createRedisConnection();
  const lightConnection = createRedisConnection();
  /**
   * How many jobs this process runs at once.
   *
   * 4 is fine for the cheap tools, and wrong for the expensive one: a single
   * Remotion render drives a Chromium and an ffmpeg to near-100% across every
   * core and wants roughly 2 GB. Four of those on a 4-vCPU / 8 GB box do not
   * run four times faster — they thrash, and the likeliest outcome is an
   * out-of-memory kill that shows up as jobs failing under load, i.e. exactly
   * when it hurts. Set WORKER_CONCURRENCY=1 or 2 on the render box.
   *
   * Left at 4 by default so nothing changes for anyone who does not set it.
   */
  const parsedConcurrency = Number(process.env.WORKER_CONCURRENCY);
  const concurrency =
    Number.isInteger(parsedConcurrency) && parsedConcurrency > 0 ? parsedConcurrency : 4;
  // Same parsing, same default, for the light lane. The light queue only ever
  // runs one provider call plus a copy per job, so 4 in parallel is safe.
  const parsedLightConcurrency = Number(process.env.WORKER_CONCURRENCY_LIGHT);
  const lightConcurrency =
    Number.isInteger(parsedLightConcurrency) && parsedLightConcurrency > 0
      ? parsedLightConcurrency
      : 4;

  const processor = makeProcessor(db);

  const worker = new Worker<JobQueueData>(HEAVY_QUEUE_NAME, processor, {
    connection,
    concurrency,
  });
  const lightWorker = new Worker<JobQueueData>(LIGHT_QUEUE_NAME, processor, {
    connection: lightConnection,
    concurrency: lightConcurrency,
  });

  // Liveness heartbeat (apps/worker/src/health.ts): written from inside this
  // process's own event loop, read by the compose healthcheck. A worker that is
  // up but no longer consuming stops beating, and Docker restarts it.
  // One call: the heartbeat is per PROCESS, not per queue.
  const stopHeartbeat = startHeartbeat(connection);

  /**
   * Event handlers shared by BOTH workers — a job completing, failing or
   * stalling on either lane must be treated identically.
   */
  function attachWorkerHandlers(w: Worker<JobQueueData>): void {
    w.on('completed', (bullJob) => consoleLogger.info('job done', { jobId: bullJob.data.jobId }));
    w.on('failed', (bullJob, err) => {
      consoleLogger.error('job failed', { jobId: bullJob?.data.jobId ?? '?', error: err.message });
      // Fire-and-forget: never await an alert inside an event handler, where a
      // rejection would be unhandled. Opt-in via ALERT_WEBHOOK_URL (no-op unset).
      void alertJobFailed({
        jobId: bullJob?.data.jobId ?? '?',
        type: bullJob?.name,
        error: err.message,
      });
    });
    w.on('error', (err) => consoleLogger.error('connection error', { error: err.message }));
    // A stall means some worker died mid-job and BullMQ re-delivered it — before
    // this listener that was invisible: the DB row stays 'running', the customer
    // polls forever, the logs say nothing. Log ONLY: BullMQ still owns the retry
    // decision, and touching the job row from here too is how a double refund
    // happens.
    w.on('stalled', (bullJobId) => consoleLogger.warn('job stalled', { bullJobId }));
  }
  attachWorkerHandlers(worker);
  attachWorkerHandlers(lightWorker);

  consoleLogger.info('listening', {
    queue: HEAVY_QUEUE_NAME,
    concurrency,
    lightQueue: LIGHT_QUEUE_NAME,
    lightConcurrency,
  });

  // Docker sends SIGTERM on stop / restart / `up -d --build`; SIGINT is a Ctrl-C.
  // Node's default for an unhandled SIGTERM is instant death, which cuts an
  // in-flight render in half with no 'failed' event, no refund, and a job row
  // stuck on 'running'. Both signals share this one guarded path, and
  // `worker.close()` waits for in-flight jobs first — that is the entire point.
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    consoleLogger.info('shutting down', { signal });
    stopHeartbeat();
    try {
      // allSettled, not all: if one worker's close() rejects, the other must
      // still be allowed to drain its in-flight jobs.
      await Promise.allSettled([worker.close(), lightWorker.close()]);
    } finally {
      // finally, not after: even if close() rejects, the process must still
      // exit — lingering here would just earn a SIGKILL 10s later.
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

// Only boot the BullMQ consumer when this file is *run*, not when it's
// imported (tests / verification drivers import runMatrixPipeline directly and
// must not open a Redis connection or exit the process on a missing key).
const isDirectRun =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) main().catch((err) => {
  consoleLogger.error('fatal', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});