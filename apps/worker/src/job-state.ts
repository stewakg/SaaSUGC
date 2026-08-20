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
  'charged_no_result',
]);

/**
 * The one state where "nije naplaćen" would be a lie.
 *
 * Reached only by the re-entry guard below: the ledger says this job WAS
 * charged, but no asset row survived to deliver. Every other failure path can
 * honestly tell the customer they were not billed; this one must not, because
 * they were. It deliberately does not promise a refund — there is no refund
 * path in the app yet, and a promise the product cannot keep is worse than an
 * honest dead end.
 */
export const CHARGED_NO_RESULT_ERROR =
  'charged_no_result: Posao je naplaćen, ali rezultat nije sačuvan. Javi nam se pre nego što pokušaš ponovo.';

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

    /**
     * RE-ENTRY GUARD — has this job already been charged?
     *
     * BullMQ re-delivers a STALLED job (default `maxStalledCount` 1), and a
     * stall does not need a crash: `scene-detect.ts` runs ffmpeg through
     * `spawnSync`, which blocks the event loop, so a long enough video can stop
     * the lock being renewed past the 30s `lockDuration` on a perfectly healthy
     * worker. Until this guard existed, that re-delivery re-ran the WHOLE
     * pipeline — real TTS characters, a real Lambda render, real R2 copies —
     * before reaching a charge that migration 0011 then rejects.
     *
     * Gating on `status` would miss the case that matters: in the crash window
     * between the charge (L~127) and the `done` update (L~165) the row still
     * says `running`. The ledger is what 0011 makes authoritative, so that is
     * what is asked. Doing this BEFORE the `running` patch also stops a
     * finished job flickering back to "u obradi" on the customer's screen.
     *
     * `delta` is what 0005 wrote — NEGATIVE (`-p_amount`) — so the charged cost
     * is its magnitude.
     */
    const { data: charged, error: ledgerError } = await db
      .from('credits_ledger')
      .select('delta')
      .eq('job_id', jobId)
      .eq('reason', 'job_spend')
      .limit(1)
      .maybeSingle();

    if (ledgerError) {
      /**
       * Fail CLOSED. An unreadable ledger means "already charged?" is
       * unanswerable, and the two ways of being wrong are not symmetric:
       * running the pipeline anyway spends provider money that cannot be
       * recovered, while refusing costs a retry. Thrown before any row patch —
       * same shape as the not-found case above — so the job keeps its current
       * status and BullMQ owns what happens next.
       */
      throw new Error(
        `[worker] job ${jobId}: could not read the charge ledger: ${ledgerError.message}`,
      );
    }

    if (charged) {
      const { data: existingAssets, error: existingError } = await db
        .from('assets')
        .select('kind, storage_key, url')
        .eq('job_id', jobId);

      if (existingError) {
        // Same fail-closed reasoning: without the asset rows there is nothing
        // to rebuild from, and re-running is the one thing that must not happen.
        throw new Error(
          `[worker] job ${jobId}: charged, but its assets could not be read: ${existingError.message}`,
        );
      }

      if (!existingAssets || existingAssets.length === 0) {
        /**
         * Charged, and nothing survived to deliver. The audit named this state:
         * the re-delivered attempt's charge-failure path deletes assets by
         * `job_id`, which takes the FIRST attempt's rows with it. Re-running is
         * not the answer — the customer would be charged a second time or, with
         * 0011 applied, land right back here having spent more provider money.
         *
         * So it ends loudly instead: the row carries a message that admits the
         * charge, and the throw makes BullMQ mark the job failed, which is what
         * fires `alertJobFailed`. A human has to decide the refund; the app has
         * no path for one.
         */
        consoleLogger.error('job was charged but has no assets to deliver', { jobId });
        await db
          .from('jobs')
          .update({ status: 'error', error: CHARGED_NO_RESULT_ERROR })
          .eq('id', jobId);
        await releaseHold();
        throw new Error(
          `charged_no_result: job ${jobId} has a job_spend ledger row but no assets — needs a manual refund decision`,
        );
      }

      const assets = existingAssets.map((a) => ({
        kind: a.kind,
        url: a.url,
        storageKey: a.storage_key,
      }));
      consoleLogger.warn('job was already charged — rebuilding from assets, pipeline skipped', {
        jobId,
        assets: assets.length,
      });
      await db
        .from('jobs')
        .update({
          status: 'done',
          result: { assets } as unknown as Json,
          cost: Math.abs(charged.delta),
        })
        .eq('id', jobId);
      // The charge already happened, so any hold left over from the enqueue is
      // pure overhead on the customer's balance until it expires.
      await releaseHold();
      return;
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
      //
      // `enhance` is the exception, because its unit is TIME, not output count:
      // one asset can be one tier or four (enhance-limits.ts). Its price was
      // fixed at enqueue time from the measured duration, and the pipeline has
      // already refused the job if the real file needed more tiers than that —
      // so the tier count on the row is the honest amount here. Multiplying by
      // `assets.length` instead would charge a 120-second clip as if it were 30.
      const paidEnhanceTiers = Number((job.params as { enhanceTiers?: unknown } | null)?.enhanceTiers);
      const actualCost =
        job.type === 'enhance' && Number.isFinite(paidEnhanceTiers) && paidEnhanceTiers > 0
          ? JOB_COST.enhance * Math.floor(paidEnhanceTiers)
          : JOB_COST[job.type as JobType] * assets.length;

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
