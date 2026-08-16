# BUSINESS.md — pricing, margins, and the money-side risks

Rescued from `handover.md` §8 before that file was deleted (2026-08-05). This is the
only place any of it is written down — it is analysis, not something derivable from the
code. The per-job credit numbers themselves live in `packages/core/src/pricing.ts`;
what's here is *why* they are what they are and where the money actually leaks.

## Pricing

- **€0.20/credit** at the "Starter" tier (€50/mo for 250 credits). Cheaper per credit at
  Pro/Max — standard SaaS bulk-discount shape.
- Per-job credit costs (`packages/core/src/pricing.ts`) **intentionally mirror the
  competitor's real observed numbers**, captured when EcomAlati/VideoGen was
  reverse-engineered early in the project — they are a deliberate reference point, not
  independently derived:

  | job | cr | job | cr | job | cr |
  |---|---|---|---|---|---|
  | `quick_test` | 2 | `enhance` | 9 | `matrix` | 15 |
  | `image_ads` | 4 | `mix` | 12 | `edit` | 18 |
  | `remove_text` | 6 | `translate` | 15 | `ai_video` | 25 |

## The margin insight (the important part)

**`matrix` never calls a paid AI video-generation API at all.** Confirmed from the
competitor's captured traffic: it reuses source clips across script/voice variants
rather than generating video. So its real cost is just cheap Claude + ElevenLabs +
render time → **~90%+ margin**, and it happens to be the differentiator we lead with.

**`edit` is the genuinely cost-sensitive tool** (and presumably any other that does real
AI video generation). Its margin is almost entirely set by the real €/call price of
Veo3-class generation via kie.ai — which is **still an estimate, never measured**. That
is the number that decides whether `edit` at 18 credits is profitable or a loss leader.

> Related but separate: the kie.ai vs fal.ai *quality/speed* benchmark is done
> (`tests/kie-vs-fal.md`, 2026-08-05 — kie ~2.3× faster, quality a wash). **Cost was NOT
> captured** — neither API returns a price field. Read each dashboard's usage log to get
> the real per-call €, which is what this section is waiting on.

## Two liabilities to keep an eye on

1. **Payment-processor fees are unknown, because there is no processor.** The history, since
   it keeps changing: Lemon Squeezy (~5% + €0.50 per transaction as a Merchant of Record)
   was the assumption, was deleted 2026-08-10, was restored 2026-08-13 as the launch
   choice — and on **2026-08-16 it is out again**. The operator will be an **LLC whose
   owner is Serbian and resident in Serbia**, and **Stripe** goes in once the LLC is
   confirmed. The Merchant-of-Record argument (it absorbs EU VAT for a Serbian entity) was
   the whole reason for Lemon Squeezy and does not survive the new structure.
   **Consequence for every margin figure below: they omit a processing fee that will
   exist, and Stripe's shape is different from a MoR's** — a bare gateway is cheaper per
   transaction but hands back the VAT/registration question rather than absorbing it. That
   is a question for whoever advises the LLC, not an assumption to re-guess here.
2. **"Neiskorišćeni krediti se prenose"** (unused credits roll over) is a **deferred
   liability**. A user who hoards credits for months and then burns them all on
   expensive-tool usage in one month can spike that month's COGS well above what was
   ever collected for those credits. Worth tracking once there is real usage data;
   harmless while volume is zero.
