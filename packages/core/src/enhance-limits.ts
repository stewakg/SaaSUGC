/* ============================================================================
   Enhance (Topaz upscale) input limits — the only path where a customer can
   make one job cost more than it earns.
   ============================================================================
   Added 2026-08-20, from MARGINS.md "Nalaz #1" (TODO §2a, the one ⛔).

   `enhance` charges a FLAT 9 credits (~€1.80). fal's Topaz video upscaler bills
   PER SECOND and PER OUTPUT RESOLUTION — $0.01/s ≤720p, $0.02/s up to 1080p,
   $0.08/s above, doubled at 60fps (captured from the model's own llms.txt,
   2026-08-10; see providers/media-edit.fal.ts). The 200 MB upload ceiling bounds
   the FILE, not its duration or its resolution, so before this module a 60s
   clip above 1080p at 60fps could cost $9.60 against €1.80 of revenue.

   Two decisions worth keeping:

   1. RESOLUTION IS JUDGED ON THE OUTPUT, not the input. The upscale factor is
      what makes a 720p source a 1440p bill, so the factor is clamped until the
      OUTPUT fits the band the product card already promises („HD do 1080p").
      That turns today's habit into a guarantee.

   2. AN UNREADABLE PROBE IS A REFUSAL, not a default. If we cannot measure the
      clip we cannot bound what it costs, and the caller has not been charged
      yet at the point this runs — so failing closed costs a customer one error
      message, while failing open costs real money on an unknown input.

   Worst case that survives these limits: 60s, 1080p, 30fps = $1.20 (~€1.11)
   against €1.80 — thin (~33%) but never a loss. Charging enhance PER SECOND is
   the real answer and is still an open pricing decision (TODO §2a).
   ========================================================================== */

/** Longest video `enhance` accepts. Matches MAX_AD_SECONDS by coincidence, not by rule. */
export const ENHANCE_MAX_SECONDS = 60;

/** Tallest OUTPUT `enhance` will produce — the top of fal's $0.02/s band, and the card's promise. */
export const ENHANCE_MAX_HEIGHT = 1080;

/** Above this, fal doubles the price. Anything faster is interpolated back down to it. */
export const ENHANCE_MAX_FPS = 30;

/** Upscale factors fal's Topaz endpoint accepts. */
const MIN_UPSCALE_FACTOR = 1;
const MAX_UPSCALE_FACTOR = 4;

export interface EnhanceVideoMeta {
  durationSec: number;
  /** Frame height in pixels — the dimension fal's price bands are named after. */
  height: number;
  /** Optional: an unreadable frame rate is treated as ≤30 and pinned anyway. */
  fps?: number;
}

export type EnhanceVideoRefusalCode = 'unreadable' | 'input_too_long' | 'input_too_large';

export type EnhanceVideoPlan =
  | {
      ok: true;
      /** What to send fal — never the raw request; clamped so the output fits the 1080p band. */
      upscaleFactor: number;
      /** Set only when the source runs faster than ENHANCE_MAX_FPS; undefined means "leave fal's default". */
      targetFps?: number;
      /** Height the customer will actually get, in pixels. */
      outputHeight: number;
      /** What we expect fal to bill, in USD, at the captured list price. */
      estimatedUsd: number;
    }
  /**
   * A refusal carries a machine code AND the exact Serbian sentence the customer
   * sees. The wizard prints `message` as-is; the worker throws
   * `${code}: ${message}` because its errors are read in logs, where the code is
   * what makes two failures greppable apart.
   */
  | { ok: false; code: EnhanceVideoRefusalCode; message: string };

/**
 * fal's Topaz video price for a finished clip, in USD.
 *
 * Bands are read off the OUTPUT height. `fps > ENHANCE_MAX_FPS` doubles it —
 * fal's own wording is "×2 at 60fps", and treating everything above 30 as the
 * expensive tier is the conservative reading of an ambiguous price list.
 */
export function topazVideoCostUsd(durationSec: number, outputHeight: number, fps = ENHANCE_MAX_FPS): number {
  const perSecond = outputHeight <= 720 ? 0.01 : outputHeight <= ENHANCE_MAX_HEIGHT ? 0.02 : 0.08;
  const fpsMultiplier = fps > ENHANCE_MAX_FPS ? 2 : 1;
  return durationSec * perSecond * fpsMultiplier;
}

/**
 * Decide whether a probed video may be enhanced, and with which parameters.
 *
 * Pure so both sides can run it: the browser probes the file before it is
 * uploaded (so the customer is not made to wait for 200 MB before being told
 * no), and the WORKER probes the stored source before it calls fal — that
 * second one is the authority, because the browser's answer is a claim a
 * hand-written request can simply not make.
 */
export function planEnhanceVideo(meta: EnhanceVideoMeta, requestedFactor?: number): EnhanceVideoPlan {
  const { durationSec, height, fps } = meta;

  if (!Number.isFinite(durationSec) || durationSec <= 0 || !Number.isFinite(height) || height <= 0) {
    return {
      ok: false,
      code: 'unreadable',
      message:
        'Ne mogu da pročitam trajanje i rezoluciju videa, pa posao nije pokrenut. ' +
        'Probaj MP4 (H.264). Nije naplaćeno.',
    };
  }

  if (durationSec > ENHANCE_MAX_SECONDS) {
    return {
      ok: false,
      code: 'input_too_long',
      message:
        `Video traje ${Math.round(durationSec)}s, a „Poboljšaj kvalitet" prima najviše ` +
        `${ENHANCE_MAX_SECONDS}s. Iseci klip pa probaj ponovo. Nije naplaćeno.`,
    };
  }

  if (height > ENHANCE_MAX_HEIGHT) {
    return {
      ok: false,
      code: 'input_too_large',
      message:
        `Video je ${Math.round(height)}p, a alat radi do ${ENHANCE_MAX_HEIGHT}p — taj snimak je već ` +
        'iznad kvaliteta koji ovaj alat isporučuje. Nije naplaćeno.',
    };
  }

  const asked =
    typeof requestedFactor === 'number' && Number.isFinite(requestedFactor)
      ? Math.min(Math.max(Math.floor(requestedFactor), MIN_UPSCALE_FACTOR), MAX_UPSCALE_FACTOR)
      : 2;
  const fitsInBand = Math.max(MIN_UPSCALE_FACTOR, Math.floor(ENHANCE_MAX_HEIGHT / height));
  const upscaleFactor = Math.min(asked, fitsInBand);
  const outputHeight = height * upscaleFactor;
  const targetFps = typeof fps === 'number' && Number.isFinite(fps) && fps > ENHANCE_MAX_FPS ? ENHANCE_MAX_FPS : undefined;

  return {
    ok: true,
    upscaleFactor,
    targetFps,
    outputHeight,
    estimatedUsd: topazVideoCostUsd(durationSec, outputHeight, targetFps ?? fps),
  };
}
