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

  let grant: { userId: string; amount: number; reason: string } | null;
  try {
    grant = await billing.parseWebhook(request);
  } catch {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  if (!grant) {
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc('add_credits', {
    p_user_id: grant.userId,
    p_amount: grant.amount,
    p_reason: grant.reason,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}