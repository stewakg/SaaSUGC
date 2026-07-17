# INFRASTRUCTURE.md — Build Plan & Progress Tracker

> **Project:** an AI video/image ad-generator SaaS for Balkan COD e-commerce (Serbian-first),
> a competitor to EcomAlati/VideoGen, plus a later "AI influencer UGC" feature
> (upload an influencer photo → they advertise the product).
>
> **This file is the single source of truth.** It is executed by **Cline** and reviewed by the planning agent.
> Cline: keep the checkboxes up to date as you go (`[ ]` todo · `[~]` in progress · `[x]` done).

---

## 0. How Cline should work (read first)

1. **Mock-first.** Build the entire app against **mock providers** and **local services**. Do NOT block waiting for
   API keys or external accounts. Anything that needs a real account is deferred to Phase **F5** (see `ACCOUNTS.md`).
2. **Never hardcode secrets.** All config comes from `.env` (validated with zod). If a key is missing, the code must
   fall back to the **mock** implementation, not crash.
3. **Work phase by phase, top to bottom.** Finish a phase's "Definition of Done" before moving on. Tick checkboxes.
4. **Small commits.** One coherent change per commit, conventional-commit messages.
5. **Ask only when genuinely blocked** (a real decision, not a signup). Otherwise keep building.
6. **Security lesson from the competitor:** EcomAlati ships a *shared password in the frontend* (`?pw=...`) that gates
   its backend — anyone can read it and run up their cloud bill. **We must NOT do this.** Every worker/API call is
   authenticated with the user's Supabase JWT, verified server-side. No shared secrets in the client. Ever.

---

## 1. Locked architecture

```
                 ┌─────────────────────────────┐
   Browser ────► │  apps/web  — Next.js (Vercel)│  UI, auth, light API, enqueues jobs
                 └──────────────┬──────────────┘
                                │ (job row + queue msg)
                 ┌──────────────▼──────────────┐
                 │ apps/worker — Node (Hetzner) │  orchestrates generation, updates job status
                 │   Docker container + Redis    │
                 └───┬───────┬───────┬───────────┘
                     │       │       │
        ┌────────────▼┐ ┌────▼────┐ ┌▼──────────────┐
        │ AI provider │ │ Render  │ │ Voice/Script  │
        │ kie.ai 1st  │ │ Remotion│ │ ElevenLabs    │
        │ fal.ai fbk  │ │ Lambda  │ │ Claude Opus   │
        └─────────────┘ └─────────┘ └───────────────┘
                 │              │
          ┌──────▼──────┐ ┌─────▼─────┐
          │  Supabase   │ │ R2 / S3   │  storage of rendered assets
          │ Postgres+Auth│ └───────────┘
          └─────────────┘
   Billing: abstract layer → mock (dev) → Lemon Squeezy (launch)
```

| Layer | Choice | Notes |
|---|---|---|
| Frontend/shell | **Next.js 15 (App Router) + TypeScript + Tailwind**, on **Vercel** | fresh scaffold; harvest patterns from Open-AI-UGC |
| DB + Auth | **Supabase** (Postgres + Auth) | local via Supabase CLI in dev, cloud in F5 |
| Worker | **Node.js + TypeScript**, **BullMQ + Redis**, **Docker** | runs on user's existing **Hetzner VPS** (shared w/ "aikutak"), own container |
| Render | **Remotion** → **AWS Lambda** in prod, **local render** in dev | render call abstracted |
| AI aggregator | **kie.ai primary + fal.ai fallback** | ⚠️ must quality/reliability test before finalizing routing |
| Voice | **ElevenLabs** (`eleven_v3`, params `stability`, `voice_id`, `speed`) | direct |
| Script | **Anthropic Claude (Opus)** | direct |
| Storage | **Cloudflare R2** (free egress) or S3 | abstracted |
| Billing | **abstract → mock → Lemon Squeezy** | wired last (needs USt-ID) |

**Reference repos (MIT) — copy modules, do NOT fork wholesale:**
- Open-AI-UGC (`github.com/Anil-matcha/Open-AI-UGC`) — credits/Stripe patterns, image-to-video reference for the influencer feature.
- OpenShorts (`github.com/mutonby/openshorts`) — fal.ai / ElevenLabs / Whisper caption-timing / URL-scrape integration code.

> Decision note: we chose **Supabase**, whereas Open-AI-UGC ships NextAuth+Prisma. So we **scaffold fresh** on
> Supabase and lift specific pieces from those repos, rather than forking either wholesale. Keep their MIT license
> notices for any copied code.

