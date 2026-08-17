/**
 * Unit tests for GET /api/dev/credits/add — the route that mints credits.
 *
 * This route creates credits out of nothing: a signed-in caller picks a
 * CREDIT_PACKS entry and the `add_credits` RPC is debited with no payment. Its
 * only gate is the production admin check (`isAdminEmail(user.email)`), so if
 * that check ever drifts — runs before auth, runs only in the UI, accepts
 * everyone, or is dropped — the tests in the "production admin gate" describe
 * fail. That is the point: anyone who knows the URL must not mint free credits
 * in production.
 *
 * Everything external is mocked so the route runs with no Supabase and no
 * network: the Supabase server/admin clients and `isAdminEmail` are replaced
 * with vi.fn()s declared through vi.hoisted (vi.mock is hoisted above every
 * import, so its factory can only see hoisted bindings). The packs come from
 * `@adgen/core/pricing` for real, so a pricing change is tracked automatically
 * rather than hardcoded here.
 *
 * The route module under test (apps/web/src/app/api/dev/credits/add/route.ts)
 * is READ-ONLY. A failing test below is a finding to report, not a reason to
 * edit the route.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, rpcMock, isAdminEmailMock, rateLimitMock } = vi.hoisted(() => ({
  rateLimitMock: vi.fn(),
  getUser: vi.fn(),
  rpcMock: vi.fn(),
  isAdminEmailMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser } }),
  createAdminClient: () => ({ rpc: rpcMock }),
}));
vi.mock('@/lib/admin', () => ({ isAdminEmail: isAdminEmailMock }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: rateLimitMock }));

import { GET } from './route.ts';
import { CREDIT_PACKS } from '@adgen/core/pricing';

/**
 * Build a GET request whose query string is read via `request.nextUrl`.
 * A plain `Request` has no `nextUrl`, so wrap with NextRequest (the type the
 * route declares). `request.url` is also used for the redirect, so give it a
 * real absolute URL.
 */
function req(pack?: string) {
  const url = new URL('https://app.example/api/dev/credits/add');
  if (pack !== undefined) url.searchParams.set('pack', pack);
  return new NextRequest(url) as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  // Reset every mock's call log and implementation, then reinstall the happy
  // path: a signed-in non-admin in development. Each test overrides only the
  // one behaviour it cares about.
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'user@example.com' } } });
  rateLimitMock.mockResolvedValue({ allowed: true, resetSeconds: 0 });
  rpcMock.mockResolvedValue({ error: null });
  isAdminEmailMock.mockReturnValue(false);
  // Stated explicitly rather than inherited from the runner. The gate now
  // admits a non-admin ONLY under NODE_ENV=development (it used to admit
  // everything that was not "production", which is the fail-open bug), and
  // vitest's own NODE_ENV is "test" — so without this the tests below would
  // 404 before reaching the pack/RPC behaviour they exist to cover. The gate's
  // own tests stub their own value on top of this.
  vi.stubEnv('NODE_ENV', 'development');
});

afterEach(() => {
  // Clear any per-test NODE_ENV stubs; beforeEach reinstalls the explicit
  // 'development' default for the next one.
  vi.unstubAllEnvs();
});

