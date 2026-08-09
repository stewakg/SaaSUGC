/**
 * Password rules, in one place because signup and password-reset must agree —
 * two copies would drift and let a user set a password on one screen that the
 * other rejects.
 *
 * Client-side only, and therefore UX, not security: it exists to explain the
 * rule before submit instead of surfacing a Supabase error afterwards. The
 * enforceable copy lives in Supabase → Authentication → Policies → Password
 * Requirements, which must be configured to match. Anything that must actually
 * hold has to be set there — this file can be skipped by anyone talking to the
 * API directly.
 */

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordRule = {
  label: string;
  ok: (pw: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  {
    label: `Najmanje ${PASSWORD_MIN_LENGTH} znakova`,
    ok: (pw) => pw.length >= PASSWORD_MIN_LENGTH,
  },
  {
    label: 'Bar jedno veliko slovo',
    // Explicit ranges, not /[A-Z]/ alone: our users type Serbian latin, and
    // Č/Ć/Š/Ž/Đ are capitals that /[A-Z]/ would silently refuse to count.
    ok: (pw) => /[A-ZČĆŠŽĐ]/.test(pw),
  },
  {
    label: 'Bar jedan specijalan znak (!?#$…)',
    ok: (pw) => /[^\p{L}\p{N}]/u.test(pw),
  },
];

/** Returns a Serbian error message, or null when the password passes. */
export function validatePassword(pw: string): string | null {
  const failed = PASSWORD_RULES.filter((r) => !r.ok(pw));
  if (failed.length === 0) return null;
  return `Lozinka mora da ispuni: ${failed.map((r) => r.label.toLowerCase()).join(', ')}.`;
}