---

## 2. Repo structure (pnpm monorepo)

```
/apps/web            Next.js app (Vercel)         — UI, auth, API routes, enqueues jobs
/apps/worker         Node worker (Hetzner/Docker) — queue consumer, generation orchestration
/packages/core       shared TS: interfaces + mock impls (AIProvider, Renderer, Storage, Billing), zod env, types
/packages/db         Supabase schema, SQL migrations, generated types, typed client helpers
/remotion            Remotion project — ad compositions (templates, captions, transitions)
/infra               docker-compose (local Supabase + Redis), worker Dockerfile, deploy scripts
INFRASTRUCTURE.md    (this file)
ACCOUNTS.md          signup checklist + which env var each key maps to
```

---

## 3. Core domain model (DB — Supabase Postgres)

Tables (SQL migrations in `/packages/db/migrations`):

- **profiles** — `id (uuid, = auth.users.id)`, `email`, `balance int default 3` (free credits on signup), `created_at`.
- **credits_ledger** — `id`, `user_id`, `delta int` (+topup / −spend), `reason text`, `job_id nullable`, `created_at`.
  Balance is the sum of deltas (keep `profiles.balance` as a cached running total, updated in the same transaction).
- **jobs** — `id (uuid)`, `user_id`, `type` (`matrix|edit|image_ads|mix|quick_test|translate|enhance|remove_text|ai_video`),
  `status` (`queued|running|done|error`), `params jsonb`, `result jsonb`, `cost int`, `error text`, `created_at`, `updated_at`.
- **assets** — `id`, `job_id`, `user_id`, `kind` (`video|image|audio`), `storage_key`, `url`, `meta jsonb`, `created_at`.

**Credit rules (charge-on-success, like the competitor):**
- Job cost is computed up front; on enqueue, verify `balance >= cost` (reject otherwise).
- **Deduct credits only when the job succeeds**, atomically (ledger insert + balance update in one transaction).
- On failure, no charge.
- Credit costs (config in `packages/core/pricing.ts`, editable): `image_ads` 4, `matrix` 15, `edit` 18, `enhance` 9 (per successful output). Tune later.

**RLS:** users can read only their own `profiles/jobs/assets/ledger`. Worker uses the **service-role key** (server-only) to update jobs. Never expose service-role key to the browser.

---

## 4. Abstract interfaces (`/packages/core`) — the key to mock-first

Define these TS interfaces and provide a **Mock** + (later) **real** implementation for each. A factory reads `.env`
and returns the real impl if its key exists, else the mock.

```ts
// AI generation (images + video scenes). TTS and script are separate below.
interface AIProvider {
  generateImage(input: { prompt: string; refImages?: string[]; size?: string }): Promise<{ url: string }>;
  generateVideo(input: { prompt: string; refImage?: string; model?: string; durationSec?: number }): Promise<{ url: string }>;
}
// Router: try primary (kie.ai), on failure fall back to fal.ai. Mock returns placeholder asset URLs.

interface ScriptProvider {   // Claude Opus. Mock returns canned Serbian ad scripts.
  generateVariants(input: {
    product: string; benefits: string; tone: string; language: string;
    style: string; durations: number[]; count: number;
  }): Promise<{ variants: { angle: string; script: string; estDurationSec: number }[] }>;
}

interface VoiceProvider {    // ElevenLabs. Mock returns a silent/placeholder mp3.
  tts(input: { script: string; voiceId: string; model: string; stability: number; speed: number; language: string }):
    Promise<{ audioUrl: string }>;
  listVoices(): Promise<{ id: string; name: string; gender: string }[]>;
}

interface Renderer {         // Remotion. Mock returns a placeholder mp4. Real = local render (dev) / Lambda (prod).
  render(input: { composition: string; props: Record<string, unknown> }): Promise<{ videoUrl: string }>;
}

interface Storage {          // Local disk (dev) → R2/S3 (prod).
  upload(key: string, data: Buffer | Stream, contentType: string): Promise<{ url: string }>;
  getUrl(key: string): string;
}

interface Billing {          // Mock (instant credit in dev) → Lemon Squeezy (launch).
  listPacks(): Promise<{ id: string; credits: number; priceEUR: number }[]>;
  createCheckout(userId: string, packId: string): Promise<{ url: string }>;
  handleWebhook(req: Request): Promise<void>; // adds credits on paid event
}

interface Scraper {          // Product page → {title, price, images}. Can be REAL from day one (no paid account): fetch + cheerio. Mock as fallback.
  scrape(url: string): Promise<{ title: string; price?: string; images: string[]; description?: string }>;
}
```

