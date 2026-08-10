# ACCOUNTS.md — Signup checklist (the "one signup evening")

> Do these in **one sitting** so Cline never stops mid-build waiting on you. Nothing here is needed until **Phase F5**
> — the whole app (F0–F4) builds on mocks/local first. Use a **dedicated project email** for all of these.
> **Whatever billing provider is eventually chosen must be under the Gewerbe holder (wife) — everything else can be the project email.**
>
> For each: create the account → grab the key → paste into the matching `.env` var (names from `INFRASTRUCTURE.md §6`).
> Claude/Cline will NOT create accounts, enter passwords, or do KYC for you — that part is yours.

| # | Service | What it's for | Free tier? | Keys → env var |
|---|---------|---------------|-----------|----------------|
| 1 | **Supabase** (supabase.com) | Cloud DB + Auth (prod) | Yes (generous) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (+ `NEXT_PUBLIC_*`) |
| 2 | **OpenRouter** (openrouter.ai) | Ad scripts (and later vision) — one key, many models | Pay-as-you-go | `OPENROUTER_API_KEY` (+ optional `OPENROUTER_SCRIPT_MODEL`) |
| 3 | **kie.ai** | AI video/image (primary aggregator) | Pay-as-you-go, cheap | `KIE_API_KEY` |
| 4 | **fal.ai** | AI video/image (fallback) | Pay-as-you-go | `FAL_API_KEY` |
| 5 | **ElevenLabs** (elevenlabs.io) | TTS / voice cloning | Free tier + paid | `ELEVENLABS_API_KEY` |
| 6 | **Cloudflare R2** (dash.cloudflare.com) | Video/image storage (free egress) | Yes | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` |
| 7 | **AWS** (aws.amazon.com) | Remotion Lambda render + IAM | Pay-per-use (cheap) | `REMOTION_AWS_ACCESS_KEY_ID`, `REMOTION_AWS_SECRET_ACCESS_KEY`, `REMOTION_LAMBDA_FUNCTION_NAME`, `REMOTION_SERVE_URL`, `REMOTION_AWS_REGION` |
| 8 | **Vercel** (vercel.com) | Deploy the Next.js web app | Yes (hobby) | (linked via CLI/GitHub, no manual key) |
| 9 | **GitHub** | Repo hosting / CI | Yes | (SSH / token) |
| 10 | **Domain** (registrar of choice) | Your brand domain + email | ~€10/yr | DNS to Vercel; email forwarding |
| ~~11~~ | ~~**Lemon Squeezy**~~ — **DROPPED 2026-08-10**, owner's decision: it will not be used. Code and env vars removed. | *no billing provider chosen* | — | *none* |

**Also have ready (payout):** a **Wise** or **Payoneer** (or bank) account for whatever payment provider replaces Lemon Squeezy — under the Gewerbe holder.

**Notes**
- #11 was Lemon Squeezy and is gone — there is **no signup to do for billing**. In dev, credits come from the
  dashboard's "Dodaj kredit" button, which hits `GET /api/dev/credits/add` (404s in production). Picking a real
  provider is still a launch blocker; see `INFRASTRUCTURE.md` F6.
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
