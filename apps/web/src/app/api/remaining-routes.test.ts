/**
 * Unit tests for the last four uncovered API routes:
 *   POST /api/generate-scripts
 *   POST /api/search-clips
 *   GET  /api/voices
 *   GET  /api/jobs/[id]
 *
 * Three of them share an auth → rate-limit → provider shape (jobs/[id] is
 * auth → DB only), so one mock surface covers all four. Each route either
 * spends real provider money or guards cross-customer data, so the clamping,
 * capping and not-found behaviour pinned below is what keeps a request cheap
 * and keeps one customer out of another customer's rows.
 *
 * Everything external is mocked so the routes run with no Supabase, no Redis,
 * no provider network and no yt-dlp binary: the Supabase server client, the
 * rate limiter, @adgen/core (createProviders overridden, with the REAL
 * toAdSeconds preserved via importActual so a duration narrowing stays tracked
 * automatically), yt-dlp and clip-search. The hoisted vi.fn()s are the only
 * bindings the mock factories can see — vi.mock is hoisted above every import,
 * same discipline as jobs/route.test.ts.
 *
 * The route modules under test are READ-ONLY. A failing test below is a finding
 * to report, not a reason to edit a route.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  getUser,
  jobsSingle,
  rateLimitMock,
  createProvidersMock,
  generateVariantsMock,
  listVoicesMock,
  runYtDlpMock,
  parseSearchOutputMock,
  usableAsMontageMaterialMock,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  jobsSingle: vi.fn(),
  rateLimitMock: vi.fn(),
  createProvidersMock: vi.fn(),
  generateVariantsMock: vi.fn(),
  listVoicesMock: vi.fn(),
  runYtDlpMock: vi.fn(),
  parseSearchOutputMock: vi.fn(),
  usableAsMontageMaterialMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  // jobs/[id] chains .from().select().eq().single(); the other three routes
  // only call auth.getUser, so `from` is never reached for them.
  createServerClient: async () => ({
    auth: { getUser },
    from: (_t: string) => ({
      select: (_c: string) => ({ eq: (_k: string, _v: unknown) => ({ single: jobsSingle }) }),
    }),
  }),
}));

vi.mock('@/lib/rate-limit', () => ({ rateLimit: rateLimitMock }));

// Override ONLY createProviders and keep the real toAdSeconds (the
// generate-scripts route calls it to normalise targetSeconds). Spreading
// importActual means a future export added to @adgen/core keeps working
// without touching this mock — same pattern as worker/matrix-pipeline.test.ts.
vi.mock('@adgen/core', async (importActual) => {
  const actual = await importActual<typeof import('@adgen/core')>();
  return { ...actual, createProviders: createProvidersMock };
});

vi.mock('@/lib/yt-dlp', () => ({ runYtDlp: runYtDlpMock }));
vi.mock('@/lib/clip-search', () => ({
  parseSearchOutput: parseSearchOutputMock,
  usableAsMontageMaterial: usableAsMontageMaterialMock,
}));

import { POST as generateScripts } from './generate-scripts/route.ts';
import { POST as searchClips } from './search-clips/route.ts';
import { GET as listVoices } from './voices/route.ts';
import { GET as getJob } from './jobs/[id]/route.ts';

/** Build a POST Request with a JSON body, cast to the route's parameter type. */
function postGenerate(body: unknown) {
  return new Request('https://app.example/api/generate-scripts', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof generateScripts>[0];
}

function postSearch(body: unknown) {
  return new Request('https://app.example/api/search-clips', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof searchClips>[0];
}

/** Call GET /api/jobs/:id — params is a Promise in the App Router. */
function getJobById(id: string) {
  const request = new Request(`https://app.example/api/jobs/${id}`) as unknown as Parameters<
    typeof getJob
  >[0];
  return getJob(request, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  // Reset every mock's call log and implementation, then reinstall the happy
  // path so each test starts from a known-good baseline and only overrides the
  // one behaviour it cares about.
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  rateLimitMock.mockResolvedValue({ allowed: true, resetSeconds: 0 });
  jobsSingle.mockResolvedValue({ data: { id: 'job1', type: 'matrix', status: 'done' }, error: null });

  createProvidersMock.mockReturnValue({
    script: { name: 'mock-script', generateVariants: generateVariantsMock },
    voice: { name: 'mock-voice', listVoices: listVoicesMock },
  });
  generateVariantsMock.mockResolvedValue({
    variants: [{ angle: 'a', script: 's', estDurationSec: 15 }],
  });
  listVoicesMock.mockResolvedValue([{ id: 'v1', name: 'Voice 1', gender: 'female' }]);

  runYtDlpMock.mockResolvedValue('');
  parseSearchOutputMock.mockReturnValue([]);
  usableAsMontageMaterialMock.mockReturnValue(true);
});
describe('POST /api/generate-scripts', () => {
  it('1. unauthenticated ⇒ 401, script provider NOT called', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await generateScripts(postGenerate({ product: 'p' }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthenticated' });
    expect(generateVariantsMock).not.toHaveBeenCalled();
  });

  it('2. rate limited ⇒ 429 with retryAfterSeconds, provider NOT called', async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, resetSeconds: 30 });

    const res = await generateScripts(postGenerate({ product: 'p' }));

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate_limited', retryAfterSeconds: 30 });
    expect(generateVariantsMock).not.toHaveBeenCalled();
  });

  it('3. an over-long product is CLAMPED to 200, not rejected', async () => {
    // Send 500 chars; the provider must receive exactly PRODUCT_MAX_CHARS (200).
    const res = await generateScripts(postGenerate({ product: 'x'.repeat(500) }));

    expect(res.status).toBe(200);
    expect(generateVariantsMock).toHaveBeenCalledTimes(1);
    expect(generateVariantsMock.mock.calls[0][0].product).toHaveLength(200);
  });

  it('4. an over-long benefits is clamped to 500', async () => {
    const res = await generateScripts(postGenerate({ product: 'p', benefits: 'y'.repeat(600) }));

    expect(res.status).toBe(200);
    expect(generateVariantsMock.mock.calls[0][0].benefits).toHaveLength(500);
  });

  it('5. a count above MAX_COUNT is clamped to 8', async () => {
    // count reaches the provider as the `count` field of the generateVariants
    // input — assert on exactly that value.
    const res = await generateScripts(postGenerate({ product: 'p', count: 50 }));

    expect(res.status).toBe(200);
    expect(generateVariantsMock.mock.calls[0][0].count).toBe(8);
  });

  it('6. happy path ⇒ 200 carrying the provider scripts', async () => {
    const res = await generateScripts(postGenerate({ product: 'p' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      variants: [{ angle: 'a', script: 's', estDurationSec: 15 }],
      speakerGender: null,
      provider: 'mock-script',
    });
  });
});

describe('POST /api/search-clips', () => {
  it('7. unauthenticated ⇒ 401, runYtDlp NOT called', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await searchClips(postSearch({ query: 'anything' }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthenticated' });
    expect(runYtDlpMock).not.toHaveBeenCalled();
  });

  it('8. rate limited ⇒ 429, runYtDlp NOT called', async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, resetSeconds: 30 });

    const res = await searchClips(postSearch({ query: 'anything' }));

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate_limited', retryAfterSeconds: 30 });
    expect(runYtDlpMock).not.toHaveBeenCalled();
  });

  it('9. an empty query ⇒ 400 invalid_query, runYtDlp NOT called', async () => {
    // Whitespace trims to empty, which the route rejects before any search.
    const res = await searchClips(postSearch({ query: '   ' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_query' });
    expect(runYtDlpMock).not.toHaveBeenCalled();
  });

  it('10. a query longer than 120 chars ⇒ 400 invalid_query, runYtDlp NOT called', async () => {
    const res = await searchClips(postSearch({ query: 'q'.repeat(121) }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_query' });
    expect(runYtDlpMock).not.toHaveBeenCalled();
  });

  it('11. results are capped at MAX_RESULTS (12)', async () => {
    // Feed 20 parsed, all-usable clips and request more than the cap. The route
    // clamps the limit to 12 then slices — assert exactly 12 come back. A
    // distinct query avoids the route's process-local search cache, so this
    // test cannot be short-circuited by an earlier run.
    parseSearchOutputMock.mockReturnValue(
      Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, url: 'u', title: 't' })),
    );

    const res = await searchClips(postSearch({ query: 'cap-query', limit: 20 }));

    expect(res.status).toBe(200);
    expect(runYtDlpMock).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.results).toHaveLength(12);
  });

  it('12. a yt-dlp failure is handled (502 search_failed)', async () => {
    // Distinct query so the cache miss forces the route into runYtDlp, which
    // rejects; the route must surface that as 502 search_failed, not 500.
    runYtDlpMock.mockRejectedValue(new Error('yt-dlp exploded'));

    const res = await searchClips(postSearch({ query: 'fail-query' }));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'search_failed' });
  });
});

