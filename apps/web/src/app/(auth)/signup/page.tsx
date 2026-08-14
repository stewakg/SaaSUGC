'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';
import { authErrorMessage } from '@/lib/auth-errors';
import { PASSWORD_MIN_LENGTH, validatePassword } from '@/lib/password';
import { PasswordRules } from '@/components/password-rules';
import { SIGNUP_BONUS_CREDITS, freeVideosLabel } from '@adgen/core/pricing';

/**
 * Email/password sign-up. The signup-bonus trigger (0001_init_schema.sql)
 * creates a profile + credits the signup bonus automatically on auth.users insert.
 * Google OAuth is deferred to F5.
 */
export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Signup is the one place a typo is unrecoverable: the account is created
    // with the mistyped password and email confirmation still lets the user in
    // once, so nothing surfaces the mistake until the next login fails.
    const weak = validatePassword(password);
    if (weak) {
      setError(weak);
      return;
    }
    if (password !== confirm) {
      setError('Lozinke se ne poklapaju.');
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    const supabase = createBrowserClient();
    // emailRedirectTo is NOT optional here. Without it Supabase points the
    // confirmation link at the project's Site URL (`/`), so the link lands on
    // the landing page as `/?code=…` — nothing there exchanges it, the code
    // expires unused and the user stays logged out after "confirming".
    // /auth/callback is the route that calls exchangeCodeForSession.
    // The URL must also be allow-listed in Supabase → Auth → URL Configuration.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) {
      setError(authErrorMessage(error.message));
      return;
    }
    // If email confirmation is enabled, Supabase returns a session-less response.
    if (data.user && !data.session) {
      setNotice('Proveri email da potvrdiš nalog, pa se uloguj.');
      return;
    }
    router.push('/app');
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
      <div className="ambient ambient--a" aria-hidden="true" />
      <div className="ambient ambient--b" aria-hidden="true" />
      <div className="panel w-full max-w-sm p-8 animate-fade-in">
        <h1 className="font-display text-2xl font-bold">Napravi nalog</h1>
        <p className="mt-1 text-sm text-txt-mid">
          {freeVideosLabel(SIGNUP_BONUS_CREDITS)} odmah. Bez kartice.
        </p>

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
            placeholder={`minimum ${PASSWORD_MIN_LENGTH} znakova`}
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
          />
          <PasswordRules value={password} />
          <Field
            label="Ponovi lozinku"
            type="password"
            value={confirm}
            onChange={setConfirm}
            placeholder="isto još jednom"
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
          />

          {error && <p className="rounded-lg bg-err/10 p-3 text-sm text-err-text">{error}</p>}
          {notice && <p className="rounded-lg bg-accent-soft p-3 text-sm text-accent-text">{notice}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? 'Pravim nalog…' : 'Registruj se'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-txt-mid">
          Imaš nalog?{' '}
          <Link href="/login" className="focus-ring rounded font-medium text-accent hover:text-accent-text">
            Uloguj se
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
  minLength,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
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
        minLength={minLength}
        autoComplete={autoComplete}
        className="input"
      />
    </label>
  );
}