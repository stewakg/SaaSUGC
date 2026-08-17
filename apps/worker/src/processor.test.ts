/**
 * Unit tests for the worker job state machine — `makeProcessor(db, runPipelineFn)`
 * returns `processJob(bullJob)`. Both impure dependencies (the Supabase client and
 * the real pipeline) are injected, so nothing here touches a database or a provider.
 *
 * The point of this file is the charge/refund/rollback logic: charge happens ONLY on
 * success, a failed charge rolls back the inserted asset rows, every failure path
 * marks the job `error` without charging, and every terminal path releases the
 * enqueue-time credit hold (release_credits). Getting any of that wrong is what
 * overbills a customer or hands them a paid asset for free.
 */
import { describe, it, expect, vi } from 'vitest';
import { consoleLogger } from '@adgen/core';
import {
  CHARGED_NO_RESULT_ERROR,
  GENERIC_JOB_ERROR,
  jobErrorForUser,
  makeProcessor,
} from './job-state.ts';

/**
 * A fake Supabase client whose shape matches exactly what `processJob` calls:
 * `from('jobs').select().eq().single()`, `.update().eq()`, `from('assets').insert()`,
 * `.delete().eq()`, and `rpc(...)`. Every call is recorded so a test can assert the
 * exact sequence of patches, inserts, deletes, and rpc invocations.
 */
function makeDb(opts: {
  job?: unknown;
  jobError?: { message: string } | null;
  insertError?: { message: string } | null;
  chargeError?: { message: string } | null;
  /** Per-RPC errors, keyed by function name — lets release_credits fail alone. */
  rpcErrors?: Record<string, { message: string } | null>;
  /**
   * The re-entry guard's two reads. `ledgerRow` non-null means this job has
   * already been charged (0005 writes `delta` NEGATIVE); `existingAssets` is
   * what survived for it. Both default to "never charged", so every test
   * written before the guard existed takes the normal path unchanged.
   */
  ledgerRow?: { delta: number } | null;
  ledgerError?: { message: string } | null;
  existingAssets?: unknown[] | null;
  existingAssetsError?: { message: string } | null;
} = {}) {
  const calls = {
    jobUpdates: [] as any[], // every patch passed to jobs.update(...)
    assetInserts: [] as any[], // every rows[] passed to assets.insert(...)
    assetDeletes: [] as any[], // every {col,val} passed to assets.delete().eq(...)
    rpc: [] as any[], // every {name,args} passed to rpc(...)
    selects: [] as any[], // every {table,cols} passed to from(t).select(cols)
  };
  const db = {
    from(table: string) {
      return {
        /**
         * One builder for all three read shapes the worker uses:
         * `jobs … .single()`, `credits_ledger … .limit().maybeSingle()`, and
         * `assets … .eq()` awaited directly — hence `eq` returns the builder
         * and the builder itself is thenable.
         */
        select: (cols?: string) => {
          calls.selects.push({ table, cols });
          const result = () => {
            if (table === 'credits_ledger') {
              return { data: opts.ledgerRow ?? null, error: opts.ledgerError ?? null };
            }
            if (table === 'assets') {
              return { data: opts.existingAssets ?? [], error: opts.existingAssetsError ?? null };
            }
            return { data: opts.job ?? null, error: opts.jobError ?? null };
          };
          const builder: any = {
            eq: (_c: string, _v: unknown) => builder,
            limit: (_n: number) => builder,
            single: async () => result(),
            maybeSingle: async () => result(),
            then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
          };
          return builder;
        },
        update: (patch: any) => {
          if (table === 'jobs') calls.jobUpdates.push(patch);
          return { eq: async (_c: string, _v: unknown) => ({ error: null }) };
        },
        insert: async (rows: any) => {
          if (table === 'assets') calls.assetInserts.push(rows);
          return { error: opts.insertError ?? null };
        },
        delete: () => ({
          eq: async (col: string, val: unknown) => {
            if (table === 'assets') calls.assetDeletes.push({ col, val });
            return { error: null };
          },
        }),
      };
    },
    rpc: async (name: string, args: any) => {
      calls.rpc.push({ name, args });
      // chargeError keeps its old meaning (charge_credits fails); per-name
      // errors let one RPC fail without failing the others.
      const error =
        opts.rpcErrors?.[name] ?? (name === 'charge_credits' ? (opts.chargeError ?? null) : null);
      return { error };
    },
  };
  return { db, calls };
}

