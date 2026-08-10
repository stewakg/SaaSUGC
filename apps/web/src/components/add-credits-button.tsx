'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Grants a credit pack instantly — DEV ONLY.
 *
 * This used to POST /api/billing/checkout and follow whatever URL the active
 * Billing provider returned (a Lemon Squeezy hosted checkout in production, the
 * dev route in development). Lemon Squeezy was removed on 2026-08-10 and no
 * payment provider replaced it, so the indirection had exactly one destination
 * left and is gone: the button navigates straight to the dev route.
 *
 * `GET /api/dev/credits/add` 404s when NODE_ENV is production, so shipping this
 * button as-is cannot grant free credits to a real user — it simply stops
 * working, which is the correct failure. Wiring it to a real provider is a
 * launch blocker tracked in INFRASTRUCTURE.md F6.
 */
export function AddCreditsButton({
  packId,
  className,
}: {
  packId: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);

  function handleClick() {
    setLoading(true);
    // A plain navigation, not fetch: the route answers with a redirect back to
    // /app?credited=1, and letting the browser follow it refreshes the balance.
    window.location.href = `/api/dev/credits/add?pack=${encodeURIComponent(packId)}`;
  }

  return (
    <button onClick={handleClick} disabled={loading} className={cn(className, 'disabled:opacity-50')}>
      {loading ? '…' : 'Dodaj kredit'}
    </button>
  );
}