// @vitest-environment jsdom
/**
 * Tests for ThemeSwitcher — the hand-rolled roving-tabindex radiogroup.
 *
 * ENVIRONMENT (copied from file-dropzone.test.tsx — read that first):
 * - jsdom opt-in via the docblock above; the suite default is node.
 * - No @testing-library/react: the component is mounted with
 *   react-dom/client's createRoot and driven with plain dispatchEvent,
 *   wrapped in React.act (this React 19 RC exports act from 'react'; it
 *   also requires globalThis.IS_REACT_ACT_ENVIRONMENT, set below).
 * - The container is appended to document.body or React's synthetic
 *   events never fire.
 *
 * What is guarded here, in the order a keyboard user meets them:
 * - The radiogroup structure: one radio per theme, real names on
 *   aria-label, "Tema" on the group.
 * - The roving tabindex: EXACTLY one tabbable control at a time, and it
 *   moves with the selection — the whole point of the pattern. Colour
 *   alone must not be the only signal, so aria-checked is asserted too.
 * - The arrow/Home/End keys the component actually handles (read from
 *   the source: ArrowRight/ArrowDown forward, ArrowLeft/ArrowUp back,
 *   Home/End to the ends, all with wraparound) move the selection, the
 *   focus AND the tab stop together.
 * - Choosing a theme persists it: the cookie is named `adgen-theme-v2`
 *   (THEME_COOKIE in lib/theme.ts) and its value is the chosen theme id.
 * - The mount effect adopts a theme already present on <html> without
 *   rewriting anything.
 *
 * '@/lib/utils' is factory-mocked with a faithful `cn` (same as the
 * dropzone harness) so no styling dependencies load. jsdom provides
 * localStorage and document.cookie, so persistence is asserted for real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';

vi.mock('@/lib/utils', () => ({
  cn: (...parts: Array<string | false | null | undefined>) =>
    parts.filter(Boolean).join(' '),
}));

import { ThemeSwitcher } from './theme-switcher';
import * as React from 'react';

// React 19's act() refuses to run unless this flag is set.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// vitest transforms .tsx with the CLASSIC JSX runtime here (tsconfig says
// jsx: "preserve", which Next/SWC handles but vite's esbuild does not), so
// executing JSX needs a `React` binding in scope. Providing it globally is
// exactly what the classic transform expects.
// `as unknown as` is load-bearing, not noise: the direct cast is only legal when
// the resolved React types happen to overlap with globalThis, and CI resolves
// `types-react@19.0.0-rc.1` where they do not (TS2352). Found 2026-08-20 when a
// docs-only commit failed CI while the code commit before it passed — the
// difference was a warm dependency cache, not the code.
(globalThis as unknown as { React?: typeof React }).React = React;

// The component's theme order — read from THEMES in theme-switcher.tsx.
const THEME_NAMES = ['Premijera', 'Obsidian', 'Poluton', 'Neon studio'];

describe('ThemeSwitcher', () => {
  const cleanups: Array<() => void> = [];

  // The switcher reads <html data-theme>, localStorage and the cookie jar
  // on mount, so every test starts from a browser that has never chosen.
  beforeEach(() => {
    delete document.documentElement.dataset.theme;
    window.localStorage.clear();
    document.cookie = 'adgen-theme-v2=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
  });

  interface MountedSwitcher {
    container: HTMLDivElement;
    group: HTMLElement;
    buttons: HTMLButtonElement[];
  }

  /** Mounts one switcher on a container attached to document.body. */
  function mountSwitcher(): MountedSwitcher {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    React.act(() => {
      root.render(<ThemeSwitcher />);
    });
    const group = container.querySelector('[role="radiogroup"]');
    if (!(group instanceof HTMLElement)) {
      throw new Error('switcher did not render a [role="radiogroup"]');
    }
    const buttons = Array.from(container.querySelectorAll('button[role="radio"]'));
    if (
      buttons.length !== THEME_NAMES.length ||
      buttons.some((b) => !(b instanceof HTMLButtonElement))
    ) {
      throw new Error(`expected ${THEME_NAMES.length} radio buttons`);
    }
    cleanups.push(() => {
      React.act(() => {
        root.unmount();
      });
      container.remove();
    });
    return { container, group, buttons: buttons as HTMLButtonElement[] };
  }

  /** The controls that are actually reachable with Tab right now. */
  function tabbable(buttons: HTMLButtonElement[]): HTMLButtonElement[] {
    return buttons.filter((b) => b.tabIndex === 0);
  }

  /** Clicks a swatch the way a user would, through React's synthetic events. */
  function click(node: Element): void {
    React.act(() => {
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  }

  /** Presses a key on a control; returns the event so preventDefault is checkable. */
  function press(node: Element, key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    React.act(() => {
      node.dispatchEvent(event);
    });
    return event;
  }

  it('renders a radiogroup with one labelled radio control per theme', () => {
    const { group, buttons } = mountSwitcher();
    expect(group.getAttribute('aria-label')).toBe('Tema');
    expect(buttons).toHaveLength(THEME_NAMES.length);
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(THEME_NAMES);
    expect(buttons.every((b) => b.getAttribute('role') === 'radio')).toBe(true);
    // The label is also exposed as a title tooltip, per the source.
    expect(buttons.map((b) => b.title)).toEqual(THEME_NAMES);
  });

  // Positions since 2026-08-18: 0 Premijera · 1 Obsidian · 2 Poluton · 3 Neon.
  const LAST = THEME_NAMES.length - 1;

  it('before any choice: exactly one control is tabbable (the first), none is checked', () => {
    const { buttons } = mountSwitcher();
    expect(tabbable(buttons)).toEqual([buttons[0]]);
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1, -1, -1]);
    // Nothing is known to be selected before the effect finds a choice, so
    // colour must not be the only signal — aria-checked is false everywhere.
    expect(buttons.map((b) => b.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'false',
      'false',
    ]);
  });

  it('adopts a theme already present on <html> as the checked, tabbable option', () => {
    document.documentElement.dataset.theme = 'poluton';
    const { buttons } = mountSwitcher();
    expect(buttons[2].getAttribute('aria-checked')).toBe('true');
    expect(tabbable(buttons)).toEqual([buttons[2]]);
  });

  it('activating a theme writes the adgen-theme cookie with the chosen id and moves the tab stop', () => {
    const { buttons } = mountSwitcher();
    click(buttons[LAST]); // Neon studio
    expect(document.cookie).toContain('adgen-theme-v2=neon');
    expect(document.documentElement.dataset.theme).toBe('neon');
    expect(window.localStorage.getItem('adgen-theme-v2')).toBe('neon');
    // aria-checked follows the active theme — only Neon is checked.
    expect(buttons.map((b) => b.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'false',
      'true',
    ]);
    // The roving tab stop moved with the selection.
    expect(tabbable(buttons)).toEqual([buttons[LAST]]);
  });

  it('ArrowRight on the last theme wraps to the first and carries selection, focus and the cookie', () => {
    const { buttons } = mountSwitcher();
    click(buttons[LAST]); // Neon studio — the last option
    const event = press(buttons[LAST], 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    expect(buttons[0].getAttribute('aria-checked')).toBe('true');
    expect(tabbable(buttons)).toEqual([buttons[0]]);
    expect(document.cookie).toContain('adgen-theme-v2=premijera');
  });

  it('ArrowDown advances without wrapping and moves focus with it', () => {
    const { buttons } = mountSwitcher();
    press(buttons[0], 'ArrowDown');
    expect(document.activeElement).toBe(buttons[1]);
    expect(buttons[1].getAttribute('aria-checked')).toBe('true');
    expect(tabbable(buttons)).toEqual([buttons[1]]);
    expect(document.cookie).toContain('adgen-theme-v2=obsidian');
  });

  it('ArrowLeft steps back one option', () => {
    const { buttons } = mountSwitcher();
    click(buttons[1]);
    press(buttons[1], 'ArrowLeft');
    expect(document.activeElement).toBe(buttons[0]);
    expect(buttons[0].getAttribute('aria-checked')).toBe('true');
    expect(document.cookie).toContain('adgen-theme-v2=premijera');
  });

  it('ArrowUp on the first theme wraps to the last', () => {
    const { buttons } = mountSwitcher();
    press(buttons[0], 'ArrowUp');
    expect(document.activeElement).toBe(buttons[LAST]);
    expect(buttons[LAST].getAttribute('aria-checked')).toBe('true');
    expect(document.cookie).toContain('adgen-theme-v2=neon');
  });

  it('Home jumps to the first theme and End to the last', () => {
    const { buttons } = mountSwitcher();
    press(buttons[0], 'End');
    expect(document.activeElement).toBe(buttons[LAST]);
    expect(buttons[LAST].getAttribute('aria-checked')).toBe('true');
    press(buttons[LAST], 'Home');
    expect(document.activeElement).toBe(buttons[0]);
    expect(buttons[0].getAttribute('aria-checked')).toBe('true');
    expect(tabbable(buttons)).toEqual([buttons[0]]);
  });

  it('a key the component does not handle changes nothing', () => {
    const { buttons } = mountSwitcher();
    const event = press(buttons[0], 'Enter');
    expect(event.defaultPrevented).toBe(false);
    expect(document.cookie).not.toContain('adgen-theme-v2=');
    expect(buttons.map((b) => b.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'false',
      'false',
    ]);
    expect(tabbable(buttons)).toEqual([buttons[0]]);
  });
});

