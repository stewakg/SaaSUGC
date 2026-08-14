/**
 * Tests for the theme identity module.
 *
 * theme.ts is deliberately tiny and PURE: it only owns the list of valid theme
 * ids, the cookie/localStorage key, and the guard that keeps a corrupt value
 * from ever reaching the DOM. It does not itself read or write the cookie —
 * the write (path=/; max-age=31536000; samesite=lax) lives in
 * components/theme-switcher.tsx, which is outside this file's scope. So the
 * node environment is enough here: there is no document.cookie access to fake.
 */
import { describe, expect, it } from 'vitest';

import { isThemeId, THEME_COOKIE, THEME_IDS } from './theme';

describe('THEME_IDS / THEME_COOKIE', () => {
  it('lists exactly the three shipped themes', () => {
    expect([...THEME_IDS]).toEqual(['obsidian', 'poluton', 'neon']);
  });

  it('uses the documented cookie (and localStorage) key', () => {
    // The root layout reads this exact name server-side; renaming it silently
    // orphans every existing preference cookie.
    expect(THEME_COOKIE).toBe('adgen-theme');
  });
});

describe('isThemeId', () => {
  it('accepts each real theme id', () => {
    for (const id of THEME_IDS) {
      expect(isThemeId(id)).toBe(true);
    }
  });

  it('rejects an unknown string', () => {
    expect(isThemeId('midnight')).toBe(false);
  });

  it('rejects the empty string', () => {
    expect(isThemeId('')).toBe(false);
  });

  it('rejects null and undefined (a missing cookie)', () => {
    expect(isThemeId(null)).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
  });

  it('rejects a number — a hand-edited cookie can hold anything', () => {
    // The signature says string, but the value comes off a cookie the user can
    // edit; the runtime check must not be fooled by a coerced type.
    expect(isThemeId(42 as unknown as string)).toBe(false);
  });
});
