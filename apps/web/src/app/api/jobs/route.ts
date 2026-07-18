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
import { createRedisConnection, JOB_QUEUE_NAME, type JobQueueData } from '@adgen/core/queue';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';
import type { JobType } from '@adgen/db';

// Generous but real: blocks a runaway script/loop without getting in a real
// user's way (the credit balance check already gates actual cost).
const RATE_LIMIT = { max: 20, windowSeconds: 60 };

// Lazy singleton: constructing a Queue opens a Redis connection immediately,
// which would fire during `next build`'s route analysis (no Redis running
// then) if created at module load. Created on first request instead, reused
// across requests in the same server process after that.
let queue: Queue<JobQueueData> | null = null;
function getQueue(): Queue<JobQueueData> {
  queue ??= new Queue<JobQueueData>(JOB_QUEUE_NAME, { connection: createRedisConnection() });
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
  const MAX_JOB_COUNT = 10;
  const count = Number.isInteger(body.count) && (body.count as number) > 0 ? (body.count as number) : 1;
  if (count > MAX_JOB_COUNT) {
    return NextResponse.json({ error: 'invalid_count', max: MAX_JOB_COUNT }, { status: 400 });
  }
  const cost = computeJobCost(type, count);
  const params = {
    ...(typeof body.params === 'object' && body.params !== null ? (body.params as Record<string, unknown>) : {}),
    count,
  };

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('balance')
    .eq('id', user.id)
    .single();
  if (profileError || !profile) {
    return NextResponse.json({ error: 'profile_not_found' }, { status: 500 });
  }
  if (profile.balance < cost) {
    return NextResponse.json({ error: 'insufficient_balance', cost, balance: profile.balance }, { status: 402 });
  }

  const admin = createAdminClient();
  const { data: job, error: insertError } = await admin
    .from('jobs')
    .insert({ user_id: user.id, type, status: 'queued', params, cost })
    .select('id')
    .single();
  if (insertError || !job) {
    return NextResponse.json({ error: insertError?.message ?? 'insert_failed' }, { status: 500 });
  }

  await getQueue().add(type, { jobId: job.id });

  return NextResponse.json({ id: job.id });
}