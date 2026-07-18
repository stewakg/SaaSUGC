# HANDOVER.md — AdGen project status (2026-07-18)

> Written because the user ran out of session credits and needs a clean pickup point for the next
> session. This is a snapshot — cross-check against `INFRASTRUCTURE.md` (the living source of truth,
> phases F0–F7 with checkboxes) and `git log` before trusting anything here as still current.

---

## 1. What this project is

**AdGen** — a Serbian/Balkan-market AI video/image ad generator SaaS for COD (cash-on-delivery)
e-commerce, competing directly with an existing product called **EcomAlati / VideoGen**. A later
"AI influencer UGC" feature (upload influencer photo + product → AI video ad) is planned but explicitly
deferred until the core product ships (F7).

The competitor was reverse-engineered early in this project (real API traffic captured, stack
identified: Supabase + Railway/FastAPI + fal.ai + ElevenLabs + Claude + Remotion Lambda). Our own
credit-cost numbers (`packages/core/src/pricing.ts`) intentionally match the competitor's real observed
numbers (Matrix=15cr, Edit=18cr, image=4cr, enhance=9cr) as a starting reference point.

---

## 2. TL;DR — where things stand right now

- **Code**: F0 through F4 fully built and code-complete. F5 mostly code-complete (real provider client
  code written for Claude/ElevenLabs/R2/Remotion Lambda/Lemon Squeezy) but **no real AI-generation
  provider has ever been called with real money** — zero API spend has happened anywhere except
  Supabase (which is live) and the VPS (which is a sunk/existing cost).
- **Infra**: real Supabase cloud project live and verified. Worker deployed for real to the user's
  existing Hetzner VPS and **the full pipeline has been proven end-to-end** (web → Supabase → Redis →
  worker → credits charged) using **mock** providers throughout — no real AI calls yet.
- **Git**: everything is committed to `master` (2 commits total, no remote configured — this repo has
  never been pushed anywhere. See §7).
- **Business/pricing**: credit pricing model matches the competitor's real numbers; margin analysis
  (see §8) suggests healthy margins IF the AI-video cost assumption holds — this is the single biggest
  unverified number in the whole plan.
- **Biggest single next step**: get kie.ai + fal.ai accounts and actually call them for real (see §6,
  item 1). Nothing else meaningfully de-risks the business plan as much as this one step.

---

## 3. What's actually done and LIVE-VERIFIED (not just typechecked)

These have been proven to work against real infrastructure, not just `tsc --noEmit`:

1. **Supabase cloud auth + credits** — real signup → `handle_new_user()` trigger → `profiles` +
   `credits_ledger` rows created correctly → dashboard shows correct balance. Project ref in `.env`
   (`SUPABASE_URL=https://gczikdrskcpqqlyzvnby.supabase.co`).
2. **Full job pipeline end-to-end** — a real "Brzi test" (quick_test) job was submitted from the local
   web app, enqueued on the VPS's Redis (via SSH tunnel), picked up by the real worker container on the
   VPS, completed, and correctly charged 2 credits (balance dropped 31→29). Confirmed via
   `docker logs adgen-worker-prod` showing `"job done"` with the matching job ID.
3. **Worker deployed to production VPS** — `docker compose -f infra/docker-compose.prod.yml -p adgen up
   -d --build` run for real on the Hetzner VPS. Containers `adgen-worker-prod` (worker) and
   `adgen-redis-prod` (Redis) are running stably (confirmed still `Up` as of this writing — see §5 for
   how to check/re-check).
4. **A real Remotion render** (standalone, outside the full pipeline) — bundled, launched headless
   Chrome, rendered a valid 1080×1920 h264 mp4 in ~9s, locally.

Everything else below this line is **code-complete + typechecked + linted**, but has **never been run
against a real external provider** — no Anthropic, ElevenLabs, kie.ai, fal.ai, R2, AWS/Remotion Lambda,
or Lemon Squeezy call has ever actually happened. This distinction matters: type-safety and mock-mode
success do not prove real-world correctness (auth headers, response shapes, rate limits, model names,
etc. are all unverified assumptions until the first real call).

---

## 4. Three real bugs found (and fixed) during the VPS deploy

