// @vitest-environment jsdom
/**
 * Tests for AppShell — the frame every signed-in page renders inside.
 *
 * ENVIRONMENT (copied from theme-switcher.test.tsx — read that first):
 * - jsdom opt-in via the docblock above; the suite default is node.
 * - No @testing-library/react: the component is mounted with
 *   react-dom/client's createRoot and driven with plain dispatchEvent,
 *   wrapped in React.act (this React 19 RC exports act from 'react'; it
 *   also requires globalThis.IS_REACT_ACT_ENVIRONMENT, set below).
 * - The container is appended to document.body or React's synthetic
 *   events never fire.
 *
 * MOCKS, and why each one exists:
 * - 'next/link': AppShell renders Links outside any App Router context,
 *   so it is mocked to the plain <a> it ultimately produces (href, click
 *   and class all pass through). Asserting hrefs therefore still means
 *   something.
 * - 'next/navigation': usePathname/useRouter throw without a router; the
 *   pathname is mutable state so nav-active behaviour could be probed.
 * - '@/lib/supabase/client': handleLogout would otherwise build a real
 *   Supabase client; mocked so nothing in this file can touch a socket.
 * - '@/lib/utils': factory-mocked with a faithful `cn` (same as the
 *   theme-switcher harness) so no styling dependencies load.
 * `creditsWord` is NOT mocked — the Serbian grammar is asserted for real
 * through what renders.
 *
 * What is guarded here, in the order a user meets it:
 * - The mutation-proven gap: role="dialog"/aria-modal/aria-label are bound
 *   to `mobileOpen`, which ONLY the lg:hidden hamburger can set. Closed
 *   by default the sidebar must be a plain <aside> — no dialog announced
 *   to desktop users on page load.
 * - Opening the hamburger flips the sidebar into a modal dialog named
 *   "Meni"; Escape closes it and strips the dialog semantics again.
 * - Focus follows the menu: opening moves it to the sidebar's first
 *   control, Escape returns it to the hamburger. jsdom implements
 *   focus()/document.activeElement faithfully, so these are real
 *   assertions, not shims.
 * - The topbar email links to /app/profil (it was a plain <p> before).
 * - The balance renders `creditsWord`'s noun — 1 "kredit" vs 2 "kredita"
 *   is where Serbian actually splits.
 * - Nav svgs are aria-hidden: each sits beside its own text label.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';

vi.mock('@/lib/utils', () => ({
  cn: (...parts: Array<string | false | null | undefined>) =>
    parts.filter(Boolean).join(' '),
}));

vi.mock('@/lib/supabase/client', () => ({
  createBrowserClient: vi.fn(() => ({
    auth: { signOut: vi.fn(async () => {}) },
  })),
}));

// The router fakes need to exist before the module graph evaluates, and
// vi.mock factories are hoisted above everything — hence vi.hoisted.
const navigation = vi.hoisted(() => ({
  pathname: '/app' as string,
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({
    push: navigation.push,
    refresh: navigation.refresh,
    replace: navigation.replace,
  }),
}));

// The factory runs while './app-shell' is still being imported — before
// the classic-JSX `globalThis.React` binding below exists — so it builds
// the element with createElement instead of JSX.
vi.mock('next/link', async () => {
  const { createElement } = await import('react');
  type LinkProps = React.ComponentProps<'a'>;
  const Link = ({ href, children, ...rest }: LinkProps) =>
    createElement('a', { href, ...rest }, children);
  return { default: Link };
});

import { AppShell } from './app-shell';
import * as React from 'react';

// React 19's act() refuses to run unless this flag is set.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// vitest transforms .tsx with the CLASSIC JSX runtime here (tsconfig says
// jsx: "preserve", which Next/SWC handles but vite's esbuild does not), so
// executing JSX needs a `React` binding in scope. Providing it globally is
// exactly what the classic transform expects.
(globalThis as { React?: typeof React }).React = React;

describe('AppShell', () => {
  const cleanups: Array<() => void> = [];

  beforeEach(() => {
    navigation.pathname = '/app';
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
  });

  interface MountedShell {
    container: HTMLDivElement;
    aside: HTMLElement;
    hamburger: HTMLButtonElement;
  }

  /** Mounts one shell on a container attached to document.body. */
  function mountShell(props: { email?: string; balance?: number } = {}): MountedShell {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    React.act(() => {
      root.render(
        <AppShell email={props.email ?? 'korisnik@adgen.rs'} balance={props.balance ?? 10}>
          <p>sadržaj</p>
        </AppShell>,
      );
    });
    const aside = container.querySelector('aside');
    if (!(aside instanceof HTMLElement)) {
      throw new Error('shell did not render an <aside> sidebar');
    }
    const hamburger = container.querySelector('header button');
    if (!(hamburger instanceof HTMLButtonElement)) {
      throw new Error('shell did not render a topbar hamburger button');
    }
    cleanups.push(() => {
      React.act(() => {
        root.unmount();
      });
      container.remove();
    });
    return { container, aside, hamburger };
  }

  /** Clicks a control the way a user would, through React's synthetic events. */
  function click(node: Element): void {
    React.act(() => {
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  }

  /** Presses a key on the document, where the shell's Escape listener lives. */
  function pressDocumentKey(key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    React.act(() => {
      document.dispatchEvent(event);
    });
    return event;
  }

  it('closed by default: the sidebar is a plain <aside>, not a dialog', () => {
    const { aside, hamburger } = mountShell();
    // role/aria-modal/aria-label are all bound to `mobileOpen`, which only
    // the lg:hidden hamburger can set — a desktop user must not have a
    // dialog announced on page load. Making role="dialog" unconditional
    // breaks exactly this test.
    expect(aside.getAttribute('role')).toBeNull();
    expect(aside.getAttribute('aria-modal')).toBeNull();
    expect(aside.getAttribute('aria-label')).toBeNull();
    // The hamburger agrees that nothing is open.
    expect(hamburger.getAttribute('aria-expanded')).toBe('false');
  });

  it('opening the hamburger turns the sidebar into a modal dialog named "Meni"', () => {
    const { aside, hamburger } = mountShell();
    click(hamburger);
    expect(aside.getAttribute('role')).toBe('dialog');
    expect(aside.getAttribute('aria-modal')).toBe('true');
    expect(aside.getAttribute('aria-label')).toBe('Meni');
    expect(hamburger.getAttribute('aria-expanded')).toBe('true');
  });

  it('Escape closes the menu and strips the dialog semantics again', () => {
    const { aside, hamburger } = mountShell();
    click(hamburger);
    expect(aside.getAttribute('role')).toBe('dialog');
    pressDocumentKey('Escape');
    expect(aside.getAttribute('role')).toBeNull();
    expect(aside.getAttribute('aria-modal')).toBeNull();
    expect(aside.getAttribute('aria-label')).toBeNull();
    expect(hamburger.getAttribute('aria-expanded')).toBe('false');
  });

  it('focus moves into the sidebar when opened and back to the hamburger on Escape', () => {
    const { aside, hamburger } = mountShell();
    // Nothing inside the shell has focus before the menu exists.
    expect(document.activeElement).toBe(document.body);
    click(hamburger);
    // The mount effect focuses the sidebar's first a/button — the first
    // nav link. jsdom tracks focus/activeElement for real, so this is a
    // genuine assertion of the one-way-door fix, not a shim.
    const firstControl = aside.querySelector('a, button');
    expect(firstControl).toBeInstanceOf(HTMLElement);
    expect(document.activeElement).toBe(firstControl);
    pressDocumentKey('Escape');
    // The caret is returned to the control that opened the menu, not left
    // on an element that just slid off-screen.
    expect(document.activeElement).toBe(hamburger);
  });

  it('the email is a link to /app/profil, not plain text', () => {
    const { container } = mountShell({ email: 'proba@adgen.rs' });
    // TWO routes to the account screen, deliberately. The email lives in a
    // `hidden sm:block` container, so on a phone it does not render at all —
    // the nav entry is what keeps the profile reachable there. Assert both, or
    // dropping either one goes unnoticed.
    const links = [...container.querySelectorAll('a[href="/app/profil"]')];
    expect(links).toHaveLength(2);

    const byEmail = links.find((a) => a.textContent === 'proba@adgen.rs');
    expect(byEmail).toBeInstanceOf(HTMLAnchorElement);
    expect(byEmail!.getAttribute('title')).toBe('Profil');

    const inNav = links.find((a) => a.textContent?.includes('Profil'));
    expect(inNav).toBeInstanceOf(HTMLAnchorElement);
    expect(inNav!.closest('nav')).not.toBeNull();
  });

  it('balance 1 reads "kredit" — the Serbian singular', () => {
    const { container } = mountShell({ balance: 1 });
    const box = container.querySelector('header .items-baseline');
    if (!box) throw new Error('topbar balance box not found');
    const spans = box.querySelectorAll('span');
    expect(spans).toHaveLength(2);
    expect(spans[0].textContent).toBe('1');
    expect(spans[1].textContent).toBe('kredit');
  });

  it('balance 2 reads "kredita" — the Serbian plural', () => {
    const { container } = mountShell({ balance: 2 });
    const box = container.querySelector('header .items-baseline');
    if (!box) throw new Error('topbar balance box not found');
    const spans = box.querySelectorAll('span');
    expect(spans).toHaveLength(2);
    expect(spans[0].textContent).toBe('2');
    expect(spans[1].textContent).toBe('kredita');
  });

  it('nav icons are aria-hidden — their text labels stand next to them', () => {
    const { container } = mountShell();
    // Every svg in the sidebar nav (Početna, Moje reklame, Profil) and the
    // hamburger itself must be hidden from the a11y tree; each has its own
    // visible text or aria-label.
    const svgs = container.querySelectorAll('aside nav svg');
    expect(svgs).toHaveLength(3);
    svgs.forEach((svg) => {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    });
    const hamburgerSvg = container.querySelector('header button svg');
    expect(hamburgerSvg).not.toBeNull();
    expect(hamburgerSvg!.getAttribute('aria-hidden')).toBe('true');
  });
});

