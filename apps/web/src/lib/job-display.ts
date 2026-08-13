/**
 * Pure helpers for rendering a job row in "Moje reklame" — extracted from the
 * page so the money-display logic can be unit-tested. Getting `costLabel` wrong
 * is not cosmetic: it once showed a FAILED job as "… · 2 kredita · …", i.e. as
 * if the user had been charged for output that never arrived. The worker charges
 * on success only, so anything not `done` has not been billed.
 */
import { creditsLabel } from '@adgen/core/pricing';
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
