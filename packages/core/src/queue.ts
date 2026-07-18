/**
 * Shared BullMQ queue config — the producer (apps/web API routes) and the
 * consumer (apps/worker) must agree on the queue name and Redis connection
 * options, or enqueued jobs never get picked up.
 *
 * Server-only (imports ioredis). Never import from a "use client" file.
 */
import IORedis from 'ioredis';

export const JOB_QUEUE_NAME = 'adgen-jobs';

/** Payload carried on the BullMQ job — just a pointer to the `jobs` row. */
export interface JobQueueData {
  jobId: string;
}

const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379';

/**
 * BullMQ requires `maxRetriesPerRequest: null` on connections used for
 * blocking commands (Worker), so producer and consumer share this factory
 * rather than each hand-rolling ioredis options.
 */
export function createRedisConnection(redisUrl?: string): IORedis {
  // `??` only falls through on null/undefined, not '' — a blank REDIS_URL=
  // in .env (same failure class found live in env.ts's URL validation) would
  // otherwise try to connect to Redis at the literal empty string instead of
  // silently defaulting. Treat '' the same as unset for both inputs.
  const url = (redisUrl || undefined) ?? (process.env.REDIS_URL || undefined) ?? DEFAULT_REDIS_URL;
  return new IORedis(url, { maxRetriesPerRequest: null });
}
