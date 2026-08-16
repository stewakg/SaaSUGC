# TODO.md — what is missing for the site to actually work

One line per item. **This file is an index, not a second source of truth** — the detail, the
history and the caveats live in `INFRASTRUCTURE.md` and `RELEASE_PLAN.md`. If they ever disagree,
those win and this file is the one that is stale.

**Updated 2026-08-16** with what the security audit left for the owner: the R2 bucket is still
public, the old asset rows still hold public urls, and the signed-url change has to be deployed to
web and worker together (§1). Everything else in this file is as of the rewrite below.

**Last reviewed: 2026-08-14 — full rewrite.** The previous version was written on 2026-08-10 and
had gone wrong on nearly every line: hosting, R2, Lambda, the worker's real keys and billing have
all happened since, and all three "known defects" in its §6b had already been fixed.

## Legend

| Mark | Meaning |
|---|---|
| ✅ | works, and has been run for real |
| 🟡 | code exists and typechecks, but has **never been executed** against the real thing |
| ❌ | does not exist |
| ⛔ | **launch blocker** — the site cannot go live with this open |
| 👤 | needs you: an account, money, or a decision |
| 🤖 | needs me: code |

---

## 1. Hosting & infrastructure

| Status | Item | Who | Note |
|---|---|---|---|
| ✅ | **VPS** — Hetzner CX23, Nürnberg, Ubuntu 24.04 | — | `5.75.154.153`. ufw (SSH/80/443 only), fail2ban, 2 GB swap, Docker 29.7 |
| ✅ | **Web + worker + Redis in Docker** | — | `adgen-web-prod`, `adgen-worker-prod`, `adgen-redis-prod` at `/srv/adgen`; web answers 200 on port 80 |
| ✅ | **R2 bucket** — `adgenwebsaas`, EU jurisdiction | — | Verified by a real upload. EU buckets need their own S3 endpoint (`R2_ENDPOINT`); the derived form fails with "bucket not found" |
| ✅ | **Remotion Lambda** — function + site, `eu-central-1` | — | First real render 26.8s; the mp4 landed in R2 and the AWS copy was deleted |
| ✅ | **Supabase cloud** — auth, DB, migrations 0001–0009 | — | All nine applied as of 2026-08-16 (0007 + 0009 verified by querying `pg_policies` and `information_schema.column_privileges`; 0008 on the owner's report) |
| ✅ | **Migration 0007 applied — and 0009 finished it** | — | Confirmed against the live DB 2026-08-16: `pg_policies` for `profiles` returns only `profiles_select_own`, so there is no UPDATE policy and RLS denies every client write. **0007's second statement turned out to be a no-op** — PostgreSQL cannot subtract a column from a table-level grant, and Supabase grants these roles at table level, so `revoke update (balance, id)` had nothing to revoke and the column-privileges query still showed anon/authenticated holding UPDATE. `0009_revoke_profiles_update.sql` does it at table level; applied the same day and the check query now returns zero rows |
| ❌ ⛔ | **AWS Lambda concurrency quota** | 👤 | Found 2026-08-14 by the first full-chain run: a **ten-second ad — the shortest we sell — could not render at all** (`AWS Concurrency limit reached`). Renders are now capped at 3 Lambdas so they work, but that caps speed too. Ask AWS to raise Service Quotas → Lambda → Concurrent executions, then set `REMOTION_LAMBDA_CONCURRENCY` higher; no deploy needed |
| ❌ ⛔ | **Domain + DNS** | 👤 | Nothing reserved. Blocks HTTPS, the Supabase auth callback, the Lemon Squeezy webhook URL, a sending address, and the R2 custom domain |
| 🟡 | **TLS / reverse proxy** | 👤 | **Written and staged** (`bd61c53`): `infra/Caddyfile` + a `caddy` service behind the `tls` compose profile, so nothing starts until asked. Verified on the VPS's real Docker that the profile adds caddy and nothing else changes. Switch-on steps are in the Caddyfile — the one that bites is that `web` must give up `80:3000` first. Still blocked on the domain |
| ❌ | **Sending email address** | 👤 | Supabase auth mail still goes out on Supabase defaults |
| ✅ | **Worker survives a deploy, and a wedged one is detected** | — | Fixed 2026-08-14 (`115cb25`, `03a3bbc`) and **proven with a real SIGTERM to the live container**: exits 0, drains first, and Node is PID 1 so Docker's signal is not filtered through pnpm. Liveness is a Redis heartbeat the compose healthcheck reads — "the loop beat recently", not "the process exists" |
| 🟡 | **Error alerting** | 👤 | Shipped and deployed 2026-08-14 (`d47815e`, 6 tests): a failed job POSTs one line to `ALERT_WEBHOOK_URL`. **It is unset on the live box, so nothing is reported today** — paste a Discord/Slack/Telegram relay url into `/srv/adgen/.env` and restart the worker. One line, no rebuild |
| 🟡 | **R2 public URL is still the `r2.dev` dev subdomain** | 👤 then 🤖 | Cloudflare rate-limits it and says not for production. Swap to `cdn.<domain>` once the domain exists |
| ✅ | **R2 bucket is PRIVATE** | — | Done 2026-08-16 by the owner: Settings → **Public Development URL** → Disable (the control is named that now, not "public access"; Custom Domains was empty). Verified from the VPS — `$R2_PUBLIC_URL/<anything>` returns **401** where it returned 404 an hour earlier, and the app still answers 200. With the deploy and 0008 both done first, nothing broke. Original item: |
| ~~❌ ⛔~~ | ~~**Make the R2 bucket PRIVATE**~~ | 👤 | Added 2026-08-16. The code stopped handing out permanent public urls (`26a0f34`: uploads return `/api/storage/<key>`, the route 302s to a signed url after the ownership check, the worker signs keys itself). **None of that closes anything while the bucket still answers anonymously** — the old `${R2_PUBLIC_URL}/uploads/<uid>/<timestamp>.mp4` form is guessable and still works. Cloudflare → the bucket → disable public access. Do it together with the row below, and after the deploy below |
| ✅ | **Rewrite pre-2026-08-16 asset urls — migration 0008** | — | `supabase/migrations/0008_asset_urls_through_route.sql`, **applied by the owner 2026-08-16** (reported, not verified by me — I have no DB access from here). Covers two tables, not one: `assets.url` is the ownership record, but every screen a customer looks at renders `jobs.result -> assets[] -> url`. New urls are built from the stored `storage_key`, rows without a key are untouched, re-running is a no-op. ⚠️ It was applied BEFORE the deploy, so between the two the app served links to a route that did not exist. That window is closed |
| ✅ | **Signed-url change deployed** | — | Done 2026-08-16 by Claude over SSH: `/srv/adgen` pulled to `2741dba`, both images rebuilt, all three containers `healthy`. Verified on the box: `/` 200, `/api/storage/...` answers `401 {"error":"unauthenticated"}` (our route, not Next's 404), and a traversal payload also returns 401 rather than `400 invalid_path` — which is the discriminator proving the SIGNING branch is live and not the local-disk one. Worker startup logs `storage: s3-storage`, `renderer: remotion-lambda-renderer`. Build cache pruned afterwards (4.88 GB, disk 46% → 35%) |
| ✅ | **`/api/storage` was missing from every web image ever built** | — | Found 2026-08-16 while verifying the deploy above, and it is the reason that verification was worth doing. `.dockerignore` carried `**/storage` for the LOCAL_STORAGE_DIR working directory, and that pattern also matched `apps/web/src/app/api/storage/`, so the route never reached the image — `.next/server/app/api` listed nine routes and not this one. Harmless while production served assets from R2's public base url; **instantly fatal once asset urls became `/api/storage/<key>`**. Fixed at `2741dba` with anchored patterns (`/storage`, `apps/*/storage`) |

## 2. Money

| Status | Item | Who | Note |
|---|---|---|---|
| ✅ | **Billing layer restored** — Lemon Squeezy | — | Idempotent webhook (order id → `add_credits_idempotent`), paid-variant cross-check, redirect back to the app, production refusal when billing resolves to the mock. 24 tests |
| 🟡 ⛔ | **Never called with a real Lemon Squeezy key** | 👤 | Needs a store, one variant per pack, and `LEMONSQUEEZY_VARIANT_MAP`. Blocked on the entity below |
| ❌ ⛔ | **Whose company takes the money** | 👤 | The owner operates from Frankfurt on his own cards; the plan is a friend's LLC. **No euro may be taken and no real user onboarded before that entity exists and Lemon Squeezy is in its name** — otherwise the operator, the taxpayer and the GDPR controller are all him. A German Steuerberater should see the US-LLC-managed-from-Germany question before the company is formed |
| ✅ | **Migration 0007 + 0009 (credit self-grant)** | — | `profiles_update_own` let any logged-in user set their own `balance` and spend it on real provider calls. **Both applied and verified 2026-08-16** — see the row in §1 for why 0009 exists: 0007's column-level revoke was a no-op against a table-level grant, so the second lock only landed with 0009 |
| ❌ | **Refunds / chargebacks (L3.6)** | 👤 then 🤖 | Needs a decision first: a reversal arriving after the credits were SPENT → negative balance, clamp at zero, or freeze the account |
| 🟡 | **Credit reservation is a check, not a lock** | 🤖 | Half-fixed 2026-08-16 (`35bdf4c`): the balance now has to cover queued+running work too, so the "fifteen jobs, one balance, fourteen unpaid provider calls" case is closed. What is left is the narrow one — two requests in the same millisecond read the same in-flight set. Closing it properly means a database-side hold (reserve at enqueue, convert or release at charge), which is a new migration and an RPC. Not urgent at current traffic; do not let it be forgotten |
| ❌ | **Per-job cost compared against real invoices** | 👤 | The worker logs units (characters, render seconds); nobody has held them next to an ElevenLabs or OpenRouter bill |

## 3. Tools — does the card tell the truth?

Trimmed 2026-08-14 by the functional audit: a card links to a wizard ONLY if a pipeline exists.

| Status | Tool | Note |
|---|---|---|
| ✅ | **Video reklame** (`matrix`) | Renamed from "Matrix" 2026-08-13. Real script, real TTS, scene-detect montage, Lambda render |
| ✅ | **AI slike** (`image_ads`) | ✅ LIVE through `runPipeline` 2026-08-14: 196.3s, 1.17 MB png on our own url. **kie.ai timed out at 180s and the fal.ai fallback carried it** — the first time that fallback has fired for real. 196s for one image is a bad wait; consider lowering the kie timeout so the fallback starts sooner |
| ✅ | **Poboljšaj kvalitet** (`enhance`) | ✅ LIVE through the WHOLE pipeline 2026-08-14: 14.6s, 543 KB on our url. The earlier ✅ on this row was overstated — it had only exercised the fal provider, and the ownership copy into R2 was in fact broken for every customer until `81a023b` |
| ✅ | **Skini tekst** (`remove_text`) | ✅ LIVE through the WHOLE pipeline 2026-08-14: 14.6s, 335 KB on our url. Same correction as the row above — the earlier ✅ covered the provider only. Images by design; video erasers are negative margin |
| ❌ | **Brzi test · Edit videi · Mix · Prevod** | Wizard exists, pipeline does not. Now badged USKORO instead of linking to a wizard that ends in an error |
| ✅ | **Preozvuči** (`revoice`) | ✅ LIVE through the WHOLE pipeline 2026-08-14: 90.7s, 9.6 MB mp4 on our own url (`ttsCharacters 185`, `renderSeconds 81.4`). Reachable via the montage switch in step 3 of the Video-reklame wizard, which sends this job type and quotes its own cheaper price. **All five working tools have now been run end to end through `runPipeline`** |

## 3b. Profil / podešavanja — MISSING ENTIRELY

Requested by the owner 2026-08-14 and largely built the same day. What is left is listed below;
the rows marked 🔄 are in progress right now.

| Status | Item | Note |
|---|---|---|
| ✅ | **Profile entry point** | `/app/profil` shipped 2026-08-14. Reached by clicking the email in the topbar — and ALSO from the sidebar, because the email sits in a `hidden sm:block` container and on a phone there was nothing to click at all |
| 🔄 | **Rename to "Moj Profil"** | Owner's wording, 2026-08-14. Everywhere it is named: the nav entry, the topbar link title, the page heading |
| 🔄 | **Credits move off the dashboard into the profile** | Owner's decision, 2026-08-14. The packs currently sit at the bottom of Početna; that is not where a returning customer looks for them, and it pushes the tools down |
| 🔄 | **Collapsible sidebar** | Owner's request, 2026-08-14. A toggle slides the left nav out of view and stays visible so it can be brought back. Today it is fixed on desktop and only the mobile hamburger can hide it |
| ✅ | **Change password** | Done 2026-08-14. Reuses the existing `validatePassword` checklist and `PasswordRules`, maps Supabase's English through `authErrorMessage`, and announces both failure and success (`role="alert"` / `role="status"`) |
| 🔄 | **Buy / add credits from the profile** | In progress — the packs move off Početna entirely. The production admin gate on the instant-credit button has to move WITH them, or every production user gets free credits |
| ✅ | **Timezone + time display** | Done 2026-08-14, and actually wired: the job list formats through `formatDateTime` with the picked zone, read server-side off the cookie. An unknown zone falls back instead of throwing — `Intl` raises `RangeError`, which would have broken every page showing a date |
| 🟡 | **Account basics** | Email and sign-out shipped 2026-08-14. **Delete-my-account is the one still missing**, and it is blocked on a decision rather than on work: `Storage` has no `delete` (see §5), so we could not actually erase the person's videos, and a GDPR obligation half-honoured is worse than one not yet offered |
| ❌ | **Invoices / purchase history** | Lemon Squeezy is a merchant of record and issues the invoice, so this may be a link out rather than a screen we build. Decide before building anything |

Two things to settle before writing code: whether this is a full page (`/app/profil`) or a panel,
and whether "delete my account" ships in the first version — because promising it and not honouring
the file deletion is worse than not offering it yet.

## 3c. Homepage — the first thing a stranger sees

Raised by the owner 2026-08-14. Two problems, both measured on the live page.

### A. It shows every tool, half of which do not exist
The landing renders all 10 cards, and **5 carry an USKORO badge**. A visitor's first impression is
a catalogue that is half "coming soon", which reads as a product that is not ready — and it buries
the five that do work. The dashboard is the right place for the full list; the landing is a pitch.

| Option | What it does | Cost of being wrong |
|---|---|---|
| **A1 (recommended)** | Show ONLY the tools with a pipeline — the five that work. Drop USKORO from the landing entirely; the dashboard keeps showing them | If a tool ships later, one line adds it back. Nothing is lost — the badge already exists on the dashboard |
| A2 | Show three headline tools (Video reklame, AI slike, Poboljšaj kvalitet) and a "vidi sve alate" link | Strongest pitch, but hides two working tools from someone who came for them |
| A3 | Keep all ten, collapse the five USKORO into one line of text under the grid | Least change, still admits half the catalogue is unbuilt on the front page |

A1 needs no new mechanism: `isToolSoon()` already exists and the landing already imports it.

### B. The 9:16 slot is an empty box
`apps/web/src/app/page.tsx:58` renders a `phone-frame` div containing the text `1080×1920`. It
occupies the hero's most valuable space and shows a placeholder where the product's actual output
belongs. **We now have real renders in R2** — the verification runs produced finished mp4s.

| Option | What it does | The catch |
|---|---|---|
| **B1 (recommended)** | A poster frame from a real render, with a play control that starts the video on click | No autoplay bandwidth on every visit. `r2.dev` is rate-limited and Cloudflare says not for production, so a 9.6 MB autoplaying file on the landing page is a real risk |
| B2 | A short muted autoplay loop, 2–4 seconds, re-encoded small (target < 1.5 MB) | Best impression, but needs someone to produce and store that asset, and it still spends `r2.dev` requests on every visit |
| B3 | Drop the frame; give the hero space to the offer and CTA | Honest and cheapest. Loses the "this is what you get" signal that sells a video product |

Both B1 and B2 depend on **one decision the owner has to make: which render to use as the sample.**
No code can pick that — it is the shop window.

## 4. Output quality

| Status | Item | Note |
|---|---|---|
| ✅ | **The script model sees the product** | Wired 2026-08-14: the first product image is described once per job and appended to the prompt. Degrades to no-extra-context on any failure — a vision hiccup must never fail a paid job |
| ❌ | **Third-party watermarks in imported clips** | Decision recorded (exclude dirty shots, never erase); nothing built |
| ❌ | **No music/SFX library** | Bring-your-own only — and the Matrix description no longer claims otherwise |
| 🟡 | **Script quality** | The blind eval concluded "no model produced broken Serbian", NOT "the cheapest is as good as the best". Re-run scoring each axis if a bad script ever ships |

## 5. Legal (before any real customer)

| Status | Item | Who |
|---|---|---|
| ❌ ⛔ | Uslovi / Privatnost / Impressum reviewed by a lawyer | 👤 |
| ❌ ⛔ | Impressum must name the REAL operator | 👤 |
| ❌ | GDPR / cookie consent | 🤖 after the lawyer |
| ❌ | 30-day retention | 👤 sets the bucket rule; 🤖 does the expired-asset UI, which would lie until the rule exists |
| ❌ | **`Storage` has no `delete` method at all** | 🤖 after a 👤 decision. Found 2026-08-14. Retention by R2 lifecycle rule is legitimate and is the plan — but it means the APP cannot delete a file on request, so a GDPR erasure or a "remove this video" button has nothing to call. Decide whether deletion is bucket-only or the app needs the capability before a real user asks. One artifact is already stranded by this: `renders/lambda-dqbz7jwul1.mp4`, ~1 MB, from the live render verification |

Deliberately not drafted by me: this carries real legal weight across DE/RS/EU, and generated
placeholder text is worse than none because it reads as if it were coverage.

## 6. Testing

**979 tests** (core 365, web 495, worker 119) as of 2026-08-16; `pnpm -r typecheck` clean on all five
projects, and **CI actually runs them now** (`a7f22e2` — until that commit the workflow ran only
typecheck, lint and the build, so the whole suite gated nothing on a pull request).
`@adgen/web` can now test COMPONENTS: `jsdom` is a devDependency and `apps/web/vitest.config.ts`
keeps `node` as the default environment, so a file opts into a DOM with `// @vitest-environment
jsdom` and the ~300 route tests keep a real `Request`/`Response`. Before this, no component in the
app had ever been executed by a test.
All 12 API routes are covered. Every delegated suite was mutation-audited — the implementation was
deliberately broken and the right test had to fail.

| Status | Item |
|---|---|
| ✅ | Money path: job admission, charge-on-success, refund-on-failure, rollback, webhook idempotency |
| ✅ | Security-shaped: SSRF gates, path traversal, cross-customer storage access, the production admin gate |
| ✅ | Both renderers, all four providers, the billing layer |
| ✅ | **The provider chain is exercised end to end** — `apps/worker/scripts/verify-full-pipeline.mts` drives the shipped `runMatrixPipeline` against live OpenRouter, ElevenLabs, Lambda and R2, and refuses to run if anything resolves to a mock. It found a defect on its first run that would have failed every customer job (see the AWS quota row). Costs tens of cents; run it deliberately |
| ❌ | **Still no signup → job → asset test** — the driver skips the DB and the queue on purpose, so nothing covers the web→DB→BullMQ→worker hop against a real stack |
| ✅ | **Every component is covered by tests** — `app-shell`, `job-wizard`, `file-dropzone`, `tool-cards`, `theme-switcher`, `password-rules`. This morning none of them were, because the app had no DOM test environment at all |
| ✅ | **Accessibility audit of the signed-in app** — 18 findings, all fixed 2026-08-14. The serious one: the open mobile menu was not modal, so Tab walked out of it into content the menu was covering. Also every wizard error was silent to a screen reader, no wizard page had an `h1`, and decorative icons were announced |
| 🟡 | **The PUBLIC pages have now been looked at** — landing, login, signup and the three legal pages, at 375px and desktop, in all three themes. Four defects came out of it that measurement could not see (see `SESSION_LOG.md` 2026-08-14) |
| ❌ ⛔ | **Nobody has seen the SIGNED-IN screens** — dashboard and all six wizards. I cannot reach them: they are behind auth, and I do not create accounts or type passwords on the owner's behalf. **The owner works remotely from a second machine and cannot log in from the browser pane either**, so this waits until he is at the home machine. One login is enough — after that every page can be walked and screenshotted in one pass |
| ❌ ⛔ | **No human has clicked a wizard end to end** |
| ❌ | Signup and password recovery never click-tested (recovery sends a real email) |

**All three "known defects" from the old §6b are fixed** and were verified on 2026-08-14:
Serbian plurals go through `creditsWord` (`1 kredit` / `2 kredita`), the fal poller treats any
non-pending status as terminal (`FAL_PENDING_STATUSES`), and `charge_credits` is typed with four
arguments including `p_reason`.

## 7. Advice — what I would do next, in this order

Judgement, not blockers. Cheapest first.

1. **Apply migration 0007 today.** The only open hole with money attached, and it is one paste.
1b. **Deploy → apply migration 0008 → close the R2 bucket, in that order** (§1). Deploying first
   because only the new worker can sign a `/api/storage/<key>` source; 0008 before the bucket
   closes because those rows are what a closed bucket would break; the bucket last because until
   it is private nothing is actually closed, whatever the code now returns.
2. **Buy the domain.** The single item unblocking the most others: TLS, email, the Lemon Squeezy
   webhook, the R2 custom domain. Being unblocked matters more than the name being perfect — a
   name can be rebranded later, a missing domain blocks five things today.
3. ~~Wire `describeImage`~~ and ~~give `revoice` a UI~~ — both done 2026-08-14.
4. **Set `ALERT_WEBHOOK_URL`.** The code ships a one-line alert on every failed job; with the
   variable unset it stays silent, which means the first real failure is still found by a customer.
5. **One login from the home machine.** Everything behind auth is unreviewed, and a single sign-in
   in the browser pane converts that from "unknown" to "walked page by page". The public side took
   one pass and produced four real defects; there is no reason to expect the wizards are cleaner —
   they are the more complicated half.
6. **Measure a real job against a real invoice** — the only number in BUSINESS.md nobody has ever
   checked.
6. **Do the L5 rehearsal on production with a real card** before the link is shared with anyone.
7. **Only then**: watermark handling, a music library, the expired-asset state, per-job-type worker
   concurrency (cheap tools 4, matrix 1 — BullMQ does it with separate queues).

## 8. Two machines, one repo — how not to lose work

The owner works from more than one computer, and the sibling `aikutak` project lost three weeks to
exactly this. The rule that cost them:

> **Never end a session with uncommitted work.** Commit it anyway — a `wip:` prefix or a
> `wip/<topic>` branch — then push. A commit is not a claim that something is finished; it is the
> only thing that carries work to the other machine, and the only backup.

**Start of every session, on either machine:**

```bash
git fetch origin && git status -sb
```

`behind` → pull before touching a file. `ahead` → the last session did not push; find out why
before adding to it.

**What does NOT travel with git, and must be set up once per machine:**

| Thing | Why | What to do |
|---|---|---|
| `.env` | gitignored, holds live keys | Copy it across by hand over a channel you trust. Never paste keys into a chat |
| `node_modules` | not tracked | `pnpm install` |
| SSH key for the VPS | machine-local | Copy the key, or add the second machine's public key in Hetzner |
| Cline wallet | lives in `~/.cline` | Log in again. Always `-P openai-compatible` — the `zai` entry is the empty wallet |
| Docker images | server-side only | Nothing to do; the VPS is the deployment, not your laptop |

**Deploying from either machine** is the same three commands, and the server pulls from GIT rather
than from your disk — so anything you did not push does not deploy:

```bash
ssh root@5.75.154.153 'cd /srv/adgen && git pull'
ssh root@5.75.154.153 'cd /srv/adgen && docker compose -f infra/docker-compose.prod.yml -p adgen up -d --build'
ssh root@5.75.154.153 'docker compose -f infra/docker-compose.prod.yml -p adgen ps'
```

**The server's `.env` is separate from yours and does not come from git.** If you add a key
locally, copy the file up and rebuild, or the container keeps the old values:

```bash
scp .env root@5.75.154.153:/srv/adgen/.env
ssh root@5.75.154.153 'cd /srv/adgen && cp .env apps/web/.env && cp .env apps/worker/.env'
```

⚠️ **Every `--build` leaves cache behind, and it adds up fast.** Eight rebuilds in one day on
2026-08-14 left **173 build-cache entries eating 19.82 GB**, taking the 38 GB disk to 72% full.
Nothing warns you; the box just fills until something fails in a way that looks unrelated. After a
day of repeated deploys:

```bash
ssh root@5.75.154.153 'docker builder prune -f && df -h /'
```

That reclaims cache only — images, containers and the `redis_data` volume are untouched (verify
with `docker system df`: they should read `0B` reclaimable). The next build is slower and that is
the whole cost. Do NOT reach for `docker system prune -a`, which would also delete the images the
running stack was built from.

⚠️ **One Redis, one queue.** If a worker runs on your laptop AND on the VPS against the same Redis,
both pull from the same queue and whichever grabs a job answers it. That is how a job once got
answered with mocks. Run one worker at a time, or point them at different Redis instances.