const JOB_ID = 'j1';
const bullJob = { data: { jobId: JOB_ID } } as any;
/** A row the worker loads — `params: {}` means the pipeline is called with `{}`. */
const job = { id: JOB_ID, type: 'matrix', user_id: 'u1', params: {} };
/** A single asset the fake pipeline resolves with. */
const asset = { kind: 'video', url: 'https://x/v.mp4', storageKey: 'renders/v.mp4' };

describe('makeProcessor / processJob — the worker job state machine', () => {
  it('throws when the job is not found, and charges/calls nothing', async () => {
    const runPipelineFn = vi.fn();
    const { db, calls } = makeDb({ job: null, jobError: { message: 'no row' } });
    const processJob = makeProcessor(db as any, runPipelineFn);

    await expect(processJob(bullJob)).rejects.toThrow(/not found/);
    expect(calls.rpc).toHaveLength(0);
    expect(runPipelineFn).not.toHaveBeenCalled();
  });

  it('happy path: marks running, inserts assets, charges, then marks done', async () => {
    const runPipelineFn = vi.fn().mockResolvedValue([asset]);
    const { db, calls } = makeDb({ job });
    const processJob = makeProcessor(db as any, runPipelineFn);

    await processJob(bullJob);

    // 1. The job is marked running before any work happens.
    expect(calls.jobUpdates[0]).toEqual({ status: 'running' });

    // 2. The pipeline is driven with the job type and its params verbatim.
    expect(runPipelineFn).toHaveBeenCalledTimes(1);
    expect(runPipelineFn).toHaveBeenCalledWith('matrix', {});

    // 3. One asset row is inserted, mapped from the pipeline shape to the column shape.
    expect(calls.assetInserts[0]).toEqual([
      { job_id: 'j1', user_id: 'u1', kind: 'video', storage_key: 'renders/v.mp4', url: 'https://x/v.mp4' },
    ]);

    // 4. charge_credits is called once, for the job's user, with a positive amount.
    expect(calls.rpc[0]).toEqual({
      name: 'charge_credits',
      args: { p_user_id: 'u1', p_job_id: 'j1', p_amount: expect.any(Number) },
    });
    expect(calls.rpc[0].args.p_amount).toBeGreaterThan(0);

    // 5. The job is marked done carrying the assets and a cost that equals what was
    //    charged — the credit number is never hardcoded, only that the two agree.
    const doneUpdate = calls.jobUpdates[calls.jobUpdates.length - 1];
    expect(doneUpdate.status).toBe('done');
    expect(doneUpdate.result).toEqual({ assets: [asset] });
    expect(doneUpdate.cost).toBe(calls.rpc[0].args.p_amount);
  });

  it('throws when the pipeline produces no assets, charges nothing, marks error', async () => {
    const runPipelineFn = vi.fn().mockResolvedValue([]);
    const { db, calls } = makeDb({ job });
    const processJob = makeProcessor(db as any, runPipelineFn);

    await expect(processJob(bullJob)).rejects.toThrow(/no assets/);
    // Nothing was charged — and the failure path releases the enqueue hold.
    expect(calls.rpc.filter((c) => c.name === 'charge_credits')).toHaveLength(0);
    expect(calls.rpc).toEqual([{ name: 'release_credits', args: { p_job_id: 'j1' } }]);
    // The "no assets" text now goes to the worker log, not the row — the row
    // gets the generic customer-facing message.
    expect(calls.jobUpdates[calls.jobUpdates.length - 1]).toEqual({
      status: 'error',
      error: GENERIC_JOB_ERROR,
    });
  });

  it('rethrows when the pipeline throws, charges nothing, marks error with the message', async () => {
    const runPipelineFn = vi.fn().mockRejectedValue(new Error('boom'));
    const { db, calls } = makeDb({ job });
    const processJob = makeProcessor(db as any, runPipelineFn);

    await expect(processJob(bullJob)).rejects.toThrow(/boom/);
    // Nothing was charged — and the failure path releases the enqueue hold.
    expect(calls.rpc.filter((c) => c.name === 'charge_credits')).toHaveLength(0);
    expect(calls.rpc).toEqual([{ name: 'release_credits', args: { p_job_id: 'j1' } }]);
    expect(calls.jobUpdates[calls.jobUpdates.length - 1]).toEqual({
      status: 'error',
      error: GENERIC_JOB_ERROR,
    });
  });

  it('a coded user-facing error reaches the customer unchanged', async () => {
    // `missing_source:` is one of the five codes whose message was written FOR
    // the customer — it must survive to the row verbatim, not be genericised.
    const runPipelineFn = vi
      .fn()
      .mockRejectedValue(new Error('missing_source: enhance zahteva otpremljeni fajl.'));
    const { db, calls } = makeDb({ job });
    const processJob = makeProcessor(db as any, runPipelineFn);

    await expect(processJob(bullJob)).rejects.toThrow('missing_source');
    expect(calls.jobUpdates[calls.jobUpdates.length - 1]).toEqual({
      status: 'error',
      error: 'missing_source: enhance zahteva otpremljeni fajl.',
    });
  });

  it('a Postgres message never reaches the row the customer reads', async () => {
    const runPipelineFn = vi.fn().mockRejectedValue(
      new Error(
        'assets insert failed: duplicate key value violates unique constraint "assets_pkey"',
      ),
    );
    const { db, calls } = makeDb({ job });
    const processJob = makeProcessor(db as any, runPipelineFn);

    await expect(processJob(bullJob)).rejects.toThrow('assets insert failed');
    const stored = calls.jobUpdates[calls.jobUpdates.length - 1];
    expect(stored).toEqual({ status: 'error', error: GENERIC_JOB_ERROR });
    expect(stored.error).not.toContain('duplicate key');
    expect(stored.error).not.toContain('assets_pkey');
  });

  it('throws when assets.insert fails, before any charge', async () => {
    const runPipelineFn = vi.fn().mockResolvedValue([asset]);
    const { db, calls } = makeDb({ job, insertError: { message: 'dup' } });
    const processJob = makeProcessor(db as any, runPipelineFn);

    await expect(processJob(bullJob)).rejects.toThrow(/assets insert failed/);
    // Nothing was charged — and the failure path releases the enqueue hold.
    expect(calls.rpc.filter((c) => c.name === 'charge_credits')).toHaveLength(0);
    expect(calls.rpc).toEqual([{ name: 'release_credits', args: { p_job_id: 'j1' } }]);
    expect(calls.jobUpdates[calls.jobUpdates.length - 1].status).toBe('error');
  });

  it('rolls back assets and marks error (without throwing) when charge_credits fails', async () => {
    const runPipelineFn = vi.fn().mockResolvedValue([asset]);
    const { db, calls } = makeDb({ job, chargeError: { message: 'insufficient' } });
    const processJob = makeProcessor(db as any, runPipelineFn);

    // A failed charge is a handled outcome, not an exception — the job ends in error.
    await expect(processJob(bullJob)).resolves.toBeUndefined();

    // The unpaid asset rows must be deleted so they are not reachable via ownership.
    expect(calls.assetDeletes).toEqual([{ col: 'job_id', val: 'j1' }]);

    // The job is marked error with the charge-failed reason, and never marked done.
    expect(calls.jobUpdates[calls.jobUpdates.length - 1]).toEqual({
      status: 'error',
      error: expect.stringContaining('charge_failed'),
    });
    expect(calls.jobUpdates.some((u) => u.status === 'done')).toBe(false);
  });

  it('charges per delivered asset — two assets cost exactly twice one', async () => {
    // Same job type both runs, so the per-asset unit is constant; only the count varies.
    const one = makeDb({ job });
    await makeProcessor(one.db as any, vi.fn().mockResolvedValue([asset]))(bullJob);
    const oneAmount = one.calls.rpc[0].args.p_amount;

    const two = makeDb({ job });
    const secondAsset = { kind: 'image', url: 'https://x/i.png', storageKey: 'renders/i.png' };
    await makeProcessor(two.db as any, vi.fn().mockResolvedValue([asset, secondAsset]))(bullJob);
    const twoAmount = two.calls.rpc[0].args.p_amount;

    expect(twoAmount).toBe(oneAmount * 2);
  });
});

