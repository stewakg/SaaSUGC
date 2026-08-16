/**
 * POST /api/jobs — enqueue a generation job (F2 job pipeline).
 *
 * Flow: auth -> validate type/count -> compute cost -> check balance ->
 * insert `jobs` row (service-role; RLS has no insert policy for clients,
 * by design — see supabase/migrations/0001_init_schema.sql) -> push to
 * BullMQ -> return the job id for the client to poll.
 *
 * Credits are NOT deducted here — charge-on-success happens in the worker
 * once the job actually completes (INFRASTRUCTURE.md §3).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { Queue } from 'bullmq';
import { computeJobCost, JOB_COST } from '@adgen/core/pricing';
import { createRedisConnection, queueNameForJobType, type JobQueueData } from '@adgen/core/queue';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';
import { findForeignAssetUrl } from '@/lib/asset-url';
import type { JobType } from '@adgen/db';
import { toAdSeconds } from '@adgen/core';

// Generous but real: blocks a runaway script/loop without getting in a real
// user's way (the credit balance check already gates actual cost).
const RATE_LIMIT = { max: 20, windowSeconds: 60 };

// Lazy singletons: constructing a Queue opens a Redis connection immediately,
// which would fire during `next build`'s route analysis (no Redis running
// then) if created at module load. Created on first request instead, and
// memoised one instance PER QUEUE NAME — a fresh Queue per request would open
// a fresh Redis connection per request and leak them until Redis refuses.
const queues = new Map<string, Queue<JobQueueData>>();
function getQueue(name: string): Queue<JobQueueData> {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue<JobQueueData>(name, { connection: createRedisConnection() });
    queues.set(name, queue);
  }
  return queue;
}

function isJobType(value: unknown): value is JobType {
  // `in` walks the prototype chain (e.g. 'toString' in {} is true) — use
  // hasOwnProperty so inherited Object keys aren't accepted as job types.
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(JOB_COST, value);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const rl = await rateLimit(`jobs:${user.id}`, RATE_LIMIT.max, RATE_LIMIT.windowSeconds);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'rate_limited', retryAfterSeconds: rl.resetSeconds }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    type?: unknown;
    count?: unknown;
    params?: unknown;
  };

  if (!isJobType(body.type)) {
    return NextResponse.json({ error: 'invalid_type' }, { status: 400 });
  }
  const type = body.type;
  const MAX_JOB_COUNT = 15; // Matrix offers up to 15 variants (competitor parity)
  const count = Number.isInteger(body.count) && (body.count as number) > 0 ? (body.count as number) : 1;
  if (count > MAX_JOB_COUNT) {
    return NextResponse.json({ error: 'invalid_count', max: MAX_JOB_COUNT }, { status: 400 });
  }
  const cost = computeJobCost(type, count);
  const rawParams =
    typeof body.params === 'object' && body.params !== null ? (body.params as Record<string, unknown>) : {};

  const params = {
    ...rawParams,
    // Normalised HERE as well as in the worker, so the stored job row records
    // the length that will actually be rendered. Without it a client sending
    // junk leaves a row claiming something the render never honoured, and the
    // per-job spend log becomes impossible to reconcile against it.
    targetSeconds: toAdSeconds(rawParams.targetSeconds),
    count,
  };

  // The worker fetches these urls itself, so a foreign one is an outbound
  // request made by the most privileged process we run (see asset-url.ts).
  // Rejected here, at the only place that writes a `jobs` row.
  const foreignUrl = findForeignAssetUrl(params);
  if (foreignUrl !== null) {
    console.warn(`[jobs] rejected foreign asset url from user ${user.id}: ${foreignUrl}`);
    return NextResponse.json({ error: 'invalid_asset_url' }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('balance')
    .eq('id', user.id)
    .single();
  if (profileError || !profile) {
    return NextResponse.json({ error: 'profile_not_found' }, { status: 500 });
  }
  /**
   * Charge-on-success means the balance is not touched until the worker
   * finishes, so a bare `balance < cost` check passes for EVERY job enqueued
   * inside the same window. Fifteen matrix jobs on a 15-credit account each
   * ran the real pipeline and each spent real provider money; only the first
   * charge could succeed and the business ate the other fourteen.
   *
   * So the balance has to cover what is already in flight as well. This is a
   * check, not a lock: two requests in the same millisecond still read the
   * same in-flight set. It shrinks the window from minutes of queue-and-render
   * time to one round trip. A real hold belongs in the database and is a
   * separate change.
   */
  const { data: inFlight, error: inFlightError } = await supabase
    .from('jobs')
    .select('cost')
    .eq('user_id', user.id)
    .in('status', ['queued', 'running']);
  if (inFlightError) {
    console.error('[jobs] in-flight lookup failed:', inFlightError.message);
    return NextResponse.json({ error: 'balance_check_failed' }, { status: 500 });
  }
  const reserved = (inFlight ?? []).reduce((sum, row) => sum + (row.cost ?? 0), 0);
  if (profile.balance < reserved + cost) {
    return NextResponse.json(
      { error: 'insufficient_balance', cost, balance: profile.balance, reserved },
      { status: 402 },
    );
  }

  const admin = createAdminClient();
  const { data: job, error: insertError } = await admin
    .from('jobs')
    .insert({ user_id: user.id, type, status: 'queued', params, cost })
    .select('id')
    .single();
  if (insertError || !job) {
    // The Postgres message can name tables, columns and constraints, so it is
    // logged rather than returned — same posture as the billing routes. The
    // client only needs to know the job was not created.
    console.error('[jobs] insert failed:', insertError?.message ?? 'no row returned');
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  await getQueue(queueNameForJobType(type)).add(type, { jobId: job.id });

  return NextResponse.json({ id: job.id });
}