/**
 * Shared domain types — mirror the Supabase schema in INFRASTRUCTURE.md §3.
 * Keep these in sync with the SQL migrations in packages/db/migrations.
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
  | 'ai_video';

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
  /** SFX-on-CTA hook (INFRASTRUCTURE.md §5 F4) — plays once when the outro card appears. Unset in mock mode. */
  sfxUrl?: string;
  captionWords: CaptionWord[];
  captionStyle: string;
  captionScale: number;
  transitionIn: MatrixTransition;
  outroText: string;
  durationInFrames: number;
  fps: number;
}