/**
 * GET /api/jobs/:id — poll a job's status/result. The client wizard hits this
 * on an interval until status is "done" or "error".
 *
 * DELETE /api/jobs/:id — the "Obriši fajlove" control in „Moje reklame":
 * removes the job's generated files from storage and the rows that point at
 * them. Also the per-file building block a GDPR erasure request calls.
 *
 * RLS ("jobs_select_own") scopes the query to the caller's own jobs, so a
 * foreign job id simply comes back empty -> 404, no explicit ownership check
 * needed.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createProviders } from '@adgen/core';
import { createAdminClient, createServerClient } from '@/lib/supabase/server';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { data: job, error } = await supabase
    .from('jobs')
    .select('id, type, status, result, error, cost, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ job });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // RLS scopes this to the caller's own jobs — a foreign id is a 404, same as GET.
  const { data: job, error } = await supabase
    .from('jobs')
    .select('id, status, result')
    .eq('id', id)
    .single();
  if (error || !job) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // A queued/running job's worker is about to write the very rows and objects
  // this handler removes — deleting under it would recreate half the state and
  // orphan the other half. The customer can delete the moment it settles.
  if (job.status === 'queued' || job.status === 'running') {
    return NextResponse.json({ error: 'job_in_flight' }, { status: 409 });
  }

  const { data: assetRows } = await supabase
    .from('assets')
    .select('id, storage_key')
    .eq('job_id', id);
  const keys = (assetRows ?? [])
    .map((a) => a.storage_key)
    .filter((k): k is string => typeof k === 'string' && k.length > 0);

  // Storage first, rows second — on purpose. If a storage delete fails midway,
  // the surviving rows still carry the keys, so a retry finishes the job
  // (Storage.delete is idempotent on a missing key by contract). The other
  // order strands unreachable objects in the bucket: rows gone, keys lost.
  //
  // createProviders() per request rather than memoised: unlike /api/storage,
  // which serves every asset load, deletion is a rare user-initiated action.
  const { storage } = createProviders();
  try {
    for (const key of keys) {
      await storage.delete(key);
    }
  } catch (cause) {
    console.error('[jobs] file delete failed:', cause);
    return NextResponse.json({ error: 'delete_failed' }, { status: 502 });
  }

  // Clients hold no DELETE/UPDATE policy on these tables (by design — see
  // 0001/0007), so the mutation runs service-role AFTER the RLS-scoped
  // ownership check above.
  const admin = createAdminClient();
  const { error: rowsError } = await admin.from('assets').delete().eq('job_id', id);
  if (rowsError) {
    console.error('[jobs] asset row delete failed:', rowsError);
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
  }

  // `result.assets` is what „Moje reklame" renders — empty it and leave a
  // marker so the row can say "files deleted" instead of looking broken.
  const result = (job.result ?? null) as Record<string, unknown> | null;
  if (result !== null) {
    const { error: patchError } = await admin
      .from('jobs')
      .update({ result: { ...result, assets: [], files_deleted: true } })
      .eq('id', id);
    if (patchError) {
      console.error('[jobs] result patch failed:', patchError);
      return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ deleted: keys.length });
}
