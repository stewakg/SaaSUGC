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
