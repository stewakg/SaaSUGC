/**
 * Unit tests for the two billing routes: POST /api/billing/checkout and
 * POST /api/billing/webhook.
 *
 * Why these matter:
 *  - checkout is the door to a *real* Lemon Squeezy purchase. In production it
 *    must refuse to hand back the dev mock's "instant credit" URL, because that
 *    URL never charges the customer — serving it would be a free-credits leak.
 *    The mock-in-production guard (case 3) is the line that stops that.
 *  - webhook is the door Lemon Squeezy uses to tell us a payment landed. Trust
 *    comes entirely from the HMAC signature (parseWebhook), and the grant must
 *    be idempotent on orderId (case 11) or a Lemon Squeezy retry grants twice.
 *    A validly-signed but irrelevant event must still be acked 200 (case 10) or
 *    Lemon Squeezy retries it forever.
 *
 * Everything external is mocked so the routes run with no Supabase and no
 * network: the Supabase server/admin clients, the rate limiter, and the whole
 * @adgen/core provider bundle are replaced with vi.fn()s declared through
 * vi.hoisted (vi.mock is hoisted above every import, so its factory can only
 * see hoisted bindings — same discipline as jobs/route.test.ts). The two routes
 * share all of these mocks, so they live in one file.
 *
 * Both route modules under test are READ-ONLY. A failing test below is a finding
 * to report, not a reason to edit a route.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { getUser, rateLimitMock, createCheckout, parseWebhook, billingName, rpcMock } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rateLimitMock: vi.fn(),
  createCheckout: vi.fn(),
  parseWebhook: vi.fn(),
  // A plain object, not a vi.fn(): the provider mock reads `billingName.value`
  // via a getter, so a test can flip the resolved provider name (lemonsqueezy
  // vs mock) without re-wiring the mock factory.
  billingName: { value: 'lemonsqueezy-billing' },
  rpcMock: vi.fn(),
}));

vi.mock('@adgen/core', () => ({
  createProviders: () => ({
    billing: { get name() { return billingName.value; }, createCheckout, parseWebhook },
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser } }),
  createAdminClient: () => ({ rpc: rpcMock }),
}));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: rateLimitMock }));

import { POST as checkoutPOST } from './checkout/route.ts';
import { POST as webhookPOST } from './webhook/route.ts';

/**
 * The webhook route identifies a bad signature by constructor name, not by
 * `instanceof` or `.name` — the real class ships as a bare
 * `class InvalidWebhookSignatureError extends Error {}`. Mirror that exactly so
 * the route's name-match branch is exercised the way it runs in production.
 */
class InvalidWebhookSignatureError extends Error {}

/** Build a checkout POST request with a JSON body, cast to the route's param. */
function post(body: unknown) {
  return new Request('https://app.example/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof checkoutPOST>[0];
}

/** Build a webhook POST request with a JSON body, cast to the route's param. */
function webhookPost(body: unknown) {
  return new Request('https://app.example/api/billing/webhook', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof webhookPOST>[0];
}

beforeEach(() => {
  // Reset every mock's call log and implementation, then reinstall the happy
  // path so each test starts from a known-good baseline and only overrides the
  // one behaviour it cares about. console.error is spied (and silenced) so the
  // logged provider detail can be asserted without polluting test output.
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});

  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  rateLimitMock.mockResolvedValue({ allowed: true, resetSeconds: 0 });
  billingName.value = 'lemonsqueezy-billing';
  createCheckout.mockResolvedValue({ url: 'https://ls.example/co' });
  parseWebhook.mockResolvedValue(null);
  rpcMock.mockResolvedValue({ error: null });
});

