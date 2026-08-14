/**
 * Unit tests for the worker heartbeat (health.ts).
 *
 * The invariant that outranks every other: the heartbeat must NEVER take the
 * worker down (same rule as alert.ts). A rejecting Redis write resolves quietly
 * as a warn, and the very next beat still fires — the heartbeat is diagnostics
 * for the compose healthcheck, not a suicide switch.
 *
 * No network is ever opened: `set` is a plain vi.fn() satisfying the structural
 * `{ set }` parameter. Fake timers drive the interval deterministically.
 *
 * The warn assertion spies `process.stdout.write` because `consoleLogger.warn`
 * writes a JSON line to stdout (see alert.test.ts for the same reasoning).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  startHeartbeat,
  isHeartbeatFresh,
  HEARTBEAT_KEY,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_STALE_MS,
} from './health.ts';

describe('startHeartbeat — never-fatal Redis liveness beat', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('1. writes once immediately, to HEARTBEAT_KEY, with a numeric string timestamp', () => {
    vi.useFakeTimers();
    const set = vi.fn().mockResolvedValue('OK');

    startHeartbeat({ set });

    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(HEARTBEAT_KEY, expect.any(String));
    const value = set.mock.calls[0][1];
    expect(value).toMatch(/^\d+$/);
    // Written from this process's clock, so it must be ~now (fake-timer now).
    expect(Math.abs(Number(value) - Date.now())).toBeLessThan(1000);
  });

  it('2. writes again every HEARTBEAT_INTERVAL_MS', () => {
    vi.useFakeTimers();
    const set = vi.fn().mockResolvedValue('OK');
    startHeartbeat({ set });

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    expect(set).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    expect(set).toHaveBeenCalledTimes(4);
  });

  it('3. the returned stop function stops further writes', () => {
    vi.useFakeTimers();
    const set = vi.fn().mockResolvedValue('OK');

    const stop = startHeartbeat({ set });
    stop();

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 10);
    expect(set).toHaveBeenCalledTimes(1); // only the initial immediate beat
  });

  it('4. a rejecting set does not throw and does not stop later beats (the never-fatal rule)', async () => {
    vi.useFakeTimers();
    const set = vi.fn().mockRejectedValue(new Error('redis socket dead'));
    const stdoutSpy = vi.spyOn(process.stdout, 'write');

    expect(() => startHeartbeat({ set })).not.toThrow();

    // advanceTimersByTimeAsync flushes the rejected promises between beats.
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 2);

    // Immediate beat + two interval beats, despite EVERY write rejecting —
    // the failure of one beat must not silence the next.
    expect(set).toHaveBeenCalledTimes(3);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('heartbeat write failed'));
  });
});

describe('isHeartbeatFresh — freshness of the stored timestamp', () => {
  // Fixed "now" so nothing depends on the wall clock.
  const now = 1_800_000_000_000;

  it('5a. a recent timestamp is fresh', () => {
    expect(isHeartbeatFresh(String(now - 1_000), now)).toBe(true);
    expect(isHeartbeatFresh(String(now), now)).toBe(true);
  });

  it('5b. null (no heartbeat ever written) is not fresh', () => {
    expect(isHeartbeatFresh(null, now)).toBe(false);
  });

  it("5c. a non-numeric value ('abc') is not fresh", () => {
    expect(isHeartbeatFresh('abc', now)).toBe(false);
    expect(isHeartbeatFresh('', now)).toBe(false);
  });

  it('5d. a timestamp older than HEARTBEAT_STALE_MS is not fresh', () => {
    expect(isHeartbeatFresh(String(now - HEARTBEAT_STALE_MS - 1), now)).toBe(false);
    expect(isHeartbeatFresh(String(now - HEARTBEAT_STALE_MS * 10), now)).toBe(false);
  });

  it('5e. a FUTURE timestamp is fresh — clock skew must not cause a restart loop', () => {
    expect(isHeartbeatFresh(String(now + 5 * 60_000), now)).toBe(true);
  });
});
