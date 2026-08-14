/**
 * Real provider for the two post-production tools the wizard offers but nothing
 * has ever executed: `enhance` (upscale an image or a video) and `remove_text`
 * (strip burned-in writing from an image). Both run on fal.ai. Plain fetch, no
 * SDK — matches this repo's style (ai.kiefal.ts, script.openrouter.ts,
 * scraper.real.ts).
 *
 * WHY A SEPARATE MODULE RATHER THAN MORE METHODS ON KieAIFalRouter: that class
 * implements AIProvider, whose contract is "make something from a prompt", and
 * it exists to route between two vendors for the same job. Neither applies
 * here. These are edit operations on media the user already has, there is no
 * kie.ai counterpart to route to, and — see below — one of them takes no prompt
 * at all. Bolting them onto the router would mean widening AIProvider for
 * methods only fal can serve.
 *
 * TEXT REMOVAL TAKES NO PROMPT, AND THAT IS THE REASON THIS ENDPOINT WAS
 * PICKED. The obvious alternatives (`bria/fibo-edit/erase_by_text`,
 * `object-removal`) want you to name the thing to erase in a prompt. Our users
 * type Serbian, the models are prompted in English, and every prompt-driven
 * tool would need a translation layer that can silently mistranslate into
 * erasing the wrong object. `fal-ai/image-editing/text-removal` needs only the
 * image URL, so the whole class of failure disappears.
 *
 * VIDEO TEXT REMOVAL IS DELIBERATELY ABSENT. fal's only video erasers
 * (`bria/video/erase/{mask,keypoints}`) cost $0.14/s — $2.10 for a 15s clip,
 * against ~€3–4.50 of revenue for the entire video — and the keypoints variant
 * caps input at 5 seconds. See research/fal-ai-catalogue.md §2. Do not add a
 * removeTextFromVideo here until that changes; the shot-level filter is the
 * answer for now.
 *
 * Costs, from each model's own llms.txt (captured 2026-08-10):
 *   - topaz/upscale/video: $0.01/s ≤720p, $0.02/s 720p–1080p, $0.08/s above,
 *     doubled at 60fps. A 15s 1080p clip is ~$0.30.
 *   - topaz/upscale/image: $0.08 up to 24MP, rising to $1.36 at 512MP.
 *   - image-editing/text-removal: $0.04 per image.
 *
 * NOT LIVE-TESTED. Schemas below were read from the per-model llms.txt on
 * 2026-08-10, which fal generates from the same metadata it serves, but no call
 * has ever been made with a real FAL_API_KEY. Treat as CODE-COMPLETE.
 */

const FAL_QUEUE_BASE = 'https://queue.fal.run';

export const FAL_UPSCALE_IMAGE_ENDPOINT = 'fal-ai/topaz/upscale/image';
export const FAL_UPSCALE_VIDEO_ENDPOINT = 'fal-ai/topaz/upscale/video';
export const FAL_TEXT_REMOVAL_ENDPOINT = 'fal-ai/image-editing/text-removal';

const IMAGE_POLL_INTERVAL_MS = 2000;
const IMAGE_MAX_WAIT_MS = 5 * 60 * 1000; // Topaz stills finish in seconds; the headroom is for queue depth
const VIDEO_POLL_INTERVAL_MS = 5000;
const VIDEO_MAX_WAIT_MS = 20 * 60 * 1000; // a 15s clip at 4x is minutes of real GPU work, plus queue

/** fal's queue reports these three; anything else is treated as a hard failure. */
const PENDING_STATUSES = new Set(['IN_QUEUE', 'IN_PROGRESS']);

export interface UpscaleImageOptions {
  /** Topaz model, e.g. 'Standard V2' (default), 'High Fidelity V2', 'Text Refine'. */
  model?: string;
  /** 1–4, fal defaults to 2. */
  upscaleFactor?: number;
  /** fal defaults to 'jpeg'; png is the right choice for anything re-composited later. */
  outputFormat?: 'jpeg' | 'png';
  /** fal defaults this to true, which retouches faces — undesirable on a product shot. */
  faceEnhancement?: boolean;
  cropToFill?: boolean;
}

