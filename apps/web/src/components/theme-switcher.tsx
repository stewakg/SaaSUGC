'use client';

import { useEffect, useRef, useState } from 'react';
import { isThemeId, THEME_COOKIE, type ThemeId } from '@/lib/theme';
import { cn } from '@/lib/utils';

/**
 * Theme picker — the one piece of NEW behaviour in the redesign.
 *
 * A theme is nothing but a `data-theme` attribute on <html>; every colour in
 * the app resolves from the token block that attribute selects (globals.css).
 * So switching is a single attribute write — no re-render, no reload.
 *
 * The choice is persisted twice on purpose: localStorage so the client can
 * repair the attribute if the cookie is ever lost, and a cookie so the SERVER
 * can put data-theme on <html> during SSR — that is what prevents a flash of
 * the wrong theme on a hard refresh (see app/layout.tsx).
 *
 * The swatches lean on a property of the token blocks: they are selected by
 * `[data-theme="…"]`, not `html[data-theme="…"]`, so putting the attribute on
 * a nested <span> gives that span the OTHER theme's tokens locally. Each
 * swatch paints itself from var(--ground)/var(--text-grad) and no colour
 * literal has to be repeated here.
 */

/** Names are product names, not UI copy — they read the same in Serbian. */
const THEMES: { id: ThemeId; name: string }[] = [
  { id: 'obsidian', name: 'Obsidian' },
  { id: 'poluton', name: 'Poluton' },
  { id: 'neon', name: 'Neon studio' },
];

function persist(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_COOKIE, theme);
  } catch {
    /* private mode / storage disabled — the cookie still carries the choice */
  }
  // 1 year, readable by the server on the next request.
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

export function ThemeSwitcher({ className }: { className?: string }) {
  // Starts null so the first client render matches the server's, which knows
  // nothing about localStorage; the effect below fills it in.
  const [active, setActive] = useState<ThemeId | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const fromDom = document.documentElement.dataset.theme;
    if (isThemeId(fromDom)) {
      setActive(fromDom);
      return;
    }
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(THEME_COOKIE);
    } catch {
      /* ignore */
    }
    if (isThemeId(stored)) {
      // Cookie was lost but the choice survived — reapply it, cookie included.
      persist(stored);
      setActive(stored);
    }
  }, []);

  function choose(theme: ThemeId) {
    persist(theme);
    setActive(theme);
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const last = THEMES.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = index === last ? 0 : index + 1;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = index === 0 ? last : index - 1;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = last;
    }
    if (next === null) return;
    event.preventDefault();
    choose(THEMES[next].id);
    buttons.current[next]?.focus();
  }

  // Before the effect runs nothing is known to be selected; keep the first
  // option reachable by Tab so the group is never a keyboard dead end.
  const focusIndex = Math.max(
    0,
    THEMES.findIndex((t) => t.id === active),
  );

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-[11px] uppercase tracking-wide text-txt-low">Tema</span>
      <div role="radiogroup" aria-label="Tema" className="flex items-center gap-1.5">
        {THEMES.map((theme, index) => (
          <button
            key={theme.id}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active === theme.id}
            aria-label={theme.name}
            title={theme.name}
            tabIndex={index === focusIndex ? 0 : -1}
            onClick={() => choose(theme.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'theme-swatch-button',
              active === theme.id && 'theme-swatch-button--on',
            )}
          >
            <span data-theme={theme.id} className="theme-swatch" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}
