# INFRASTRUCTURE.md — Build Plan & Progress Tracker

> **Project:** an AI video/image ad-generator SaaS for Balkan COD e-commerce (Serbian-first),
> a competitor to EcomAlati/VideoGen, plus a later "AI influencer UGC" feature
> (upload an influencer photo → they advertise the product).
>
> **This file is the single source of truth for BUILD phases (F0–F7).** It is executed by
> **Cline** and reviewed by the planning agent.
> Cline: keep the checkboxes up to date as you go (`[ ]` todo · `[~]` in progress · `[x]` done).
>
> **For the LAUNCH path, read `RELEASE_PLAN.md` instead** (added 2026-08-11). The two are
> different axes and were being conflated: this file tracks whether a FEATURE exists, that one
> tracks what has to be true before a stranger can pay money and receive a video. A phase can
> be 🟢 here and still be nowhere near shippable there — F5 is exactly that, with providers live
> but no hosting, no storage bucket and no payment provider.
>
> Decisions taken 2026-08-11/12 that change what "done" means for later phases, all with
> reasoning in `RELEASE_PLAN.md`: rendering moves to **Remotion Lambda**; hosting is a
> **second, dedicated VPS** (the existing box runs the `aikutak` pipelines and shares two
> cores); storage is **Cloudflare R2** with **30-day retention on everything**; ad length is
> **user-chosen at 10/15/30s** and is the ceiling on per-job cost; and the Matrix wizard now
> has **Simple and Advanced modes**.

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
   Billing: NONE — removed 2026-08-10, no provider chosen (dev credits via /api/dev/credits/add)
