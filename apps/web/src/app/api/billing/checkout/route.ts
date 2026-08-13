/**
 * POST /api/billing/checkout — start a credit-pack purchase.
 * Auth required. Delegates to the active Billing provider (mock in dev,
 * Lemon Squeezy once configured) and returns a URL for the client to
 * navigate to — a real Lemon Squeezy hosted checkout page in production,
 * or the dev mock "instant credit" redirect until then.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createProviders } from '@adgen/core';
import { createServerClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';

// Tight: legitimate use is a handful of checkout attempts, not a loop.
const RATE_LIMIT = { max: 10, windowSeconds: 60 };

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const rl = await rateLimit(`checkout:${user.id}`, RATE_LIMIT.max, RATE_LIMIT.windowSeconds);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'rate_limited', retryAfterSeconds: rl.resetSeconds }, { status: 429 });
  }

  const { packId } = (await request.json().catch(() => ({}))) as { packId?: string };
  if (!packId) {
    return NextResponse.json({ error: 'missing_pack_id' }, { status: 400 });
  }

  const { billing } = createProviders();
  // A mock provider hands back the dev "instant credit" URL. In production that
  // is a free-credits link, so refuse rather than serve it: the deploy is
  // misconfigured (no LEMONSQUEEZY_* keys) and the honest answer is "checkout is
  // not available", not a checkout that never charges.
  if (process.env.NODE_ENV === 'production' && billing.name === 'mock-billing') {
    console.error('[billing] checkout requested in production but billing resolved to the mock provider — LEMONSQUEEZY_* is not configured.');
    return NextResponse.json({ error: 'billing_unavailable' }, { status: 503 });
  }

  try {
    const { url } = await billing.createCheckout(user.id, packId);
    return NextResponse.json({ url });
  } catch (err) {
    console.error('[billing] checkout creation failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'checkout_failed' }, { status: 500 });
  }
}