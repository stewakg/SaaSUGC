import type { Job } from 'bullmq';
import { consoleLogger } from '@adgen/core';
import { JOB_COST } from '@adgen/core/pricing';
import type { JobQueueData } from '@adgen/core/queue';
import { createServiceClient } from '@adgen/db';
import type { JobType, Json } from '@adgen/db';
import { runPipeline, type PipelineAsset } from './pipelines.ts';

/**
 * Error codes whose message was written FOR the customer and may be shown as-is.
 *
 * The worker's convention is `<code>: <poruka na srpskom>`, and the dashboard
 * (`job-display.ts`) strips the code and renders the rest. Anything without one
 * of these codes is an internal message — a Postgres constraint, a provider url
 * with a token in it, a stack-shaped string — and `GET /api/jobs/[id]` used to
 * hand it to the customer verbatim.
 */
const USER_FACING_ERROR_CODES = new Set([
  'missing_source',
  'provider_unavailable',
  'source_not_public',
  'video_not_supported',
  'tool_not_implemented',
]);

/** What the customer sees when the real reason is not theirs to read. */
export const GENERIC_JOB_ERROR =
  'internal_error: Obrada nije uspela. Posao nije naplaćen — pokušaj ponovo.';

/** Full text goes to the worker log; this is what may be stored on the row. */
export function jobErrorForUser(message: string): string {
  const separator = message.indexOf(':');
  if (separator > 0) {
    const code = message.slice(0, separator);
    if (/^[a-z0-9_]+$/.test(code) && USER_FACING_ERROR_CODES.has(code)) return message;
  }
  return GENERIC_JOB_ERROR;
}

/**
 * The job state machine, isolated from its two impure dependencies so it can be
 * tested without a database or a real render. `db` is the Supabase client;
 * `runPipelineFn` defaults to the real `runPipeline` and is only overridden by
 * tests, which pass a fake so the charge/refund/rollback logic can be exercised
 * without touching a provider. Behaviour with the default is identical to before
 * this seam existed — same pattern as `runMatrixPipeline`'s injected deps.
 */
export function makeProcessor(
  db: ReturnType<typeof createServiceClient>,
  runPipelineFn: (type: string, params: Record<string, unknown>) => Promise<PipelineAsset[]> = runPipeline,
) {
  return async function processJob(bullJob: Job<JobQueueData>) {
    const { jobId } = bullJob.data;

    // Best-effort: the hold expires by itself within the hour, so a failure
    // here delays a customer's credits at worst. Letting it throw would turn
    // a paid, delivered job into a failed one, which is far worse.
    const releaseHold = async () => {
      try {
        const { error: releaseError } = await db.rpc('release_credits', { p_job_id: jobId });
        if (releaseError) {
          consoleLogger.warn('release_credits failed', { jobId, error: releaseError.message });
        }
      } catch (err) {
        // A rejected rpc call is the same outcome as an errored one — log
        // and swallow; it must never change the job's result.
        consoleLogger.warn('release_credits failed', {
          jobId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    const { data: job, error } = await db.from('jobs').select('*').eq('id', jobId).single();
    if (error || !job) {
      throw new Error(`[worker] job ${jobId} not found: ${error?.message ?? 'no row'}`);
    }

    await db.from('jobs').update({ status: 'running' }).eq('id', jobId);

    try {
      const params = (job.params ?? {}) as Record<string, unknown>;
      const assets = await runPipelineFn(job.type, params);

      /**
       * A pipeline that returns nothing has FAILED, even without throwing.
       *
       * Without this the job fell through to `actualCost = cost * 0`, charged
       * zero, and was marked `done` — so the customer saw "Gotovo" in Moje
       * reklame with no video attached and no error to explain it. Reachable
       * whenever the script provider answers with an empty variant list: the
       * loop below simply never runs and every later step succeeds.
       *
       * Throwing hands it to the catch, which marks the job `error` and returns
       * BEFORE charge_credits — nothing is charged, which is already the rule
       * for a failed job.
       */
      if (assets.length === 0) {
        throw new Error(
          `pipeline produced no assets for job type "${job.type}" — nothing to deliver`,
        );
      }

      {
        const { error: assetsError } = await db.from('assets').insert(
          assets.map((a) => ({
            job_id: jobId,
            user_id: job.user_id,
            kind: a.kind,
            storage_key: a.storageKey,
            url: a.url,
          })),
        );
        if (assetsError) throw new Error(`assets insert failed: ${assetsError.message}`);
      }

      // Charge for what was actually delivered, not what was requested —
      // some pipelines can produce fewer outputs than `count` asked for
      // (e.g. MockScriptProvider caps matrix variants at 3 canned scripts).
      // Charging job.cost (computed from the requested count at enqueue
      // time) would overbill in that case.
      const actualCost = JOB_COST[job.type as JobType] * assets.length;

      // Charge BEFORE marking the job done/visible — if this fails (e.g. a
      // concurrent job already spent the balance), the result must not be
      // delivered for free.
      const { error: chargeError } = await db.rpc('charge_credits', {
        p_user_id: job.user_id,
        p_job_id: jobId,
        p_amount: actualCost,
      });
      if (chargeError) {
        // The assets rows inserted above are now orphaned — an unpaid job
        // must not leave anything reachable via /api/storage (which
        // authorizes by asset-row ownership, not by job status). Delete
        // them; the underlying render file is cleaned up by F5's storage
        // lifecycle/auto-expire sweep, not here.
        if (assets.length > 0) {
          await db.from('assets').delete().eq('job_id', jobId);
        }
        // The RPC's own message is a Postgres one — logged, never stored on a
        // row the customer reads.
        consoleLogger.error('charge failed', { jobId, error: chargeError.message });
        await db
          .from('jobs')
          .update({
            status: 'error',
            error: 'charge_failed: Naplata nije uspela. Posao nije naplaćen.',
          })
          .eq('id', jobId);
        // Nothing was charged, so the held credits go back to available.
        await releaseHold();
        return;
      }

      // charge_credits succeeded — the money has moved, so the hold has done
      // its job and the credits go back to available for the next enqueue.
      await releaseHold();

      // `assets` is a plain, JSON-serialisable array of strings — safe to
      // hand to the jsonb column despite PipelineAsset not structurally
      // matching TS's recursive `Json` index-signature check.
      await db
        .from('jobs')
        .update({ status: 'done', result: { assets } as unknown as Json, cost: actualCost })
        .eq('id', jobId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Keep the real text where the operator can read it, store only what the
      // customer should see. `err` is still rethrown unchanged, so BullMQ's
      // retry/stall behaviour is exactly as before.
      consoleLogger.error('job failed', { jobId, error: message });
      await db
        .from('jobs')
        .update({ status: 'error', error: jobErrorForUser(message) })
        .eq('id', jobId);
      // The pipeline threw — nothing was charged, so the hold must not
      // outlive the job.
      await releaseHold();
      throw err;
    }
  };
}
