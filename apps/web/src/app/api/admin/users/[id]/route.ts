/**
 * DELETE /api/admin/users/:id — manual account deletion from /app/admin.
 *
 * Order of operations, same reasoning as DELETE /api/jobs/:id: storage objects
 * go FIRST (their keys live in rows this deletion destroys — the other order
 * strands unreachable objects in the bucket), then the auth user, whose
 * deletion cascades through profiles → jobs/assets/credits_ledger/credits_holds
 * (every FK is ON DELETE CASCADE, 0001/0010).
 *
 * What this deliberately does NOT remove: the user's raw uploads under
 * `uploads/<id>/…`. They have no DB rows (assets.job_id is NOT NULL), Storage
 * has no list(), and the 30-day R2 lifecycle rule (TODO §5) is the mechanism
 * that ages them out.
 *
 * Two refusals with reasons:
 *  - self-deletion: an admin wiping their own signed-in account mid-session is
 *    a footgun, not a use case — 400.
 *  - queued/running jobs: the worker is about to write rows for this user and
 *    would fail midway through a paid pipeline — 409, delete after it settles.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createProviders } from '@adgen/core';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

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
  if (id === user.id) {
    return NextResponse.json({ error: 'cannot_delete_self' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: target } = await admin.from('profiles').select('id').eq('id', id).maybeSingle();
  if (!target) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data: inFlight } = await admin
    .from('jobs')
    .select('id')
    .eq('user_id', id)
    .in('status', ['queued', 'running'])
    .limit(1);
  if ((inFlight ?? []).length > 0) {
    return NextResponse.json({ error: 'jobs_in_flight' }, { status: 409 });
  }

  const { data: assetRows } = await admin.from('assets').select('storage_key').eq('user_id', id);
  const keys = (assetRows ?? [])
    .map((a) => a.storage_key)
    .filter((k): k is string => typeof k === 'string' && k.length > 0);

  const { storage } = createProviders();
  try {
    for (const key of keys) {
      await storage.delete(key);
    }
  } catch (cause) {
    // Rows and account survive, keys intact — the retry finishes the job.
    console.error('[admin] storage delete failed:', cause);
    return NextResponse.json({ error: 'delete_failed' }, { status: 502 });
  }

  const { error: authError } = await admin.auth.admin.deleteUser(id);
  if (authError) {
    console.error('[admin] auth delete failed:', authError.message);
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
  }

  return NextResponse.json({ deleted: true, files: keys.length });
}
