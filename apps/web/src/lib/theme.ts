/**
 * Theme identity — shared by the client switcher and the server layout.
 *
 * Lives outside components/theme-switcher.tsx on purpose: that file is a
 * 'use client' module, and every export of a client module reaches a server
 * component as an opaque reference, so the root layout could not actually
 * CALL isThemeId() if it were declared there.
 *
 * A theme id is only ever a `data-theme` value on <html>; the colours behind
 * each one live in globals.css and nowhere else.
 */

export const THEME_IDS = ['obsidian', 'poluton', 'neon'] as const;

export type ThemeId = (typeof THEME_IDS)[number];

/** Cookie AND localStorage key. The cookie is what SSR reads to avoid a flash. */
export const THEME_COOKIE = 'adgen-theme';

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return !!value && (THEME_IDS as readonly string[]).includes(value);
}
