/**
 * Unit tests for LemonSqueezyBilling (F6) — the money path.
 *
 * This provider has never run against a live Lemon Squeezy account (no keys,
 * no store — see ACCOUNTS.md), and the factory never instantiates it until
 * LEMONSQUEEZY_API_KEY is set. These tests pin the contract with NO network:
 * globalThis.fetch is faked and webhook signatures are produced locally with
 * node:crypto.
 *
 * The two paths that matter most:
 *  1. createCheckout must POST the exact Lemon Squeezy JSON:API shape (custom
 *     data carrying user+pack, the mapped variant, our store, the app redirect)
 *     and surface the hosted checkout url.
 *  2. parseWebhook must verify an HMAC-SHA256 signature over the RAW body,
 *     only grant on order_created+paid, and — the money guard added
 *     2026-08-13 — refuse a grant when the actually-purchased variant does not
 *     match the variant mapped to the pack (stops a EUR 5 payment buying a
 *     EUR 50 pack).
 *
 * Isolation (same discipline as ai.kiefal.test.ts): beforeEach fakes fetch and
 * spies console.warn; afterEach restores fetch and calls vi.restoreAllMocks so
 * nothing leaks into later files in the same vitest run.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { createHmac } from 'node:crypto';
import { LemonSqueezyBilling, LemonSqueezyConfigError, InvalidWebhookSignatureError } from './billing.lemonsqueezy.ts';
import { CREDIT_PACKS } from '../pricing.ts';

// Source of truth for pack ids, credits and bonuses is CREDIT_PACKS — never
// hardcode any of them. Pick the first pack and build the variant map from it.
const PACK = CREDIT_PACKS[0];
const VARIANT = '999001';
const SECRET = 'whsec_test';

function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body).digest('hex');
}

function webhookRequest(payload: unknown, signature?: string): Request {
  const body = JSON.stringify(payload);
  return new Request('https://app.example/api/billing/webhook', {
    method: 'POST',
    headers: { 'x-signature': signature ?? sign(body) },
    body,
  });
}

function makeBilling(over: Partial<{ variantMapJson: string }> = {}) {
  return new LemonSqueezyBilling({
    apiKey: 'lskey',
    storeId: 'store1',
    webhookSecret: SECRET,
    variantMapJson: over.variantMapJson ?? JSON.stringify({ [PACK.id]: VARIANT }),
    appUrl: 'https://app.example',
  });
}

function paidOrder(
  over: Partial<{
    eventName: string;
    status: string;
    userId: string | undefined;
    packId: string | undefined;
    variantId: number | undefined;
    orderId: string;
  }> = {},
) {
  const custom: Record<string, string> = {};
  const uid = 'userId' in over ? over.userId : 'u1';
  const pid = 'packId' in over ? over.packId : PACK.id;
  if (uid !== undefined) custom.user_id = uid;
  if (pid !== undefined) custom.pack_id = pid;
  const attributes: Record<string, unknown> = { status: over.status ?? 'paid' };
  const vid = 'variantId' in over ? over.variantId : Number(VARIANT);
  if (vid !== undefined) attributes.first_order_item = { variant_id: vid };
  return {
    meta: { event_name: over.eventName ?? 'order_created', custom_data: custom },
    data: { id: over.orderId ?? 'order_42', attributes },
  };
}

// One persistent fetch mock assigned onto globalThis.fetch, plus a console.warn
// spy captured for the variant cross-check paths.
const fetchMock = vi.fn();
let originalFetch: typeof globalThis.fetch;
let warnSpy: MockInstance;

beforeEach(() => {
  fetchMock.mockReset();
  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ===========================================================================
// Constructor / config
// ===========================================================================
describe('constructor / config', () => {
  it('1. missing storeId throws LemonSqueezyConfigError naming LEMONSQUEEZY_STORE_ID', () => {
    const fn = () =>
      new LemonSqueezyBilling({
        apiKey: 'lskey',
        storeId: '',
        webhookSecret: SECRET,
        variantMapJson: JSON.stringify({ [PACK.id]: VARIANT }),
        appUrl: 'https://app.example',
      });
    expect(fn).toThrow(LemonSqueezyConfigError);
    expect(fn).toThrow(/LEMONSQUEEZY_STORE_ID/);
  });

  it('2. missing webhookSecret throws LemonSqueezyConfigError naming LEMONSQUEEZY_WEBHOOK_SECRET', () => {
    const fn = () =>
      new LemonSqueezyBilling({
        apiKey: 'lskey',
        storeId: 'store1',
        webhookSecret: '',
        variantMapJson: JSON.stringify({ [PACK.id]: VARIANT }),
        appUrl: 'https://app.example',
      });
    expect(fn).toThrow(LemonSqueezyConfigError);
    expect(fn).toThrow(/LEMONSQUEEZY_WEBHOOK_SECRET/);
  });

  it('3. missing variantMapJson throws LemonSqueezyConfigError naming LEMONSQUEEZY_VARIANT_MAP', () => {
    const fn = () =>
      new LemonSqueezyBilling({
        apiKey: 'lskey',
        storeId: 'store1',
        webhookSecret: SECRET,
        appUrl: 'https://app.example',
      });
    expect(fn).toThrow(LemonSqueezyConfigError);
    expect(fn).toThrow(/LEMONSQUEEZY_VARIANT_MAP/);
  });

  it('4. invalid JSON variant map throws LemonSqueezyConfigError mentioning valid JSON', () => {
    const fn = () =>
      new LemonSqueezyBilling({
        apiKey: 'lskey',
        storeId: 'store1',
        webhookSecret: SECRET,
        variantMapJson: '{not json',
        appUrl: 'https://app.example',
      });
    expect(fn).toThrow(LemonSqueezyConfigError);
    expect(fn).toThrow(/valid JSON/);
  });

  it('5. a full config constructs and name is lemonsqueezy-billing', () => {
    const billing = makeBilling();
    expect(billing.name).toBe('lemonsqueezy-billing');
  });
});

// ===========================================================================
// createCheckout
// ===========================================================================
describe('createCheckout', () => {
  it('6. posts the right shape', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { attributes: { url: 'https://store.lemonsqueezy.com/checkout/x' } } }),
    } as unknown as Response);

    const billing = makeBilling();
    const result = await billing.createCheckout('u1', PACK.id);
    expect(result).toEqual({ url: 'https://store.lemonsqueezy.com/checkout/x' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.lemonsqueezy.com/v1/checkouts');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer lskey');

    const body = JSON.parse(init.body as string);
    expect(body.data.attributes.checkout_data.custom).toEqual({ user_id: 'u1', pack_id: PACK.id });
    expect(body.data.relationships.store.data.id).toBe('store1');
    expect(body.data.relationships.variant.data.id).toBe(VARIANT);
  });

  it('7. the buyer is sent back to the app', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { attributes: { url: 'https://store.lemonsqueezy.com/checkout/x' } } }),
    } as unknown as Response);

    const billing = makeBilling();
    await billing.createCheckout('u1', PACK.id);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.data.attributes.product_options.redirect_url).toBe('https://app.example/app?kupljeno=1');
  });

  it('8. unknown pack id rejects mentioning the pack id and does NOT call fetch', async () => {
    const billing = makeBilling();
    await expect(billing.createCheckout('u1', 'pack_does_not_exist')).rejects.toThrow(/pack_does_not_exist/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('9. a pack with no mapped variant rejects with LemonSqueezyConfigError naming LEMONSQUEEZY_VARIANT_MAP, fetch NOT called', async () => {
    const billing = makeBilling({ variantMapJson: JSON.stringify({ some_other_pack: '1' }) });
    await expect(billing.createCheckout('u1', PACK.id)).rejects.toThrow(LemonSqueezyConfigError);
    await expect(billing.createCheckout('u1', PACK.id)).rejects.toThrow(/LEMONSQUEEZY_VARIANT_MAP/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('10. a non-ok checkout response rejects with the status in the message', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: async () => 'bad variant',
    } as unknown as Response);

    const billing = makeBilling();
    await expect(billing.createCheckout('u1', PACK.id)).rejects.toThrow(/422/);
  });
});

// ===========================================================================
// parseWebhook — signature verification
// ===========================================================================
describe('parseWebhook — signature', () => {
  it('11. a correctly signed paid order grants the pack credits', async () => {
    const billing = makeBilling();
    const result = await billing.parseWebhook(webhookRequest(paidOrder()));
    expect(result).toEqual({
      userId: 'u1',
      amount: PACK.credits + (PACK.bonus ?? 0),
      reason: `lemonsqueezy:${PACK.id}`,
      orderId: 'order_42',
    });
  });

  it('11b. a pack WITH a bonus grants credits + bonus, not credits alone', async () => {
    // PACK (CREDIT_PACKS[0]) has no bonus, so case 11 cannot tell
    // `credits + (bonus ?? 0)` apart from `credits` — dropping the bonus would
    // short a paying customer (pack_agency: 600 + 120) and no test would notice.
    // This case uses the first pack that actually carries one.
    const bonusPack = CREDIT_PACKS.find((p) => (p.bonus ?? 0) > 0);
    if (!bonusPack) throw new Error('no CREDIT_PACKS entry carries a bonus — update this test');
    const bonusVariant = '999002';
    const billing = new LemonSqueezyBilling({
      apiKey: 'lskey',
      storeId: 'store1',
      webhookSecret: SECRET,
      variantMapJson: JSON.stringify({ [bonusPack.id]: bonusVariant }),
      appUrl: 'https://app.example',
    });

    const result = await billing.parseWebhook(
      webhookRequest(paidOrder({ packId: bonusPack.id, variantId: Number(bonusVariant) })),
    );

    expect(result?.amount).toBe(bonusPack.credits + bonusPack.bonus!);
    // And it is strictly more than the base credits — the assertion that fails
    // if the bonus term is ever dropped.
    expect(result?.amount).toBeGreaterThan(bonusPack.credits);
  });

  it('12. a wrong signature throws InvalidWebhookSignatureError', async () => {
    const billing = makeBilling();
    await expect(billing.parseWebhook(webhookRequest(paidOrder(), sign('tampered')))).rejects.toThrow(
      InvalidWebhookSignatureError,
    );
  });

  it('13. a missing x-signature header throws InvalidWebhookSignatureError', async () => {
    const billing = makeBilling();
    const body = JSON.stringify(paidOrder());
    const req = new Request('https://app.example/api/billing/webhook', { method: 'POST', body });
    await expect(billing.parseWebhook(req)).rejects.toThrow(InvalidWebhookSignatureError);
  });

  it('14. a signature of the wrong length throws InvalidWebhookSignatureError rather than crashing', async () => {
    const billing = makeBilling();
    await expect(billing.parseWebhook(webhookRequest(paidOrder(), 'abc'))).rejects.toThrow(
      InvalidWebhookSignatureError,
    );
  });

  it('15. a tampered body with the old signature throws InvalidWebhookSignatureError', async () => {
    const billing = makeBilling();
    const staleSignature = sign(JSON.stringify(paidOrder()));
    await expect(
      billing.parseWebhook(webhookRequest(paidOrder({ orderId: 'order_99' }), staleSignature)),
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });
});

// ===========================================================================
// parseWebhook — event filtering (all correctly signed ⇒ null, never throws)
// ===========================================================================
describe('parseWebhook — event filtering', () => {
  it('16. event_name other than order_created ⇒ null', async () => {
    const billing = makeBilling();
    const result = await billing.parseWebhook(webhookRequest(paidOrder({ eventName: 'subscription_created' })));
    expect(result).toBeNull();
  });

  it('17. status other than paid ⇒ null', async () => {
    const billing = makeBilling();
    const result = await billing.parseWebhook(webhookRequest(paidOrder({ status: 'pending' })));
    expect(result).toBeNull();
  });

  it('18. missing custom_data.user_id ⇒ null', async () => {
    const billing = makeBilling();
    const result = await billing.parseWebhook(webhookRequest(paidOrder({ userId: undefined })));
    expect(result).toBeNull();
  });

  it('19. missing custom_data.pack_id ⇒ null', async () => {
    const billing = makeBilling();
    const result = await billing.parseWebhook(webhookRequest(paidOrder({ packId: undefined })));
    expect(result).toBeNull();
  });

  it('20. a pack_id not in CREDIT_PACKS ⇒ null', async () => {
    const billing = makeBilling();
    const result = await billing.parseWebhook(webhookRequest(paidOrder({ packId: 'pack_does_not_exist' })));
    expect(result).toBeNull();
  });
});

// ===========================================================================
// parseWebhook — the paid-variant cross-check (the money guard, 2026-08-13)
// ===========================================================================
describe('parseWebhook — paid-variant cross-check', () => {
  it('21. a mismatching paid variant is REFUSED: null + warn mentioning the pack id', async () => {
    const billing = makeBilling();
    const result = await billing.parseWebhook(webhookRequest(paidOrder({ variantId: 123456 })));
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(PACK.id));
  });

  it('22. a matching paid variant grants and does NOT warn', async () => {
    const billing = makeBilling();
    const result = await billing.parseWebhook(webhookRequest(paidOrder()));
    expect(result).toEqual({
      userId: 'u1',
      amount: PACK.credits + (PACK.bonus ?? 0),
      reason: `lemonsqueezy:${PACK.id}`,
      orderId: 'order_42',
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('23. an absent variant_id still grants, with a warning', async () => {
    const billing = makeBilling();
    const result = await billing.parseWebhook(webhookRequest(paidOrder({ variantId: undefined })));
    expect(result).toEqual({
      userId: 'u1',
      amount: PACK.credits + (PACK.bonus ?? 0),
      reason: `lemonsqueezy:${PACK.id}`,
      orderId: 'order_42',
    });
    expect(warnSpy).toHaveBeenCalled();
  });
});