export interface UpscaleVideoOptions {
  /** Topaz model, e.g. 'Proteus' (default), 'Artemis HQ', 'Gaia 2'. */
  model?: string;
  /** 1–4, fal defaults to 2. */
  upscaleFactor?: number;
  /** Frame interpolation target, 16–60. Note that 60 doubles the price. */
  targetFps?: number;
  /** H.264 instead of the default H.265 — safer for downstream Remotion/browser playback. */
  h264Output?: boolean;
}

export interface RemoveTextOptions {
  /** 0–20, fal defaults to 3.5. */
  guidanceScale?: number;
  /** 1–50, fal defaults to 30. */
  numInferenceSteps?: number;
  /** fal defaults to 'jpeg'. */
  outputFormat?: 'jpeg' | 'png';
  /** Pin for reproducible output. */
  seed?: number;
}

/** Shape of the submit response; `status_url` is fal's own canonical poll URL. */
interface FalSubmitResponse {
  request_id?: string;
  status_url?: string;
  /**
   * Where the RESULT lives. fal returns this for a reason, and constructing it
   * instead is what broke the first live call — see the comment at the result
   * fetch below.
   */
  response_url?: string;
}

interface FalStatusResponse {
  status?: string;
  error?: unknown;
}

interface FalFile {
  url?: string;
}

export class FalMediaEditProvider {
  readonly name = 'fal-media-edit';

  constructor(private readonly config: { apiKey: string }) {}

  /**
   * Upscale a still. Returns the URL of the new image on fal's CDN — the caller
   * is responsible for copying it into R2, since fal's URLs are not permanent.
   */
  async upscaleImage(imageUrl: string, opts: UpscaleImageOptions = {}): Promise<{ url: string }> {
    const result = await this.runQueueJob<{ image?: FalFile }>(
      FAL_UPSCALE_IMAGE_ENDPOINT,
      {
        image_url: imageUrl,
        model: opts.model,
        upscale_factor: opts.upscaleFactor,
        output_format: opts.outputFormat,
        face_enhancement: opts.faceEnhancement,
        crop_to_fill: opts.cropToFill,
      },
      IMAGE_POLL_INTERVAL_MS,
      IMAGE_MAX_WAIT_MS,
    );
    // Singular `image`, unlike text-removal's `images` array — the two fal
    // endpoints genuinely differ here.
    const url = result.image?.url;
    if (!url) {
      throw new Error(`fal.ai ${FAL_UPSCALE_IMAGE_ENDPOINT} completed but returned no image URL`);
    }
    return { url };
  }

  /** Upscale a video. Same CDN caveat as upscaleImage. */
  async upscaleVideo(videoUrl: string, opts: UpscaleVideoOptions = {}): Promise<{ url: string }> {
    const result = await this.runQueueJob<{ video?: FalFile }>(
      FAL_UPSCALE_VIDEO_ENDPOINT,
      {
        video_url: videoUrl,
        model: opts.model,
        upscale_factor: opts.upscaleFactor,
        target_fps: opts.targetFps,
        H264_output: opts.h264Output,
      },
      VIDEO_POLL_INTERVAL_MS,
      VIDEO_MAX_WAIT_MS,
    );
    const url = result.video?.url;
    if (!url) {
      throw new Error(`fal.ai ${FAL_UPSCALE_VIDEO_ENDPOINT} completed but returned no video URL`);
    }
    return { url };
  }

  /**
   * Remove every piece of burned-in text from an image, preserving the
   * background. No prompt — see the module doc-comment for why that is the
   * point rather than a limitation.
   */
  async removeTextFromImage(imageUrl: string, opts: RemoveTextOptions = {}): Promise<{ url: string }> {
    const result = await this.runQueueJob<{ images?: FalFile[] }>(
      FAL_TEXT_REMOVAL_ENDPOINT,
      {
        image_url: imageUrl,
        guidance_scale: opts.guidanceScale,
        num_inference_steps: opts.numInferenceSteps,
        output_format: opts.outputFormat,
        seed: opts.seed,
      },
      IMAGE_POLL_INTERVAL_MS,
      IMAGE_MAX_WAIT_MS,
    );
    const url = result.images?.[0]?.url;
    if (!url) {
      throw new Error(`fal.ai ${FAL_TEXT_REMOVAL_ENDPOINT} completed but returned no image URL`);
    }
    return { url };
  }

