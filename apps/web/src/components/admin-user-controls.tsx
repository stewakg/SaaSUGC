'use client';

/**
 * Per-account controls on /app/admin: manual credit adjustment and account
 * deletion. The server routes re-check the admin gate on every call — these
 * controls are convenience, not security.
 *
 * Deletion asks for confirmation WITH the email in the prompt, because the
 * rows on that page look alike and this button removes a customer, their jobs,
 * their ledger and their files in one click.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AdminUserControls({
  userId,
  email,
  isSelf,
}: {
  userId: string;
  email: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function adjust(sign: 1 | -1) {
    const parsed = Number(amount);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setError('Unesi ceo pozitivan broj kredita.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, delta: sign * parsed }),
      });
      if (!res.ok) {
        setError('Korekcija nije uspela.');
        return;
      }
      setAmount('');
      router.refresh();
    } catch {
      setError('Korekcija nije uspela.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (!window.confirm(`Trajno brišeš nalog ${email} — sve reklame, fajlove i istoriju. Nastaviti?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(
          body?.error === 'jobs_in_flight'
            ? 'Nalog ima posao u toku — sačekaj da se završi.'
            : 'Brisanje nije uspelo.',
        );
        return;
      }
      router.refresh();
    } catch {
      setError('Brisanje nije uspelo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="number"
        min={1}
        step={1}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="krediti"
        aria-label={`Broj kredita za ${email}`}
        className="input w-28"
        disabled={busy}
      />
      <button type="button" onClick={() => adjust(1)} disabled={busy} className="btn-ghost text-sm">
        Dodaj
      </button>
      <button type="button" onClick={() => adjust(-1)} disabled={busy} className="btn-ghost text-sm">
        Oduzmi
      </button>
      {!isSelf && (
        <button
          type="button"
          onClick={deleteAccount}
          disabled={busy}
          className="btn-ghost ml-auto text-sm text-err-text"
        >
          Obriši nalog
        </button>
      )}
      {error && (
        <span role="alert" className="w-full text-xs text-err-text">
          {error}
        </span>
      )}
    </div>
  );
}
