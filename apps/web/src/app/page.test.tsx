/**
 * Tests for the PUBLIC LANDING PAGE — the one screen a stranger sees before
 * deciding whether this product is real.
 *
 * Why this file exists: the landing had no test at all. On 2026-08-16 the page
 * was changed to show ONLY the tools that work and to drop the credit prices,
 * and a mutation check found that reverting either change broke nothing — the
 * whole page was unguarded. The two rules below are business decisions, not
 * styling, and they are exactly the kind that get quietly undone by a later
 * refactor:
 *
 *  1. no USKORO on the landing (the dashboard still shows coming-soon tools);
 *  2. no credit prices on the landing (a stranger has no price list to read
 *     "8 kredita" against).
 *
 * The page is a server component with no async work and no client hooks, so it
 * renders with renderToStaticMarkup — same approach as tool-cards.test.tsx.
 * `next/link` is factory-mocked to a plain <a>, because the real Link needs the
 * App Router context. '@adgen/core' loads FOR REAL: the descriptors are the
 * subject of the test, and mocking them would test the mock.
 */
import { describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JOB_DESCRIPTORS } from '@adgen/core';
import { isToolSoon } from '@/lib/live-tools';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href }, children),
}));
vi.mock('@/lib/utils', () => ({
  cn: (...parts: unknown[]) => parts.filter(Boolean).join(' '),
}));
// The theme switcher is a client component with effects and localStorage; the
// landing's tool rules have nothing to do with it.
vi.mock('@/components/theme-switcher', () => ({ ThemeSwitcher: () => null }));

// vitest transforms .tsx with the CLASSIC JSX runtime here, so the page's own
// JSX needs a global `React` — same line as tool-cards.test.tsx.
(globalThis as { React?: typeof React }).React = React;

import LandingPage from './page.tsx';

function html(): string {
  // JSX rather than createElement: under the React 19 RC types the element
  // returned by createElement does not narrow to ReactNode and typecheck fails.
  return renderToStaticMarkup(<LandingPage />);
}

describe('landing page — what a stranger is shown', () => {
  it('shows every tool that WORKS, by its real label', () => {
    const live = JOB_DESCRIPTORS.filter((t) => !isToolSoon(t.type));
    // Guard the guard: if this ever drops to zero the assertions below would
    // pass vacuously and the test would be worthless.
    expect(live.length).toBeGreaterThan(0);

    const markup = html();
    for (const tool of live) {
      expect(markup).toContain(tool.label);
    }
  });

  it('shows NO tool that has no pipeline — not even badged', () => {
    const soon = JOB_DESCRIPTORS.filter((t) => isToolSoon(t.type));
    expect(soon.length).toBeGreaterThan(0);

    const markup = html();
    for (const tool of soon) {
      expect(markup).not.toContain(tool.label);
    }
  });

  it('never prints the USKORO badge', () => {
    expect(html()).not.toContain('USKORO');
  });

  it('never quotes a credit price', () => {
    // Covers "8 kredita", "1 kredit", "15 kredita" — every form creditsLabel
    // can produce shares this stem.
    expect(html()).not.toMatch(/kredit/i);
  });

  it('still carries the three legal links and the free-trial line', () => {
    const markup = html();
    expect(markup).toContain('/uslovi');
    expect(markup).toContain('/privatnost');
    expect(markup).toContain('/impressum');
    expect(markup).toContain('Bez kartice');
  });
});