Worth knowing about since they were subtle and NOT catchable by `tsc`/`eslint` — if something similar
surfaces again elsewhere, check for this failure class first (empty string vs. undefined):

1. **`packages/core/src/env.ts`** — `z.string().url().optional()` rejects `''`, but `.env` files /
   Docker `--env-file` write unset optional keys as `KEY=` (empty string, not truly absent). Crashed the
   worker on first boot (`R2_PUBLIC_URL`, `REMOTION_SERVE_URL` both blank). Fixed with an `optionalUrl()`
   zod preprocessor that treats `''` as `undefined`.
2. **`packages/core/src/queue.ts`** — same failure class: `??` doesn't fall through on `''`, so a blank
   `REDIS_URL=` tried to connect to Redis at the literal empty string instead of using the default. Fixed
   with explicit `|| undefined` before the `??` chain.
3. **`apps/worker/Dockerfile`** — the Playwright `v1.48.0-jammy` base image (chosen for its bundled
   Chrome/Remotion system dependencies) ships Node 20.18.0, but `@supabase/supabase-js` needs Node 22+'s
   native `WebSocket` global. Crash-looped with `"Node.js detected but native WebSocket not found"` until
   a NodeSource Node 22 install was added right after the `FROM` line.

---

## 5. Infrastructure reference — how to get back into everything

**VPS**: Hetzner, IP `46.225.214.52`, hostname `aikutak`, Ubuntu 24.04, root SSH via the existing local
`~/.ssh/id_ed25519` key (already trusted, `ssh root@46.225.214.52` should just work). App lives at
`/opt/adgen-saas` on the VPS, Docker Compose project name `adgen` (isolated from anything else on that
box — an old "openclaw" + "n8n" setup was fully removed from this VPS earlier in the project, with
explicit user permission).

**Check the worker is still running:**
```
ssh root@46.225.214.52 "docker ps -a --filter name=adgen"
ssh root@46.225.214.52 "docker logs adgen-worker-prod --tail 50"
```

