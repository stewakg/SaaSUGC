/**
 * Timezone identity — the one formatter every job timestamp goes through.
 *
 * Job timestamps used to render in whatever the browser guessed, with nothing
 * saying which zone: a seller in Frankfurt and one in Belgrade saw different
 * times for the same job, both unlabelled. The user's pick lives in a cookie
 * (same pattern as THEME_COOKIE in @/lib/theme) and is passed here explicitly.
 *
 * Lives outside the profile page on purpose: a formatting helper buried in a
 * client component cannot be imported by other pages or by tests.
 */

/** Cookie that carries the user's zone. Absent = follow the browser. */
export const TIMEZONE_COOKIE = 'adgen_tz';

/** The zones this audience actually lives in, in this order. */
export const TIMEZONES = [
  { id: 'Europe/Belgrade', label: 'Beograd (CET)' },
  { id: 'Europe/Berlin', label: 'Berlin / Frankfurt (CET)' },
  { id: 'Europe/Zagreb', label: 'Zagreb (CET)' },
  { id: 'Europe/Sarajevo', label: 'Sarajevo (CET)' },
  { id: 'Europe/Bucharest', label: 'Bukurešt (EET)' },
  { id: 'UTC', label: 'UTC' },
] as const;

export type TimezoneId = (typeof TIMEZONES)[number]['id'];

export function isTimezoneId(value: unknown): value is TimezoneId {
  return typeof value === 'string' && (TIMEZONES as readonly { id: string }[]).some((t) => t.id === value);
}

/**
 * `sr-Latn-RS`, medium date + short time, in the given zone (or the browser
 * default when no zone is passed).
 *
 * Two inputs must never break a page that shows a date:
 *  - An invalid/unknown `timeZone` makes `Intl` throw RangeError — and a stale
 *    cookie value would then take down every page that renders a timestamp, so
 *    it is caught and the browser default is used instead.
 *  - An unparseable `iso` yields '—' rather than leaking "Invalid Date".
 */
export function formatDateTime(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('sr-Latn-RS', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('sr-Latn-RS', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }
}
