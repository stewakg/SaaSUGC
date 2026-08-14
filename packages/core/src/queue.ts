/**
 * Shared BullMQ queue config — the producer (apps/web API routes) and the
 * consumer (apps/worker) must agree on the queue name and Redis connection
 * options, or enqueued jobs never get picked up.
 *
 * Server-only (imports ioredis). Never import from a "use client" file.
 */
import IORedis from 'ioredis';

/** Queue for jobs that render video on Lambda. Keeps the original name — see below. */
export const HEAVY_QUEUE_NAME = 'adgen-jobs';
/** Queue for jobs that are one provider call and a copy. */
export const LIGHT_QUEUE_NAME = 'adgen-jobs-light';

/**
 * Job types that render video. Everything else is light.
 *
 * A type NOT listed here goes to the light queue, which is the safe default in
 * one direction only: a light job on the heavy queue merely waits, while a
 * heavy job on the light queue could put four Remotion renders on one box and
 * OOM it. So when a new video-producing type is added it MUST be added here.
 */
export const HEAVY_JOB_TYPES: ReadonlySet<string> = new Set(['matrix', 'revoice']);

/** Which queue a job type belongs on — the producer and consumer both call this. */
export function queueNameForJobType(type: string): string {
  return HEAVY_JOB_TYPES.has(type) ? HEAVY_QUEUE_NAME : LIGHT_QUEUE_NAME;
}

/**
 * Alias of HEAVY_QUEUE_NAME. Prefer `queueNameForJobType` — the single queue
 * this named is now only one of two lanes.
 *
 * @deprecated Import `queueNameForJobType` (or the specific queue constant) instead.
 */
export const JOB_QUEUE_NAME = HEAVY_QUEUE_NAME;

/** Payload carried on the BullMQ job — just a pointer to the `jobs` row. */
export interface JobQueueData {
  jobId: string;
}

const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379';

/**
 * `??` only falls through on null/undefined, not '' — a blank REDIS_URL=
 * in .env (same failure class found live in env.ts's URL validation) would
 * otherwise try to connect to Redis at the literal empty string instead of
 * silently defaulting. Treat '' the same as unset for both inputs.
 */
function resolveRedisUrl(redisUrl?: string): string {
  return (redisUrl || undefined) ?? (process.env.REDIS_URL || undefined) ?? DEFAULT_REDIS_URL;
}

/**
 * BullMQ requires `maxRetriesPerRequest: null` on connections used for
 * blocking commands (Worker), so producer and consumer share this factory
 * rather than each hand-rolling ioredis options.
 *
 * Use this ONLY for BullMQ. `maxRetriesPerRequest: null` means a command
 * issued while Redis is unreachable waits forever instead of rejecting —
 * correct for a queue consumer that should ride out a blip, fatal for a
 * request/response caller. See `createRedisCommandClient` below.
 */
export function createRedisConnection(redisUrl?: string): IORedis {
  return new IORedis(resolveRedisUrl(redisUrl), { maxRetriesPerRequest: null });
}

/**
 * Connection for ordinary request/response commands issued while an HTTP
 * request is waiting — today that's the rate limiter.
 *
 * Found live 2026-08-10: with no Redis running, every rate-limited route hung
 * forever instead of degrading. The rate limiter's `catch` is written to fail
 * open, but it only fires on a REJECTED promise, and the BullMQ connection
 * above never rejects — it queues the command until Redis returns. So the
 * fail-open path was unreachable in the exact case it exists for, and static
 * review could not see it (the `catch` is right there in the file).
 *
 * `enableOfflineQueue: false` is what makes the failure surface: commands
 * issued while disconnected reject immediately rather than being buffered.
 */
export function createRedisCommandClient(redisUrl?: string): IORedis {
  const client = new IORedis(resolveRedisUrl(redisUrl), {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 1000,
    // Bounded backoff: keep trying so a recovered Redis is picked back up,
    // but never let a reconnect attempt block a caller.
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });
  // ioredis emits 'error' on every failed reconnect. With no listener, Node
  // prints an "Unhandled error event" stack per attempt and floods the log —
  // which is what a missing local Redis looked like before this fix.
  client.on('error', () => {});
  return client;
}
