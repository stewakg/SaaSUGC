# ACCOUNTS.md — Signup checklist (the "one signup evening")

> Do these in **one sitting** so Cline never stops mid-build waiting on you. Nothing here is needed until **Phase F5**
> — the whole app (F0–F4) builds on mocks/local first. Use a **dedicated project email** for all of these.
> **Billing accounts (Lemon Squeezy, later Stripe) must be under the Gewerbe holder (wife) — everything else can be the project email.**
>
> For each: create the account → grab the key → paste into the matching `.env` var (names from `INFRASTRUCTURE.md §6`).
> Claude/Cline will NOT create accounts, enter passwords, or do KYC for you — that part is yours.

| # | Service | What it's for | Free tier? | Keys → env var |
|---|---------|---------------|-----------|----------------|
| 1 | **Supabase** (supabase.com) | Cloud DB + Auth (prod) | Yes (generous) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (+ `NEXT_PUBLIC_*`) |
| 2 | **Anthropic** (console.anthropic.com) | Claude Opus — ad scripts | Pay-as-you-go | `ANTHROPIC_API_KEY` |
| 3 | **kie.ai** | AI video/image (primary aggregator) | Pay-as-you-go, cheap | `KIE_API_KEY` |
| 4 | **fal.ai** | AI video/image (fallback) | Pay-as-you-go | `FAL_API_KEY` |
| 5 | **ElevenLabs** (elevenlabs.io) | TTS / voice cloning | Free tier + paid | `ELEVENLABS_API_KEY` |
| 6 | **Cloudflare R2** (dash.cloudflare.com) | Video/image storage (free egress) | Yes | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` |
| 7 | **AWS** (aws.amazon.com) | Remotion Lambda render + IAM | Pay-per-use (cheap) | `REMOTION_AWS_ACCESS_KEY_ID`, `REMOTION_AWS_SECRET_ACCESS_KEY`, `REMOTION_LAMBDA_FUNCTION_NAME`, `REMOTION_SERVE_URL`, `REMOTION_AWS_REGION` |
| 8 | **Vercel** (vercel.com) | Deploy the Next.js web app | Yes (hobby) | (linked via CLI/GitHub, no manual key) |
| 9 | **GitHub** | Repo hosting / CI | Yes | (SSH / token) |
| 10 | **Domain** (registrar of choice) | Your brand domain + email | ~€10/yr | DNS to Vercel; email forwarding |
| 11 | **Lemon Squeezy** (lemonsqueezy.com) — *F6, needs USt-IdNr* | Billing (Merchant of Record) | Rev-share fees | `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET` |

**Also have ready (payout):** a **Wise** or **Payoneer** (or bank) account for Lemon Squeezy payouts — under the Gewerbe holder.

**Notes**
- #11 Lemon Squeezy: in addition to the three keys above, once the store + its products/variants exist you must also
  fill in `LEMONSQUEEZY_VARIANT_MAP` — a JSON object mapping each `CREDIT_PACKS` id (e.g. `pack_starter`) to its
  Lemon Squeezy variant id, e.g. `LEMONSQUEEZY_VARIANT_MAP={"pack_starter":"123456","pack_creator":"123457"}`.
  Without it the checkout route can't create a Lemon Squeezy checkout (the provider falls back to mock billing).
- #6 R2: in addition to the four keys above, you must also set `R2_PUBLIC_URL` — the public read URL for the bucket.
  Enable either a custom domain or the R2.dev subdomain from the Cloudflare dashboard (Settings → Public access),
  then paste it as `R2_PUBLIC_URL` (writing to a bucket doesn't tell you how to read it back). Same applies to
  `AWS_S3_PUBLIC_URL` if using plain S3 instead.
- #7 AWS: Remotion has a CLI that provisions the Lambda function + an IAM user with a scoped policy — follow Remotion's
  "Lambda setup" docs; create a **dedicated IAM user** (least privilege), not root keys.
  Unlike every other row here, `REMOTION_LAMBDA_FUNCTION_NAME` and `REMOTION_SERVE_URL` are NOT something you copy
  from a dashboard — they're the **output** of actually running `remotion lambda functions deploy` and
  `remotion lambda sites create` (from the `/remotion` directory) against this AWS account. The renderer client code
  is already written and waiting; an API key alone won't turn it on — this row needs that one-time deploy run first.
  `REMOTION_AWS_REGION` defaults to `eu-central-1` if left unset.
- #1 Supabase: dev can use **local** Supabase (CLI) with zero account. The cloud project is only for staging/prod.
- Keep every key out of git. Only `.env.example` (empty placeholders) is committed.
- ⚠️ Remotion **license**: free for individuals & companies ≤3 people; check current terms before commercial launch.