---

## 5. Phases & tasks

### F0 — Foundation (no accounts) 🟢
- [x] Init pnpm monorepo + workspaces; TypeScript, ESLint, Prettier, `.editorconfig`.
- [x] `apps/web`: Next.js 15 App Router + Tailwind; base layout; dark theme matching EcomAlati (near-black bg, gradient tool cards).
- [x] `packages/core`: zod-validated env loader; the interfaces in §4 with **mock implementations**; `pricing.ts`.
- [x] `packages/db`: Supabase schema + migrations from §3; typed client helpers; seed script (a dev user with credits).
- [x] `infra/docker-compose.yml`: local **Supabase** (via `supabase` CLI) + **Redis**. `pnpm dev` boots web + worker + services.
- [ ] Commit `INFRASTRUCTURE.md` + `ACCOUNTS.md` into the repo.
- **DoD:** `pnpm dev` runs; local Supabase reachable; empty app shell loads; no secrets required. ✅ (verified: all packages typecheck; `next build` succeeds; worker boots in mock mode)

### F1 — Shell: auth + credits (mock) 🟢
- [ ] Supabase Auth: email/password sign-up + login (Google OAuth deferred to F5). Session via `@supabase/ssr`.
- [ ] App shell: left sidebar (Početna, Moje reklame), topbar with **credit balance** + account link.
- [ ] Landing page (public) in EcomAlati style: hero, tool cards (VideoGen), "3 free videos on signup", pricing placeholder.
- [ ] Credit system end-to-end on mock: signup grants 3 credits; **dev-only** "add credits" button; ledger + balance display.
- [ ] "Moje reklame" page: lists the user's `jobs`/`assets` (empty state for now).
- **DoD:** a user can sign up, log in, see balance, and the credit ledger updates correctly (all local).

### F2 — Job pipeline + mocks 🟢
- [ ] `apps/worker`: BullMQ queue + Redis; consumer that reads a `jobs` row, runs the (mock) pipeline, writes status/result.
- [ ] Web → `POST /api/jobs` enqueues (after balance check) → returns job id → client **polls** `GET /api/jobs/:id`.
- [ ] Wire mock providers through the worker so a fake job goes `queued → running → done` and deducts credits **on success only**.
- [ ] Reusable wizard UI shell (steps, progress bar, "Dalje/Nazad", cost estimate) matching EcomAlati's 3-step flow.
- **DoD:** submitting any job type produces a mock result, correct credit deduction, visible in "Moje reklame".

### F3 — First real tool: "AI slike" (mock AI, real scrape) 🟢
- [ ] `Scraper` **real** impl (fetch + cheerio) — product URL → title/price/images. Mock fallback if it fails.
- [ ] AI slike wizard: step 1 import product URL (auto-fill), step 2 settings (count, language, offer notes), generate.
- [ ] `image_ads` job: mock `AIProvider.generateImage` returns a placeholder ad image with Serbian text overlay concept.
- [ ] Result gallery + download; charge 4 credits/image on success.
- **DoD:** full AI-slike flow works locally end-to-end with a real scrape + mock image + correct billing.

### F4 — Matrix + Remotion compositions (the core; mock AI, REAL render) 🟢 ⭐
> This is the differentiator. Remotion renders **locally** — no accounts needed. Build the real ad templates here.
- [ ] `/remotion`: Remotion project. Build the **ad composition(s)** replicating EcomAlati's recipe:
  - Vertical 1080×1920, background clip layer, **karaoke captions** (font **Impact**, white words + 2px black stroke,
    active word highlight color, e.g. `#FFE000`), configurable via a `caption_style` prop of the form
    `cap:<font>:<anim>:<hexcolor>` (fonts: Impact/Montserrat; anims: smooth/pop/none), `caption_scale`.
  - Intro/outro transitions (fade / zoom-punch / flash+whoosh / color-pop), **Outro CTA card** ("NARUČI ODMAH · Plaćaš pouzećem"), SFX-on-CTA hook, background music track + volume mix.
- [ ] Caption timing: Whisper (run locally, e.g. `whisper.cpp` or faster-whisper) to get word-level timestamps → feed the composition. Mock timings if Whisper unavailable.
- [ ] `matrix` job pipeline (all mock AI, real assembly):
  `generateVariants` (mock Claude → canned scripts) → `tts` per variant (mock → placeholder audio) →
  Remotion **local render** per item → upload to local Storage → charge 15/video on success.
