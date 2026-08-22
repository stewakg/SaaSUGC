/**
 * Pure helpers for rendering a job row in "Moje reklame" — extracted from the
 * page so the money-display logic can be unit-tested. Getting `costLabel` wrong
 * is not cosmetic: it once showed a FAILED job as "… · 2 kredita · …", i.e. as
 * if the user had been charged for output that never arrived. The worker charges
 * on success only, so anything not `done` has not been billed.
 */
import { creditsLabel } from '@adgen/core/pricing';
import { RETENTION_DAYS, RETENTION_MS, expiresAtMs, isExpired } from '@adgen/core';
import type { JobStatus } from '@adgen/db';

/**
 * `job.cost` is the price quoted when the job was *enqueued*, not money that
 * actually moved. `error` never reached `charge_credits`; `queued`/`running` are
 * still only an estimate. So the label is per-status, never the bare figure.
 */
export function costLabel(status: JobStatus, cost: number): string {
  if (status === 'done') return creditsLabel(cost);
  if (status === 'error') return 'nije naplaćeno';
  return `procena: ${creditsLabel(cost)}`;
}

/** Machine prefix on worker errors, e.g. `tool_not_implemented: `. */
const ERROR_CODE_PREFIX = /^[a-z0-9_]+:\s*/;

/**
 * Worker errors arrive as `<code>: <poruka na srpskom>`. The part after the
 * code is already user-facing, so drop the code; if there is no such prefix
 * (or nothing left after it), show the string as-is rather than nothing.
 */
export function humanError(error: string): string {
  return error.replace(ERROR_CODE_PREFIX, '').trim() || error;
}

/**
 * One day in ms, derived from the retention constants rather than a second
 * magic number sitting next to the 30 the legal pages promise.
 */
const DAY_MS = RETENTION_MS / RETENTION_DAYS;

export type JobFileState = 'available' | 'expired' | 'deleted' | 'none';

/**
 * What a job row may say about its files.
 *
 *  - `available` — done, inside retention, files still there;
 *  - `expired`   — done, past the 30-day boundary: the bucket has deleted them;
 *  - `deleted`   — done, and the customer deleted them themselves;
 *  - `none`      — anything not `done`. A queued job has no files YET and a failed one never
 *                  had any, so neither may be told its files were deleted — the same mistake
 *                  costLabel guards against on the money side.
 */
export function jobFileState(
  status: JobStatus,
  createdAt: string,
  filesDeleted: boolean | undefined,
  nowMs: number = Date.now(),
): JobFileState {
  if (status !== 'done') return 'none';
  // Expiry outranks a customer deletion: the bucket removed the object either
  // way, so a month on the row must say why the link is gone.
  if (isExpired(createdAt, nowMs)) return 'expired';
  if (filesDeleted) return 'deleted';
  return 'available';
}

/**
 * „Ističe danas” / „Ističe sutra” / „Ističe za N dana”, or null when the file has more than a
 * week left (the countdown is information only in the last week) or is already expired.
 */
export function expiryCountdownLabel(createdAt: string, nowMs: number = Date.now()): string | null {
  // isExpired also fails closed on an unparseable createdAt, so the NaN that
  // expiresAtMs would produce never reaches the arithmetic below.
  if (isExpired(createdAt, nowMs)) return null;
  const remainingMs = expiresAtMs(createdAt) - nowMs;
  // Whole days left, rounded DOWN: rounding up over-promises how long a file
  // lives, and a customer who returns on the day we named must never find the
  // file already gone.
  const daysLeft = Math.floor(remainingMs / DAY_MS);
  if (daysLeft > 7) return null;
  // `daysLeft === 0` is the sub-day case: the file expires TODAY, so „sutra”
  // would be a lie for anything that dies before midnight.
  if (daysLeft === 0) return 'Ističe danas';
  if (daysLeft === 1) return 'Ističe sutra';
  return `Ističe za ${daysLeft} dana`;
}

/** What the row says when the files are gone. Null when there is nothing to say. */
export function fileStateLabel(state: JobFileState): string | null {
  if (state === 'expired') return `Fajlovi obrisani — rok od ${RETENTION_DAYS} dana je istekao`;
  if (state === 'deleted') return 'Fajlovi obrisani';
  return null;
}
