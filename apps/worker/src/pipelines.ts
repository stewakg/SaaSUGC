import {
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
import type { AssetKind } from '@adgen/db';
import { detectShots, downloadClip } from './scene-detect.ts';
import { buildMontage, type PoolShot } from './montage.ts';
import { approvedScripts, speakerGenderOf } from './approved-scripts.ts';
import { providers, matrixRenderer } from './providers.ts';
import { isImageSource, persistRemoteAsset, resolveStorageUrl } from './asset-storage.ts';

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

export interface PipelineAsset {
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
        `Alat je u izradi; Nova reklama, AI slike i Poboljšaj kvalitet rade.`,
    );
  }

  const { videoUrl, storageKey } = await deps.renderer.render({ composition: type, props: params });
  return [{ kind: 'video', url: videoUrl, storageKey: storageKey ?? null }];
}
