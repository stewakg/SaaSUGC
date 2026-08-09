'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';
import { PASSWORD_MIN_LENGTH, validatePassword } from '@/lib/password';
import { PasswordRules } from '@/components/password-rules';
import { SIGNUP_BONUS_CREDITS } from '@adgen/core/pricing';

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
      setError(error.message);
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
    <main className="glow relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="card-gradient w-full max-w-sm p-8 animate-fade-in">
        <h1 className="font-display text-2xl font-bold">Napravi nalog</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {SIGNUP_BONUS_CREDITS} besplatna videa odmah. Bez kartice.
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

          {error && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
          {notice && <p className="rounded-lg bg-brand-400/10 p-3 text-sm text-brand-200">{notice}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? 'Pravim nalog…' : 'Registruj se'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-400">
          Imaš nalog?{' '}
          <Link href="/login" className="font-medium text-brand-300 hover:text-brand-200">
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
      <span className="mb-1 block text-sm text-zinc-300">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none transition focus:border-brand-400/50 focus:ring-1 focus:ring-brand-400/30"
      />
    </label>
  );
}