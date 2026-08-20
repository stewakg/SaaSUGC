/**
 * POST /api/jobs — enqueue a generation job (F2 job pipeline).
 *
 * Flow: auth -> validate type/count -> compute cost -> cheap balance
 * pre-check -> insert `jobs` row (service-role; RLS has no insert policy
 * for clients, by design — see supabase/migrations/0001_init_schema.sql)
 * -> RESERVE the cost (reserve_credits holds it against the balance —
 * supabase/migrations/0010_credit_holds.sql) -> push to BullMQ -> return
 * the job id for the client to poll.
 *
 * Credits are NOT deducted here — charge-on-success happens in the worker
 * once the job actually completes (INFRASTRUCTURE.md §3). The reservation
 * is a hold, not a charge: it stops concurrent enqueues from each spending
 * the same balance, and the worker releases it on every terminal path
 * (one-hour expiry is the backstop for a worker that dies mid-job).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { Queue } from 'bullmq';
import { computeJobCost, JOB_COST } from '@adgen/core/pricing';
import { ENHANCE_MAX_SECONDS, enhanceCreditCost, enhanceTiers } from '@adgen/core/enhance-limits';
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
  const rawParams =
    typeof body.params === 'object' && body.params !== null ? (body.params as Record<string, unknown>) : {};

  /**
   * `enhance` is the one tool whose price is TIME, not output count: fal bills
   * per second, so we bill per 30-second tier (enhance-limits.ts). The client
   * measures the file in the browser before uploading it and sends the duration;
   * a missing or junk value resolves to one tier, which is both the still-image
   * case and the safe floor.
   *
   * The client is not trusted with this — it is trusted to be CONVENIENT. The
   * worker probes the stored file itself and refuses a job whose real length
   * needs more tiers than were paid for, which is why lying downwards buys a
   * rejection rather than a discount.
   */
  const enhanceSeconds = type === 'enhance' ? Number(rawParams.durationSec) : Number.NaN;
  if (type === 'enhance' && Number.isFinite(enhanceSeconds) && enhanceSeconds > ENHANCE_MAX_SECONDS) {
    // Refuse here rather than bill four tiers for something the worker will
    // reject anyway — the customer finds out before the credits are held.
    return NextResponse.json(
      { error: 'enhance_too_long', maxSeconds: ENHANCE_MAX_SECONDS },
      { status: 400 },
    );
  }
  const cost =
    type === 'enhance'
      ? enhanceCreditCost(enhanceSeconds, JOB_COST.enhance)
      : computeJobCost(type, count);

  const params = {
    ...rawParams,
    // Normalised HERE as well as in the worker, so the stored job row records
    // the length that will actually be rendered. Without it a client sending
    // junk leaves a row claiming something the render never honoured, and the
    // per-job spend log becomes impossible to reconcile against it.
    targetSeconds: toAdSeconds(rawParams.targetSeconds),
    count,
    // A RECEIPT, not an input: how many tiers this job was charged for. The
    // worker compares it against the length it measures itself, and refuses the
    // job if the file needs more. Only enhance carries it.
    ...(type === 'enhance' ? { enhanceTiers: enhanceTiers(enhanceSeconds) } : {}),
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
   * Cheap pre-check, not the gate. It saves a row insert + delete in the
   * common "user has no credits at all" case and keeps the 402 body the
   * client already knows (`error`, `cost`, `balance`). `reserve_credits`
   * below is the authority: it takes the profile row's write lock in
   * Postgres, counts the caller's outstanding holds — the queued/running
   * jobs this check used to sum for itself — and places this job's hold
   * atomically. No application-side check can do that: two requests in the
   * same millisecond read the same state here and would both pass.
   */
  if (profile.balance < cost) {
    return NextResponse.json(
      { error: 'insufficient_balance', cost, balance: profile.balance },
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

  // The row has to exist before the hold can point at it. If the reservation
  // fails, this job never runs, so the row is removed again rather than left as
  // a queued job nobody will ever process.
  const { data: reserved, error: reserveError } = await admin.rpc('reserve_credits', {
    p_user_id: user.id,
    p_job_id: job.id,
    p_amount: cost,
  });
  if (reserveError) {
    console.error('[jobs] reserve_credits failed:', reserveError.message);
    await admin.from('jobs').delete().eq('id', job.id);
    return NextResponse.json({ error: 'balance_check_failed' }, { status: 500 });
  }
  if (reserved !== true) {
    await admin.from('jobs').delete().eq('id', job.id);
    return NextResponse.json(
      { error: 'insufficient_balance', cost, balance: profile.balance },
      { status: 402 },
    );
  }

  await getQueue(queueNameForJobType(type)).add(type, { jobId: job.id });

  return NextResponse.json({ id: job.id });
}