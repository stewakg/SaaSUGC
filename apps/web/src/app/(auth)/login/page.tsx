'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';
import { authErrorMessage } from '@/lib/auth-errors';

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
  const [error, setError] = useState<string | null>(callbackError ? 'Link za prijavu nije ispravan ili je istekao. Pokušaj ponovo.' : null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(authErrorMessage(error.message));
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
      <div className="ambient ambient--a" aria-hidden="true" />
      <div className="ambient ambient--b" aria-hidden="true" />
      <div className="panel w-full max-w-sm p-8 animate-fade-in">
        <h1 className="font-display text-2xl font-bold">Uloguj se</h1>
        <p className="mt-1 text-sm text-txt-mid">Dobrodošao nazad.</p>

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

          {error && (
            // role="alert" so a screen reader announces the failure. Without it the
            // form looked like it did nothing: the message appears visually and
            // is never read out. The password checklist below already had a live
            // region, which is what made this look covered when it was not.
            <p role="alert" className="rounded-lg bg-err/10 p-3 text-sm text-err-text">{error}</p>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? 'Prijava…' : 'Uloguj se'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm">
          <Link
            href="/zaboravljena-lozinka"
            className="focus-ring rounded text-txt-mid underline-offset-4 hover:text-txt-hi hover:underline"
          >
            Zaboravio si lozinku?
          </Link>
        </p>

        <p className="mt-6 text-center text-sm text-txt-mid">
          Nemaš nalog?{' '}
          <Link href="/signup" className="focus-ring rounded font-medium text-accent hover:text-accent-text">
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
      <span className="mb-1 block text-sm text-txt-mid">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        className="input"
      />
    </label>
  );
}