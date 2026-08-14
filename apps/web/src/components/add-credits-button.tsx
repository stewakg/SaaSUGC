'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Starts a real credit-pack purchase through the active Billing provider.
 *
 * POSTs to /api/billing/checkout and follows the URL the provider returns —
 * a Lemon Squeezy hosted checkout page in production, or the dev instant-credit
 * route when the active provider is the mock (local dev).
 */
export function AddCreditsButton({
  packId,
  className,
}: {
  packId: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId }),
      });
      if (!res.ok) {
        setLoading(false);
        setError(true);
        return;
      }
      const data = (await res.json()) as { url?: string };
      if (!data.url) {
        setLoading(false);
        setError(true);
        return;
      }
      // Hand off to the provider's checkout page (or the dev instant-credit
      // redirect). Leaving the page also clears the loading state visually.
      window.location.href = data.url;
    } catch {
      setLoading(false);
      setError(true);
    }
  }

  // Carries its own button styling rather than trusting the caller to pass a
  // class. It used to look right only because its single caller happened to
  // pass `btn-ghost`; the next caller that forgot would have got an unstyled
  // button with no focus ring. `className` still wins for layout.
  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        className={cn('btn-ghost disabled:opacity-50', className)}
      >
        {loading ? '…' : 'Dodaj kredit'}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-err-text">Kupovina trenutno nije moguća.</p>}
    </>
  );
}