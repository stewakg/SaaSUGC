'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';
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
      setError(error.message);
      return;
    }
    router.push('/app');
    router.refresh();
  }

  return (
    <main className="glow relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="card-gradient w-full max-w-sm p-8 animate-fade-in">
        <h1 className="font-display text-2xl font-bold">Nova lozinka</h1>

        {checking ? (
          <p className="mt-4 text-sm text-zinc-400">Proveravam link…</p>
        ) : !hasSession ? (
          <>
            <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
              Link je istekao ili je već iskorišćen.
            </p>
            <p className="mt-6 text-center text-sm text-zinc-400">
              <Link
                href="/zaboravljena-lozinka"
                className="font-medium text-brand-300 hover:text-brand-200"
              >
                Pošalji novi link
              </Link>
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-zinc-400">Unesi je dva puta, da ne bude omaške.</p>
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

              {error && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

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
      <span className="mb-1 block text-sm text-zinc-300">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        minLength={PASSWORD_MIN_LENGTH}
        autoComplete="new-password"
        className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none transition focus:border-brand-400/50 focus:ring-1 focus:ring-brand-400/30"
      />
    </label>
  );
}
