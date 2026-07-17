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
| 7 | **AWS** (aws.amazon.com) | Remotion Lambda render + IAM | Pay-per-use (cheap) | `REMOTION_AWS_ACCESS_KEY_ID`, `REMOTION_AWS_SECRET_ACCESS_KEY`, `REMOTION_LAMBDA_FUNCTION_NAME`, `REMOTION_SERVE_URL` |
| 8 | **Vercel** (vercel.com) | Deploy the Next.js web app | Yes (hobby) | (linked via CLI/GitHub, no manual key) |
| 9 | **GitHub** | Repo hosting / CI | Yes | (SSH / token) |
| 10 | **Domain** (registrar of choice) | Your brand domain + email | ~€10/yr | DNS to Vercel; email forwarding |
| 11 | **Lemon Squeezy** (lemonsqueezy.com) — *F6, needs USt-IdNr* | Billing (Merchant of Record) | Rev-share fees | `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET` |

**Also have ready (payout):** a **Wise** or **Payoneer** (or bank) account for Lemon Squeezy payouts — under the Gewerbe holder.

**Notes**
- #7 AWS: Remotion has a CLI that provisions the Lambda function + an IAM user with a scoped policy — follow Remotion's
  "Lambda setup" docs; create a **dedicated IAM user** (least privilege), not root keys.
- #1 Supabase: dev can use **local** Supabase (CLI) with zero account. The cloud project is only for staging/prod.
- Keep every key out of git. Only `.env.example` (empty placeholders) is committed.
- ⚠️ Remotion **license**: free for individuals & companies ≤3 people; check current terms before commercial launch.
