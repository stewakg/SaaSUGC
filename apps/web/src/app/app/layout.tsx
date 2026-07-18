import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';

/**
 * Authenticated app shell layout.
 * Server component: fetches the session + profile (balance) so the topbar
 * renders the credit balance without a client round-trip. RLS ensures the
 * user only sees their own profile.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, balance')
    .eq('id', user.id)
    .single();

  return (
    <AppShell email={profile?.email ?? user.email ?? ''} balance={profile?.balance ?? 0}>
      {children}
    </AppShell>
  );
}