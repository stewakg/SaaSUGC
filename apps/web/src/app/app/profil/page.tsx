'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';
import { authErrorMessage } from '@/lib/auth-errors';
import { PASSWORD_MIN_LENGTH, validatePassword } from '@/lib/password';
import { PasswordRules } from '@/components/password-rules';
import { TIMEZONES, TIMEZONE_COOKIE, formatDateTime, isTimezoneId } from '@/lib/timezone';

/**
 * Account screen — the thing the shell's email text promised but never did.
 *
 * A page, not a modal: it is linkable, survives a refresh, and tests like any
 * other route. Auth itself needs no client round-trip (the /app layout already
 * redirected unsigned users out), but the email shown here comes from the
 * session the same way the auth pages read it.
 *
 * No account deletion in this version: Storage has no delete method, so we
 * could not actually erase the person's videos, and offering erasure we
 * cannot perform is worse than not offering it yet.
 */
export default function ProfilPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [tz, setTz] = useState('');
  // Null until mount: the server and the browser would otherwise format two
  // different "now"s and hydrate mismatched text.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? '');
    });
    const stored = document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${TIMEZONE_COOKIE}=`))
      ?.split('=')[1];
    if (isTimezoneId(stored)) setTz(stored);
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  async function handlePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
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
    setSaved(true);
    setPassword('');
    setConfirm('');
  }

  async function handleSignOut() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  function handleTimezone(id: string) {
    setTz(id);
    // Mirrors THEME_COOKIE in @/lib/theme: 1 year, readable by the server on
    // the next request. The empty choice clears it instead of storing noise.
    document.cookie = id
      ? `${TIMEZONE_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`
      : `${TIMEZONE_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="font-display text-2xl font-bold sm:text-3xl">Nalog</h1>

      <section className="card space-y-3">
        <h2 className="font-display text-lg font-semibold">Nalog</h2>
        <p className="text-sm text-txt-mid">
          <span className="block">Email</span>
          <span className="text-txt-hi">{email || '…'}</span>
        </p>
        <button type="button" onClick={handleSignOut} className="btn-ghost">
          Odjavi se
        </button>
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-lg font-semibold">Promeni lozinku</h2>
        <form onSubmit={handlePassword} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-txt-mid">Nova lozinka</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`minimum ${PASSWORD_MIN_LENGTH} znakova`}
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              className="input"
            />
          </label>
          <PasswordRules value={password} />
          <label className="block">
            <span className="mb-1 block text-sm text-txt-mid">Potvrdi novu lozinku</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="isto još jednom"
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              className="input"
            />
          </label>

          {error && (
            // role="alert" so a screen reader announces the failure. Without it the
            // form looked like it did nothing: the message appears visually and
            // is never read out. The password checklist below already had a live
            // region, which is what made this look covered when it was not.
            <p role="alert" className="rounded-lg bg-err/10 p-3 text-sm text-err-text">{error}</p>
          )}
          {saved && (
            // role="status", not "alert": success is not urgent enough to
            // interrupt, but silence here is worse — the fields clear and
            // nothing says the password actually changed.
            <p role="status" className="rounded-lg bg-accent-soft p-3 text-sm text-accent-text">
              Lozinka je promenjena.
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-primary disabled:opacity-50">
            {loading ? 'Čuvam…' : 'Sačuvaj lozinku'}
          </button>
        </form>
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-lg font-semibold">Vremenska zona</h2>
        <select value={tz} onChange={(e) => handleTimezone(e.target.value)} className="input">
          <option value="">Kao na uređaju</option>
          {TIMEZONES.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.label}
            </option>
          ))}
        </select>
        {now && (
          <p className="text-sm text-txt-mid">
            Trenutno vreme: {formatDateTime(now.toISOString(), tz || undefined)}
          </p>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-lg font-semibold">Krediti</h2>
        <p className="text-sm text-txt-mid">Pakete kupuješ na početnoj strani.</p>
        <Link href="/app" className="focus-ring rounded font-medium text-accent hover:text-accent-text">
          Idi na pakete
        </Link>
      </section>
    </div>
  );
}
