/**
 * Unit tests for POST /api/jobs — the job-creation money gate.
 *
 * This route is the single door between a signed-in customer and a render that
 * costs real provider money (ElevenLabs voice, OpenRouter script, Lambda GPU).
 * Credits are NOT deducted here — the worker charges on success — so the
 * things standing between a zero-balance account and a free job are the cheap
 * `balance < cost` pre-check and, above all, the `reserve_credits` hold the
 * route places once the job row exists. If either ever slips (a `<=` / `<`
 * typo, a missing balance load, a reservation that never runs or runs after
 * the enqueue), the tests in the "balance gate" describe fail, which is the
 * point.
 *
 * Everything external is mocked so the route runs with no Supabase, no Redis,
 * no BullMQ and no network: the Supabase server/admin clients, the rate
 * limiter, the BullMQ Queue and the Redis connection factory are all replaced
 * with vi.fn()s declared through vi.hoisted (vi.mock is hoisted above every
 * import, so its factory can only see hoisted bindings — same discipline as
 * rate-limit.test.ts and renderer.lambda.test.ts). The cost function and
 * toAdSeconds are imported for REAL from @adgen/core, so a pricing change is
 * tracked automatically rather than hardcoded here.
 *
 * The route module under test (apps/web/src/app/api/jobs/route.ts) is READ-ONLY.
 * A failing test below is a finding to report, not a reason to edit the route.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { computeJobCost } from '@adgen/core/pricing';
import { toAdSeconds } from '@adgen/core';
import type { JobType } from '@adgen/db';

// Real job type picked from JOB_COST (matrix: 15). Never hardcode a credit
// number — derive every expected cost below from computeJobCost(type, count).
const type = 'matrix' satisfies JobType;

const {
  getUser,
  profileSingle,
  insertSingle,
  insertSpy,
  adminDeleteEq,
  reserveRpc,
  rateLimitMock,
  queueAdd,
  queueNames,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileSingle: vi.fn(),
  insertSingle: vi.fn(),
  insertSpy: vi.fn(),
  // `from('jobs').delete().eq('id', ...)` — the failed-reservation cleanup.
  adminDeleteEq: vi.fn(),
  // `admin.rpc('reserve_credits', ...)` — the hold itself.
  reserveRpc: vi.fn(),
  rateLimitMock: vi.fn(),
  queueAdd: vi.fn(),
  queueNames: [] as string[],
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser },
    from: (_t: string) => ({
      select: (_c: string) => ({
        eq: (_k: string, _v: unknown) => ({
          // `profiles` ends here — the route no longer reads `jobs` from the
          // user client; the in-flight sum moved into reserve_credits (RPC).
          single: profileSingle,
        }),
      }),
    }),
  }),
  createAdminClient: () => ({
    from: (_t: string) => ({
      insert: (row: unknown) => {
        insertSpy(row);
        return { select: (_c: string) => ({ single: insertSingle }) };
      },
      // A failed reservation deletes the just-inserted job row again.
      delete: () => ({
        eq: (col: string, val: unknown) => {
          adminDeleteEq(col, val);
          return Promise.resolve({ error: null });
        },
      }),
    }),
    rpc: reserveRpc,
  }),
}));

vi.mock('@/lib/rate-limit', () => ({ rateLimit: rateLimitMock }));
// The constructor records the queue NAME. Without this the mock swallowed the
// one argument that decides whether a render runs alone or four at a time.
vi.mock('bullmq', () => ({
  Queue: class {
    add = queueAdd;
    constructor(name: string) {
      queueNames.push(name);
    }
  },
}));
// Only the Redis connection is faked. `queueNameForJobType` comes from the
// REAL module on purpose: which lane a job lands in is now part of what this
// route decides, and a stubbed router would let the route enqueue a render
// onto the light queue — four Remotion renders on one box — while this file
// reported green.
vi.mock('@adgen/core/queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@adgen/core/queue')>()),
  createRedisConnection: () => ({}),
}));

import { POST } from './route.ts';
import { JOB_COST } from '@adgen/core/pricing';
import { ENHANCE_MAX_SECONDS } from '@adgen/core/enhance-limits';

/** Build a POST request with a JSON body, cast to the route's parameter type. */
function req(body: unknown) {
  return new Request('https://app.example/api/jobs', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  // Reset every mock's call log and implementation, then reinstall the happy
  // path so each test starts from a known-good baseline and only overrides the
  // one behaviour it cares about.
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  rateLimitMock.mockResolvedValue({ allowed: true, resetSeconds: 0 });
  profileSingle.mockResolvedValue({ data: { balance: 10_000 }, error: null });
  insertSingle.mockResolvedValue({ data: { id: 'job1' }, error: null });
  // The hold is placed by default — only the reservation tests override it.
  reserveRpc.mockResolvedValue({ data: true, error: null });
});

