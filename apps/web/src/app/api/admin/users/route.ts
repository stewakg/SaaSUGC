/**
 * Admin account control — the API behind /app/admin.
 *
 *   GET  /api/admin/users — every account: email, balance, created_at.
 *   POST /api/admin/users — manual credit adjustment { userId, delta }.
 *
 * Both are gated on ADMIN_EMAILS with NO development carve-out — unlike
 * /api/dev/credits/add, nothing here is needed by a non-admin dev flow, so the
 * gate is unconditional. Non-admins get the same 404 an unknown URL would,
 * because a 403 confirms the route exists.
 *
 * Adjustments go through the add_credits RPC (ledger row + cached balance in
 * one transaction) with reason "admin_adjust", so every manual grant or
 * deduction is an auditable ledger entry, same as a purchase.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';

/**
 * One manual adjustment is bounded so a typo (an extra digit, a pasted id in
 * the amount field) cannot move an absurd sum in one call. Repeat calls are
 * fine — the bound is per request, not per account. Not exported: a Next
 * route file may only export its handlers.
 */
const MAX_ADJUST = 100_000;

/** 401 for strangers, 404 for signed-in non-admins, null for admins. */
async function requireAdmin(): Promise<NextResponse | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'not_available' }, { status: 404 });
  }
  return null;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const admin = createAdminClient();
  const { data: users, error } = await admin
    .from('profiles')
    .select('id, email, balance, created_at')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[admin] profiles list failed:', error.message);
    return NextResponse.json({ error: 'list_failed' }, { status: 500 });
  }

  return NextResponse.json({ users: users ?? [] });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { userId?: unknown; delta?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const userId = typeof body.userId === 'string' ? body.userId : '';
  const delta = body.delta;
  if (
    userId === '' ||
    typeof delta !== 'number' ||
    !Number.isInteger(delta) ||
    delta === 0 ||
    Math.abs(delta) > MAX_ADJUST
  ) {
    return NextResponse.json({ error: 'invalid_adjustment' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: newBalance, error } = await admin.rpc('add_credits', {
    p_user_id: userId,
    p_amount: delta,
    p_reason: 'admin_adjust',
  });
  if (error) {
    console.error('[admin] add_credits failed:', error.message);
    return NextResponse.json({ error: 'adjust_failed' }, { status: 500 });
  }

  return NextResponse.json({ balance: newBalance });
}
