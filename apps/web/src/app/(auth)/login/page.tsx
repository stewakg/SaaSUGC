'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';

/**
 * Email/password login. Supabase Auth (local in dev).
 * On success → redirect to /app (or the `next` param).
 */
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/app';
  const callbackError = params.get('error') === 'callback';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(callbackError ? 'Neispravan auth callback.' : null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <main className="glow relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="card-gradient w-full max-w-sm p-8 animate-fade-in">
        <h1 className="font-display text-2xl font-bold">Uloguj se</h1>
        <p className="mt-1 text-sm text-zinc-400">Dobrodošao nazad.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="ti@primer.rs"
            required
            autoComplete="email"
          />
          <Field
            label="Lozinka"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />

          {error && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? 'Prijava…' : 'Uloguj se'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm">
          <Link
            href="/zaboravljena-lozinka"
            className="text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline"
          >
            Zaboravio si lozinku?
          </Link>
        </p>

        <p className="mt-6 text-center text-sm text-zinc-400">
          Nemaš nalog?{' '}
          <Link href="/signup" className="font-medium text-brand-300 hover:text-brand-200">
            Registruj se
          </Link>
        </p>
      </div>
    </main>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  required,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-zinc-300">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none transition focus:border-brand-400/50 focus:ring-1 focus:ring-brand-400/30"
      />
    </label>
  );
}