**To test the pipeline locally against the real VPS worker again:**
1. Open an SSH tunnel to the VPS's (loopback-only) Redis:
   `ssh -N -L 127.0.0.1:6379:127.0.0.1:6379 root@46.225.214.52` (run this in the background — it must
   stay open the whole time you're testing).
2. Root `.env`'s `REDIS_URL` should already be `redis://127.0.0.1:6379` — confirm, then run
   `pnpm run env:sync` if you changed anything.
3. `pnpm dev` (starts `apps/web` locally; the worker itself runs on the VPS, not locally).
4. Log in, submit a job (e.g. "Brzi test" — cheapest at 2 credits), watch it complete, then check
   `docker logs adgen-worker-prod` on the VPS to confirm it was picked up there.

**Redeploying the worker after a code change:**
```
# from local machine — sync the repo to the VPS (no git remote exists yet, so this is a raw copy):
tar czf - --exclude=node_modules --exclude=.git --exclude=.next --exclude=storage --exclude=.env \
  --exclude=.claude --exclude=.vscode -C "<repo root>" . | ssh root@46.225.214.52 "mkdir -p /opt/adgen-saas && tar xzf - -C /opt/adgen-saas"
ssh root@46.225.214.52 "cd /opt/adgen-saas && docker compose -f infra/docker-compose.prod.yml -p adgen up -d --build"
```
The worker's real `.env` lives at `/opt/adgen-saas/apps/worker/.env` **on the VPS only** — it is not in
the git repo (gitignored) and was hand-created via SSH. It currently has the real Supabase keys filled in
and every AI/storage/render/billing key blank (mock mode). To go live on any real provider, that VPS file
needs the corresponding key added, then the worker container needs a restart
(`docker compose -f infra/docker-compose.prod.yml -p adgen restart worker`).

**Local dev env**: single source of truth is the root `.env` (gitignored). `pnpm dev`'s `predev` hook
(and `pnpm env:sync` manually) copies it into `apps/web/.env` and `apps/worker/.env` automatically — never
hand-edit those two, they get overwritten. All provider keys are currently blank there too (mock mode).

**Supabase**: cloud project `gczikdrskcpqqlyzvnby`, migrations run by hand via the SQL Editor (no
Supabase CLI link was ever set up — `supabase/migrations/*.sql` in the repo are the source of truth if
you ever need to replay them somewhere, but running them requires manually pasting into the SQL Editor,
not `supabase db push`).

---

## 6. What's left — in priority order

### 1. kie.ai + fal.ai accounts, wire `AIProvider`, run a real benchmark ⭐ (biggest single next step)
- Sign up for both (`ACCOUNTS.md` #3/#4), add `KIE_API_KEY`/`FAL_API_KEY` to `.env`.
- The client code for both already exists as an interface + factory pattern in `packages/core` — swapping
  in real keys should "just work" per the mock-first design, but **has never been tried**, so budget time
  for the first-real-call debugging pass (expect auth header issues, response shape mismatches, etc. —
  same pattern as the 3 bugs in §4).
- **Do a real side-by-side test**: same prompts, same models (Veo3, Kling, nano-banana/Flux) on both
  kie.ai and fal.ai. Record actual €/call cost and output quality. This single number (real cost per
  Veo3-class video call) is the biggest unknown in the entire margin analysis (§8) — right now it's a
  guess (€0.10–0.30/call) inferred indirectly from the competitor's credit pricing, not measured.
- Once benchmarked, finalize the primary/fallback routing in the `AIProvider` factory.

### 2. Anthropic + ElevenLabs real keys (cheap, low-risk, do anytime)
- Both have code-complete client implementations, just need a key (`ACCOUNTS.md` #2/#5).
- This live-verifies the real Matrix pipeline (script + voice + render), which per the margin analysis
  should be very cheap (~90%+ margin) since Matrix does **not** call kie.ai/fal.ai at all (confirmed via
  the competitor's captured real API traffic — Matrix reuses a background clip, not a fresh AI video
  generation per variant).

### 3. R2 bucket + AWS Remotion Lambda deploy (not urgent — VPS local render works today)
- Matrix currently renders locally on the VPS's own CPU (hardcoded to `LocalRemotionRenderer`, not the
  Lambda path) — this works fine at low volume but caps out around the VPS's 2 vCPUs. Only becomes
  urgent once there's real concurrent user load.
- R2 (`ACCOUNTS.md` #6) needed for any real Storage use beyond local disk.
- AWS Remotion Lambda (`ACCOUNTS.md` #7) needs a one-time `remotion lambda functions deploy` +
  `remotion lambda sites create` run — the env vars are the *output* of that deploy, not something you
  copy from a dashboard.

### 4. Decide: Vercel deploy for `apps/web`, or keep it on the VPS too?
- This is a **decision**, not just a coding task — needs the user's call.
- Vercel is the originally-locked plan, but `POST /api/upload` (used by 5 of the 8 wizards: edit, mix,
  translate, enhance, remove_text) proxies file uploads through the Next.js server route, and Vercel
  Serverless Functions have a hard ~4.5MB request body limit that isn't configurable from app code — a
  real video upload would 413 before ever reaching the route's own logic.
- Two real fixes, pick one: (a) build a presigned-URL-direct-to-R2 upload flow (browser uploads straight
  to storage, bypassing the Next.js server entirely — real code work, maybe a few hours), or (b) just run
  `apps/web` on the VPS too (Docker, next to the worker) and skip Vercel's limit entirely (loses some
  Vercel conveniences — preview deploys, edge network — but is simpler given the worker's already there).

### 5. Lemon Squeezy billing (parked, not urgent per explicit user decision)
- Blocked on the wife's USt-IdNr arriving (Gewerbe already opened, VAT ID pending — a German
  bureaucratic timeline, not something to chase). Billing must be under the Gewerbe holder, not the
  project email.
- Code is done (`packages/core/src/providers/billing.lemonsqueezy.ts`), just needs the account + keys +
  a webhook test via Lemon Squeezy's dashboard "send test event" feature once it exists.

### 6. Legal pages (Uslovi/Privatnost/Impressum, cookie consent)
- **Deliberately not drafted by Claude** — real GDPR-relevant legal weight, cross-border DE/RS/EU. Needs
  a real Steuerberater/lawyer, not AI-generated boilerplate that could be mistaken for real coverage.

### 7. Deferred design/branding polish (§8 of `INFRASTRUCTURE.md`, explicitly "not urgent" per user)
- Rename `matrix` (it's literally the competitor's product name — a real trademark/lookalike risk before
  public launch; candidate "Rafal" was floated and rejected, still undecided).
- Differentiate the tool-card color scheme from the competitor's (currently a close visual match,
  deliberately done first for speed — user does not want to ship it 1:1).
- Visual redesign pass for the 8 wizard pages (currently plain/functional — dashboard got the nice
  gradient-card treatment, wizards didn't yet).
- Final editorial copy pass on all tool descriptions/benefit bullets.

### 8. F7 — AI influencer UGC feature
- Not started. Deferred until the rest of the site ships, per the original project goal ordering.

---

## 7. Uncommitted-work / git hygiene note

The entire F1–F6 build (everything except the original F0 scaffold) sat **uncommitted in the working
tree for the whole session** until it was all committed in one shot near the end
(`4900279 feat(F1-F6): ...`, 82 files). There is still **no git remote configured** — this repo has never
been pushed to GitHub or anywhere else. `.github/workflows/ci.yml` exists (typecheck + lint + build on
push/PR) but has never actually run since there's no remote to trigger it. **Setting up a GitHub remote
and pushing is worth doing soon** — right now a lost/corrupted local machine would lose the entire
project with no backup.

---

## 8. Business/pricing context (for whoever picks this up on the business side too)

- Credit price: **€0.20/credit** at the "Starter" tier (€50/mo for 250 credits) — matches the
  competitor's real observed numbers, cheaper per-credit at higher tiers (Pro/Max), which is standard
  SaaS bulk-discount structure.
- Real per-job credit costs (`packages/core/src/pricing.ts`, matching the competitor's actual numbers):
  `image_ads`=4, `matrix`=15, `edit`=18, `enhance`=9, `mix`=12, `quick_test`=2, `translate`=15,
  `remove_text`=6, `ai_video`=25.
- **Key margin insight from this session's analysis**: Matrix does NOT call any paid AI video-generation
  API at all (confirmed via the competitor's real captured traffic — it reuses a background clip across
  script/voice variants), so its real cost is just cheap Claude + ElevenLabs + render — very high margin
  (~90%+). Edit (and presumably other tools using real AI video generation) is the one genuinely
  cost-sensitive tool, and its margin is almost entirely determined by the real €/call cost of
  Veo3-class generation via kie.ai — which is **still an estimate, not a measured number** (see §6 item 1
  — this is exactly why that benchmark matters so much).
- Lemon Squeezy (Merchant of Record) takes roughly 5% + €0.50 per transaction — factor this into any
  margin math, it's a real deduction before COGS even comes out.
- "Neiskorišćeni krediti se prenose" (unused credits roll over) is a real deferred liability worth
  tracking once there's real usage data — a user hoarding credits then burning them all on
  expensive-tool usage in one month could spike that month's COGS above what was collected for those
  credits.

---

## 9. Quick file map

```
INFRASTRUCTURE.md          Living source of truth — phase checkboxes (F0–F7), THE file to trust over this one
ACCOUNTS.md                 Signup checklist — which account maps to which env var
.env                         Root env (gitignored) — single source of truth, synced to apps/*/env
apps/web/                    Next.js app — UI, auth, API routes, job wizards
apps/worker/                 Node worker — BullMQ consumer, deployed to the VPS (Dockerfile here)
packages/core/                Shared interfaces + mock/real provider implementations + pricing.ts
packages/db/                  Supabase schema, migrations, generated types
remotion/                     Remotion composition project (Matrix ad template)
infra/docker-compose.prod.yml Worker+Redis prod deploy config (used on the VPS)
scripts/sync-env.mjs          Root .env → apps/*/env sync script
```

---

## 10. Recommended first move for the next session

Start with **§6 item 1** (kie.ai + fal.ai). It's the cheapest possible next step (pay-as-you-go
signup, no big commitment), and it's the one thing that turns the entire margin analysis in §8 from an
educated guess into a real number — which matters before spending more time on pricing-tier decisions,
Vercel-vs-VPS deploy debates, or anything else that depends on knowing whether this business is
actually profitable per video.