```

| Layer | Choice | Notes |
|---|---|---|
| Frontend/shell | **Next.js 15 (App Router) + TypeScript + Tailwind**, on **Vercel** | fresh scaffold; harvest patterns from Open-AI-UGC |
| DB + Auth | **Supabase** (Postgres + Auth) | local via Supabase CLI in dev, cloud in F5 |
| Worker | **Node.js + TypeScript**, **BullMQ + Redis**, **Docker** | its OWN Hetzner VPS `adgenwebsaas` — **not** shared with "aikutak" (corrected 2026-08-16, measured) |
| Render | **Remotion** → **AWS Lambda** in prod, **local render** in dev | render call abstracted |
| AI aggregator | **kie.ai primary + fal.ai fallback** | ⚠️ must quality/reliability test before finalizing routing |
| Voice | **ElevenLabs** (`eleven_v3`, params `stability`, `voice_id`, `speed`) | direct |
| Script | **Anthropic Claude (Opus)** | direct |
| Storage | **Cloudflare R2** (free egress) or S3 | abstracted |
| Billing | **Stripe, once the LLC is confirmed** | Lemon Squeezy is OUT as of 2026-08-16 (operator is an LLC, owner Serbian/in Serbia — the MoR-for-EU-VAT reason is gone). Its code still ships, unreached; nothing has been called with a real key of any kind |

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
/apps/worker         Node worker (Hetzner/Docker) — queue consumer, generation orchestration; Dockerfile lives here
/packages/core       shared TS: interfaces + mock impls (AIProvider, Renderer, Storage, Scraper), zod env, types
/packages/db         Supabase schema, SQL migrations, generated types, typed client helpers
/remotion            Remotion project — ad compositions (templates, captions, transitions)
/infra               docker-compose (local Redis; prod worker+Redis in docker-compose.prod.yml)
/scripts             small repo-wide Node scripts (currently just sync-env.mjs — see §6)
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

Every external capability sits behind a TS interface with a **Mock** and (from F5) a
**real** implementation. `createProviders()` in `packages/core/src/providers/factory.ts`
reads the validated env and returns the real impl when its key is present, else the mock
— which is why the whole app runs end-to-end with zero API keys.

**The interfaces themselves live in `packages/core/src/interfaces.ts`. Read them there,
not here.** This section used to carry a copy of the signatures; it had already drifted
(it was missing `parseWebhook`'s `orderId` — the field the billing webhook's idempotency
depends on — the whole `Logger` interface, and `readonly name` on every provider), and
the source file's doc-comments are richer than the copy ever was.

| Interface | Mock | Real (F5+) |
|---|---|---|
| `AIProvider` | placeholder image/video | kie.ai primary → fal.ai fallback (`ai.kiefal.ts`) |
| `ScriptProvider` | canned Serbian ad scripts | Claude (`script.claude.ts`) |
| `VoiceProvider` | silent placeholder mp3 | ElevenLabs (`voice.elevenlabs.ts`) |
| `Renderer` | placeholder mp4 | local Remotion (dev) / Lambda (prod) |
| `Storage` | local disk + `/api/storage` | R2/S3 (`storage.r2.ts`) |
| ~~`Billing`~~ | *interface deleted 2026-08-10* | dev credits: `GET /api/dev/credits/add` → `add_credits` RPC |
| `Scraper` | canned product | **real from day one** — fetch + cheerio, mock only as fallback |
| `Logger` | console | console (structured) |

---

## 5. Phases & tasks

### F0 — Foundation (no accounts) 🟢
- [x] Init pnpm monorepo + workspaces; TypeScript, ESLint, Prettier, `.editorconfig`.
- [x] `apps/web`: Next.js 15 App Router + Tailwind; base layout; dark theme matching EcomAlati (near-black bg, gradient tool cards).
- [x] `packages/core`: zod-validated env loader; the interfaces in §4 with **mock implementations**; `pricing.ts`.
- [x] `packages/db`: Supabase schema + migrations from §3; typed client helpers; seed script (a dev user with credits).
- [x] `infra/docker-compose.yml`: local **Supabase** (via `supabase` CLI) + **Redis**. `pnpm dev` boots web + worker + services.
- [x] Commit `INFRASTRUCTURE.md` + `ACCOUNTS.md` into the repo.
- **DoD:** `pnpm dev` runs; local Supabase reachable; empty app shell loads; no secrets required. ✅ (verified: all packages typecheck; `next build` succeeds; worker boots in mock mode)

### F1 — Shell: auth + credits (mock) 🟢
- [x] Supabase Auth: email/password sign-up + login (Google OAuth deferred to F5). Session via `@supabase/ssr`.
- [x] App shell: left sidebar (Početna, Moje reklame), topbar with **credit balance** + account link.
- [x] Landing page (public) in EcomAlati style: hero, tool cards (VideoGen), "3 free videos on signup", pricing placeholder.
- [x] Credit system end-to-end on mock: signup grants 3 credits; **dev-only** "add credits" button; ledger + balance display.
- [x] "Moje reklame" page: lists the user's `jobs`/`assets` (empty state for now).
- **DoD:** a user can sign up, log in, see balance, and the credit ledger updates correctly (all local). ✅ (code-complete: typecheck + `next build` pass; NOT yet run live end-to-end — no local Supabase/Docker in this environment, needs a real click-through pass)

### F2 — Job pipeline + mocks 🟢
- [x] `apps/worker`: BullMQ queue + Redis; consumer that reads a `jobs` row, runs the (mock) pipeline, writes status/result.
- [x] Web → `POST /api/jobs` enqueues (after balance check) → returns job id → client **polls** `GET /api/jobs/:id`.
- [x] Wire mock providers through the worker so a fake job goes `queued → running → done` and deducts credits **on success only**.
- [x] Reusable wizard UI shell (steps, progress bar, "Dalje/Nazad", cost estimate) matching EcomAlati's 3-step flow — proved out with a 2-step `quick_test` wizard; per-tool wizards land in F3+.
- **DoD:** submitting any job type produces a mock result, correct credit deduction, visible in "Moje reklame". ✅ **LIVE-VERIFIED 2026-07-18** against the real worker deployed to the Hetzner VPS (see the F6 deploy bullet): submitted a `quick_test` job from the local web app → `POST /api/jobs` enqueued it on the VPS's Redis (reached over an SSH tunnel) → the VPS worker container picked it up, logged `"job done"`, and the dashboard showed `Gotovo!` with `2 kredita · naplaćeno` — balance dropped exactly 2 (31→29), confirmed via `docker logs adgen-worker-prod` showing the matching `jobId`. First real end-to-end proof of `queued → running → done` + charge-on-success outside a typecheck.

### F3 — First real tool: "AI slike" (mock AI, real scrape) 🟢
- [x] `Scraper` **real** impl (fetch + cheerio) — product URL → title/price/images. Mock fallback if it fails.
- [x] AI slike wizard: step 1 import product URL (auto-fill), step 2 settings (count, language, offer notes), generate. (3rd step: generate + result gallery.)
- [x] `image_ads` job: mock `AIProvider.generateImage` returns a placeholder ad image with Serbian text overlay concept (now prompted from the scraped/edited product title + price + offer notes).
- [x] Result gallery + download; charge 4 credits/image on success.
- **DoD:** full AI-slike flow works locally end-to-end with a real scrape + mock image + correct billing. ✅ (code-complete: typecheck + `next build` pass; NOT yet run live — needs `supabase start` + Redis + a real product URL to verify the scrape/generate/charge loop)

### F4 — Matrix + Remotion compositions (the core; mock AI, REAL render) 🟢 ⭐
> This is the differentiator. Remotion renders **locally** — no accounts needed. Build the real ad templates here.

> **⚠️ CORRECTION 2026-08-09 — the competitor description below is WRONG.** The owner re-confirmed
> what EcomAlati's Matrix actually does: it takes **ONE** source clip, strips its audio, and returns
> N copies of that same video with different generated audio and captions. It does **not** build
> montages and does not cut between clips. The "multi-clip MONTAGE editor" attributed to the
> competitor below was a misreading of their UI in July.
>
> **What this means:** the montage engine built in M1–M2c is *not* competitor parity — it is
> something they do not have. One source clip, N differently-cut montages, each with its own script,
> is our product, not theirs. Two consequences: (1) the "Matrix" name is now not just legally theirs
> but **descriptively wrong for what we built** (see §8 naming); (2) the competitor's actual flow —
> one clip, swap audio + captions, N outputs — is a **simpler, cheaper separate tool** we may still
> want, alongside `edit` and `mix`. It is not a mode of this one.
>
> The rework record below stands as history — it describes what was built, which is correct. Only
> the claim about what the competitor does is wrong.
>
> **⚠️ ARCHITECTURE GAP found 2026-07-19, montage rework LARGELY LANDED 2026-07-20.** Owner walked
> through the real competitor Matrix UI: ~~the real Matrix is a **multi-clip MONTAGE editor**~~ —
> (1) user uploads MULTIPLE source clips OR imports them from a TikTok/YouTube/Instagram/any link;
> (2) product is SCRAPED in the wizard (not typed); (3) each of N creatives (count **5/10/15**) is a
> DIFFERENT montage of those source clips + a different AI script + voiceover + captions/music/SFX.
> The original F4 (checkboxes below) was a **single-clip caption-overlay renderer** — this is now
> being reworked into the real montage editor. **DONE IN CODE (CODE-COMPLETE, NOT yet
> runtime-verified) as of 2026-07-20 — see SESSION_LOG.md for the granular M/L-series ledger:**
> - M1 — product SCRAPE in the wizard (was typed by hand). ✅
> - M2a — multi-clip UPLOAD step. ✅
> - M2b/M2c — scene-detect every source into a shot pool → per-variant random MONTAGE via
>   `<Series>`; `MatrixAdProps` is now a `shots[]` list, no longer a single `backgroundVideoUrl`. ✅
>   (worker `runMatrixPipeline` downloads clips → `detectShots` → `buildMontage`; storage urls
>   absolutized so the worker/renderer can fetch them.)
> - L1/L2 — LINK IMPORT (TikTok/YT/IG) in the wizard via `POST /api/import-clip` (yt-dlp). ✅
> - Count 5/10/15 (competitor parity; MAX_JOB_COUNT raised, poll timeout count-scaled). ✅
>
> **✅ RUNTIME-VERIFIED 2026-08-05 — the montage chain actually renders.** yt-dlp binary
> fetched; a real YouTube link imported end-to-end; `runMatrixPipeline` produced 2 real
> variants (1080×1920, 18.05s + 23.06s, ~20 MB each, with audio streams) whose filmstrips
> were inspected frame-by-frame: real cuts between different source clips, Serbian
> word-highlight captions, intro transition, outro CTA card, and the two variants differ
> in BOTH script and shot selection. Three bugs had to be fixed first — see
> SESSION_LOG.md 2026-08-05; the biggest was that `/api/storage` required a session
> cookie the headless worker/renderer don't have, so every montage job had been
> hard-failing on a 401 since M2c landed.
>
> **✅ AUDIO LANDED 2026-08-05 (`eae4b4c`).** The voiceover is muxed into the render and
> captions run on ElevenLabs' REAL per-word alignment (`/with-timestamps` →
> `foldAlignmentIntoWords`), with `mockWordTimestamps` kept as the fallback for providers
> that report no alignment. Verified by MEASURING the output, not by seeing an audio
> stream exist: `volumedetect` mean −23.4 dB vs −91.0 dB (digital silence) before.
> **Cost change:** a matrix job now spends real ElevenLabs credits per variant — count=15
> means 15 TTS calls.
>
> **✅ SOUND PANEL LANDED 2026-08-05 (`e04f865`).** The "no music asset source" block was
> self-imposed — users upload their own track through the existing `/api/upload` path, so
> no licensed library is needed. Music + CTA SFX pickers, volume slider (default 25%,
> warns past 45%). Verified by measuring the video tail after the voiceover stops:
> −91.0 dB silence → −33.7 dB with music. **Fixed a latent bug while testing:** the CTA
> SFX had never played — its `<Audio>` sat inside `OutroCard` with no enclosing
> `<Sequence>`, so Remotion treated it as starting at frame 0 and a short clip was long
> past its end by the time the card appeared. Broken since F4, invisible because the prop
> was never set.
>
> **STILL NOT DONE:** a built-in music/SFX *library* (users must bring their own audio);
> generated music (`stable-audio`) remains an F7 nice-to-have. Owner confirmed:
> montage of user-supplied REAL clips, NOT AI-generating video from them. **Still not
> exercised:** the `/api/jobs → BullMQ → worker` hop through the UI (needs a local Redis;
> the pipeline itself is verified without it, and prod Redis already runs on the VPS).
- [x] `/remotion`: Remotion project. Built the **matrix-ad** composition:
  - Vertical 1080×1920, background clip layer, **karaoke captions** (white words + 2px black stroke, active word
    highlight color e.g. `#FFE000`), driven by `caption_style` = `cap:<font>:<anim>:<hexcolor>` (anims: smooth/pop/none).
    `Impact` maps to **Anton** (Google Font) — Impact is a proprietary system font not guaranteed present on a
    headless render host; the `cap:Impact:...` convention is kept so a real Impact .ttf can be swapped in later.
    `Montserrat` maps to real Montserrat.
  - Intro transition (fade / zoom-punch / flash-whoosh / color-pop), **Outro CTA card** ("NARUČI ODMAH · Plaćaš
    pouzećem"), SFX-on-CTA **hook** (`sfxUrl` prop, rendered if set — unset in mock mode, no real SFX asset yet).
    Background music: optional `musicUrl` prop, mixed in only if a real http(s) URL is supplied.
- [x] Caption timing: **mocked** (`mockWordTimestamps` in `packages/core/src/captions.ts`) — evenly distributes
  script words across an estimated speaking duration. Whisper integration deferred; the spec explicitly allows
  mocking timings when Whisper is unavailable, and no local Whisper binary exists in this environment.
- [x] `matrix` job pipeline (all mock AI, real assembly):
  `generateVariants` (mock Claude → canned scripts) → `tts` per variant (mock — tracked but not muxed, since
  MockVoiceProvider's placeholder isn't decodable audio) → **real local Remotion render** per variant via
  `LocalRemotionRenderer` (`packages/core/src/providers/renderer.local.ts`, bundles once per process, renders with
  `@remotion/renderer`) → uploads to local Storage, served via `apps/web`'s `GET /api/storage/[...path]` → charges
  15/video on success (existing charge-on-success path from F2).
- [x] Matrix settings screen (`/app/matrix`): voice, script tone preset, caption font/anim/color, count, transitions,
  outro text. Music/SFX shown as "uskoro" — no real audio asset source in mock mode.
- [x] ⭐ **Caption editor — user-controllable placement/size.** DONE 2026-08-05 (`18a004a`, `8cc7a94`): `captionX`/`captionY` props (frame fractions, clamped so nothing can leave the frame), sliders for position + size, three safe-zone presets, and a warning when dragged below 72% height. `captionScale` only needed a control — the renderer already honoured it. Render side runtime-verified; **the wizard controls are now click-tested too** (2026-08-10, click-test 4 @ `cb3bcfb`): font Impact→Montserrat, animation Pop→Smooth, preset "Centar" correctly dragging the vertical slider 46→50, size 130%, colour input present. Original spec kept below for reference:
- [ ] ~~Caption editor — user-controllable placement/size (position is the real gap).~~ Font, animation and
  active-word colour are already user-chosen in the wizard; `captionScale` already exists as a
  `MatrixAdProps` prop but has **no UI**; **position does not exist at all** and was hardcoded in
  `remotion/src/compositions/MatrixAd.tsx` until `304e44a`. To add:
  - `captionX` / `captionY` props (fractions of frame, e.g. `0.5` / `0.46`) replacing the hardcoded
    `justifyContent`/`paddingBottom`, plumbed through `MatrixAdProps` → worker `runMatrixPipeline` →
    the wizard's job `params` (same path `captionStyle` already takes).
  - A slider (or draggable handle over a preview frame) for vertical + horizontal position, plus one
    for `captionScale` — that last one is nearly free, the render side already honours it.
  - **Keep the safe-zone default.** Default must stay ~45–55% of frame height. The bottom ~250–400px of
    a 9:16 frame is covered by TikTok/Reels/Shorts chrome (username, description, music ticker) and the
    right ~150–200px by the action rail; the reliably visible band is the middle ~60% (y≈300–1500 of
    1920). The old bottom-anchored default sat at ~88% height, inside TikTok's own UI band. If the UI
    lets users drag freely, **warn or soft-clamp outside the safe zone** rather than silently allowing a
    placement that gets covered in-feed.
  - Nice-to-have once this lands: presets ("centar", "iznad sredine", "gornja trećina") so most users
    never touch the sliders.
- **DoD:** Matrix produces **real MP4 files** locally. ✅ **Verified live in this environment**: a standalone render
  (bundle → Chrome Headless Shell auto-download → render → local-disk upload) produced a real, valid 1080×1920 h264
  mp4 in ~9s (`ftyp isom / avc1` header confirmed). The full web→queue→worker→credits loop is still code-complete
  only — not run end-to-end (no local Supabase/Redis in this environment) — needs a live click-through pass.
  One fix made along the way: the mock placeholder video URL (`commondatastorage.googleapis.com/gtv-videos-bucket`)
  now 403s — replaced everywhere with `https://www.w3schools.com/html/mov_bbb.mp4`.

> **F0–F4 signed off by user 2026-07-18.** Code-complete, typechecked, linted, one real Remotion render verified
> live. The full web→queue→worker→Supabase click-through has NOT been run live (no local Supabase/Redis in Cline's
> sandbox) — non-blocking for now, worth doing opportunistically once F5 sets up real accounts anyway.
>
> **Update 2026-07-18 (same day, after real Supabase cloud was wired in F5):** the **web→Supabase** half of that
> click-through is now live-verified — real signup, the `handle_new_user()` trigger, `profiles`/`credits_ledger`,
> and the dashboard all confirmed working against the real cloud project (see the Supabase bullet under F5).
>
> **Update 2026-07-18 (later same day):** the **→queue→worker** half is now ALSO live-verified — rather than
> installing Docker Desktop locally just to test, the worker was deployed straight to its real production home (the
> Hetzner VPS, see F6) and a job was run through it over an SSH tunnel to the VPS's Redis. See the F2 DoD note for
> the result. The whole `web → Supabase → Redis → worker → Supabase → credits` loop is now confirmed working
> end-to-end, not just typechecked.

### F5 — Go real (needs accounts — see `ACCOUNTS.md`) 🟡
> Do the one-time signup batch (`ACCOUNTS.md`), drop keys in `.env`, then swap mocks → real one by one.
- [x] Supabase **cloud** project; point env at it; run migrations. — *Project created, all 3 migrations (0001–0003) run via the SQL Editor (no Supabase CLI available, so no `supabase link`/`db push` — ran the combined SQL by hand instead). `.env` points at the real project. **LIVE-VERIFIED 2026-07-18**: real signup → `handle_new_user()` trigger → `profiles`/`credits_ledger` rows → dashboard correctly shows a balance of 3 — the first real click-through of any part of this app against a live backend (see the note above F5). Google OAuth still NOT enabled — deferred, email/password is enough for now, not blocking.*
- [x] ⚠️ **`ScriptProvider` — was CORRECTED 2026-08-09, then actually fixed and RUN.** History worth keeping: this bullet was once ticked `[x]` while `script.claude.ts` gated on `ANTHROPIC_API_KEY` (`factory.ts:95`) for an Anthropic account **the owner has never had**, so the key was never going to arrive and every Matrix job ever produced used `MockScriptProvider`'s canned Serbian lines. The dashboard card promises "AI piše skriptu i čita je glasom": ElevenLabs really did read it aloud (measured 2026-08-05), but what it read was always pre-written. **The owner's actual LLM access is OpenRouter**, not Anthropic.
  - [x] Write an **OpenRouter** provider (OpenAI-compatible, one plain `fetch` client in the `scraper.real.ts` style). `OPENROUTER_API_KEY` in `env.ts` + `.env.example`; `factory.ts` gates on it instead. Retire `script.claude.ts`. — *Done: `packages/core/src/providers/script.openrouter.ts` (+ its own unit test), `factory.ts:100` gates on `OPENROUTER_API_KEY`, `script.claude.ts` deleted. **✅ VERIFIED live from the application 2026-08-10** (click-test 2, `SESSION_LOG.md` block for that date): `POST /api/generate-scripts → 200` in the Matrix wizard with voice Charlie (male) returned real Serbian copy — masculine forms throughout ("proveo", "našao"), cases holding, no ijekavica leakage, diacritics intact, and the price + offer typed into step 2 present in the text. Until that run it had only ever executed from the blind-eval harness, never from the app.*
  - [~] ⚠️ **Serbian copy quality is the gating question, and no published benchmark answers it.** Serbian LLM evals exist (Serbian SuperGLUE, `gordicaleksa/serbian-llm-eval`, BenchMAX) but measure NLU — QA, inference, coreference — not ad-copy quality. Run a **blind** eval instead: the repo's own `ScriptProvider` prompt, 3 real scraped products, 5 variants × 4 candidate models, shuffled and unlabelled, **with `MockScriptProvider`'s canned lines mixed in as a control**. Grade on the axes that actually break in Serbian: **case declension (padeži)** — the most common failure; **ekavica vs ijekavica leakage** — the app sells Srpski / Bosanski / Hrvatski as *separate* languages, so a model that slips "mlijeko" into Serbian output is unusable regardless of its benchmark scores; diacritics (č ć š ž đ); translationese word order; and register (COD ad copy is colloquial and sales-y, not literary). Cost of the whole eval: under $0.50. Expectation to falsify: the cheapest tier (Gemini 3.1 Flash Lite, $0.25/$1.50 per 1M) is where Serbian breaks first — and the price gap to a larger model is cents per job, so **do not pick on price before reading the output**. — ***GRADED 2026-08-10 by the owner: all 30 variants acceptable.*** *The expectation above is **falsified** — the cheapest tier did not visibly break Serbian, so the production default moved to `google/gemini-3.1-flash-lite` (`script.openrouter.ts`). **Read the caveat, it matters:** the eval carried 3 canned `MockScriptProvider` variants as a control precisely to catch a grading where everything passes, and those passed too. So the honest reading is "no model produced broken Serbian", NOT "the cheapest matches the best" — the test did not separate the models and could not, given a single collective verdict. If a bad script ever reaches production, that is the reason, and the fix is to re-run scoring each axis individually. Full verdict and reasoning appended to `tests/serbian-script-eval/2026-08-09-11-30-blind.md`.*
- [ ] ⚠️ **Source clips carry other platforms' burned-in UI — no pixel is ever inspected.** Reported by the owner 2026-08-09: rendered ads contain frames showing another creator's comment bubbles, usernames, and TikTok watermarks. These are **pixels in the file**, not overlays: TikTok burns reply-to-comment bubbles in at publish time, the standard download endpoint burns in the logo + @handle, and screen-recorded reposts carry the whole UI. No yt-dlp flag fixes any of that. Severity is legal, not cosmetic — that is a third party's handle and brand inside a paying customer's commercial ad. The pipeline is `yt-dlp → detectShots → buildMontage → render` with **no gate between "downloaded" and "15 credits spent"**.
  - [ ] Filter **shots, not clips** — a compilation may have 8 clean shots and 2 dirty. `scene-detect.ts` already splits them; sample 2 frames per shot, drop the dirty ones from the pool, and `buildMontage` never picks them. No architectural change.
  - [ ] Add an **import-time gate** so the user is warned while they can still pick a different clip.
  - [ ] Detection method: a **vision model**, not pixel heuristics. Only image understanding separates "a caption the creator added" from "someone else's comment" — an edge-density heuristic flags both, and Tesseract reads text without knowing whose it is. Same OpenRouter client as the scripts above; ~2 frames/shot, one call per clip, cached by `storage_key`. ~$0.009 per 3-clip job against €3.00–4.50 of revenue.
  - [ ] **The real cost is a labelled set of the owner's own clips** to measure hit rate — everything else here is a day's work. Per this repo's own rule, unmeasured detection is CODE-COMPLETE, not done.
- [ ] **NEW FEATURE — script review + per-stage billing.** Owner design 2026-08-09.
  - [x] ⚠️ **Serbian scripts come out in FEMININE gender by default** — "našla sam", "sigurna",
    "hidrirana". A male voice reading that is a broken ad. Serbian marks gender on past tense and
    adjectives; English does not, so no model gets this right unprompted. **Voice must therefore be
    chosen BEFORE scripts are generated**, and its gender passed into `generateVariants`.
    `listVoices()` already returns `gender` (ElevenLabs `labels.gender`; mock has it too), and the
    voice list is curated by us, so there is no `unknown` case to handle. — *Done and **✅ VERIFIED
    live 2026-08-10** (click-test 2). Gender is resolved server-side in
    `apps/web/src/app/api/generate-scripts/route.ts` from the voice id, never trusted from the
    client — the wizard had already dropped the field once, so this closes that class of bug. A male
    voice produced masculine copy on the first real run.*
  - [x] Generate ~5 script candidates, let the user read, edit and keep the ones worth using; the
    kept set feeds the N videos. **Do NOT build this as a two-phase job** (new `jobs` status +
    worker state machine + polling). Generate in the wizard through a light route before the job is
    submitted and pass the approved scripts in `params`; the worker uses `params.scripts` when
    present and only calls the provider otherwise. Needs its own rate limit — regeneration would
    otherwise be free and unlimited. — *Built as specified, no two-phase job: `POST
    /api/generate-scripts` (rate-limited `scripts:<uid>` 6/60, tighter than `/api/jobs` because it
    spends provider money on every click) plus the review UI in the Matrix wizard — candidates
    append rather than replace, `FREE_SCRIPTS = 5` on the house up to `MAX_SCRIPTS = 10`, each one
    readable, editable and keepable. The kept set feeds the N videos through `params.scripts`.
    ✅ Click-tested 2026-08-10.*
  - [x] Caption timing needs no work here: ElevenLabs returns alignment for the text actually
    spoken, so `foldAlignmentIntoWords` handles an edited script unchanged. — *Confirmed; no code
    was needed.*
  - [x] ⚠️ **`charge_credits` was NOT safe to call twice for one job — migration 0005.** Its old
    rollback path (`0001_init_schema.sql:186`) deleted by `user_id + job_id + reason` rather than by
    the row it had just inserted, with `reason` hardcoded to `'job_spend'`. Harmless while each job
    charges exactly once; under per-stage billing a second call failing on insufficient balance
    would have **deleted the first, legitimately charged row** — silently refunding the user for
    scripts because they ran out of credits for audio. Fixed in
    `supabase/migrations/0005_charge_credits_per_stage.sql`: `insert … returning id` then `delete
    where id = …`, plus a `p_reason` parameter naming the stage, with the old 3-argument signature
    dropped explicitly (a defaulted parameter creates an overload, not a replacement). — ***APPLIED
    and VERIFIED against the live database 2026-08-09*** *— `charge_credits` reports four parameters
    (`p_amount, p_job_id, p_reason, p_user_id`), read out of PostgREST's OpenAPI spec rather than by
    calling the function, which would have deducted real credits. **This is no longer a blocker for
    anything.***
  - [ ] Billing model: pay for what was produced. Scripts ~1 credit, audio ~2, video on creation;
    stop halfway and you pay only that far. Prices are placeholders, to be tuned. — *Not started,
    and **deliberately parked 2026-08-10** — the owner's call: pricing a product that is still being
    built is premature. `/api/generate-scripts` therefore charges nothing today, while the wizard's
    button already offers "prvih 5 besplatno, pa 1 kredit". Two questions have to be answered before
    any code, and both are business decisions, not technical ones: (1) **how the server enforces the
    free allowance** — it cannot trust the client's `scripts.length`, since reloading the wizard
    resets that counter and makes every script free forever, and there is no `job_id` to count
    against at script time; (2) **whether a script's credit adds to the video price or comes out of
    it** — the per-stage model above describes splitting one total, but `JOB_COST.matrix` is
    currently a full 15 on top. ~~Also note the stale generated type: `charge_credits` is still
    declared with 3 arguments.~~ **Corrected 2026-08-16:** the generated type is current —
    `packages/db/src/generated/database.types.ts:165` declares all four args with `p_reason?`, so
    nothing blocks a caller from passing it.*
  - [ ] **Voice cloning** — user clones a voice and picks its gender explicitly (the cloned voice
    carries no `labels.gender`). Later; recorded so the gender plumbing above is designed with it
    in mind rather than retrofitted.
- [ ] **NEW FEATURE — clip suggestions ("ubaci sliku → predložimo snimke").** Owner decision 2026-08-09: source is **platform search (YouTube / TikTok / IG)**, not stock libraries and not AI generation. We only *suggest*; the user watches each candidate and decides, so this is not an auto-insert path.
  - [ ] **v1 = YouTube only.** yt-dlp supports search natively (`ytsearch10:"…"` + `--flat-playlist` returns title/duration/thumbnail/url as metadata only — no download, so previews are near-free). **TikTok and Instagram have no yt-dlp search extractor** — URL extraction only. They need a third-party API and are a **separate decision, after v1**.
  - [ ] **Search-by-image is the actual ask** (upload a product photo → get videos *of that product*), not query-from-scraped-title. An earlier note here claimed this was impossible and routed through a vision-model description — **that was wrong, corrected same day.** The working chain is two hops: **reverse image search identifies the exact product**, then its real name/model drives the platform search. Do NOT substitute a vision-model caption for hop 1 — a caption yields "black massage gun", reverse image search yields the actual listing title.
    - **Why this fits COD specifically:** dropshipping listings reuse the *supplier's* stock photos across hundreds of resellers, so the query image is already indexed all over the web. Reverse image search hits it precisely — the property that makes this feature viable here would not hold for original photography.
    - Options for hop 1: **Google Cloud Vision `WEB_DETECTION`** (official Google API — full/partial matching images, the pages carrying them, web entities; no product cards) or **Google Lens via a scraper API** (SerpApi / ScrapeBadger / Zenserp / Apify — returns product name, price, merchant; more precise for identification, third-party). Zenserp is ~$0.01/search ($49 / 5,000, 50/mo free); other vendors' pricing unverified.
  - [ ] Needs its own rate limit (stricter than `import:<uid>` 10/60) plus a per-query cache — repeated yt-dlp searches from one VPS IP get throttled.
  - [ ] Pricing: search itself costs almost nothing to run (metadata + sub-cent vision calls), so any credit charge is **positioning, not cost recovery**. If charged, keep the base price on the tool card and surface the surcharge inside the wizard's existing cost estimate — a "15–60 kredita" range on the card is a worse offer than a flat number.
- [ ] **Imported clips can arrive at 360p.** The 2026-08-05 verified import pulled format 18 (640×360), which is then upscaled to 1080×1920. If output looks soft, this is why — independent of the UI-overlay problem above.
- [x] `VoiceProvider` real = **ElevenLabs** (eleven_v3 default model, stability/voice_id/speed → `voice_settings`, persists the MP3 through `Storage`); real `listVoices`. — *code-complete + typechecked. **✅ VERIFIED live 2026-07-19**: called for real via a throwaway script driving `createProviders().voice` — `listVoices()` returned 58 real voices from the account; `tts()` with a Serbian sentence succeeded in 1.5s, wrote a genuine ID3-tagged MP3 (71KB, ~4-5s audio) through `MockStorage` to `<repo root>/storage/voice/`. The `speed` field in `voice_settings` was re-verified against ElevenLabs' current API docs (WebFetch, 2026-07-19) beforehand — confirmed correct (range ~0.7-1.2, default 1.0), not just assumed.*
- [x] `AIProvider` real = **kie.ai** (primary) + **fal.ai** (fallback) with auto-retry (`KieAIFalRouter`, `packages/core/src/providers/ai.kiefal.ts`). — *`generateImage`: kie.ai's generic Jobs API (`nano-banana-2`) → fal.ai's queue API (`fal-ai/nano-banana-2`) fallback; aspect_ratio derived from the "WxH" size string (square product photos vs vertical ads both real callers). `generateVideo`: kie.ai's DEDICATED Veo endpoints (`/api/v1/veo/generate` — verified a genuinely different response shape than the image Jobs API: `successFlag` not `state`, `resultUrls` a JSON-string not nested under `resultJson`) → fal.ai `veo3.1/image-to-video` fallback; unexercised today (`ai_video` is F7). Per-model routing config is the fixed default-model-per-provider shown above, not a configurable matrix — deferred until F7 or the benchmark below needs it. All contracts cross-verified against kie.ai's and fal.ai's published docs (2026-07), not guessed. **✅ VERIFIED live 2026-07-19**: `generateImage` called for real against BOTH providers independently (kie.ai-only and fal.ai-only, same prompt) via a throwaway script driving the actual `getAI()`/`KieAIFalRouter` code path — both succeeded on the first try (kie.ai 13.9s, fal.ai 14.2s), output images visually confirmed photorealistic and prompt-accurate. See `tests/kie-vs-fal.md` for the images/details. `generateVideo` (Veo path, both providers) is still CODE-COMPLETE / not live-tested — no `ai_video` job is wired yet (F7).*
- [x] ⚠️ **Quality + reliability test: kie.ai vs fal.ai — IMAGE side DONE 2026-08-05.** *This bullet's old note ("kie.ai side still `_pending_` in every row") described the 2026-07-17 browser round and was left stale for four days — corrected 2026-08-09. The real benchmark ran on 08-05 through the shipped `KieAIFalRouter`, each provider in an isolated router so nothing could silently fall back: 3 prompts × 2 providers, **6/6 succeeded first try**, kie.ai ~2.3× faster at the median (12.0s vs 27.8s) with its worst case beating fal.ai's best. Quality a wash, both production-grade, both rendered correct Serbian diacritics. **Routing conclusion: kie.ai primary, fal.ai fallback — now backed by measurement, not the cost assumption alone.** Details in `tests/kie-vs-fal.md`.*
- [ ] ⚠️ **Quality + reliability test: VIDEO side — still not started.** `generateVideo` (kie Veo3 / fal Veo 3.1, Kling) has **never been called live**: no wired job calls it (`ai_video` is F7). Known blocker from the 07-17 round: fal deprecated Veo3 i2v and moved to Veo 3.1, so fal-vs-kie on "Veo3" is not a version match; and fal's Kling playground hangs under browser automation, so this must go through the **API**, not the web UI.
- [ ] **Per-call cost — public list prices captured 2026-08-09, dashboards still unread.** Neither API returns a price field, so these come from the providers' own pages, not from our usage: **nano-banana-2 — fal.ai $0.08/image base** (2K ×1.5, 4K ×2, +$0.015 if web search is used) vs **kie.ai from $0.04**, i.e. kie is roughly half for the identical model. At `image_ads` = 4 credits and 0.20–0.30 €/credit, that is cents of cost against ~0.80–1.20 € of revenue per image. Still worth reading both dashboards' usage logs to confirm what we are actually billed. **Supply-risk note:** kie.ai's pricing is widely *speculated* to rest on resold subsidised subscriptions, and it is our **primary** route — treat as an unverified rumour, but it argues for keeping the fal.ai fallback path exercised rather than dormant.
- [ ] **Pick providers for `enhance` and `remove_text`** (still none chosen — see the wizards bullet below). Add **GPT Image 2** to that evaluation: it is a multimodal *editing* model, which is exactly what both tools do, and is available on kie.ai (~$0.03/1K, $0.05/2K, $0.08/4K per kie's page). Evaluate alongside the fal.ai candidates already noted (Real-ESRGAN/AuraSR upscalers, Flux Fill/LaMa inpainting) in one round rather than a separate signup batch.
- [x] `Storage` real = **Cloudflare R2** (or S3), same `S3CompatibleStorage` class for both (R2 via `endpoint` override); serve via `R2_PUBLIC_URL`/`AWS_S3_PUBLIC_URL`. — *~~code-complete + typechecked, NEVER live-tested (no bucket exists yet)~~ — **stale since 2026-08-13 and corrected 2026-08-17: the bucket exists and this code is LIVE.** `adgenwebsaas`, EU jurisdiction, real renders and real uploads have gone through it, and it has been private since 2026-08-16. The one code fix the real bucket forced is worth keeping: an EU bucket's S3 endpoint is `<account>.eu.r2.cloudflarestorage.com`, and the derived default form fails every request with "bucket not found" (`R2_ENDPOINT`, `7c7a1fd`). Auto-expire old renders still TODO — the deletion itself is a bucket lifecycle rule rather than code, and as of 2026-08-17 `Storage.delete` exists for the cases a rule cannot cover.*
- [x] ✅ **DECIDED AND IMPLEMENTED 2026-08-16: presigned urls, served through our own route** (`26a0f34`).
  `S3CompatibleStorage.upload` now returns `/api/storage/<key>` — the same shape MockStorage has
  always returned — and that route authorises the caller exactly as before, then 302-redirects to a
  `signedDownloadUrl` with an hour's life. The worker/renderer/fal cannot use the route (no session
  cookie), so `resolveStorageUrl` signs keys directly when the active storage can, which is also
  what removed the need for any auth bypass in production. ~~**Two things are still owed and neither
  is code:** the R2 bucket must actually be made PRIVATE (until then the old public urls keep
  working), and `assets` rows written before 2026-08-16 still hold absolute public urls — they will
  break when the bucket is closed unless they are rewritten to the `/api/storage/<key>` form.~~
  **Both were done the same day, 2026-08-16.** The owner disabled the bucket's Public Development
  URL — verified from the VPS, where `$R2_PUBLIC_URL/<anything>` answers **401** where it answered
  404 an hour earlier — and migration `0008_asset_urls_through_route.sql` rewrote the pre-existing
  rows in BOTH `assets.url` and `jobs.result`, the second being what every customer screen actually
  renders. Order mattered and was followed: deploy, then 0008, then close the bucket.
  **Added 2026-08-17:** `Storage` also has `delete(key)` now — idempotent, implemented by both
  providers, and called by nothing. It exists so that retention and GDPR erasure stop being blocked
  on a missing capability; the policy question of who may call it is still open (`TODO.md` §5).
  The original text of this item, kept because it is what the fix was measured against:
- [ ] ~~⚠️ **DECIDE BEFORE LAUNCH: public R2 bucket vs presigned urls.**~~ `S3CompatibleStorage.getUrl` returns a plain `${publicBaseUrl}/${key}` — an unauthenticated, permanent url. Keys are guessable (`uploads/<uid>/imported-<timestamp>.mp4`, sequential render suffixes), which reintroduces **exactly** the cross-user asset exposure that `/api/storage`'s auth check was written to prevent (see that route's own doc-comment). Presigned, short-lived GET urls are the real answer; they also keep the worker/renderer working without any auth bypass. Raised 2026-08-05 while fixing the dev-side 401 — not urgent while R2 is unwired, but it is a launch blocker, not a nice-to-have.
- [x] `Renderer` real = **Remotion Lambda** (`renderMediaOnLambda` + `getRenderProgress` polling via `@remotion/lambda-client`, pinned to the same version as `@remotion/bundler`/`@remotion/renderer`). — *client code complete + typechecked, but UNLIKE Script/Voice/Storage above, this one genuinely cannot go live on a key alone: it also needs a one-time `remotion lambda functions deploy` + `remotion lambda sites create` run against a real AWS account (see `ACCOUNTS.md` #7) — `REMOTION_LAMBDA_FUNCTION_NAME`/`REMOTION_SERVE_URL` are the OUTPUT of that deploy, not values you invent. Not live-tested; no function is deployed yet.*
- [x] Remaining tool **wizards**: `edit`, `mix`, `translate` (foreign ad → Serbian, cloned voice), `enhance`, `remove_text` (`quick_test` already existed from F2). — *wizard UI + job pipeline wiring code-complete + typechecked + built; all five run the existing mock-first pipeline end-to-end (upload → enqueue → generic worker branch → mock renderer result → charge-on-success), same as `image_ads`/`matrix` before their real providers landed. New this round: `POST /api/upload` (auth'd, persists a user file through the active `Storage` provider under `uploads/<user id>/…`) since these five start from an uploaded file, not a scraped URL or a script — `mix` uploads multiple; the others one. `/api/storage/[...path]` gained an ownership fast-path for `uploads/<own user id>/…` paths (no `assets` row exists for them — `assets.job_id` is `NOT NULL` and no job exists yet at upload time). **Known gap, not yet solved:** `enhance`/`remove_text` accept an image or video, but the generic worker pipeline branch always returns a video result (`Renderer` is inherently video-shaped) — harmless today since the mock result isn't actually derived from the source, but real per-tool pipelines will need to branch on source kind, likely routing image inputs through `AIProvider` instead. NOT live-tested against real providers — same status as everything else in this phase. **No provider is chosen yet for either tool** (`ACCOUNTS.md` has no dedicated row) — fal.ai hosts candidate models for both: Real-ESRGAN/AuraSR-style upscalers for `enhance`, Flux Fill/LaMa-style inpainting for `remove_text` (watermark/caption removal). Evaluate both alongside the kie.ai/fal.ai Veo3/Kling benchmark rather than as a separate signup round.*
- **DoD:** each tool works with real providers behind the same interfaces; failures don't bill users; mocks still usable when keys absent.

### F6 — Billing + launch 🟡
> **STALE BULLET BELOW — corrected 2026-08-16.** Lemon Squeezy was RESTORED on 2026-08-13 (owner
> ⚠️ **AND SUPERSEDED AGAIN 2026-08-16: Lemon Squeezy is out.** The operator will be an LLC whose
> owner is Serbian and resident in Serbia, the German angle is gone, and Stripe goes in once the
> LLC is confirmed (`TODO.md` §2). The code below still exists and nothing has been deleted; only
> the "launch provider" decision changed. The 2026-08-13 note, kept for the history:
> chose it as the launch provider: a merchant of record carries the EU VAT a Serbian entity
> otherwise would). `billing.lemonsqueezy.ts`, both billing routes, the four `LEMONSQUEEZY_*` env
> vars and 24 tests all exist again, hardened over the deleted version (the webhook cross-checks the
> variant actually PAID against `LEMONSQUEEZY_VARIANT_MAP`, production refuses a mock provider, and
> as of `06d5572` the 500 no longer echoes the Postgres message). It has still NEVER been called
> with a real key, and `order_refunded` is still unhandled — see `CLAUDE.md` and RELEASE_PLAN L3.6.
- [ ] ⚠️ **No payment provider. Lemon Squeezy was DELETED 2026-08-10** on the owner's decision ("neće se koristiti"). It had been code-complete and typechecked but was never called with a real key, so nothing working was lost. Removed wholesale rather than left dormant: `billing.lemonsqueezy.ts`, `POST /api/billing/checkout`, `POST /api/billing/webhook`, the `Billing` interface, `MockBilling`, its factory switch, and the four `LEMONSQUEEZY_*` env vars. The abstraction went too — one mock implementation with no caller is not an abstraction, and the next provider's webhook shape will not be Lemon Squeezy's. **Kept:** `CREDIT_PACKS` (still drives the dashboard cards), migration 0004's `add_credits_idempotent` (harmless, and any future provider wants it), and `GET /api/dev/credits/add`, which the "Dodaj kredit" button now hits directly — it 404s under `NODE_ENV=production`, so it cannot leak free credits.
  - [ ] **Choosing a replacement is a launch blocker** and has not been started. Until then there is no way for a real user to buy credits.
- [~] Deploy: **web → Vercel** (still manual/TODO — no Vercel account exists yet), **worker → Hetzner** (Docker container next to "aikutak", + Redis) — *`apps/worker/Dockerfile` + `infra/docker-compose.prod.yml` written, isolated container/volume names (compose project `adgen`) so it can't collide with "aikutak" on the same box. **LIVE-VERIFIED 2026-07-18**: built and deployed for real on the VPS (`/opt/adgen-saas`), `adgen-worker-prod` + `adgen-redis-prod` running stably, and a real job was processed end-to-end (see the F2 DoD note). Two real bugs surfaced only by this live deploy and fixed: (1) `packages/core/src/env.ts` — `z.string().url().optional()` rejects an empty string, but `.env`/Docker `--env-file` write unset optional keys as `KEY=` (empty string, not absent) — added an `optionalUrl()` preprocessor treating `''` as `undefined`; (2) `packages/core/src/queue.ts` — same failure class, `??` doesn't fall through on `''`, so a blank `REDIS_URL=` tried to connect to Redis at the literal empty string instead of defaulting — fixed with explicit `|| undefined` before the `??` chain; (3) `apps/worker/Dockerfile` — the Playwright `v1.48.0-jammy` base image ships Node 20.18.0, but `@supabase/supabase-js` needs Node 22+'s native `WebSocket` global, causing a crash loop until a NodeSource Node 22 install was added right after the `FROM` line. The Playwright base image tag itself needed no change. Domain + DNS still TODO (needs a registrar decision + money — your call, not autonomous).*
  ⚠️ **If web does end up on Vercel:** `POST /api/upload` (F5 tool wizards) proxies the file through the server, but
  Vercel Serverless Functions have a platform-level request-body limit (historically ~4.5MB) that isn't
  configurable from Next.js App Router code — a real video upload would 413 there before the route's own size check
  even runs. Fine on a self-hosted Node server (no such limit); if Vercel is the final call, the real fix is a
  presigned-URL upload straight from the browser to Storage, not a retrofit of this route.
- [x] Production hardening: per-user **rate limiting** (Redis-backed fixed-window, fails open if Redis is down — `apps/web/src/lib/rate-limit.ts`, applied to `/api/jobs`, `/api/upload`, `/api/billing/checkout`), **structured logging** (`consoleLogger` now emits one JSON line per entry instead of a human-oriented string — moved out of `providers/mocks.ts` since it isn't a mock with a "real" counterpart, into its own `packages/core/src/logger.ts`; wired into the worker, replacing every ad-hoc `console.*` call). — *code-complete + typechecked; rate limiter's Redis behavior not live-tested (no Redis running in this environment) but the fail-open path means a Redis outage degrades gracefully either way.* **Not done / reconsidered:** "worker endpoints authenticated by verified Supabase JWT" — moot as originally worded: the worker has no HTTP endpoints of its own (BullMQ pulls jobs via Redis; job status is read through `/api/jobs/:id` in apps/web, which is already Supabase-session-authenticated) — there's no shared-secret-shaped surface to close here, unlike the competitor's `?pw=` pattern this rule was written to avoid. Error alerting (e.g. Sentry) and cost dashboards still open — both need a real account/service to be worth wiring (same class of blocker as Supabase cloud).
- [~] Legal pages (Uslovi/Privatnost/Impressum), cookie/consent (privacy-first). — ⚠️ **2026-08-16: written for a structure that no longer applies.** They assumed a German Gewerbe holder; the operator will be an LLC with a Serbian owner resident in Serbia. `/impressum` is built around **§5 DDG**, a German statute, and `/uslovi` names a governing law and forum — both need re-scoping by whoever advises the LLC before they mean anything. GDPR is NOT dropped by the move: it follows the customers, and the customers are in the EU. — **Corrected 2026-08-16: the three pages EXIST** (`apps/web/src/app/uslovi`, `privatnost`, `impressum`) with substantive, provider-accurate content — the privacy page's processor list is assembled from the providers actually wired. What stands is the caveat, not the absence: this was written by an LLM and has had no legal review, and there is still no cookie/consent flow and no user-facing GDPR export/delete. Original note: *Deliberately NOT drafted: these carry real legal weight (GDPR-relevant, cross-border DE/RS/EU) and fabricating placeholder legal text risks the user mistaking it for real coverage. Needs your Steuerberater/a real legal review, not generated boilerplate.*
- **DoD:** a real user can sign up, buy credits, generate an ad, and download it in production.

### F7 (later) — AI influencer UGC 🔵
- [ ] `ai_video` job: upload influencer photo + product → image-to-video via kie.ai/fal.ai (Veo3/Kling accept a reference image). Reference Open-AI-UGC's image-to-video flow.
- [ ] ⭐ **Lip-sync / talking-avatar model** (candidates as of 2026-07-18, verify fal.ai's live catalog before
      committing — names/availability shift: Sync.so lipsync, Hedra/Character-3, OmniHuman, LatentSync) — takes the
      already-generated ElevenLabs audio + the influencer photo/video and syncs mouth movement to the speech. This is
      the piece that actually makes F7 read as "an influencer talking", not just a generic product video with a
      voiceover layered on top — without it, F7 doesn't really deliver on its own premise. Language question
      (Serbian/Croatian/Bosnian): lip-sync operates on the audio waveform (phoneme→viseme), not on text, so it should
      be largely language-agnostic — but this is reasoning, not a live test. Test with a real Serbian ElevenLabs clip
      the first time any candidate model is evaluated.
- [ ] **Face-consistent generation** (candidates: InstantID, IP-Adapter FaceID, PhotoMaker) — keeps the same
      AI-influencer face recognizable across multiple separate ad generations, for a recurring "virtual spokesperson"
      instead of a fresh face every time.
- [ ] (Nice-to-have, not F7-blocking) **Virtual try-on** (candidates: IDM-VTON, CatVTON) — shows the product
      "worn"/"in hand" of a virtual model without a real product photoshoot. Most relevant to apparel/accessories COD
      listings specifically.
- [ ] (Nice-to-have) **Flux Kontext**-style contextual image editing ("place this product in this scene") as a
      cheaper alternative to full regeneration for `image_ads`.
- [ ] (Nice-to-have) Audio-gen model (e.g. `stable-audio` on fal.ai) for generated background music/SFX per ad,
      instead of the fixed music library the real `matrix-job` pipeline currently draws from (see the EcomAlati
      teardown notes — `music_id` picked from `/api/music-library`).
- **DoD:** deferred until the rest of the site is done (per project goal).

---

## 6. Environment variables (all optional in dev → fall back to mock)

See `ACCOUNTS.md` for where each key comes from.

**Single source of truth: the root `.env`** (gitignored, never `.env.example`). Edit only that file — `apps/web/.env`
and `apps/worker/.env` are generated FROM it by `scripts/sync-env.mjs`, which runs automatically before `pnpm dev`
(a `predev` hook) or manually via `pnpm env:sync`. This exists because neither app reads a root-level `.env` on its
own: Next.js only loads `.env` from `apps/web/` itself, and the worker only loads what `tsx --env-file=.env` points
at (added to `apps/worker/package.json`'s `dev`/`start` scripts — the worker did NOT auto-load any `.env` before
this, a real gap since without it `SUPABASE_SERVICE_ROLE_KEY` etc. would silently never reach `process.env`). Don't
hand-edit the per-app `.env` files — the next sync overwrites them.

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
R2_ACCOUNT_ID= R2_ACCESS_KEY_ID= R2_SECRET_ACCESS_KEY= R2_BUCKET= R2_PUBLIC_URL=   # or AWS_* + AWS_S3_PUBLIC_URL for S3
# Remotion Lambda (prod)
REMOTION_AWS_ACCESS_KEY_ID= REMOTION_AWS_SECRET_ACCESS_KEY= REMOTION_LAMBDA_FUNCTION_NAME= REMOTION_SERVE_URL= REMOTION_AWS_REGION=
# Billing — none. Removed 2026-08-10, no provider chosen.
```

---

## 7. Conventions
- TypeScript everywhere (web + worker + core). Strict mode on.
- UI: Tailwind; component primitives (buttons, cards, toggles) in a small shared kit; dark-first, mobile-responsive.
- Serbian UI copy (with Bosanski/Hrvatski/Rumunski/English selectable, as the competitor has).
- No secrets in client bundles. Server-only keys stay in the worker / Next server routes.
- Every external call goes through an interface in `packages/core` — no direct provider calls scattered in features.

---

## 8. Open design/branding decisions (deferred — not urgent, revisit before final release)

Dashboard visual pass (2026-07-18) deliberately mirrored EcomAlati's "VideoGen" layout closely (per-tool colored
gradient cards, white icon badge, benefit bullets, main/utility tier split) to get a real reference point fast.
User feedback: doesn't want to ship a 1:1 look-alike — needs a pass to make it ours before launch. Not blocking
current work; parked here so it isn't lost.

- [ ] **Naming**: `matrix` job type is literally the competitor's product name — needs a unique name before launch
      (candidate discussed: "Rafal"; user rejected initial round of suggestions, undecided). `edit`/`image_ads` (AI
      slike)/`mix`/`quick_test` (Brzi test)/`translate` (Prevod) are generic functional terms, not the competitor's
      branding — lower priority to rename, may be fine to keep.
- [ ] **Colors**: tool cards currently use one distinct gradient per tool (orange/blue/purple/teal/pink/red),
      matching the competitor's pattern of "each tool = its own color." Consider: different specific hues/shades,
      a different visual motif (texture, radial vs linear), or a different assignment of which tool gets which
      color, so it doesn't read as a copy even though the *pattern* (colored main cards + bullets) stays.
- [ ] **Wizard pages** (`/app/matrix`, `/app/edit`, etc.): currently plain/functional (step counter, form fields,
      no icons or visual richness) — competitor's equivalent has per-step icons, a colored accent bar, drag-drop
      upload zones, and live previews (e.g. a caption preview box). Needs the same kind of visual pass the
      dashboard just got. Bigger job than the dashboard — touches all 8 wizard pages.
- [ ] Job type **copy** (labels/descriptions/benefit bullets) should get a final editorial pass "kako korisnik
      odluči" before release — current copy is a reasonable first draft, not treated as final.

### Dashboard visual review 2026-08-09 (owner walked the live page, logged in)
Owner's verdict on the real rendered `/app`: nothing on it reads as visually finished. **Parked
deliberately — functionality first, cosmetics later.** Recorded here so it isn't rediscovered from scratch.

Root cause is not any single element: the page speaks **three unrelated visual languages** stacked
vertically — (1) main tools: six saturated gradient cards at maximum loudness; (2) "Dodatni alati":
flat dark rows, nearly invisible by comparison; (3) "Krediti": bare price cards in a third style.
Each section was built on its own without a shared system, and it shows.

- [ ] **Adopt one accent + neutral surfaces.** Six hues for six tools is decoration, not information —
      nothing in the palette tells the user what matters more. Candidate direction: the yellow already
      in the logo/CTA as the single accent, neutral dark cards, colour confined to the icon badges.
- [ ] **Extract design tokens + primitives BEFORE reskinning** (spacing scale, radii, type scale,
      `Card`/`Button`). Without them the next section drifts off on its own again — which is exactly
      how the three languages above happened.
- [ ] **Content column floats.** On a wide viewport the centred column leaves large dead margins and
      the page reads as unfinished. Needs a max-width/layout decision, not just padding tweaks.
- [ ] **Move the credit packs off the dashboard** to their own page (`/app/krediti`). They compete with
      the tools for attention on every visit while a user actually needs them about once a month.
- [ ] Order once this is unparked: direction → tokens/primitives → dashboard → wizards. **The wizards are
      the bigger half** (8 pages, still plain/functional) and are where the user actually spends time —
      polishing the entrance while the rooms behind it are bare is the wrong order.

**DoD:** none yet — this section exists to hold the decision, not to track phase completion.
