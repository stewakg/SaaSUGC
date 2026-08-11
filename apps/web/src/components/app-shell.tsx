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
 * credit balance and account/logout. The sidebar collapses on mobile.
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
      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 border-r border-line bg-panel transition-transform lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
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
                  'focus-ring flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition',
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
          <button
            onClick={handleLogout}
            className="focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-txt-mid transition hover:bg-panel-2 hover:text-txt-hi"
          >
            <NavIcon name="logout" />
            Izloguj se
          </button>
          <ThemeSwitcher className="mt-3 px-3" />
          {/*
            The Impressum has to be reachable in two clicks from anywhere, not
            just from the marketing page a signed-in user never sees again.
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
              Impressum
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
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
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

          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-baseline gap-1.5 rounded-xl border border-line bg-panel-2 px-3 py-1.5">
              <span className="font-mono tabular text-lg font-semibold leading-none text-txt-hi">
                {balance}
              </span>
              <span className="text-xs text-txt-mid">{creditsWord(balance)}</span>
            </div>
            <div className="hidden text-right sm:block">
              <p className="max-w-[160px] truncate text-xs text-txt-mid">{email}</p>
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
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V9.5Z" strokeLinejoin="round" />
        </svg>
      );
    case 'film':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4" />
        </svg>
      );
    case 'logout':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'menu':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}