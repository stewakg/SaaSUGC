/**
 * GET /api/dev/credits/add — dev-only mock "checkout" landing page.
 * MockBilling.createCheckout() points the browser here to simulate the
 * redirect a real Lemon Squeezy hosted checkout does after payment: credit
 * the account instantly, then redirect back to the dashboard.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { CREDIT_PACKS } from '@adgen/core/pricing';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not_available' }, { status: 404 });
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
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
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  return NextResponse.redirect(new URL('/app?credited=1', request.url));
}