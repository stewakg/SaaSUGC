import { consoleLogger } from '@adgen/core';

/**
 * Liveness for a process that has no HTTP server.
 *
 * A container healthcheck that only proves "the process exists" is worthless
 * here: the failure that matters is a worker that is running but no longer
 * consuming. So the worker writes a timestamp on an interval from inside its
 * own event loop, and the healthcheck asks whether that timestamp is recent.
 * A blocked loop or a dead Redis socket both stop the writes.
 */
export const HEARTBEAT_KEY = 'adgen:worker:heartbeat';
export const HEARTBEAT_INTERVAL_MS = 15_000;
/** Four missed beats. Generous on purpose — a restart loop is worse than a slow beat. */
export const HEARTBEAT_STALE_MS = 60_000;

/**
 * Start writing the heartbeat. The first beat is immediate, so a freshly
 * restarted worker is healthy from the first probe (with start_period covering
 * the gap anyway).
 *
 * The stop function clears the interval; the timer is unref'd so it alone can
 * never keep the process alive.
 */
export function startHeartbeat(redis: {
  set: (k: string, v: string) => Promise<unknown>;
}): () => void {
  const beat = () => {
    redis.set(HEARTBEAT_KEY, String(Date.now())).catch((err) => {
      // Swallow — same rule as alert.ts: diagnostics must never be the thing
      // that kills the worker. A dead Redis socket is the connection error
      // listener's problem, not a crash here.
      consoleLogger.warn('heartbeat write failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  };

  beat();
  const interval = setInterval(beat, HEARTBEAT_INTERVAL_MS);
  interval.unref();
  return () => clearInterval(interval);
}

/**
 * Is the heartbeat timestamp recent enough to call this worker alive?
 *
 * A timestamp in the FUTURE counts as fresh on purpose: the healthcheck command
 * and the worker run in different containers, and clock skew between them must
 * not cause a restart loop.
 */
export function isHeartbeatFresh(raw: string | null, now: number = Date.now()): boolean {
  if (raw === null) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return false;
  return now - ts < HEARTBEAT_STALE_MS;
}
