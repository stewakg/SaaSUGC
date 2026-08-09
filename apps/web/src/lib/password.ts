/**
 * Password rules, in one place because signup and password-reset must agree —
 * two copies would drift and let a user set a password on one screen that the
 * other rejects.
 *
 * Client-side only, and therefore UX, not security: it exists to explain the
 * rule before submit instead of surfacing a Supabase error afterwards. The
 * enforceable copy lives in Supabase (Auth → Sign In / Providers → Email).
 *
 * THESE RULES MUST BE AT LEAST AS STRICT AS THE SUPABASE POLICY. Looser is the
 * dangerous direction: the checklist goes all-green, the user submits, and the
 * server rejects with an error they cannot act on. That has now happened twice
 * here, both times because this file guessed at what Supabase counts:
 *
 *   1. Supabase was set to require a digit while this file checked only
 *      length, capital and symbol — `Testovi!` passed every visible rule.
 *   2. The character tests used Unicode classes (`\p{N}`, `[^\p{L}\p{N}]`) and
 *      Serbian letters (`Č`, `č`). Supabase uses literal ASCII sets, so `Č`
 *      did not count as a capital and a SPACE did not count as a symbol —
 *      `Test tes1` passed here and failed there.
 *
 * The sets below are transcribed from GoTrue's own
 * `GOTRUE_PASSWORD_REQUIRED_CHARACTERS` config, which is a `:`-separated list
 * of literal character sets. They are written as strings rather than regexes
 * on purpose: a regex character class of `!@#$%^&*()_+-=[]{};'\:"|<>?,./\`~`
 * needs escaping that is easy to get subtly wrong, and the strings can be
 * compared to Supabase's config by eye.
 *
 * Note the Serbian consequence: `Čekaj123!` has no ASCII capital, so it fails
 * — correctly, because Supabase would reject it too. Telling the user that up
 * front is the whole point of this file.
 */

export const PASSWORD_MIN_LENGTH = 8;

/** GoTrue's sets, verbatim. Update these only alongside the dashboard setting. */
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()_+-=[]{};\'\\:"|<>?,./`~';

const has = (set: string) => {
  const chars = new Set(set);
  return (pw: string) => [...pw].some((c) => chars.has(c));
};

export type PasswordRule = {
  label: string;
  ok: (pw: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  {
    label: `Najmanje ${PASSWORD_MIN_LENGTH} znakova`,
    ok: (pw) => pw.length >= PASSWORD_MIN_LENGTH,
  },
  { label: 'Bar jedno malo slovo (a-z)', ok: has(LOWERCASE) },
  { label: 'Bar jedno veliko slovo (A-Z)', ok: has(UPPERCASE) },
  { label: 'Bar jedna cifra', ok: has(DIGITS) },
  { label: 'Bar jedan specijalan znak (!?#$…)', ok: has(SYMBOLS) },
];

/** Returns a Serbian error message, or null when the password passes. */
export function validatePassword(pw: string): string | null {
  const failed = PASSWORD_RULES.filter((r) => !r.ok(pw));
  if (failed.length === 0) return null;
  return `Lozinka mora da ispuni: ${failed.map((r) => r.label.toLowerCase()).join(', ')}.`;
}
