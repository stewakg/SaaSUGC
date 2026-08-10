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
import { createRedisCommandClient } from '@adgen/core/queue';
import type IORedis from 'ioredis';

// Lazy singleton, same reasoning as the Queue singleton in /api/jobs/route.ts:
// creating the connection at module load would fire during `next build`'s
// route analysis, when no Redis is running.
let redis: IORedis | null = null;
function getRedis(): IORedis {
  // NOT the BullMQ connection: that one is configured to wait forever rather
  // than reject, which made the fail-open below unreachable (see queue.ts).
  redis ??= createRedisCommandClient();
  return redis;
}

/**
 * Hard ceiling on how long rate limiting may delay a request.
 *
 * Belt and braces: `enableOfflineQueue: false` already rejects immediately
 * while disconnected, but a connection that stalls mid-command (half-open
 * socket, unresponsive server) would still hang the caller. Rate limiting is
 * never worth making the user wait — if it can't answer fast, let the request
 * through.
 */
const RATE_LIMIT_TIMEOUT_MS = 1000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('rate-limit timeout')), ms)),
  ]);
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
    const count = await withTimeout(client.incr(redisKey), RATE_LIMIT_TIMEOUT_MS);
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
