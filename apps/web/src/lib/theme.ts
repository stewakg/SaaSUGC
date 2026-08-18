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

export const THEME_IDS = ['premijera', 'obsidian', 'poluton', 'neon'] as const;

export type ThemeId = (typeof THEME_IDS)[number];

/** Cookie AND localStorage key. The cookie is what SSR reads to avoid a flash.
 *
 * Bumped to -v2 on 2026-08-18, the day Premijera became the default: renaming
 * the key orphans every pre-redesign preference ON PURPOSE, so every existing
 * visitor gets one reset to the new look instead of being pinned to the old
 * default they never actively chose. Choices made after the bump persist
 * normally under the new key. */
export const THEME_COOKIE = 'adgen-theme-v2';

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return !!value && (THEME_IDS as readonly string[]).includes(value);
}