describe('processJob — the enqueue-time credit hold (release_credits)', () => {
  it('a successful job releases the hold: release_credits with the job id, once, after the charge', async () => {
    const { db, calls } = makeDb({ job });
    await makeProcessor(db as any, vi.fn().mockResolvedValue([asset]))(bullJob);

    expect(calls.rpc.filter((c) => c.name === 'release_credits')).toEqual([
      { name: 'release_credits', args: { p_job_id: 'j1' } },
    ]);
    // The charge moves the money first; only then does the hold go.
    const chargeIdx = calls.rpc.findIndex((c) => c.name === 'charge_credits');
    expect(chargeIdx).toBeGreaterThanOrEqual(0);
    expect(chargeIdx).toBeLessThan(calls.rpc.findIndex((c) => c.name === 'release_credits'));
  });

  it('a FAILED charge releases the hold too — the money never moved, so the credits must go back', async () => {
    const { db, calls } = makeDb({ job, chargeError: { message: 'insufficient' } });
    await makeProcessor(db as any, vi.fn().mockResolvedValue([asset]))(bullJob);

    expect(calls.rpc.filter((c) => c.name === 'release_credits')).toEqual([
      { name: 'release_credits', args: { p_job_id: 'j1' } },
    ]);
  });

  it('a thrown pipeline releases the hold', async () => {
    const { db, calls } = makeDb({ job });
    const processJob = makeProcessor(db as any, vi.fn().mockRejectedValue(new Error('boom')));

    await expect(processJob(bullJob)).rejects.toThrow('boom');
    expect(calls.rpc.filter((c) => c.name === 'release_credits')).toEqual([
      { name: 'release_credits', args: { p_job_id: 'j1' } },
    ]);
  });

  it('a FAILING release_credits does not change the outcome: the job is still done and the error is only logged', async () => {
    // The one that matters — wiring the release so it could fail the job
    // would turn a paid, delivered job into a failed one.
    const warnSpy = vi.spyOn(consoleLogger, 'warn').mockImplementation(() => {});
    const { db, calls } = makeDb({ job, rpcErrors: { release_credits: { message: 'locked' } } });

    await makeProcessor(db as any, vi.fn().mockResolvedValue([asset]))(bullJob);

    expect(calls.jobUpdates[calls.jobUpdates.length - 1].status).toBe('done');
    expect(warnSpy).toHaveBeenCalledWith(
      'release_credits failed',
      expect.objectContaining({ jobId: 'j1' }),
    );
    warnSpy.mockRestore();
  });
});

