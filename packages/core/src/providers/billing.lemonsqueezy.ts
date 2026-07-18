/**
 * Real Billing (F6): Lemon Squeezy (Merchant of Record) — handles cross-border
 * EU VAT/OSS so we don't have to. One-time credit-pack purchases via Lemon
 * Squeezy's hosted Checkouts API; the webhook grants credits on a paid order.
 *
 * Needs a Lemon Squeezy store + one "variant" (priced product) per pack in
 * CREDIT_PACKS, and LEMONSQUEEZY_VARIANT_MAP set to a JSON object mapping
 * pack id -> Lemon Squeezy variant id, e.g.
 *   LEMONSQUEEZY_VARIANT_MAP={"pack_starter":"123456","pack_creator":"123457"}
 * None of this exists until the ACCOUNTS.md Lemon Squeezy signup is done —
 * written now so it's ready to wire in; never instantiated until
 * LEMONSQUEEZY_API_KEY is set (see factory.ts).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Billing } from '../interfaces.ts';
import { CREDIT_PACKS } from '../pricing.ts';

const API_BASE = 'https://api.lemonsqueezy.com/v1';

export class LemonSqueezyConfigError extends Error {}
export class InvalidWebhookSignatureError extends Error {}

export class LemonSqueezyBilling implements Billing {
  readonly name = 'lemonsqueezy-billing';
  private readonly variantMap: Record<string, string>;

  constructor(
    private readonly config: {
      apiKey: string;
      storeId: string;
      webhookSecret: string;
      variantMapJson?: string;
    },
  ) {
    if (!config.storeId) {
      throw new LemonSqueezyConfigError(
        'LEMONSQUEEZY_STORE_ID is not set — configure it once the Lemon Squeezy store exists (see ACCOUNTS.md).',
      );
    }
    if (!config.webhookSecret) {
      throw new LemonSqueezyConfigError(
        'LEMONSQUEEZY_WEBHOOK_SECRET is not set — configure it once the Lemon Squeezy webhook exists (see ACCOUNTS.md).',
      );
    }
    if (!config.variantMapJson) {
      throw new LemonSqueezyConfigError(
        "LEMONSQUEEZY_VARIANT_MAP is not set — map each CREDIT_PACKS id to its Lemon Squeezy variant id once the store's products exist (see ACCOUNTS.md).",
      );
    }
    try {
      this.variantMap = JSON.parse(config.variantMapJson) as Record<string, string>;
    } catch {
      throw new LemonSqueezyConfigError('LEMONSQUEEZY_VARIANT_MAP is not valid JSON.');
    }
  }

  async listPacks() {
    return CREDIT_PACKS.map((p) => ({ id: p.id, credits: p.credits, priceEUR: p.priceEUR }));
  }

  async createCheckout(userId: string, packId: string): Promise<{ url: string }> {
    const pack = CREDIT_PACKS.find((p) => p.id === packId);
    if (!pack) throw new Error(`Unknown credit pack: ${packId}`);

    const variantId = this.variantMap[packId];
    if (!variantId) {
      throw new LemonSqueezyConfigError(
        `No Lemon Squeezy variant mapped for pack "${packId}" in LEMONSQUEEZY_VARIANT_MAP.`,
      );
    }

    const res = await fetch(`${API_BASE}/checkouts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/vnd.api+json',
        Accept: 'application/vnd.api+json',
      },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            checkout_data: {
              custom: { user_id: userId, pack_id: packId },
            },
          },
          relationships: {
            store: { data: { type: 'stores', id: this.config.storeId } },
            variant: { data: { type: 'variants', id: variantId } },
          },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Lemon Squeezy checkout creation failed (${res.status}): ${body}`);
    }

    const json = (await res.json()) as { data: { attributes: { url: string } } };
    return { url: json.data.attributes.url };
  }

  async parseWebhook(req: Request): Promise<{ userId: string; amount: number; reason: string } | null> {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get('x-signature') ?? '';

    const expected = createHmac('sha256', this.config.webhookSecret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const actualBuf = Buffer.from(signatureHeader, 'utf8');
    const valid = expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
    if (!valid) {
      throw new InvalidWebhookSignatureError('Lemon Squeezy webhook signature verification failed.');
    }

    const payload = JSON.parse(rawBody) as {
      meta: { event_name: string; custom_data?: Record<string, string> };
      data: { attributes: { status: string } };
    };

    if (payload.meta.event_name !== 'order_created' || payload.data.attributes.status !== 'paid') {
      return null;
    }

    const userId = payload.meta.custom_data?.user_id;
    const packId = payload.meta.custom_data?.pack_id;
    if (!userId || !packId) return null;

    const pack = CREDIT_PACKS.find((p) => p.id === packId);
    if (!pack) return null;

    return {
      userId,
      amount: pack.credits + (pack.bonus ?? 0),
      reason: `lemonsqueezy:${packId}`,
    };
  }
}