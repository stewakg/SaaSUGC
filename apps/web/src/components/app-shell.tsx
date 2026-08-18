'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { creditsWord } from '@adgen/core/pricing';
import { createBrowserClient } from '@/lib/supabase/client';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { cn } from '@/lib/utils';

/**
 * Authenticated app shell: left sidebar (Početna, Moje reklame) + topbar with
 * credit balance and account/logout. The sidebar collapses on mobile; on
 * desktop it can be slid out of view from the topbar toggle.
 */
export function AppShell({
  email,
  balance,
  children,
}: {
  email: string;
  balance: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Deliberately a SEPARATE piece of state: `mobileOpen` is a modal overlay
  // (dialog semantics, backdrop, Escape), while the desktop collapse just
  // narrows the layout. Overloading one flag would announce a dialog to a
  // desktop user who only wanted more room for the tools.
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  /**
   * Escape closes the mobile menu, and focus moves in and back out with it.
   *
   * Without this the menu was a one-way door for anyone not using a mouse: the
   * hamburger opened it, but the ONLY way to dismiss it was tapping the
   * backdrop — a plain div — so a keyboard user could leave only by activating
   * a nav link, which navigates away as a side effect. Closing also returns
   * focus to the button that opened it, or the caret is left on an element
   * that just slid off-screen.
   */
  useEffect(() => {
    if (!mobileOpen) return;
    sidebarRef.current?.querySelector<HTMLElement>('a, button')?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setMobileOpen(false);
      menuButtonRef.current?.focus();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  async function handleLogout() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const nav = [
    { href: '/app', label: 'Početna', icon: 'home' },
    { href: '/app/reklame', label: 'Moje reklame', icon: 'film' },
  ];

  return (
    <div className="flex min-h-screen bg-ground">
      {/* Sidebar. role/aria-modal/aria-label are bound to `mobileOpen`, which
          only the lg:hidden hamburger can set — the permanent desktop sidebar
          renders as a plain named-less <aside>, never as a dialog. */}
      <aside
        ref={sidebarRef}
        role={mobileOpen ? 'dialog' : undefined}
        aria-modal={mobileOpen || undefined}
        aria-label={mobileOpen ? 'Meni' : undefined}
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 border-r border-line bg-panel transition-transform',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: pinned open unless the topbar toggle collapsed it. Without
          // this line the collapsed sidebar would still be pushed back in by
          // the lg: override and the toggle would look broken.
          !desktopCollapsed && 'lg:translate-x-0',
        )}
      >
        <div className="flex h-16 items-center gap-2 px-5">
          <span className="font-display text-lg font-extrabold tracking-tight">AdGen</span>
          <span className="badge ml-auto">Beta</span>
        </div>
        <nav className="space-y-1 px-3 py-4">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'focus-ring flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition',
                  active
                    ? 'step-chip--active'
                    : 'text-txt-mid hover:bg-panel-2 hover:text-txt-hi',
                )}
              >
                <NavIcon name={item.icon} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute inset-x-0 bottom-0 p-3">
          {/*
            Moj profil lives down HERE, beside Izloguj se — the account
            controls — not only on the email in the header.

            The email link was the single entry point to the account screen,
            and it lives in a `hidden sm:block` container — so below 640px it
            does not render at all and the profile was simply unreachable on a
            phone. For an audience that is mostly on a phone, that is the whole
            feature missing.
          */}
          <Link
            href="/app/profil"
            onClick={() => setMobileOpen(false)}
            className="focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-txt-mid transition hover:bg-panel-2 hover:text-txt-hi"
          >
            <NavIcon name="user" />
            Moj profil
          </Link>
          <button
            onClick={handleLogout}
            className="focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-txt-mid transition hover:bg-panel-2 hover:text-txt-hi"
          >
            <NavIcon name="logout" />
            Izloguj se
          </button>
          <ThemeSwitcher className="mt-3 px-3" />
          {/*
            Provider identity has to be reachable from anywhere, not just from
            the marketing page a signed-in user never sees again. The label was
            "Impressum" while the plan was a German operation; the operator is a
            Wyoming LLC since 2026-08-16, so the page is now "Podaci o firmi" —
            the /impressum PATH stays so no existing link breaks.
            Deliberately understated — these are obligations, not navigation.
          */}
          <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 px-3 text-[11px] text-txt-low">
            <Link href="/uslovi" className="focus-ring rounded hover:text-txt-mid">
              Uslovi
            </Link>
            <Link href="/privatnost" className="focus-ring rounded hover:text-txt-mid">
              Privatnost
            </Link>
            <Link href="/impressum" className="focus-ring rounded hover:text-txt-mid">
              Podaci o firmi
            </Link>
          </p>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-ground/80 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main */}
      {/* min-w-0 is load-bearing: a flex item's min-width defaults to
          min-content, so one wide child (the 6-step wizard rail) was widening
          this whole column past the viewport and scrolling the page sideways
          on a phone. */}
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col',
          // The sidebar is `fixed`, so its width is bought back with padding —
          // which is why the collapsed state removes the padding entirely and
          // the content takes the full width.
          !desktopCollapsed && 'lg:pl-64',
        )}
      >
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-ground/80 px-4 backdrop-blur sm:px-6">
          <button
            ref={menuButtonRef}
            aria-expanded={mobileOpen}
            className="focus-ring rounded-lg border border-line p-2 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Meni"
          >
            <NavIcon name="menu" />
          </button>

          {/* Desktop collapse toggle. It lives in the TOPBAR, not inside the
              sidebar, precisely so it is still on screen once the sidebar has
              slid out — a control that disappears when you use it is a one-way
              door. Hidden below lg, where the hamburger already does this job
              as a modal overlay. The icon is a DIRECTIONAL chevron, not a
              hamburger (owner's call 2026-08-18): it points where the sidebar
              will go — « to tuck it away while open, » to bring it back. */}
          <button
            type="button"
            aria-expanded={!desktopCollapsed}
            aria-label={desktopCollapsed ? 'Prikaži meni' : 'Sakrij meni'}
            className="focus-ring hidden rounded-lg border border-line p-2 lg:block"
            onClick={() => setDesktopCollapsed((collapsed) => !collapsed)}
          >
            <NavIcon name={desktopCollapsed ? 'chevrons-right' : 'chevrons-left'} />
          </button>

          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-baseline gap-1.5 rounded-xl border border-line bg-panel-2 px-3 py-1.5">
              <span className="font-mono tabular text-lg font-semibold leading-none text-txt-hi">
                {balance}
              </span>
              <span className="text-xs text-txt-mid">{creditsWord(balance)}</span>
            </div>
            <div className="hidden text-right sm:block">
              <Link
                href="/app/profil"
                title="Moj profil"
                className="focus-ring block max-w-[160px] truncate rounded text-xs text-txt-mid hover:text-txt-hi"
              >
                {email}
              </Link>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function NavIcon({ name }: { name: string }) {
  const common = 'h-4 w-4';
  switch (name) {
    case 'home':
      return (
        <svg aria-hidden="true" className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V9.5Z" strokeLinejoin="round" />
        </svg>
      );
    case 'film':
      return (
        <svg aria-hidden="true" className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4" />
        </svg>
      );
    case 'user':
      return (
        <svg aria-hidden="true" className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" strokeLinecap="round" />
        </svg>
      );
    case 'logout':
      return (
        <svg aria-hidden="true" className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'menu':
      return (
        <svg aria-hidden="true" className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </svg>
      );
    case 'chevrons-left':
      return (
        <svg aria-hidden="true" className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="m11 17-5-5 5-5M18 17l-5-5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'chevrons-right':
      return (
        <svg aria-hidden="true" className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="m13 17 5-5-5-5M6 17l5-5-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}