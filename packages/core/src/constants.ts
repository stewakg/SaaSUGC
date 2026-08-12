/**
 * Canonical UI option lists + Matrix defaults.
 *
 * Shared by the worker (fallback defaults, param validation), the web
 * wizards (dropdown options), and the Remotion Studio preview (Root.tsx) —
 * a single source of truth so a language/transition/default never drifts
 * between what the UI offers and what the worker actually accepts.
 */
import type { MatrixTransition, UiLanguage } from './types.ts';

/** Supported UI languages (competitor has these too). */
export const UI_LANGUAGES: { value: UiLanguage; label: string }[] = [
  { value: 'sr', label: 'Srpski' },
  { value: 'bs', label: 'Bosanski' },
  { value: 'hr', label: 'Hrvatski' },
  { value: 'ro', label: 'Rumunski' },
  { value: 'en', label: 'Engleski' },
];

export const MATRIX_TRANSITIONS: { value: MatrixTransition; label: string }[] = [
  { value: 'fade', label: 'Fade' },
  { value: 'zoom-punch', label: 'Zoom punch' },
  { value: 'flash-whoosh', label: 'Flash whoosh' },
  { value: 'color-pop', label: 'Color pop' },
];

// The old googleapis gtv-videos-bucket sample now 403s (bucket locked down) —
// this w3schools tutorial asset has been a stable public sample for years.
export const DEFAULT_BACKGROUND_VIDEO_URL = 'https://www.w3schools.com/html/mov_bbb.mp4';
export const DEFAULT_MATRIX_CAPTION_STYLE = 'cap:Impact:pop:#FFE000';
export const DEFAULT_MATRIX_OUTRO_TEXT = 'NARUČI ODMAH · Plaćaš pouzećem';

/**
 * ElevenLabs model id used as the default when a job doesn't specify one.
 * MockVoiceProvider ignores this; ElevenLabsVoiceProvider sends it as the real
 * model_id. Update when ElevenLabs ships a newer default.
 */
export const DEFAULT_VOICE_MODEL = 'eleven_v3';

/* ============================================================================
   Ad length limits — the ceiling on what one job can cost.
   ============================================================================
   Added 2026-08-12. Until now a job's cost had no upper bound at all, which is
   why per-job spend could not be measured, only guessed at:

   - the 2000-character cap lived in `approved-scripts.ts` and therefore applied
     ONLY to scripts the user had reviewed. A script coming straight from the
     model went to ElevenLabs verbatim, at whatever length it happened to be;
   - `durationInFrames` was computed from the real word timings with no clamp,
     so a long script produced a long render, and render time is roughly linear
     in frames.

   Both costs scale with the same thing — how much speech there is — so both
   limits are expressed here and applied at the single point where the money is
   actually spent (just before TTS in the worker).

   The numbers are chosen for the product, not for the API: an ad for TikTok,
   Reels or Shorts is 15-30 seconds. Serbian runs roughly 14-15 characters per
   second of speech, so 700 characters is about 45-50 seconds — comfortably
   above any real ad while making a runaway script impossible. */

/** Hard ceiling on the finished ad, INCLUDING the outro card. */
export const MAX_AD_SECONDS = 60;

/**
 * Longest script that will be sent to text-to-speech, per variant.
 *
 * ElevenLabs bills per character, and a `count=15` job speaks this many
 * characters fifteen times — so this number, multiplied by 15, is the worst
 * case for the voice line of a single job.
 */
export const MAX_SCRIPT_CHARS = 700;

/**
 * Trim a script to `MAX_SCRIPT_CHARS` without cutting mid-word.
 *
 * Prefers to end on sentence punctuation, then on a word boundary, and only
 * falls back to a hard cut if the text contains neither within the limit. A
 * hard cut mid-word is audible: the voice reads the fragment, and the customer
 * hears an ad that stops in the middle of a syllable.
 */
export function clampScriptForSpeech(script: string, limit = MAX_SCRIPT_CHARS): string {
  const text = script.trim();
  if (text.length <= limit) return text;

  const head = text.slice(0, limit);

  const lastSentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
  if (lastSentence > limit * 0.5) return head.slice(0, lastSentence + 1).trim();

  const lastSpace = head.lastIndexOf(' ');
  if (lastSpace > limit * 0.5) return head.slice(0, lastSpace).trim();

  return head.trim();
}
