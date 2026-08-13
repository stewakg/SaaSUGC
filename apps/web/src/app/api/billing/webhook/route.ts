/**
 * POST /api/billing/webhook — Lemon Squeezy payment webhook (F6).
 * NOT user-authenticated (called by Lemon Squeezy's servers) — trust comes
 * entirely from the HMAC signature Billing.parseWebhook verifies. Grants
 * credits atomically via the same add_credits RPC the dev route uses.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createProviders } from '@adgen/core';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const { billing } = createProviders();

  let grant: { userId: string; amount: number; reason: string; orderId: string } | null;
  try {
    grant = await billing.parseWebhook(request);
  } catch (err) {
    // `.name` is NOT set on the error class (it is a bare
    // `class InvalidWebhookSignatureError extends Error {}` with no constructor),
    // so `instanceof`/`.name` do not identify it — match on the constructor name.
    const isSignature = err instanceof Error && err.constructor.name === 'InvalidWebhookSignatureError';
    if (isSignature) {
      return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
    }
    console.error('[billing] webhook parse failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'malformed_payload' }, { status: 400 });
  }

  if (!grant) {
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc('add_credits_idempotent', {
    p_user_id: grant.userId,
    p_amount: grant.amount,
    p_reason: grant.reason,
    p_external_ref: grant.orderId,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}