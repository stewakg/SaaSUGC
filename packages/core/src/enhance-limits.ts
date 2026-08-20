/* ============================================================================
   Enhance (Topaz upscale) input limits — the only path where a customer can
   make one job cost more than it earns.
   ============================================================================
   Added 2026-08-20, from MARGINS.md "Nalaz #1" (TODO §2a, the one ⛔).

   `enhance` charges a FLAT 9 credits (€0.90 worst-case — 9 credits at the cheapest pack's €0.100/credit, see pricing.ts). fal's Topaz video upscaler bills
   PER SECOND and PER OUTPUT RESOLUTION — $0.01/s ≤720p, $0.02/s up to 1080p,
   $0.08/s above, doubled at 60fps (captured from the model's own llms.txt,
   2026-08-10; see providers/media-edit.fal.ts). The 200 MB upload ceiling bounds
   the FILE, not its duration or its resolution, so before this module a 60s
   clip above 1080p at 60fps could cost $9.60 against €0.90 of revenue.

   Two decisions worth keeping:

   1. RESOLUTION IS JUDGED ON THE OUTPUT, not the input. The upscale factor is
      what makes a 720p source a 1440p bill, so the factor is clamped until the
      OUTPUT fits the band the product card already promises („HD do 1080p").
      That turns today's habit into a guarantee.

   2. AN UNREADABLE PROBE IS A REFUSAL, not a default. If we cannot measure the
      clip we cannot bound what it costs, and the caller has not been charged
      yet at the point this runs — so failing closed costs a customer one error
      message, while failing open costs real money on an unknown input.

   3. LENGTH IS PRICED, NOT FORBIDDEN (2026-08-20). The first version of this
      module refused anything over 30 seconds, which protected the margin by
      making the tool useless for a normal 45-second ad. It now bills in 30-second
      TIERS: nine credits buys thirty seconds, a longer clip costs proportionally
      more, and the margin stops decaying with duration instead of the tool
      stopping at 30s. Four tiers (120s) is the ceiling — an unbounded one is how
      this became a bug in the first place.

   Worst case per tier: 30s in the 1080p band = $0.60 (~€0.55) against €0.90 of
   revenue at the cheapest pack rate. A 120s clip is 36 credits (€3.60) against
   ~€2.22. Thin (~39%) at every length, but never a loss, and no longer
   length-dependent.
   ========================================================================== */

/**
 * One billing tier of video. Thirty seconds costs `JOB_COST.enhance` credits.
 *
 * The number comes from the money: fal's Topaz bills $0.02/s in the 1080p band,
 * so 30s costs ~€0.55 against the €0.90 that nine credits earn at the cheapest
 * pack rate. Any tier length works arithmetically — this one keeps a single-tier
 * job feeling like a flat price to the customer while the margin stays constant
 * as clips get longer.
 */
export const ENHANCE_SECONDS_PER_TIER = 30;

/** Four tiers, i.e. two minutes. A ceiling has to exist; see decision 3 above. */
export const ENHANCE_MAX_TIERS = 4;

/** Longest video `enhance` accepts, derived so the two numbers cannot drift. */
export const ENHANCE_MAX_SECONDS = ENHANCE_SECONDS_PER_TIER * ENHANCE_MAX_TIERS;

/**
 * How many tiers a clip is billed as: every started 30 seconds, minimum one.
 *
 * A still image has no duration and bills as one tier — which is also what a
 * non-finite or negative input returns, because the safe answer to "I cannot
 * measure this" on the PRICING side is the minimum the customer could owe. The
 * REFUSAL side is where an unmeasurable file is rejected (planEnhanceVideo);
 * mixing the two would either overcharge for an image or let a bad probe set a
 * price.
 */
export function enhanceTiers(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 1;
  const tiers = Math.ceil(durationSec / ENHANCE_SECONDS_PER_TIER);
  return Math.min(Math.max(tiers, 1), ENHANCE_MAX_TIERS);
}

/**
 * What a clip of this length costs, in credits.
 *
 * `unitCost` defaults to the 9 that `JOB_COST.enhance` holds, passed as a
 * parameter rather than imported: `pricing.ts` is the module that owns job
 * prices, and importing it here would point the dependency arrow backwards —
 * pricing already refers to this file in prose. Callers that have `JOB_COST` in
 * hand should pass it, so a future change to the price of `enhance` reaches this
 * function without anyone remembering to update a literal.
 */
export function enhanceCreditCost(durationSec: number, unitCost = 9): number {
  return unitCost * enhanceTiers(durationSec);
}

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
        `${ENHANCE_MAX_SECONDS}s (${ENHANCE_MAX_TIERS} × ${ENHANCE_SECONDS_PER_TIER}s). ` +
        'Iseci klip pa probaj ponovo. Nije naplaćeno.',
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
