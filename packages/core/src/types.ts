/**
 * Shared domain types — mirror the Supabase schema in INFRASTRUCTURE.md §3.
 * Keep these in sync with the SQL migrations in packages/db/migrations.
 */

/**
 * ⚠️ This list exists in THREE places that nothing keeps in step automatically:
 * here, `packages/db/src/generated/database.types.ts`, and the `job_type` enum
 * in the SQL migrations. Adding a job type means editing all three — miss one
 * and the mismatch surfaces as a type error at best, or as a job the database
 * rejects at insert time at worst.
 */
export type JobType =
  | 'matrix'
  | 'edit'
  | 'image_ads'
  | 'mix'
  | 'quick_test'
  | 'translate'
  | 'enhance'
  | 'remove_text'
  | 'ai_video'
  /** One clip, N re-voiced copies. Migration 0006. */
  | 'revoice';

export type JobStatus = 'queued' | 'running' | 'done' | 'error';

export type AssetKind = 'video' | 'image' | 'audio';

/** A row in `profiles`. balance is a cached running total of credits_ledger. */
export interface Profile {
  id: string; // uuid, = auth.users.id
  email: string;
  balance: number;
  createdAt: string;
}

/** A row in `credits_ledger`. delta is +topup / -spend. */
export interface CreditLedgerEntry {
  id: string;
  userId: string;
  delta: number;
  reason: string;
  jobId: string | null;
  createdAt: string;
}

/** A row in `jobs`. params/result are freeform jsonb (typed per JobType). */
export interface Job {
  id: string;
  userId: string;
  type: JobType;
  status: JobStatus;
  params: Record<string, unknown>;
  result: Record<string, unknown> | null;
  cost: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A row in `assets`. `storageKey` is null when the asset isn't actually
 * stored under a key of ours (external mock URL, or a provider CDN URL) —
 * see the note on `AIProvider`/`Renderer` in interfaces.ts.
 */
export interface Asset {
  id: string;
  jobId: string;
  userId: string;
  kind: AssetKind;
  storageKey: string | null;
  url: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

/**
 * UI-facing job descriptor (costs, labels) — from pricing.ts.
 *
 * `benefits`/`theme`/`tier` drive the EcomAlati-style dashboard cards: a
 * small set of `main` tools get a big colored gradient card with 3 bullet
 * benefits, the rest (`utility`) get a compact list row. `theme` is a
 * semantic color-slot key (e.g. 'orange') — apps/web maps it to actual
 * Tailwind gradient classes; kept out of this package so @adgen/core (used
 * by the worker too) stays presentation-agnostic, same reasoning as `icon`.
 */
export interface JobDescriptor {
  type: JobType;
  label: string;
  description: string;
  cost: number;
  icon?: string;
  benefits?: string[];
  theme?: string;
  tier?: 'main' | 'utility';
}

/** Supported UI languages (competitor has these too). */
export type UiLanguage = 'sr' | 'bs' | 'hr' | 'ro' | 'en';

// ----------------------------------------------------------------------------
// Matrix / Remotion composition (F4) — shared between apps/worker (which
// builds these props) and /remotion (which renders them). Keep in sync with
// remotion/src/compositions/MatrixAd.tsx.
// ----------------------------------------------------------------------------

/** A single word with its speech timing, in seconds from video start. */
export interface CaptionWord {
  text: string;
  startSec: number;
  endSec: number;
}

export type CaptionFont = 'Impact' | 'Montserrat';
export type CaptionAnim = 'smooth' | 'pop' | 'none';
export type MatrixTransition = 'fade' | 'zoom-punch' | 'flash-whoosh' | 'color-pop';

/** How long the outro CTA card holds at the end of a Matrix render. */
export const MATRIX_OUTRO_SECONDS = 3;
/** How long the intro transition plays at the start. */
export const MATRIX_INTRO_SECONDS = 0.6;
/** Matrix compositions render at this frame rate. */
export const MATRIX_FPS = 30;

/**
 * Output shapes the user can pick from. 9:16 is the default and the reason this
 * product exists — TikTok/Reels/Shorts are vertical — but a 16:9 source
 * cover-cropped into 9:16 throws away roughly two thirds of the frame width, so
 * forcing every ad vertical actively destroys some footage. Measured on a real
 * import 2026-08-10: a 640×360 clip filling a 1080×1920 frame keeps ~202 of its
 * 640 px of width and upscales what's left ~5.3×.
 *
 * Keep every option a multiple of 2 in both dimensions — h264 requires it.
 */
export const MATRIX_ASPECTS = {
  '9:16': { width: 1080, height: 1920, label: 'Uspravno (TikTok, Reels, Shorts)' },
  '1:1': { width: 1080, height: 1080, label: 'Kvadrat (feed)' },
  '16:9': { width: 1920, height: 1080, label: 'Vodoravno (YouTube)' },
} as const satisfies Record<string, { width: number; height: number; label: string }>;

export type MatrixAspect = keyof typeof MATRIX_ASPECTS;

/** The shape used when nothing is chosen — unchanged from before this was selectable. */
export const DEFAULT_MATRIX_ASPECT: MatrixAspect = '9:16';

/** Narrow an untrusted value (job params, query string) to a known aspect. */
export function toMatrixAspect(value: unknown): MatrixAspect {
  return typeof value === 'string' && value in MATRIX_ASPECTS ? (value as MatrixAspect) : DEFAULT_MATRIX_ASPECT;
}

/**
 * Props for the `matrix-ad` Remotion composition.
 * `captionStyle` is the compact form from INFRASTRUCTURE.md §5 F4:
 * `cap:<font>:<anim>:<hexcolor>` e.g. `cap:Impact:pop:#FFE000`.
 *
 * The index signature is required by Remotion's `Composition<Props>` generic
 * (`Props extends Record<string, unknown>`) — a plain interface doesn't
 * structurally satisfy that constraint without one.
 */
/** One shot placed in the montage: play `playSec` of `url` starting at `startSec` (M2c). */
export interface MatrixShot {
  url: string;
  startSec: number;
  playSec: number;
}

export interface MatrixAdProps {
  [key: string]: unknown;
  /** Ordered montage of scene-detected shots (M2c). Replaces the single backgroundVideoUrl. */
  shots: MatrixShot[];
  /** Generated voiceover, muxed over the montage. Unset in mock mode (no real audio). */
  voiceUrl?: string;
  musicUrl?: string;
  /**
   * Background-music level, 0-1. Defaults to 0.25 — low enough that the voiceover
   * stays intelligible over it. Clamped by the composition.
   */
  musicVolume?: number;
  /** SFX-on-CTA hook (INFRASTRUCTURE.md §5 F4) — plays once when the outro card appears. Unset in mock mode. */
  sfxUrl?: string;
  captionWords: CaptionWord[];
  captionStyle: string;
  captionScale: number;
  /**
   * Caption anchor as a FRACTION of the frame (resolution independent), measured to the
   * CENTRE of the caption block. Defaults: x 0.5 (horizontally centred), y 0.46 (just
   * above centre — the safe-zone placement, clear of TikTok/Reels chrome at the bottom).
   * The composition clamps both, so an out-of-range value cannot push text off-frame.
   */
  captionX?: number;
  captionY?: number;
  transitionIn: MatrixTransition;
  outroText: string;
  durationInFrames: number;
  fps: number;
  /**
   * Output frame size. Optional so existing callers keep rendering 1080×1920 —
   * `Root.tsx`'s `calculateMetadata` falls back to the 9:16 default when unset.
   * Because captions are positioned as fractions of the frame, they follow any
   * size without further work.
   */
  width?: number;
  height?: number;
}