afterEach(() => {
  // Drop the console.error spy between runs (avoids re-spying the same method)
  // and restore any NODE_ENV stubs the production cases install.
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('POST /api/billing/checkout — auth, rate limit, mock-in-production guard', () => {
  it('1. unauthenticated ⇒ 401, createCheckout not called', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await checkoutPOST(post({ packId: 'pack_starter' }));

    expect(res.status).toBe(401);
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it('2. rate limited ⇒ 429 with retryAfterSeconds, createCheckout not called', async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, resetSeconds: 60 });

    const res = await checkoutPOST(post({ packId: 'pack_starter' }));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('rate_limited');
    expect(body.retryAfterSeconds).toBe(60);
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it('3. PRODUCTION + mock billing ⇒ 503 billing_unavailable, createCheckout NEVER called', async () => {
    // This is the guard that stops a free-credits URL being served to a paying
    // customer. In production a mock provider means LEMONSQUEEZY_* is unset and
    // the honest answer is "checkout unavailable", not a checkout that never charges.
    billingName.value = 'mock-billing';
    vi.stubEnv('NODE_ENV', 'production');

    const res = await checkoutPOST(post({ packId: 'pack_starter' }));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'billing_unavailable' });
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it('4. development + mock billing ⇒ allowed (createCheckout IS called)', async () => {
    // Outside production the mock provider is the local-dev instant-credit path,
    // so it must still work — otherwise local checkout testing is impossible.
    // No NODE_ENV stub here: the default (non-production) value skips the guard.
    billingName.value = 'mock-billing';

    const res = await checkoutPOST(post({ packId: 'pack_starter' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://ls.example/co' });
    expect(createCheckout).toHaveBeenCalledWith('u1', 'pack_starter');
  });

  it('5. missing packId ⇒ 400 missing_pack_id, createCheckout not called', async () => {
    const res = await checkoutPOST(post({ notPack: 'x' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'missing_pack_id' });
    expect(createCheckout).not.toHaveBeenCalled();
  });
});

describe('POST /api/billing/checkout — happy path and provider error', () => {
  it('6. happy path ⇒ 200 { url } and createCheckout called with (user.id, packId)', async () => {
    const res = await checkoutPOST(post({ packId: 'pack_starter' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://ls.example/co' });
    expect(createCheckout).toHaveBeenCalledTimes(1);
    expect(createCheckout).toHaveBeenCalledWith('u1', 'pack_starter');
  });

  it('7. a thrown provider error ⇒ 500 checkout_failed, message does NOT leak', async () => {
    // The provider error detail is logged server-side only. It must never reach
    // the client — LEMONSQUEEZY_STORE_ID (a config secret name) appearing in a
    // response body would be an information leak AND a confusing checkout error.
    createCheckout.mockRejectedValue(new Error('LEMONSQUEEZY_STORE_ID is not set'));

    const res = await checkoutPOST(post({ packId: 'pack_starter' }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'checkout_failed' });
    // The raw secret-name string must appear nowhere in the serialised body.
    expect(JSON.stringify(body)).not.toContain('LEMONSQUEEZY_STORE_ID');
    // The detail IS logged server-side (so ops can diagnose), just not returned.
    expect(console.error).toHaveBeenCalled();
  });
});

describe('POST /api/billing/webhook — signature, parse, idempotent grant', () => {
  it('8. a signature error ⇒ 400 invalid_signature, nothing granted', async () => {
    parseWebhook.mockRejectedValue(new InvalidWebhookSignatureError('nope'));

    const res = await webhookPOST(webhookPost({ raw: 'event' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_signature' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('9. any other throw ⇒ 400 malformed_payload, nothing granted', async () => {
    // This must NOT collapse into the signature answer — telling a bad signature
    // apart from a malformed payload is the point (signature ⇒ maybe an attack,
    // malformed ⇒ Lemon Squeezy changed their payload shape and we need to know).
    parseWebhook.mockRejectedValue(new SyntaxError('Unexpected token'));

    const res = await webhookPOST(webhookPost({ raw: 'event' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'malformed_payload' });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('10. a null grant acks 200 and touches nothing', async () => {
    // A validly-signed but irrelevant event (e.g. subscription_updated) must be
    // acked, or Lemon Squeezy retries it forever hammering our endpoint.
    parseWebhook.mockResolvedValue(null);

    const res = await webhookPOST(webhookPost({ raw: 'event' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('11. a grant calls add_credits_idempotent with the order id as p_external_ref', async () => {
    // The external ref is what stops a Lemon Squeezy retry granting the same
    // order twice: add_credits_idempotent no-ops on a repeated p_external_ref.
    parseWebhook.mockResolvedValue({
      userId: 'u9',
      amount: 260,
      reason: 'lemonsqueezy:pack_pro',
      orderId: 'ord_1',
    });

    const res = await webhookPOST(webhookPost({ raw: 'event' }));

    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('add_credits_idempotent', {
      p_user_id: 'u9',
      p_amount: 260,
      p_reason: 'lemonsqueezy:pack_pro',
      p_external_ref: 'ord_1',
    });
  });

  it('12. an RPC error ⇒ 500 (Lemon Squeezy SHOULD retry a grant that failed to persist)', async () => {
    rpcMock.mockResolvedValue({ error: { message: 'boom' } });
    parseWebhook.mockResolvedValue({
      userId: 'u9',
      amount: 260,
      reason: 'lemonsqueezy:pack_pro',
      orderId: 'ord_1',
    });

    const res = await webhookPOST(webhookPost({ raw: 'event' }));

    expect(res.status).toBe(500);
  });
});
