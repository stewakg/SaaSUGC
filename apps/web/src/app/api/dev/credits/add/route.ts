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
import { rateLimit } from '@/lib/rate-limit';

/**
 * Tight on purpose. This is the one route that creates credits out of nothing,
 * and it was the only credit-touching route with no limit at all — found by the
 * 2026-08-13 audit. The production admin gate below is the real defence; this is
 * the second one, so that a regression in the gate cannot be turned into
 * unlimited minting in a loop. Legitimate use is a handful of clicks.
 */
const RATE_LIMIT = { max: 10, windowSeconds: 60 };

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

  const rl = await rateLimit(`devcredits:${user.id}`, RATE_LIMIT.max, RATE_LIMIT.windowSeconds);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'rate_limited', retryAfterSeconds: rl.resetSeconds }, { status: 429 });
  }

  /*
   * This route mints credits out of nothing, so it is for listed admins only —
   * and the check lives HERE, not just in the UI, because hiding the button
   * hides nothing from anyone who knows the URL.
   *
   * The condition is deliberately `!== 'development'` and NOT
   * `=== 'production'`. It used to be the latter, which FAILS OPEN: every
   * value other than "production" — unset, empty, a typo, `NODE_ENV=test`, a
   * container started without the var — left unlimited credit minting open to
   * any authenticated user. Asking "are we provably in development?" instead
   * means anything unrecognised lands on the SAFE side. `next dev` sets
   * `development` itself, so local testing is exactly as painless as before.
   *
   * (NODE_ENV=production is separately set in both Dockerfiles and in
   * docker-compose.prod.yml. This is the fourth layer, and the only one that
   * holds if the other three are misconfigured at once.)
   */
  if (process.env.NODE_ENV !== 'development' && !isAdminEmail(user.email)) {
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