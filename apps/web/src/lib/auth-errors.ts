/**
 * Supabase speaks English. This app does not.
 *
 * Every auth screen used to render `error.message` directly, so a mistyped
 * password produced "Invalid login credentials" in the middle of a Serbian
 * form. Matching is done on a lowercased SUBSTRING because Supabase varies the
 * tail of several of these ("For security purposes, you can only request this
 * after 41 seconds"), and an unknown message must never reach the user — the
 * fallback is deliberately vague about the cause and specific about the next
 * step, which is the opposite of what the raw text does.
 */
const FALLBACK = 'Nešto nije u redu. Pokušaj ponovo za koji trenutak.';

/** First lowercased substring that appears in the message wins. */
const MATCHERS: readonly [substring: string, message: string][] = [
  ['invalid login credentials', 'Pogrešan email ili lozinka.'],
  ['email not confirmed', 'Nalog još nije potvrđen. Otvori mejl i klikni na link za potvrdu.'],
  ['user already registered', 'Nalog sa ovim mejlom već postoji. Uloguj se ili zatraži novu lozinku.'],
  ['already been registered', 'Nalog sa ovim mejlom već postoji. Uloguj se ili zatraži novu lozinku.'],
  ['password should be at least', 'Lozinka je prekratka.'],
  ['new password should be different', 'Nova lozinka mora da se razlikuje od stare.'],
  ['for security purposes', 'Previše pokušaja. Sačekaj minut pa probaj ponovo.'],
  ['rate limit', 'Previše pokušaja. Sačekaj minut pa probaj ponovo.'],
  ['token has expired', 'Link je istekao. Zatraži novi.'],
  ['invalid or has expired', 'Link je istekao. Zatraži novi.'],
  ['email address is invalid', 'Email adresa nije ispravna.'],
  ['failed to fetch', 'Nema veze sa internetom. Proveri konekciju pa probaj ponovo.'],
];

export function authErrorMessage(raw: string | null | undefined): string {
  if (!raw) return FALLBACK;
  const haystack = raw.toLowerCase();
  for (const [substring, message] of MATCHERS) {
    if (haystack.includes(substring)) return message;
  }
  return FALLBACK;
}
