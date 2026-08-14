'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';
import { authErrorMessage } from '@/lib/auth-errors';
import { PASSWORD_MIN_LENGTH, validatePassword } from '@/lib/password';
import { PasswordRules } from '@/components/password-rules';

/**
 * Step 2 of password recovery: set the new password.
 *
 * Reached only via /auth/callback, which exchanged the recovery code for a
 * session — that session is the entire authorisation for updateUser(). Landing
 * here without one means the link was expired, already used, or opened
 * directly, so we say so instead of showing a form that would fail on submit.
 *
 * Not listed in middleware's protected paths on purpose: the recovery session
 * exists by the time the redirect lands, and gating it behind /app would send
 * the user to /login with a session they don't yet know they have.
 */
export default function NewPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
      setChecking(false);
    });
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(authErrorMessage(error.message));
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
        <h1 className="font-display text-2xl font-bold">Nova lozinka</h1>

        {checking ? (
          <p className="mt-4 text-sm text-txt-mid">Proveravam link…</p>
        ) : !hasSession ? (
          <>
            <p className="mt-4 rounded-lg bg-err/10 p-3 text-sm text-err-text">
              Link je istekao ili je već iskorišćen.
            </p>
            <p className="mt-6 text-center text-sm text-txt-mid">
              <Link
                href="/zaboravljena-lozinka"
                className="focus-ring rounded font-medium text-accent hover:text-accent-text"
              >
                Pošalji novi link
              </Link>
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-txt-mid">Unesi je dva puta, da ne bude omaške.</p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <Field
                label="Nova lozinka"
                value={password}
                onChange={setPassword}
                placeholder={`minimum ${PASSWORD_MIN_LENGTH} znakova`}
              />
              <PasswordRules value={password} />
              <Field
                label="Ponovi lozinku"
                value={confirm}
                onChange={setConfirm}
                placeholder="isto još jednom"
              />

              {error && <p className="rounded-lg bg-err/10 p-3 text-sm text-err-text">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full disabled:opacity-50"
              >
                {loading ? 'Čuvam…' : 'Sačuvaj lozinku'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-txt-mid">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        minLength={PASSWORD_MIN_LENGTH}
        autoComplete="new-password"
        className="input"
      />
    </label>
  );
}
