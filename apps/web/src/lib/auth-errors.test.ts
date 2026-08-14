import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './auth-errors.ts';

const FALLBACK = 'Nešto nije u redu. Pokušaj ponovo za koji trenutak.';

describe('authErrorMessage', () => {
  it('the most-seen error in the product maps to the password message', () => {
    expect(authErrorMessage('Invalid login credentials')).toBe('Pogrešan email ili lozinka.');
  });

  it('matching is case-insensitive', () => {
    expect(authErrorMessage('INVALID LOGIN CREDENTIALS')).toBe('Pogrešan email ili lozinka.');
  });

  it('a varying Supabase tail still matches', () => {
    expect(
      authErrorMessage('For security purposes, you can only request this after 41 seconds'),
    ).toBe('Previše pokušaja. Sačekaj minut pa probaj ponovo.');
  });

  it('an unknown message gets the fallback, never the raw text', () => {
    const raw = 'Something completely unheard of from some future Supabase release';
    const result = authErrorMessage(raw);
    expect(result).toBe(FALLBACK);
    expect(result).not.toContain(raw);
  });

  it('null, undefined and whitespace all fall back', () => {
    expect(authErrorMessage(null)).toBe(FALLBACK);
    expect(authErrorMessage(undefined)).toBe(FALLBACK);
    expect(authErrorMessage('   ')).toBe(FALLBACK);
  });

  it.each([
    ['Invalid login credentials', 'Pogrešan email ili lozinka.'],
    ['Email not confirmed', 'Nalog još nije potvrđen. Otvori mejl i klikni na link za potvrdu.'],
    ['User already registered', 'Nalog sa ovim mejlom već postoji. Uloguj se ili zatraži novu lozinku.'],
    ['User has already been registered', 'Nalog sa ovim mejlom već postoji. Uloguj se ili zatraži novu lozinku.'],
    ['Password should be at least 6 characters', 'Lozinka je prekratka.'],
    ['New password should be different from the old password', 'Nova lozinka mora da se razlikuje od stare.'],
    ['For security purposes, you can only request this after 41 seconds', 'Previše pokušaja. Sačekaj minut pa probaj ponovo.'],
    ['Rate limit exceeded', 'Previše pokušaja. Sačekaj minut pa probaj ponovo.'],
    ['OTP token has expired', 'Link je istekao. Zatraži novi.'],
    ['Email link is invalid or has expired', 'Link je istekao. Zatraži novi.'],
    ['Email address is invalid', 'Email adresa nije ispravna.'],
    ['Failed to fetch', 'Nema veze sa internetom. Proveri konekciju pa probaj ponovo.'],
  ])('%s maps to its Serbian message', (raw, expected) => {
    const result = authErrorMessage(raw);
    expect(result).toBe(expected);
    // Every value the function can return is usable copy: never empty, and
    // never the raw English that prompted this module to exist.
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe(raw);
  });
});
