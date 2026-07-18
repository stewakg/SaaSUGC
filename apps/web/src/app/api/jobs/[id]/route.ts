/**
 * GET /api/jobs/:id — poll a job's status/result. The client wizard hits this
 * on an interval until status is "done" or "error".
 *
 * RLS ("jobs_select_own") scopes the query to the caller's own jobs, so a
 * foreign job id simply comes back empty -> 404, no explicit ownership check
 * needed.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

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
