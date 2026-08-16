/**
 * Unit tests for the worker job state machine — `makeProcessor(db, runPipelineFn)`
 * returns `processJob(bullJob)`. Both impure dependencies (the Supabase client and
 * the real pipeline) are injected, so nothing here touches a database or a provider.
 *
 * The point of this file is the charge/refund/rollback logic: charge happens ONLY on
 * success, a failed charge rolls back the inserted asset rows, and every failure path
 * marks the job `error` without charging. Getting any of that wrong is what overbills
 * a customer or hands them a paid asset for free.
 */
import { describe, it, expect, vi } from 'vitest';
import { GENERIC_JOB_ERROR, jobErrorForUser, makeProcessor } from './index.ts';

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
} = {}) {
  const calls = {
    jobUpdates: [] as any[], // every patch passed to jobs.update(...)
    assetInserts: [] as any[], // every rows[] passed to assets.insert(...)
    assetDeletes: [] as any[], // every {col,val} passed to assets.delete().eq(...)
    rpc: [] as any[], // every {name,args} passed to rpc(...)
  };
  const db = {
    from(table: string) {
      return {
        select: (_cols?: string) => ({
          eq: (_c: string, _v: unknown) => ({
            single: async () => ({ data: opts.job ?? null, error: opts.jobError ?? null }),
          }),
        }),
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
      return { error: opts.chargeError ?? null };
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
    expect(calls.rpc).toHaveLength(0);
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
    expect(calls.rpc).toHaveLength(0);
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
    expect(calls.rpc).toHaveLength(0);
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
