/**
 * Worker entry — F2 BullMQ consumer.
 *
 * Consumes jobs enqueued by `POST /api/jobs` in apps/web: loads the `jobs`
 * row, runs the pipeline, writes `assets` + `jobs.result`, and charges credits
 * ONLY on success via the `charge_credits` RPC (INFRASTRUCTURE.md §3 —
 * charge-on-success). On failure the job is marked "error" and nothing is
 * charged. Whatever the outcome, the hold `POST /api/jobs` placed on the
 * balance at enqueue time is released via `release_credits`, so the reserved
 * credits return to available (one-hour expiry is the backstop if this
 * process dies).
 *
 * Mock-first: with zero external keys, `createProviders()` resolves to mocks,
 * so the whole pipeline runs end-to-end locally (just needs Redis + Supabase).
 *
 * This file is only the entry point: it wires the providers, starts the two
 * BullMQ lanes (heavy renders vs light jobs), and owns graceful shutdown.
 * Everything else lives next to it:
 *
 * - `providers.ts` — the `providers` set and the `matrixRenderer` derived
 *   from it, built once at module load and shared by every module below.
 * - `asset-storage.ts` — persisting provider results into OUR storage
 *   (`persistRemoteAsset`) and turning stored urls into fetchable ones
 *   (`resolveStorageUrl`, `isImageSource`).
 * - `pipelines.ts` — the job pipelines (`runMatrixPipeline`,
 *   `runMediaEditPipeline`, `runPipeline`) and their prompt/voice helpers
 *   (`buildImageAdsPrompt`, `resolveVoiceId`, `describeProductImage`).
 * - `job-state.ts` — the job state machine (`makeProcessor`) that charges,
 *   refunds and marks jobs, plus the customer-facing error filter
 *   (`jobErrorForUser`).
 */

import { Worker } from 'bullmq';
import { pathToFileURL } from 'node:url';
import { mockProviderSlots, consoleLogger } from '@adgen/core';
import {
  createRedisConnection,
  HEAVY_QUEUE_NAME,
  LIGHT_QUEUE_NAME,
  type JobQueueData,
} from '@adgen/core/queue';
import { createServiceClient } from '@adgen/db';
import { alertJobFailed } from './alert.ts';
import { startHeartbeat } from './health.ts';
import { providers, matrixRenderer } from './providers.ts';
import { makeProcessor } from './job-state.ts';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Set the moment shutdown begins. Docker can send a second signal while the
 * first `worker.close()` is still draining in-flight jobs, and a double close
 * would cut the very jobs the close is waiting for. Module-level because both
 * signal handlers must see the same flag.
 */
let shuttingDown = false;