describe('POST /api/jobs — auth, rate limit and input validation', () => {
  it('1. unauthenticated ⇒ 401 and nothing is inserted or enqueued', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(req({ type, count: 1 }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthenticated' });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('2. rate limited ⇒ 429 with retryAfterSeconds, nothing inserted or enqueued', async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, resetSeconds: 42 });

    const res = await POST(req({ type, count: 1 }));

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate_limited', retryAfterSeconds: 42 });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('3. an unknown type OR an inherited Object key (toString) ⇒ 400 invalid_type', async () => {
    // The route uses hasOwnProperty precisely so a prototype key like
    // 'toString' is NOT accepted as a job type — `in` would accept it.
    for (const badType of ['nope', 'toString']) {
      const res = await POST(req({ type: badType, count: 1 }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_type' });
    }
    expect(insertSpy).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('4. count above the max ⇒ 400 invalid_count with the max, nothing inserted or enqueued', async () => {
    const res = await POST(req({ type, count: 16 }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_count', max: 15 });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });
});

describe('POST /api/jobs — count normalisation', () => {
  it('5. count defaults to 1 for missing, 0, negative, fractional and string values', async () => {
    // Each of these must be treated as count === 1 (Number.isInteger && > 0).
    for (const count of [undefined, 0, -3, 2.5, '3']) {
      insertSpy.mockClear();
      const res = await POST(req({ type, count }));
      expect(res.status).toBe(200);
      expect(insertSpy).toHaveBeenCalledTimes(1);

      const row = insertSpy.mock.calls[0][0];
      expect(row.params.count).toBe(1);
      expect(row.cost).toBe(computeJobCost(type, 1));
    }
  });

  it('6. a valid integer count is honoured in params and cost', async () => {
    const res = await POST(req({ type, count: 5 }));

    expect(res.status).toBe(200);
    const row = insertSpy.mock.calls[0][0];
    expect(row.params.count).toBe(5);
    expect(row.cost).toBe(computeJobCost(type, 5));
  });
});

describe('POST /api/jobs — the balance gate', () => {
  it('7. insufficient balance ⇒ 402 with cost + balance, NOTHING inserted or enqueued', async () => {
    // One credit short of the exact cost — this is the gate that stops a free job.
    const cost = computeJobCost(type, 5);
    profileSingle.mockResolvedValue({ data: { balance: cost - 1 }, error: null });

    const res = await POST(req({ type, count: 5 }));

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.cost).toBe(cost);
    expect(body.balance).toBe(cost - 1);
    expect(insertSpy).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('8. balance exactly equal to cost is ALLOWED (boundary)', async () => {
    // A `<=`/`<` slip here would refuse a customer who can exactly afford it.
    const cost = computeJobCost(type, 5);
    profileSingle.mockResolvedValue({ data: { balance: cost }, error: null });

    const res = await POST(req({ type, count: 5 }));

    expect(res.status).toBe(200);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(queueAdd).toHaveBeenCalledTimes(1);
  });

  it('9. profile load failure ⇒ 500 profile_not_found, nothing inserted or enqueued', async () => {
    profileSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const res = await POST(req({ type, count: 1 }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'profile_not_found' });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('19. the happy path reserves the INSERTED job: reserve_credits(u1, job1, computed cost), after the insert and before the enqueue', async () => {
    const res = await POST(req({ type, count: 3 }));

    expect(res.status).toBe(200);
    // All three arguments matter: whose balance is held, which job the hold is
    // keyed by (the row just inserted — hence after the insert), and the full
    // quoted cost.
    expect(reserveRpc).toHaveBeenCalledTimes(1);
    expect(reserveRpc).toHaveBeenCalledWith('reserve_credits', {
      p_user_id: 'u1',
      p_job_id: 'job1',
      p_amount: computeJobCost(type, 3),
    });
    // Nothing is enqueued until the hold is placed — an enqueued job with no
    // hold is exactly the free render this gate exists to stop.
    expect(insertSpy.mock.invocationCallOrder[0]).toBeLessThan(
      reserveRpc.mock.invocationCallOrder[0],
    );
    expect(reserveRpc.mock.invocationCallOrder[0]).toBeLessThan(
      queueAdd.mock.invocationCallOrder[0],
    );
  });

  it('20. reserve_credits returning false ⇒ 402 insufficient_balance, the job row DELETED, nothing enqueued', async () => {
    // false (not an error) is the DB saying the balance cannot cover this job
    // PLUS the caller's outstanding holds — the counting the old in-flight sum
    // approximated in application code, now done under the profile row lock.
    reserveRpc.mockResolvedValue({ data: false, error: null });

    const res = await POST(req({ type, count: 1 }));

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe('insufficient_balance');
    expect(body.cost).toBe(computeJobCost(type, 1));
    expect(body.balance).toBe(10_000);
    // The row is removed again — no queued job that nobody will ever process.
    expect(adminDeleteEq).toHaveBeenCalledTimes(1);
    expect(adminDeleteEq).toHaveBeenCalledWith('id', 'job1');
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('21. reserve_credits erroring ⇒ 500 balance_check_failed, row deleted, nothing enqueued', async () => {
    // An RPC error is a database failure, not "no credits": different status,
    // same cleanup.
    reserveRpc.mockResolvedValue({ data: null, error: { message: 'db exploded' } });

    const res = await POST(req({ type, count: 1 }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'balance_check_failed' });
    expect(adminDeleteEq).toHaveBeenCalledWith('id', 'job1');
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('22. the cheap pre-check still short-circuits: balance below cost ⇒ 402 and reserve_credits was never called', async () => {
    // The pre-check exists to save the insert + delete round trip in the
    // "user has no credits at all" case; reserve_credits is the authority.
    const cost = computeJobCost(type, 2);
    profileSingle.mockResolvedValue({ data: { balance: cost - 1 }, error: null });

    const res = await POST(req({ type, count: 2 }));

    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: 'insufficient_balance', cost, balance: cost - 1 });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(reserveRpc).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });
});

describe('POST /api/jobs — the inserted jobs row', () => {
  it('10. happy path inserts the exact row (user, type, status, cost, params)', async () => {
    const res = await POST(req({ type, count: 2, params: { foo: 'bar' } }));

    expect(res.status).toBe(200);
    expect(insertSpy).toHaveBeenCalledTimes(1);

    const row = insertSpy.mock.calls[0][0];
    expect(row.user_id).toBe('u1');
    expect(row.type).toBe(type);
    expect(row.status).toBe('queued');
    expect(row.cost).toBe(computeJobCost(type, 2));
    expect(row.params.foo).toBe('bar');
    expect(row.params.count).toBe(2);
    expect(typeof row.params.targetSeconds).toBe('number');
  });

  it('11. targetSeconds is normalised via toAdSeconds, never passed through', async () => {
    // 9999 is not an offered length → toAdSeconds narrows it to the default.
    const res = await POST(req({ type, count: 1, params: { targetSeconds: 9999 } }));

    expect(res.status).toBe(200);
    const row = insertSpy.mock.calls[0][0];
    expect(row.params.targetSeconds).toBe(toAdSeconds(9999));
  });

  it('12. a non-object params is ignored safely (still 200, params has count + targetSeconds)', async () => {
    const res = await POST(req({ type, count: 1, params: 'nope' }));

    expect(res.status).toBe(200);
    const row = insertSpy.mock.calls[0][0];
    expect(row.params.count).toBe(1);
    expect(typeof row.params.targetSeconds).toBe('number');
  });
});

describe('POST /api/jobs — enqueue and insert-failure ordering', () => {
  it('13. success returns the job id and enqueues exactly once with (type, { jobId })', async () => {
    const res = await POST(req({ type, count: 1 }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'job1' });
    expect(queueAdd).toHaveBeenCalledTimes(1);
    expect(queueAdd).toHaveBeenCalledWith(type, { jobId: 'job1' });
    // `matrix` renders video, so it must land on the HEAVY lane. Getting this
    // wrong is not a slow job — it is four Remotion renders on one box.
    expect(queueNames).toContain('adgen-jobs');
    expect(queueNames).not.toContain('adgen-jobs-light');
  });

  it('14. insert failure ⇒ 500 and NOTHING is enqueued (no orphan worker job)', async () => {
    // An enqueued job with no DB row would crash-loop the worker.
    insertSingle.mockResolvedValue({ data: null, error: { message: 'db exploded' } });

    const res = await POST(req({ type, count: 1 }));

    expect(res.status).toBe(500);
    expect(queueAdd).not.toHaveBeenCalled();
  });
});

describe('POST /api/jobs — foreign asset url guard (SSRF)', () => {
  it('15. sourceVideoUrls containing the Hetzner metadata address ⇒ 400 invalid_asset_url, nothing inserted or enqueued', async () => {
    // The exact attack this guard exists for: aim the worker — the process
    // holding the service-role key — at cloud metadata from the VPS.
    const res = await POST(
      req({
        type,
        count: 1,
        params: {
          sourceVideoUrls: ['/api/storage/uploads/u1/1.mp4', 'http://169.254.169.254/hetzner/v1/metadata'],
        },
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_asset_url' });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('16. sourceUrl on a foreign origin ⇒ 400 invalid_asset_url, nothing inserted or enqueued', async () => {
    const res = await POST(req({ type, count: 1, params: { sourceUrl: 'https://evil.example/x.mp4' } }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_asset_url' });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('17. relative /api/storage/... sourceVideoUrls are still accepted (the guard did not break the normal path)', async () => {
    const sourceVideoUrls = ['/api/storage/uploads/u1/1.mp4', '/api/storage/uploads/u1/2.mp4'];
    const res = await POST(req({ type, count: 1, params: { sourceVideoUrls } }));

    expect(res.status).toBe(200);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(queueAdd).toHaveBeenCalledTimes(1);
    const row = insertSpy.mock.calls[0][0];
    expect(row.params.sourceVideoUrls).toEqual(sourceVideoUrls);
  });

  it('18. third-party sourceImages alone are still accepted — the worker never fetches those', async () => {
    // sourceImages come from scraping a real shop page (third-party by
    // design) and are fetched by the script provider, not the worker.
    const res = await POST(req({ type, count: 1, params: { sourceImages: ['https://someshop.example/p.jpg'] } }));

    expect(res.status).toBe(200);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(queueAdd).toHaveBeenCalledTimes(1);
  });
});

/**
 * `enhance` is the only tool priced by TIME. The route turns the duration the
 * browser measured into 30-second tiers; the worker re-measures the stored file
 * and refuses anything that needs more tiers than were paid for. These cases pin
 * the money half of that contract — what lands in `jobs.cost` and in the row's
 * `params.enhanceTiers` receipt.
 */
describe('POST /api/jobs — enhance is billed per 30s tier', () => {
  /** The `cost` and `params` the route wrote on the inserted row. */
  function inserted(): { cost: number; params: Record<string, unknown> } {
    const row = insertSpy.mock.calls[0][0] as { cost: number; params: Record<string, unknown> };
    return row;
  }

  const unit = JOB_COST.enhance;

  it('a 20s clip is one tier', async () => {
    await POST(req({ type: 'enhance', params: { durationSec: 20 } }));
    expect(inserted().cost).toBe(unit);
    expect(inserted().params.enhanceTiers).toBe(1);
  });

  it('a 45s clip is two tiers — every started 30 seconds is paid for', async () => {
    await POST(req({ type: 'enhance', params: { durationSec: 45 } }));
    expect(inserted().cost).toBe(unit * 2);
    expect(inserted().params.enhanceTiers).toBe(2);
  });

  it('a clip at the ceiling is four tiers', async () => {
    await POST(req({ type: 'enhance', params: { durationSec: ENHANCE_MAX_SECONDS } }));
    expect(inserted().cost).toBe(unit * 4);
    expect(inserted().params.enhanceTiers).toBe(4);
  });

  it('a missing or junk duration falls back to ONE tier — the image case and the safe floor', async () => {
    for (const params of [{}, { durationSec: 'dvadeset' }, { durationSec: -5 }, { durationSec: null }]) {
      insertSpy.mockClear();
      await POST(req({ type: 'enhance', params }));
      expect(inserted().cost).toBe(unit);
      expect(inserted().params.enhanceTiers).toBe(1);
    }
  });

  it('a clip past the ceiling is refused here, before any credits are held', async () => {
    const res = await POST(req({ type: 'enhance', params: { durationSec: ENHANCE_MAX_SECONDS + 1 } }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'enhance_too_long', maxSeconds: ENHANCE_MAX_SECONDS });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('no other job type carries the tier receipt', async () => {
    await POST(req({ type: 'matrix', count: 2, params: { durationSec: 45 } }));
    expect(inserted().params.enhanceTiers).toBeUndefined();
    // …and its price still comes from the count, untouched by the duration.
    expect(inserted().cost).toBe(JOB_COST.matrix * 2);
  });
});
