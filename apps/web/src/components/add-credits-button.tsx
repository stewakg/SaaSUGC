'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Starts a credit-pack purchase via the active Billing provider — a real
 * Lemon Squeezy hosted checkout once configured (F6), or the dev mock
 * "instant credit" redirect (see /api/dev/credits/add) until then.
 */
export function AddCreditsButton({
  packId,
  className,
}: {
  packId: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Greška pri pokretanju kupovine.');
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nepoznata greška.');
      setLoading(false);
    }
  }

  return (
    <div>
      <button onClick={handleClick} disabled={loading} className={cn(className, 'disabled:opacity-50')}>
        {loading ? '…' : 'Dodaj kredit'}
      </button>
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}