  /**
   * fal's queue protocol, shared by all three endpoints: POST the input, poll
   * the status URL until COMPLETED, then GET the result. Same three-step shape
   * as ai.kiefal.ts's fal path, with one addition — that one loops until its
   * timeout on any unrecognised status, so a job fal has already given up on
   * still burns the full wait. Here anything outside IN_QUEUE/IN_PROGRESS/
   * COMPLETED fails immediately and says which endpoint it was.
   *
   * `undefined` fields are dropped by JSON.stringify, so an omitted option
   * means "let fal apply its own default" rather than "send null".
   */
  private async runQueueJob<T>(
    endpointId: string,
    input: Record<string, unknown>,
    pollIntervalMs: number,
    maxWaitMs: number,
  ): Promise<T> {
    const authHeader = `Key ${this.config.apiKey}`;

    const submitRes = await fetch(`${FAL_QUEUE_BASE}/${endpointId}`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!submitRes.ok) {
      const body = await submitRes.text().catch(() => '');
      throw new Error(`fal.ai ${endpointId} submit failed (${submitRes.status}): ${body}`);
    }
    const submitJson = (await submitRes.json()) as FalSubmitResponse;
    const requestId = submitJson.request_id;
    if (!requestId) {
      throw new Error(`fal.ai ${endpointId} submit returned no request_id`);
    }
    const statusUrl = submitJson.status_url ?? `${FAL_QUEUE_BASE}/${endpointId}/requests/${requestId}/status`;

    const start = Date.now();
    while (true) {
      const statusRes = await fetch(statusUrl, { headers: { Authorization: authHeader } });
      if (!statusRes.ok) {
        throw new Error(`fal.ai ${endpointId} status check failed (${statusRes.status}) for request ${requestId}`);
      }
      const statusJson = (await statusRes.json()) as FalStatusResponse;
      const status = statusJson.status ?? '';
      if (status === 'COMPLETED') break;
      if (!PENDING_STATUSES.has(status)) {
        throw new Error(`fal.ai ${endpointId} request ${requestId} failed with status "${status}"`);
      }
      if (Date.now() - start > maxWaitMs) {
        throw new Error(`fal.ai ${endpointId} request ${requestId} timed out after ${maxWaitMs / 1000}s`);
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    /**
     * Use fal's own `response_url`, not a constructed one.
     *
     * FOUND BY THE FIRST LIVE CALL, 2026-08-14: constructing
     * `${base}/${endpointId}/requests/${id}` is only right for a FLAT model id.
     * These endpoints are nested — `fal-ai/topaz/upscale/image` is the app
     * `fal-ai/topaz` plus the path `upscale/image` — and the queue lives under
     * the APP, so the constructed url pointed at
     * `…/fal-ai/topaz/upscale/image/requests/<id>`, which answers **405**. The
     * submit response already carries the correct address; the status poll above
     * was reading its `status_url` and working, while the result fetch three
     * lines later ignored the sibling field and guessed.
     *
     * The constructed form stays as a fallback for a response that omits it,
     * which is exactly the flat-id case where it happens to be correct.
     */
    const resultUrl = submitJson.response_url ?? `${FAL_QUEUE_BASE}/${endpointId}/requests/${requestId}`;
    const resultRes = await fetch(resultUrl, {
      headers: { Authorization: authHeader },
    });
    if (!resultRes.ok) {
      const body = await resultRes.text().catch(() => '');
      throw new Error(`fal.ai ${endpointId} result fetch failed (${resultRes.status}): ${body}`);
    }
    return (await resultRes.json()) as T;
  }
}
