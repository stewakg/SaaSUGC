'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';

/**
 * Step 1 of password recovery: ask Supabase to email a recovery link.
 *
 * The link carries a code that only /auth/callback knows how to exchange, so
 * redirectTo must point there (the same trap the signup confirmation link fell
 * into — a bare Site URL lands on `/` and the code expires unused). `next`
 * then carries the user on to /nova-lozinka, where the session created by that
 * exchange is what authorises updateUser().
 *
 * The URL must be allow-listed in Supabase → Auth → URL Configuration.
 *
 * Always reports success, even for an unknown address: telling a stranger
 * whether an email is registered is free user enumeration.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/nova-lozinka`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <main className="glow relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="card-gradient w-full max-w-sm p-8 animate-fade-in">
        <h1 className="font-display text-2xl font-bold">Zaboravljena lozinka</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Pošaljemo ti link za postavljanje nove.
        </p>

        {sent ? (
          <p className="mt-6 rounded-lg bg-brand-400/10 p-3 text-sm text-brand-200">
            Ako postoji nalog sa tom adresom, link je poslat. Proveri i spam folder.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ti@primer.rs"
                required
                autoComplete="email"
                className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none transition focus:border-brand-400/50 focus:ring-1 focus:ring-brand-400/30"
              />
            </label>

            {error && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

            <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
              {loading ? 'Šaljem…' : 'Pošalji link'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-zinc-400">
          Setio si se?{' '}
          <Link href="/login" className="font-medium text-brand-300 hover:text-brand-200">
            Uloguj se
          </Link>
        </p>
      </div>
    </main>
  );
}