- [ ] Matrix settings screen (voice, script-style presets, caption style, count, music, SFX, transitions, outro) matching EcomAlati.
- **DoD:** Matrix produces **real MP4 files** locally (real captions/transitions/assembly, mock voice/script), correct billing, visible + downloadable.

### F5 — Go real (needs accounts — see `ACCOUNTS.md`) 🟡
> Do the one-time signup batch (`ACCOUNTS.md`), drop keys in `.env`, then swap mocks → real one by one.
- [ ] Supabase **cloud** project; point env at it; run migrations; enable Google OAuth.
- [ ] `ScriptProvider` real = **Claude Opus** (Anthropic SDK).
- [ ] `VoiceProvider` real = **ElevenLabs** (eleven_v3, stability/voice_id/speed); real `listVoices`.
- [ ] `AIProvider` real = **kie.ai** (primary) + **fal.ai** (fallback) with auto-retry; per-model routing config.
- [ ] ⚠️ **Quality + reliability test: kie.ai vs fal.ai** on the same prompts/models (Veo3, Kling, nano-banana/Flux). Record results; finalize routing based on them.
- [ ] `Storage` real = **Cloudflare R2** (or S3); serve via CDN, auto-expire old renders.
- [ ] `Renderer` real = **Remotion Lambda** (AWS, eu-central-1); deploy the Remotion bundle; site function.
- [ ] Remaining tools: `edit`, `mix`, `quick_test`, `translate` (foreign ad → Serbian, cloned voice), `enhance`, `remove_text`.
- **DoD:** each tool works with real providers behind the same interfaces; failures don't bill users; mocks still usable when keys absent.

### F6 — Billing + launch 🟡
- [ ] `Billing` real = **Lemon Squeezy** (Merchant of Record): credit packs, checkout, webhook → add credits. (Needs USt-IdNr — wire when available.)
- [ ] Deploy: **web → Vercel**, **worker → Hetzner** (Docker container next to "aikutak", + Redis), domain + DNS.
- [ ] Production hardening: per-user **rate limiting**, worker endpoints authenticated by verified Supabase JWT (NO shared secret), structured logging + error alerting, cost dashboards.
- [ ] Legal pages (Uslovi/Privatnost/Impressum under the Gewerbe holder), cookie/consent (privacy-first).
- **DoD:** a real user can sign up, buy credits, generate an ad, and download it in production.

### F7 (later) — AI influencer UGC 🔵
- [ ] `ai_video` job: upload influencer photo + product → image-to-video via kie.ai/fal.ai (Veo3/Kling accept a reference image). Reference Open-AI-UGC's image-to-video flow.
- **DoD:** deferred until the rest of the site is done (per project goal).

---

## 6. Environment variables (all optional in dev → fall back to mock)

See `ACCOUNTS.md` for where each key comes from. Web and worker each get their own `.env` (never commit real values;
commit `.env.example`).

```
# Supabase
SUPABASE_URL=              NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_ANON_KEY=         NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY= # worker only, server-only
# Redis (worker)
REDIS_URL=
# AI
ANTHROPIC_API_KEY=         KIE_API_KEY=        FAL_API_KEY=        ELEVENLABS_API_KEY=
# Storage
R2_ACCOUNT_ID= R2_ACCESS_KEY_ID= R2_SECRET_ACCESS_KEY= R2_BUCKET=   # or AWS_* for S3
# Remotion Lambda (prod)
REMOTION_AWS_ACCESS_KEY_ID= REMOTION_AWS_SECRET_ACCESS_KEY= REMOTION_LAMBDA_FUNCTION_NAME= REMOTION_SERVE_URL=
# Billing (F6)
LEMONSQUEEZY_API_KEY= LEMONSQUEEZY_STORE_ID= LEMONSQUEEZY_WEBHOOK_SECRET=
```

---

## 7. Conventions
- TypeScript everywhere (web + worker + core). Strict mode on.
- UI: Tailwind; component primitives (buttons, cards, toggles) in a small shared kit; dark-first, mobile-responsive.
- Serbian UI copy (with Bosanski/Hrvatski/Rumunski/English selectable, as the competitor has).
- No secrets in client bundles. Server-only keys stay in the worker / Next server routes.
- Every external call goes through an interface in `packages/core` — no direct provider calls scattered in features.
```