async function main() {
  // `mediaEdit` is the one slot that can be null — it has no mock counterpart,
  // so an absent FAL_API_KEY leaves it unset rather than mocked. Reading .name
  // off it crashed the worker on startup for any config without that key, which
  // is the default mock-first config: since the slot was added, a fresh clone
  // could not boot the worker at all.
  const providerModes = Object.fromEntries(
    Object.entries(providers).map(([k, v]) => [k, v?.name ?? 'not configured']),
  );
  // The factory's `renderer` is NOT what draws a matrix video — see the
  // matrixRenderer comment. Logging only the factory's choice would report
  // "mock-renderer" on a box that is in fact rendering for real locally, which
  // is precisely the kind of startup line someone would later trust.
  providerModes.matrixRenderer = matrixRenderer.name;
  consoleLogger.info('provider modes', providerModes);

  if (!SERVICE_KEY) {
    consoleLogger.error(
      'SUPABASE_SERVICE_ROLE_KEY is not set — the worker cannot read/write jobs. ' +
        'Run `supabase start` and set it (see packages/db/src/seed.ts for the pattern). Exiting.',
    );
    process.exit(1);
  }
  const db = createServiceClient(SUPABASE_URL, SERVICE_KEY);

  // A worker on mocks is worse than a worker that is down. A down worker leaves
  // the job queued; a mocked one marks it DONE, charges the credits, and hands
  // back canned text that looks like success. That exact thing was found
  // running on the VPS on 2026-08-10 against the shared queue. In production,
  // refuse to serve rather than lie.
  const mocked = mockProviderSlots(providers);
  if (mocked.length > 0) {
    const inProduction = process.env.NODE_ENV === 'production';
    const message = `provider slots resolved to MOCKS: ${mocked.join(', ')}`;
    if (inProduction && process.env.ALLOW_MOCK_PROVIDERS !== '1') {
      consoleLogger.error(
        `${message}. Refusing to start in production — a mocked worker answers paid jobs ` +
          'with canned output and still charges for it. Set the missing keys in the ' +
          "worker's .env, or set ALLOW_MOCK_PROVIDERS=1 if this really is a staging box.",
      );
      process.exit(1);
    }
    consoleLogger.warn(`${message} — fine for local development, never for production.`);
  }

  // Each Worker blocks on its connection while waiting for a job; sharing one
  // connection between two workers is a documented way to get a stuck
  // consumer. One connection per worker.
  const connection = createRedisConnection();
  const lightConnection = createRedisConnection();
  /**
   * How many jobs this process runs at once.
   *
   * 4 is fine for the cheap tools, and wrong for the expensive one: a single
   * Remotion render drives a Chromium and an ffmpeg to near-100% across every
   * core and wants roughly 2 GB. Four of those on a 4-vCPU / 8 GB box do not
   * run four times faster — they thrash, and the likeliest outcome is an
   * out-of-memory kill that shows up as jobs failing under load, i.e. exactly
   * when it hurts. Set WORKER_CONCURRENCY=1 or 2 on the render box.
   *
   * Left at 4 by default so nothing changes for anyone who does not set it.
   */
  const parsedConcurrency = Number(process.env.WORKER_CONCURRENCY);
  const concurrency =
    Number.isInteger(parsedConcurrency) && parsedConcurrency > 0 ? parsedConcurrency : 4;
  // Same parsing, same default, for the light lane. The light queue only ever
  // runs one provider call plus a copy per job, so 4 in parallel is safe.
  const parsedLightConcurrency = Number(process.env.WORKER_CONCURRENCY_LIGHT);
  const lightConcurrency =
    Number.isInteger(parsedLightConcurrency) && parsedLightConcurrency > 0
      ? parsedLightConcurrency
      : 4;

  const processor = makeProcessor(db);

  const worker = new Worker<JobQueueData>(HEAVY_QUEUE_NAME, processor, {
    connection,
    concurrency,
  });
  const lightWorker = new Worker<JobQueueData>(LIGHT_QUEUE_NAME, processor, {
    connection: lightConnection,
    concurrency: lightConcurrency,
  });

  // Liveness heartbeat (apps/worker/src/health.ts): written from inside this
  // process's own event loop, read by the compose healthcheck. A worker that is
  // up but no longer consuming stops beating, and Docker restarts it.
  // One call: the heartbeat is per PROCESS, not per queue.
  const stopHeartbeat = startHeartbeat(connection);

  /**
   * Event handlers shared by BOTH workers — a job completing, failing or
   * stalling on either lane must be treated identically.
   */
  function attachWorkerHandlers(w: Worker<JobQueueData>): void {
    w.on('completed', (bullJob) => consoleLogger.info('job done', { jobId: bullJob.data.jobId }));
    w.on('failed', (bullJob, err) => {
      consoleLogger.error('job failed', { jobId: bullJob?.data.jobId ?? '?', error: err.message });
      // Fire-and-forget: never await an alert inside an event handler, where a
      // rejection would be unhandled. Opt-in via ALERT_WEBHOOK_URL (no-op unset).
      void alertJobFailed({
        jobId: bullJob?.data.jobId ?? '?',
        type: bullJob?.name,
        error: err.message,
      });
    });
    w.on('error', (err) => consoleLogger.error('connection error', { error: err.message }));
    // A stall means some worker died mid-job and BullMQ re-delivered it — before
    // this listener that was invisible: the DB row stays 'running', the customer
    // polls forever, the logs say nothing. Log ONLY: BullMQ still owns the retry
    // decision, and touching the job row from here too is how a double refund
    // happens.
    w.on('stalled', (bullJobId) => consoleLogger.warn('job stalled', { bullJobId }));
  }
  attachWorkerHandlers(worker);
  attachWorkerHandlers(lightWorker);

  consoleLogger.info('listening', {
    queue: HEAVY_QUEUE_NAME,
    concurrency,
    lightQueue: LIGHT_QUEUE_NAME,
    lightConcurrency,
  });

  // Docker sends SIGTERM on stop / restart / `up -d --build`; SIGINT is a Ctrl-C.
  // Node's default for an unhandled SIGTERM is instant death, which cuts an
  // in-flight render in half with no 'failed' event, no refund, and a job row
  // stuck on 'running'. Both signals share this one guarded path, and
  // `worker.close()` waits for in-flight jobs first — that is the entire point.
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    consoleLogger.info('shutting down', { signal });
    stopHeartbeat();
    try {
      // allSettled, not all: if one worker's close() rejects, the other must
      // still be allowed to drain its in-flight jobs.
      await Promise.allSettled([worker.close(), lightWorker.close()]);
    } finally {
      // finally, not after: even if close() rejects, the process must still
      // exit — lingering here would just earn a SIGKILL 10s later.
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

// Only boot the BullMQ consumer when this file is *run*, not when it's
// imported (tests / verification drivers import runMatrixPipeline directly and
// must not open a Redis connection or exit the process on a missing key).
const isDirectRun =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) main().catch((err) => {
  consoleLogger.error('fatal', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});