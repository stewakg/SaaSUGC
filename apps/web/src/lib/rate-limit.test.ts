/**
 * Tests for the Redis-backed fixed-window rate limiter.
 *
 * This file is the only guard between a signed-in account and unbounded use of
 * routes that cost real money (/api/scrape fetches a URL the caller picks,
 * /api/voices hits ElevenLabs, /api/import-clip downloads video). The two
 * behaviours that absolutely must not regress are:
 *   - it FAILS OPEN: a Redis hiccup degrades to "no rate limiting", never to
 *     "the whole API is down";
 *   - it calls `EXPIRE … NX` on EVERY request, not only when the counter is 1,
 *     so a crash between INCR and EXPIRE can never leave the key with no TTL
 *     (which would rate-limit that identity permanently).
 *
 * The module lazily builds a singleton Redis client from
 * `createRedisCommandClient` (@adgen/core/queue). We mock that factory so no
 * real socket is ever opened — the three `vi.fn()`s below stand in for
 * `incr`/`expire`/`ttl`. They are declared through `vi.hoisted` because
 * `vi.mock` is hoisted above every import, so the factory closure can only see
 * bindings that were themselves hoisted.
 *
 * `withTimeout` (internal) arms a 1s `setTimeout` around the `incr` call, so
 * the suite freezes the clock with `vi.useFakeTimers()` and, for the hanging
 * case, drives it forward with `vi.advanceTimersByTimeAsync`. Real timers and
 * all mocks are restored in `afterEach` so later files in the same vitest run
 * are not poisoned.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rateLimit } from './rate-limit.ts';

const { incr, expire, ttl } = vi.hoisted(() => ({
  incr: vi.fn(),
  expire: vi.fn(),
  ttl: vi.fn(),
}));

vi.mock('@adgen/core/queue', () => ({
  // The real factory returns an IORedis-like command client. We hand back the
  // same mock object on every call — the module caches it as a singleton on
  // first use, so the assertions below read against the single shared set.
  createRedisCommandClient: () => ({ incr, expire, ttl }),
}));

beforeEach(() => {
  // Freeze the clock so the 1s internal timeout never costs real time, and
  // wipe every mock's call log + return value so tests stay independent.
  vi.useFakeTimers();
  incr.mockReset();
  expire.mockReset();
  ttl.mockReset();
});

afterEach(() => {
  // Hand the clock and the global mocks back to vitest; other files in the
  // same run depend on real timers and an un-mocked queue module.
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('rateLimit — counting inside the window', () => {
  it('allows when under the limit and counts remaining down', async () => {
    // limit = 5, this is the 1st request → remaining must be 4 (limit - count).
    incr.mockResolvedValue(1);
    ttl.mockResolvedValue(60);
    const result = await rateLimit('scrape:user-123', 5, 60);
    expect(result).toEqual({ allowed: true, remaining: 4, resetSeconds: 60 });
  });

  it('still allows exactly AT the limit', async () => {
    // The rule is `count <= limit`. With count === limit this is the last
    // legitimate request in the window; flipping to `<` would wrongly 429 it,
    // and flipping the boundary the other way lets one extra through.
    incr.mockResolvedValue(5);
    ttl.mockResolvedValue(60);
    const result = await rateLimit('scrape:user-123', 5, 60);
    expect(result).toEqual({ allowed: true, remaining: 0, resetSeconds: 60 });
  });

  it('rejects one over the limit and never reports a negative remaining', async () => {
    // count = limit + 1 → not allowed, and `remaining` must clamp at 0 rather
    // than leaking -1 to a Retry-After header or the UI.
    incr.mockResolvedValue(6);
    ttl.mockResolvedValue(60);
    const result = await rateLimit('scrape:user-123', 5, 60);
    expect(result).toEqual({ allowed: false, remaining: 0, resetSeconds: 60 });
  });
});
describe('rateLimit — Redis command arguments', () => {
  it('prefixes the key with `ratelimit:`', async () => {
    // The routes pass a scoped key like `scrape:<user id>`; the prefix is what
    // keeps these counters out of every other Redis namespace (BullMQ, cache…).
    incr.mockResolvedValue(1);
    ttl.mockResolvedValue(60);
    await rateLimit('scrape:user-123', 5, 60);
    expect(incr).toHaveBeenCalledWith('ratelimit:scrape:user-123');
  });

  it('calls `expire` with NX on EVERY request, not only when count === 1', async () => {
    // count is 3 here — well past the first request — yet EXPIRE must still
    // fire. Skipping it when count > 1 would reopen the INCR-then-crash race
    // that leaves a key with no TTL and rate-limits the identity forever.
    incr.mockResolvedValue(3);
    ttl.mockResolvedValue(60);
    await rateLimit('scrape:user-123', 5, 60);
    expect(expire).toHaveBeenCalledWith('ratelimit:scrape:user-123', 60, 'NX');
  });
});

describe('rateLimit — resetSeconds from TTL', () => {
  it('uses the live TTL when it is positive', async () => {
    // A real TTL (seconds left in the window) is what a correct Retry-After
    // needs; 42 here is arbitrary but clearly distinct from windowSeconds.
    incr.mockResolvedValue(1);
    ttl.mockResolvedValue(42);
    const result = await rateLimit('voices:user-1', 30, 60);
    expect(result.resetSeconds).toBe(42);
  });

  it('falls back to windowSeconds when ttl reports -1 (key has no TTL)', async () => {
    // -1 means the key exists but has no expiry set — a state the unconditional
    // EXPIRE … NX is meant to prevent, but the fallback must still be sane.
    incr.mockResolvedValue(1);
    ttl.mockResolvedValue(-1);
    const result = await rateLimit('voices:user-1', 30, 60);
    expect(result.resetSeconds).toBe(60);
  });

  it('falls back to windowSeconds when ttl reports -2 (key is missing)', async () => {
    // -2 means the key does not exist at all (evicted between commands). The
    // window estimate is the only honest answer we can give the caller.
    incr.mockResolvedValue(1);
    ttl.mockResolvedValue(-2);
    const result = await rateLimit('voices:user-1', 30, 60);
    expect(result.resetSeconds).toBe(60);
  });
});
describe('rateLimit — fails open', () => {
  it('allows and does not throw when `incr` rejects', async () => {
    // Redis down / command error: the catch-all must return a permissive
    // result rather than 500 the route. remaining is the full limit because
    // we have no count to subtract from.
    incr.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await rateLimit('scrape:user-123', 5, 60);
    expect(result).toEqual({ allowed: true, remaining: 5, resetSeconds: 60 });
  });

  it('allows when `incr` hangs past the 1s internal timeout', async () => {
    // A half-open socket can leave `incr` pending forever. `withTimeout` arms
    // a 1s setTimeout around it; under fake timers that never fires on its
    // own, so we advance the clock past the deadline and assert the call still
    // resolves to the fail-open shape instead of hanging the request.
    incr.mockReturnValue(new Promise<number>(() => {})); // never settles
    const promise = rateLimit('scrape:user-123', 5, 60);
    // Absorb the eventual resolution so advancing timers can't surface an
    // unhandled promise tick before our assertion attaches.
    const guard = promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(1500);

    const result = await promise;
    expect(result).toEqual({ allowed: true, remaining: 5, resetSeconds: 60 });
    void guard;
  });

  it('allows when a later command (`expire`) rejects', async () => {
    // `incr` succeeded so the request was counted, but `expire` blew up. The
    // whole call must still resolve allowed rather than throw — the route must
    // not 500 just because the TTL-setting step had a problem.
    incr.mockResolvedValue(1);
    expire.mockRejectedValue(new Error('EXEC ABORTED'));
    const result = await rateLimit('scrape:user-123', 5, 60);
    expect(result).toEqual({ allowed: true, remaining: 5, resetSeconds: 60 });
  });

  it('fails open when `expire` hangs (single shared budget covers the whole sequence)', async () => {
    // `incr` resolves fine, but a half-open socket then leaves `expire`
    // pending forever. The original code only armed a timeout around `incr`,
    // so this would hang the request indefinitely — the exact failure the
    // "hard ceiling" comment promises to prevent. With the whole sequence
    // wrapped in one withTimeout, advancing the clock past the single budget
    // must resolve to the fail-open shape instead.
    incr.mockResolvedValue(1);
    expire.mockReturnValue(new Promise<number>(() => {})); // never settles
    const promise = rateLimit('scrape:user-123', 5, 60);
    // Absorb the eventual rejection so a stray tick can't surface an
    // unhandled promise before our assertion attaches.
    const guard = promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(1500);

    const result = await promise;
    expect(result).toEqual({ allowed: true, remaining: 5, resetSeconds: 60 });
    void guard;
  });

  it('fails open when `ttl` hangs (single shared budget covers the whole sequence)', async () => {
    // Same shape as the hanging-`expire` case, one command later: `incr` and
    // `expire` both resolve, but `ttl` never settles. Only the combined
    // withTimeout can rescue this — under the old per-`incr` wrap the call
    // would hang here forever.
    incr.mockResolvedValue(1);
    expire.mockResolvedValue(1);
    ttl.mockReturnValue(new Promise<number>(() => {})); // never settles
    const promise = rateLimit('scrape:user-123', 5, 60);
    const guard = promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(1500);

    const result = await promise;
    expect(result).toEqual({ allowed: true, remaining: 5, resetSeconds: 60 });
    void guard;
  });

  it('shares the budget across commands rather than granting each a fresh one', async () => {
    // The point of a "hard ceiling" is that the TOTAL delay is bounded. If
    // `incr` already burns most of the budget and then `expire` hangs, a
    // per-command timeout would restart the clock and let the request run up
    // to ~2s; a single shared budget must reject at ~1s from the START of
    // the call.
    //
    // We express this by resolving `incr` only after ~700ms of fake time and
    // leaving `expire` hanging, then advancing exactly RATE_LIMIT_TIMEOUT_MS
    // (1000ms) from the start of the call — which is well under the 700ms +
    // 1000ms = 1700ms a per-command scheme would allow. The call must already
    // have resolved to fail-open at that point.
    incr.mockImplementation(
      () => new Promise<number>((resolve) => setTimeout(() => resolve(1), 700)),
    );
    expire.mockReturnValue(new Promise<number>(() => {})); // never settles
    const promise = rateLimit('scrape:user-123', 5, 60);
    const guard = promise.catch(() => {});

    // Advance exactly the single budget from the start of the call. Under
    // fake timers this both fires the 700ms `incr` resolver and then, with
    // ~300ms left, the withTimeout rejecter — so the promise is settled.
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ allowed: true, remaining: 5, resetSeconds: 60 });
    // Sanity: incr DID resolve (so we're not just timing out on a never-set
    // incr) and expire was reached (so the hang is genuinely on expire, not
    // before it).
    expect(incr).toHaveBeenCalled();
    expect(expire).toHaveBeenCalled();
    void guard;
  });
});
