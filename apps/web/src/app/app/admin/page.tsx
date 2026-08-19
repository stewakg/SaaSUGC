import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';
import { AdminUserControls } from '@/components/admin-user-controls';
import { TIMEZONE_COOKIE, formatDateTime, resolveTimezone } from '@/lib/timezone';

interface ProfileRow {
  id: string;
  email: string;
  balance: number;
  created_at: string;
}

/**
 * /app/admin — account control: every account with its email and balance,
 * manual credit adjustment, manual account deletion.
 *
 * Non-admins get notFound(), not a "forbidden" screen — the page should not
 * exist for them, same posture as the /api/admin routes. The list is read
 * service-role because profiles RLS only lets a user see their own row; the
 * gate above is what makes that read safe to render.
 */
export default async function AdminPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    notFound();
  }

  const pickedTz = (await cookies()).get(TIMEZONE_COOKIE)?.value;
  const tz = resolveTimezone(pickedTz);

  const admin = createAdminClient();
  const { data: users } = await admin
    .from('profiles')
    .select('id, email, balance, created_at')
    .order('created_at', { ascending: true })
    .returns<ProfileRow[]>();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Admin</h1>
        <p className="mt-1 text-sm text-txt-mid">
          Nalozi iz baze — krediti i brisanje. Svaka korekcija ide u ledger kao{' '}
          <span className="font-mono">admin_adjust</span>.
        </p>
      </div>

      {!users || users.length === 0 ? (
        <div className="card-gradient p-8 text-center">
          <p className="text-sm text-txt-mid">Baza nema nijedan nalog.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {users.map((row) => (
            <li key={row.id} className="card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-semibold text-txt-hi">{row.email}</span>
                  {row.id === user.id && (
                    <span className="ml-2 rounded-full border border-line bg-panel-2 px-2 py-0.5 text-[11px] text-txt-mid">
                      ti
                    </span>
                  )}
                  <p className="mt-0.5 text-xs text-txt-low">
                    <span className="font-mono tabular">{formatDateTime(row.created_at, tz)}</span>{' '}
                    · <span className="font-mono">{row.id}</span>
                  </p>
                </div>
                <span className="font-mono text-lg font-semibold tabular text-txt-hi">
                  {row.balance} kr
                </span>
              </div>
              <AdminUserControls userId={row.id} email={row.email} isSelf={row.id === user.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
