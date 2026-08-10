'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
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
    <div className="flex min-h-screen bg-ink-950">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 border-r border-white/5 bg-ink-900 transition-transform lg:translate-x-0',
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
                  'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition',
                  active
                    ? 'bg-brand-400/10 text-brand-200'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200',
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
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
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
          <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 px-3 text-[11px] text-zinc-600">
            <Link href="/uslovi" className="hover:text-zinc-400">
              Uslovi
            </Link>
            <Link href="/privatnost" className="hover:text-zinc-400">
              Privatnost
            </Link>
            <Link href="/impressum" className="hover:text-zinc-400">
              Impressum
            </Link>
          </p>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-white/5 bg-ink-950/80 px-4 backdrop-blur sm:px-6">
          <button
            className="rounded-lg border border-white/10 p-2 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Meni"
          >
            <NavIcon name="menu" />
          </button>

          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-brand-400/20 bg-brand-400/5 px-3 py-1.5">
              <span className="text-sm font-semibold text-brand-300">{balance}</span>
              <span className="text-xs text-zinc-400">kredita</span>
            </div>
            <div className="hidden text-right sm:block">
              <p className="max-w-[160px] truncate text-xs text-zinc-400">{email}</p>
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