describe('GET /api/voices', () => {
  it('13. unauthenticated ⇒ 401, listVoices NOT called', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await listVoices();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthenticated' });
    expect(listVoicesMock).not.toHaveBeenCalled();
  });

  it('14. rate limited ⇒ 429', async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, resetSeconds: 30 });

    const res = await listVoices();

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate_limited', retryAfterSeconds: 30 });
  });

  it('15. happy path ⇒ 200 with the provider voices', async () => {
    const res = await listVoices();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      provider: 'mock-voice',
      voices: [{ id: 'v1', name: 'Voice 1', gender: 'female' }],
    });
  });

  it('16. a provider failure ⇒ 502 voices_unavailable', async () => {
    // The wizard fetches this on mount and must get a clean 502, not a 500 —
    // a thrown listVoices is a transient catalogue outage, not a server bug,
    // and the wizard depends on this degrading cleanly.
    listVoicesMock.mockRejectedValue(new Error('elevenlabs down'));

    const res = await listVoices();

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'voices_unavailable' });
  });
});

describe('GET /api/jobs/[id]', () => {
  it('17. unauthenticated ⇒ 401', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await getJobById('job1');

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('18. a job id that returns no row ⇒ 404 not_found (RLS cross-customer)', async () => {
    // RLS scopes the select to the caller, so another user's job id simply is
    // not there — Supabase answers with no row (PGRST116), which the route
    // turns into 404 rather than leaking that the row exists for someone else.
    jobsSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

    const res = await getJobById('someone-elses-job');

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('19. happy path ⇒ 200 with the job row', async () => {
    const res = await getJobById('job1');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ job: { id: 'job1', type: 'matrix', status: 'done' } });
  });
});

