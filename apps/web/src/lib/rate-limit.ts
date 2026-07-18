/**
 * Redis-backed fixed-window rate limiter (F6 production hardening).
 *
 * An in-memory counter wouldn't work once this runs on Vercel (many
 * short-lived serverless instances, no shared memory) — Redis is the
 * natural shared store since /api/jobs already depends on it for BullMQ.
 *
 * Fails OPEN: if Redis is unreachable, requests are allowed rather than
 * blocked — a Redis hiccup should degrade to "no rate limiting", not "the
 * whole API is down".
 */
import { createRedisConnection } from '@adgen/core/queue';
import type IORedis from 'ioredis';

// Lazy singleton, same reasoning as the Queue singleton in /api/jobs/route.ts:
// creating the connection at module load would fire during `next build`'s
// route analysis, when no Redis is running.
let redis: IORedis | null = null;
function getRedis(): IORedis {
  redis ??= createRedisConnection();
  return redis;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

/**
 * `key` should already be scoped to the route + identity, e.g. `jobs:<user id>`
 * — this function just prefixes it with `ratelimit:` and counts within a
 * fixed window of `windowSeconds`, capped at `limit` requests.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  try {
    const client = getRedis();
    const redisKey = `ratelimit:${key}`;
    const count = await client.incr(redisKey);
    // `NX` (Redis 7+): only sets a TTL if the key doesn't already have one.
    // Doing this unconditionally, not just when count === 1, closes a race
    // where a crash between INCR and EXPIRE would otherwise leave the key
    // with no TTL — permanently rate-limiting that identity instead of the
    // window ever resetting.
    await client.expire(redisKey, windowSeconds, 'NX');
    const ttl = await client.ttl(redisKey);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetSeconds: ttl > 0 ? ttl : windowSeconds,
    };
  } catch {
    // Redis unreachable — fail open (see module doc comment).
    return { allowed: true, remaining: limit, resetSeconds: windowSeconds };
  }
}
