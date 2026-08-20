// @vitest-environment jsdom
/**
 * Tests for PasswordRules — the live checklist under password fields.
 *
 * ENVIRONMENT (copied from file-dropzone.test.tsx — read that first):
 * - jsdom opt-in via the docblock above; the suite default is node.
 * - No @testing-library/react: the component is mounted with
 *   react-dom/client's createRoot, wrapped in React.act (this React 19 RC
 *   exports act from 'react'; it also requires
 *   globalThis.IS_REACT_ACT_ENVIRONMENT, set below). The container is
 *   appended to document.body.
 *
 * What is guarded here:
 * - The live region: the list keeps aria-live="polite", which is what
 *   makes the checklist audible to a screen reader while typing.
 * - An empty value renders EVERY rule unmet (the rules must be readable
 *   before the user starts typing — that is the component's own brief).
 * - A value satisfying exactly one rule flips exactly that rule.
 * - A fully valid password flips all five.
 * - Re-rendering with a new value flips the rules in place, which is the
 *   "live" part of the live checklist.
 *
 * The rule labels below are copied VERBATIM from lib/password.ts
 * ('Najmanje 8 znakova', …) — they are product copy and must not be
 * retyped from memory.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/lib/utils', () => ({
  cn: (...parts: Array<string | false | null | undefined>) =>
    parts.filter(Boolean).join(' '),
}));

import { PasswordRules } from './password-rules';
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

// VERBATIM labels from PASSWORD_RULES in lib/password.ts, in order.
const RULE_LABELS = [
  'Najmanje 8 znakova',
  'Bar jedno malo slovo (a-z)',
  'Bar jedno veliko slovo (A-Z)',
  'Bar jedna cifra',
  'Bar jedan specijalan znak (!?#$…)',
] as const;

describe('PasswordRules', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
  });

  interface MountedRules {
    container: HTMLDivElement;
    list: HTMLUListElement;
    items: HTMLLIElement[];
    /** Re-renders with a new value, the way a live password field would. */
    setValue: (value: string) => void;
  }

  function mountRules(value: string): MountedRules {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    React.act(() => {
      root.render(<PasswordRules value={value} />);
    });
    const list = container.querySelector('ul');
    if (!(list instanceof HTMLUListElement)) {
      throw new Error('checklist did not render a <ul>');
    }
    const items = Array.from(list.querySelectorAll('li'));
    if (items.length !== RULE_LABELS.length) {
      throw new Error(`expected ${RULE_LABELS.length} rules, got ${items.length}`);
    }
    cleanups.push(() => {
      React.act(() => {
        root.unmount();
      });
      container.remove();
    });
    return {
      container,
      list,
      items,
      setValue: (next: string) => {
        React.act(() => {
          root.render(<PasswordRules value={next} />);
        });
      },
    };
  }

  /** The li a rule renders in, found by its verbatim label. */
  function itemFor(mounted: MountedRules, label: string): HTMLLIElement {
    const item = mounted.items.find((li) => li.textContent?.includes(label));
    if (!item) throw new Error(`no list item for rule "${label}"`);
    return item;
  }

  function metStates(mounted: MountedRules): boolean[] {
    return RULE_LABELS.map((label) =>
      itemFor(mounted, label).classList.contains('text-ok-text'),
    );
  }

  it('renders one list item per rule, each labelled with the verbatim copy', () => {
    const { items } = mountRules('');
    expect(items.map((li) => li.textContent)).toEqual(
      RULE_LABELS.map((label) => `○ ${label}`),
    );
  });

  it('keeps the aria-live="polite" region that makes the checklist audible while typing', () => {
    const { list } = mountRules('');
    expect(list.getAttribute('aria-live')).toBe('polite');
  });

  it('with an empty value every rule renders unmet', () => {
    const mounted = mountRules('');
    expect(metStates(mounted)).toEqual([false, false, false, false, false]);
    // Muted grey (text-txt-low), not the ok colour, and the hollow glyph.
    for (const label of RULE_LABELS) {
      const item = itemFor(mounted, label);
      expect(item.classList.contains('text-txt-low')).toBe(true);
      expect(item.querySelector('span[aria-hidden="true"]')?.textContent).toBe('○');
    }
  });

  it('a value satisfying exactly one rule flips only that rule', () => {
    // 'abcd' meets ONLY the lowercase rule: too short, no capital, digit or symbol.
    const mounted = mountRules('abcd');
    expect(metStates(mounted)).toEqual([false, true, false, false, false]);
    expect(
      itemFor(mounted, 'Bar jedno malo slovo (a-z)').querySelector('span[aria-hidden="true"]')
        ?.textContent,
    ).toBe('✓');
    expect(
      itemFor(mounted, 'Najmanje 8 znakova').querySelector('span[aria-hidden="true"]')
        ?.textContent,
    ).toBe('○');
  });

  it('a fully valid password shows every rule met', () => {
    // 8+ chars, lower, capital, digit, symbol — and ASCII-only on purpose,
    // because Supabase counts literal ASCII sets (see lib/password.ts).
    const mounted = mountRules('Abcdef1!');
    expect(metStates(mounted)).toEqual([true, true, true, true, true]);
    for (const label of RULE_LABELS) {
      expect(
        itemFor(mounted, label).querySelector('span[aria-hidden="true"]')?.textContent,
      ).toBe('✓');
    }
  });

  it('re-rendering with a new value flips the rules in place', () => {
    const mounted = mountRules('');
    expect(metStates(mounted)).toEqual([false, false, false, false, false]);
    mounted.setValue('Abcdef1!');
    expect(metStates(mounted)).toEqual([true, true, true, true, true]);
  });
});

