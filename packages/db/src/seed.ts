/**
 * Seed script — creates a dev user with credits so F1+ auth/credit flows have
 * data to work with. Run with: pnpm db:seed
 *
 * Uses the Supabase service-role client (local). Requires local Supabase:
 *   supabase start   (then copy the service_role key from the output)
 *   SUPABASE_SERVICE_ROLE_KEY=<key> pnpm db:seed
 *
 * Mock-first: if Supabase isn't running or the key is absent, this prints a
 * friendly note and exits 0 — it never blocks the dev workflow.
 */
import { createServiceClient } from './client.ts';

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';

const DEV_USER = {
  email: 'dev@adgen.local',
  password: 'dev-password-123',
};

async function main() {
  if (!SERVICE_KEY) {
    console.warn(
      '\n[seed] SUPABASE_SERVICE_ROLE_KEY not set — skipping seed.\n' +
        '         Run `supabase start` then set the service-role key and re-run.\n' +
        '         (Mock-first: the app runs fine without this.)\n',
    );
    return;
  }

  const supabase = createServiceClient(URL, SERVICE_KEY);

  // 1. Create auth user (idempotent: ignore if exists).
  const { data: existing } = await supabase.auth.admin.listUsers();
  const found = existing?.users?.find((u) => u.email === DEV_USER.email);
  let userId = found?.id;

  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: DEV_USER.email,
      password: DEV_USER.password,
      email_confirm: true,
    });
    if (error) {
      console.error('[seed] createUser failed:', error.message);
      process.exit(1);
    }
    userId = data.user.id;
    console.log(`[seed] created auth user ${DEV_USER.email} (${userId})`);
  } else {
    console.log(`[seed] auth user already exists (${userId})`);
  }

  // 2. Top up to 100 credits via the ledger (the signup trigger grants 3).
  const { data: profile } = await supabase
    .from('profiles')
    .select('balance')
    .eq('id', userId)
    .single();
  const target = 100;
  const topup = target - (profile?.balance ?? 0);
  if (topup > 0) {
    const { error } = await supabase.from('credits_ledger').insert({
      user_id: userId,
      delta: topup,
      reason: 'dev_topup',
      job_id: null,
    });
    if (error) {
      console.error('[seed] ledger insert failed:', error.message);
      process.exit(1);
    }
    await supabase.from('profiles').update({ balance: target }).eq('id', userId);
    console.log(`[seed] topped up ${topup} credits → balance ${target}`);
  } else {
    console.log(`[seed] balance already >= ${target} (=${profile?.balance})`);
  }

  console.log('\n[seed] done. Dev login:');
  console.log(`   email:    ${DEV_USER.email}`);
  console.log(`   password: ${DEV_USER.password}\n`);
}

main().catch((err) => {
  console.error('[seed] unexpected error:', err);
  process.exit(1);
});