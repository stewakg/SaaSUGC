/**
 * Unit tests for POST /api/jobs — the job-creation money gate.
 *
 * This route is the single door between a signed-in customer and a render that
 * costs real provider money (ElevenLabs voice, OpenRouter script, Lambda GPU).
 * Credits are NOT deducted here — the worker charges on success — so the only
 * thing standing between a zero-balance account and a free job is the
 * `balance < cost` check exercised below. If that check ever slips (a `<=` /
 * `<` typo, a missing balance load, an insert that runs before the check),
 * the tests in the "balance gate" describe fail, which is the point.
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

const { getUser, profileSingle, insertSingle, insertSpy, rateLimitMock, queueAdd, queueNames } = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileSingle: vi.fn(),
  insertSingle: vi.fn(),
  insertSpy: vi.fn(),
  rateLimitMock: vi.fn(),
  queueAdd: vi.fn(),
  queueNames: [] as string[],
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser },
    from: (_t: string) => ({
      select: (_c: string) => ({ eq: (_k: string, _v: unknown) => ({ single: profileSingle }) }),
    }),
  }),
  createAdminClient: () => ({
    from: (_t: string) => ({
      insert: (row: unknown) => {
        insertSpy(row);
        return { select: (_c: string) => ({ single: insertSingle }) };
      },
    }),
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