describe('GET /api/dev/credits/add — authentication and the production admin gate', () => {
  it('1. unauthenticated ⇒ 401 and no credits are minted', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await GET(req(CREDIT_PACKS[0].id));

    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('1b. rate limited ⇒ 429 and nothing minted', async () => {
    // Added by the 2026-08-13 audit: this was the only credit-touching route
    // with no limit at all. The admin gate is the real defence; this stops a
    // regression in that gate from becoming unlimited minting in a loop.
    rateLimitMock.mockResolvedValue({ allowed: false, resetSeconds: 42 });

    const res = await GET(req(CREDIT_PACKS[0].id));

    expect(res.status).toBe(429);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('2. PRODUCTION + non-admin ⇒ 404 not_available, nothing minted', async () => {
    // This is the gate that stops anyone who knows the URL from minting free
    // credits. If it slips, free credits go to the world in production.
    vi.stubEnv('NODE_ENV', 'production');
    isAdminEmailMock.mockReturnValue(false);

    const res = await GET(req(CREDIT_PACKS[0].id));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_available' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('3. PRODUCTION + admin ⇒ proceeds and decides adminship from the user email', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    isAdminEmailMock.mockReturnValue(true);

    await GET(req(CREDIT_PACKS[0].id));

    // The route must reach the RPC (admin is allowed through), and the admin
    // decision must be made from the signed-in user's email — never a guess.
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(isAdminEmailMock).toHaveBeenCalledWith('user@example.com');
  });

  it('4. development + non-admin ⇒ proceeds (the route is deliberately open locally)', async () => {
    // Stubbed EXPLICITLY to 'development'. This test used to rely on vitest's
    // own NODE_ENV='test' falling through — which was the fail-open bug: the
    // gate asked "is this production?" and treated every other value as safe to
    // mint. The test encoded the vulnerability, so it had to change with it.
    vi.stubEnv('NODE_ENV', 'development');
    isAdminEmailMock.mockReturnValue(false);

    await GET(req(CREDIT_PACKS[0].id));

    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  /*
   * The fail-closed property. `/api/dev/credits/add` creates credits from
   * nothing, so the question it asks must be "are we provably in development?"
   * — never "are we provably in production?". Every value below is one a real
   * deployment can end up with: a container started without the var, an empty
   * assignment, a typo, or a CI/test runner. Each one used to mean unlimited
   * minting for ANY authenticated user.
   */
  it.each([
    ['test', 'a test runner'],
    ['', 'an empty assignment in an env file'],
    ['produciton', 'a typo — the classic'],
    ['staging', 'an environment nobody enumerated'],
    ['Production', 'wrong case, so not an exact match either'],
  ])('4b. NODE_ENV=%s + non-admin ⇒ 404, nothing minted (%s)', async (value) => {
    vi.stubEnv('NODE_ENV', value);
    isAdminEmailMock.mockReturnValue(false);

    const res = await GET(req(CREDIT_PACKS[0].id));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_available' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('4c. an ADMIN still mints under any NODE_ENV — the gate must not lock the owner out', async () => {
    for (const value of ['production', 'test', '', 'staging']) {
      vi.stubEnv('NODE_ENV', value);
      isAdminEmailMock.mockReturnValue(true);
      rpcMock.mockClear();

      await GET(req(CREDIT_PACKS[0].id));

      expect(rpcMock, `admin should mint under NODE_ENV=${value}`).toHaveBeenCalledTimes(1);
    }
  });
});

describe('GET /api/dev/credits/add — pack resolution', () => {
  it('5. unknown pack ⇒ 400 unknown_pack, nothing minted', async () => {
    const res = await GET(req('pack_nope'));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'unknown_pack' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('6. missing ?pack ⇒ 400 unknown_pack, nothing minted', async () => {
    const res = await GET(req());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'unknown_pack' });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/dev/credits/add — the add_credits RPC', () => {
  it('7. mints with the right call: add_credits(user_id, credits + bonus, reason)', async () => {
    const pack = CREDIT_PACKS[0];

    await GET(req(pack.id));

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('add_credits', {
      p_user_id: 'u1',
      p_amount: pack.credits + (pack.bonus ?? 0),
      p_reason: `dev_add_credits:${pack.id}`,
    });
  });

  it('8. a pack WITH a bonus mints credits + bonus (and strictly more than credits)', async () => {
    const pack = CREDIT_PACKS.find((p) => (p.bonus ?? 0) > 0);
    if (!pack) throw new Error('no CREDIT_PACKS entry has a bonus — case cannot be exercised');

    await GET(req(pack.id));

    const args = rpcMock.mock.calls[0][1] as { p_amount: number };
    expect(args.p_amount).toBe(pack.credits + (pack.bonus ?? 0));
    // Without this strict-greater assertion, dropping the bonus term would
    // still satisfy the equality above for a no-bonus pack, and the bug would
    // ship unnoticed.
    expect(args.p_amount).toBeGreaterThan(pack.credits);
  });

  it('9. RPC failure ⇒ 500', async () => {
    rpcMock.mockResolvedValue({ error: { message: 'boom' } });

    const res = await GET(req(CREDIT_PACKS[0].id));

    expect(res.status).toBe(500);
  });
});

describe('GET /api/dev/credits/add — success redirect', () => {
  it('10. success redirects to /app?credited=1', async () => {
    const res = await GET(req(CREDIT_PACKS[0].id));

    // The status code of NextResponse.redirect varies (307/308 across Next
    // versions); the Location header is stable either way.
    const location = res.headers.get('location');
    expect(location).toBeTruthy();
    expect(location!.endsWith('/app?credited=1')).toBe(true);
  });
});

