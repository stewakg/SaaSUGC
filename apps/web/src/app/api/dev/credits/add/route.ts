/**
 * GET /api/dev/credits/add — dev-only mock "checkout" landing page.
 * MockBilling.createCheckout() points the browser here to simulate the
 * redirect a real Lemon Squeezy hosted checkout does after payment: credit
 * the account instantly, then redirect back to the dashboard.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { CREDIT_PACKS } from '@adgen/core/pricing';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';

export async function GET(request: NextRequest) {
  // Order matters: identify the caller FIRST, then decide. The previous
  // version returned 404 in production before looking at who was asking, which
  // was safe but also made the route untestable on the deployed site.
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // In production this route mints credits out of nothing, so it is for listed
  // admins only. The check lives HERE and not only in the UI — hiding the
  // button hides nothing from anyone who knows the URL. Outside production it
  // stays open, because that is what makes local testing painless.
  if (process.env.NODE_ENV === 'production' && !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'not_available' }, { status: 404 });
  }

  const packId = request.nextUrl.searchParams.get('pack');
  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) {
    return NextResponse.json({ error: 'unknown_pack' }, { status: 400 });
  }

  const amount = pack.credits + (pack.bonus ?? 0);
  const admin = createAdminClient();

  const { error: rpcError } = await admin.rpc('add_credits', {
    p_user_id: user.id,
    p_amount: amount,
    p_reason: `dev_add_credits:${pack.id}`,
  });
  if (rpcError) {
    // Log the Postgres detail rather than returning it — it names tables,
    // columns and constraints. Same posture as /api/jobs and the billing routes.
    console.error('[dev-credits] add_credits failed:', rpcError.message);
    return NextResponse.json({ error: 'grant_failed' }, { status: 500 });
  }

  return NextResponse.redirect(new URL('/app?credited=1', request.url));
}