/**
 * The re-entry guard. BullMQ re-delivers a stalled job, and a stall needs no
 * crash here — `spawnSync` in scene-detect blocks the event loop past the lock
 * duration on a slow enough video. Before this guard, that re-delivery re-ran
 * the whole pipeline and spent provider money a second time; migration 0011
 * then rejects the second charge, and the charge-failure path deletes assets by
 * `job_id`, taking the FIRST attempt's rows with it — "charged, error, nothing".
 */
describe('processJob — the re-entry guard (a job that was already charged)', () => {
  /** What the DB returns for a job charged 30 credits: delta is negative. */
  const chargedLedger = { delta: -30 };
  const storedAssets = [
    { kind: 'video', storage_key: 'renders/v.mp4', url: 'https://x/v.mp4' },
    { kind: 'video', storage_key: 'renders/w.mp4', url: 'https://x/w.mp4' },
  ];

  it('does not re-run the pipeline, and never charges a second time', async () => {
    const runPipelineFn = vi.fn();
    const { db, calls } = makeDb({ job, ledgerRow: chargedLedger, existingAssets: storedAssets });

    await makeProcessor(db as any, runPipelineFn)(bullJob);

    expect(runPipelineFn).not.toHaveBeenCalled();
    expect(calls.rpc.filter((c) => c.name === 'charge_credits')).toHaveLength(0);
    expect(calls.assetInserts).toHaveLength(0);
  });

  it('rebuilds the result from the surviving asset rows and marks the job done', async () => {
    const { db, calls } = makeDb({ job, ledgerRow: chargedLedger, existingAssets: storedAssets });

    await makeProcessor(db as any, vi.fn())(bullJob);

    const doneUpdate = calls.jobUpdates[calls.jobUpdates.length - 1];
    expect(doneUpdate.status).toBe('done');
    // The DB column shape (storage_key) is mapped back to the pipeline shape
    // (storageKey) — the wizard reads `result.assets[].url`, so getting this
    // wrong delivers a job with unreadable assets.
    expect(doneUpdate.result).toEqual({
      assets: [
        { kind: 'video', url: 'https://x/v.mp4', storageKey: 'renders/v.mp4' },
        { kind: 'video', url: 'https://x/w.mp4', storageKey: 'renders/w.mp4' },
      ],
    });
    // Cost is the MAGNITUDE of the ledger delta, which 0005 stores negative.
    expect(doneUpdate.cost).toBe(30);
  });

  it('never flips the job back to running — the customer does not see a finished job restart', async () => {
    const { db, calls } = makeDb({ job, ledgerRow: chargedLedger, existingAssets: storedAssets });

    await makeProcessor(db as any, vi.fn())(bullJob);

    expect(calls.jobUpdates.some((u) => u.status === 'running')).toBe(false);
  });

  it('releases the enqueue hold — the charge already moved the money', async () => {
    const { db, calls } = makeDb({ job, ledgerRow: chargedLedger, existingAssets: storedAssets });

    await makeProcessor(db as any, vi.fn())(bullJob);

    expect(calls.rpc).toEqual([{ name: 'release_credits', args: { p_job_id: 'j1' } }]);
  });

  it('charged with NO surviving assets: admits the charge, releases the hold, and throws so the operator is alerted', async () => {
    const errorSpy = vi.spyOn(consoleLogger, 'error').mockImplementation(() => {});
    const runPipelineFn = vi.fn();
    const { db, calls } = makeDb({ job, ledgerRow: chargedLedger, existingAssets: [] });

    // The throw is what makes BullMQ mark the job failed, which is what fires
    // alertJobFailed. Returning quietly would leave nobody knowing.
    await expect(makeProcessor(db as any, runPipelineFn)(bullJob)).rejects.toThrow(
      /charged_no_result/,
    );

    expect(runPipelineFn).not.toHaveBeenCalled();
    const stored = calls.jobUpdates[calls.jobUpdates.length - 1];
    expect(stored.status).toBe('error');
    expect(stored.error).toBe(CHARGED_NO_RESULT_ERROR);
    // Every other failure path says "nije naplaćen". This one must not — the
    // customer WAS charged, and telling them otherwise is the actual defect.
    expect(stored.error).not.toContain('nije naplaćen');
    expect(calls.rpc).toEqual([{ name: 'release_credits', args: { p_job_id: 'j1' } }]);
    errorSpy.mockRestore();
  });

  it('an unreadable ledger fails CLOSED: nothing runs, nothing is charged, the row is not touched', async () => {
    const runPipelineFn = vi.fn();
    const { db, calls } = makeDb({ job, ledgerError: { message: 'connection reset' } });

    await expect(makeProcessor(db as any, runPipelineFn)(bullJob)).rejects.toThrow(
      /could not read the charge ledger/,
    );

    // Refusing costs a retry; guessing "not charged" spends provider money that
    // cannot be recovered. The row keeps whatever status it had.
    expect(runPipelineFn).not.toHaveBeenCalled();
    expect(calls.jobUpdates).toHaveLength(0);
    expect(calls.rpc).toHaveLength(0);
  });

  it('a charged job whose assets cannot be read fails closed too, rather than re-running', async () => {
    const runPipelineFn = vi.fn();
    const { db, calls } = makeDb({
      job,
      ledgerRow: chargedLedger,
      existingAssetsError: { message: 'timeout' },
    });

    await expect(makeProcessor(db as any, runPipelineFn)(bullJob)).rejects.toThrow(
      /assets could not be read/,
    );
    expect(runPipelineFn).not.toHaveBeenCalled();
    expect(calls.jobUpdates).toHaveLength(0);
  });

  it('an UNCHARGED job is unaffected — the ledger is consulted, then the normal path runs', async () => {
    const runPipelineFn = vi.fn().mockResolvedValue([asset]);
    const { db, calls } = makeDb({ job }); // ledgerRow defaults to null

    await makeProcessor(db as any, runPipelineFn)(bullJob);

    expect(calls.selects.some((s) => s.table === 'credits_ledger')).toBe(true);
    expect(runPipelineFn).toHaveBeenCalledTimes(1);
    expect(calls.jobUpdates[0]).toEqual({ status: 'running' });
    expect(calls.jobUpdates[calls.jobUpdates.length - 1].status).toBe('done');
  });
});

describe('jobErrorForUser — what may be stored on the row the customer reads', () => {
  it('passes each of the five deliberate user-facing codes through verbatim', () => {
    for (const code of [
      'missing_source',
      'provider_unavailable',
      'source_not_public',
      'video_not_supported',
      'tool_not_implemented',
    ]) {
      expect(jobErrorForUser(`${code}: poruka na srpskom`)).toBe(`${code}: poruka na srpskom`);
    }
  });

  it('an unknown code becomes the generic message', () => {
    expect(jobErrorForUser('weird_code: nešto')).toBe(GENERIC_JOB_ERROR);
  });

  it('a message with no colon becomes the generic message', () => {
    expect(jobErrorForUser('boom')).toBe(GENERIC_JOB_ERROR);
  });

  it('a message whose prefix is not a bare code becomes the generic message', () => {
    // A url contains a colon — "https://..." must not be mistaken for a code.
    expect(jobErrorForUser('https://provider.example/x: timeout')).toBe(GENERIC_JOB_ERROR);
  });
});
