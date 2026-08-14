# TODO.md — what is missing for the site to actually work

One line per item. **This file is an index, not a second source of truth** — the detail, the
history and the caveats live in `INFRASTRUCTURE.md` and `RELEASE_PLAN.md`. If they ever disagree,
those win and this file is the one that is stale.

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
| ✅ | **Supabase cloud** — auth, DB, migrations 0001–0006 | — | ⚠️ 0007 is written and NOT applied — see §2 |
| ❌ ⛔ | **Apply migration 0007 to the live DB** | 👤 | **The credit self-grant hole is open in production until this runs.** One paste into the SQL editor |
| ❌ ⛔ | **AWS Lambda concurrency quota** | 👤 | Found 2026-08-14 by the first full-chain run: a **ten-second ad — the shortest we sell — could not render at all** (`AWS Concurrency limit reached`). Renders are now capped at 3 Lambdas so they work, but that caps speed too. Ask AWS to raise Service Quotas → Lambda → Concurrent executions, then set `REMOTION_LAMBDA_CONCURRENCY` higher; no deploy needed |
| ❌ ⛔ | **Domain + DNS** | 👤 | Nothing reserved. Blocks HTTPS, the Supabase auth callback, the Lemon Squeezy webhook URL, a sending address, and the R2 custom domain |
| 🟡 | **TLS / reverse proxy** | 👤 | **Written and staged** (`bd61c53`): `infra/Caddyfile` + a `caddy` service behind the `tls` compose profile, so nothing starts until asked. Verified on the VPS's real Docker that the profile adds caddy and nothing else changes. Switch-on steps are in the Caddyfile — the one that bites is that `web` must give up `80:3000` first. Still blocked on the domain |
| ❌ | **Sending email address** | 👤 | Supabase auth mail still goes out on Supabase defaults |
| ✅ | **Worker survives a deploy, and a wedged one is detected** | — | Fixed 2026-08-14 (`115cb25`, `03a3bbc`) and **proven with a real SIGTERM to the live container**: exits 0, drains first, and Node is PID 1 so Docker's signal is not filtered through pnpm. Liveness is a Redis heartbeat the compose healthcheck reads — "the loop beat recently", not "the process exists" |
| 🟡 | **Error alerting** | 👤 | Shipped and deployed 2026-08-14 (`d47815e`, 6 tests): a failed job POSTs one line to `ALERT_WEBHOOK_URL`. **It is unset on the live box, so nothing is reported today** — paste a Discord/Slack/Telegram relay url into `/srv/adgen/.env` and restart the worker. One line, no rebuild |
| 🟡 | **R2 public URL is still the `r2.dev` dev subdomain** | 👤 then 🤖 | Cloudflare rate-limits it and says not for production. Swap to `cdn.<domain>` once the domain exists |

## 2. Money

| Status | Item | Who | Note |
|---|---|---|---|
| ✅ | **Billing layer restored** — Lemon Squeezy | — | Idempotent webhook (order id → `add_credits_idempotent`), paid-variant cross-check, redirect back to the app, production refusal when billing resolves to the mock. 24 tests |
| 🟡 ⛔ | **Never called with a real Lemon Squeezy key** | 👤 | Needs a store, one variant per pack, and `LEMONSQUEEZY_VARIANT_MAP`. Blocked on the entity below |
| ❌ ⛔ | **Whose company takes the money** | 👤 | The owner operates from Frankfurt on his own cards; the plan is a friend's LLC. **No euro may be taken and no real user onboarded before that entity exists and Lemon Squeezy is in its name** — otherwise the operator, the taxpayer and the GDPR controller are all him. A German Steuerberater should see the US-LLC-managed-from-Germany question before the company is formed |
| ❌ ⛔ | **Migration 0007 (credit self-grant)** | 👤 | `profiles_update_own` let any logged-in user set their own `balance` and spend it on real provider calls. Fixed in code 2026-08-13, **not yet applied** |
| ❌ | **Refunds / chargebacks (L3.6)** | 👤 then 🤖 | Needs a decision first: a reversal arriving after the credits were SPENT → negative balance, clamp at zero, or freeze the account |
| ❌ | **Per-job cost compared against real invoices** | 👤 | The worker logs units (characters, render seconds); nobody has held them next to an ElevenLabs or OpenRouter bill |

## 3. Tools — does the card tell the truth?

Trimmed 2026-08-14 by the functional audit: a card links to a wizard ONLY if a pipeline exists.

| Status | Tool | Note |
|---|---|---|
| ✅ | **Video reklame** (`matrix`) | Renamed from "Matrix" 2026-08-13. Real script, real TTS, scene-detect montage, Lambda render |
| ✅ | **AI slike** (`image_ads`) | kie.ai primary, fal.ai fallback, result copied into our storage |
| ✅ | **Poboljšaj kvalitet** (`enhance`) | ✅ LIVE 2026-08-14: real Topaz upscale through our own provider, 14.1s. The first call found a real bug — fal's result url must come from `response_url`, because a nested model id 405s (`eaa2da7`) |
| ✅ | **Skini tekst** (`remove_text`) | ✅ LIVE 2026-08-14, 11.9s. Images only by design — video erasers are negative margin |
| ❌ | **Brzi test · Edit videi · Mix · Prevod** | Wizard exists, pipeline does not. Now badged USKORO instead of linking to a wizard that ends in an error |
| ✅ | **Preozvuči** (`revoice`) | Reachable since 2026-08-14: the montage switch in step 3 of the Video-reklame wizard sends this job type and quotes its own (cheaper) price |

## 3b. Profil / podešavanja — MISSING ENTIRELY

Requested by the owner 2026-08-14. Today the email in the app shell is text: clicking it does
nothing, and there is no account screen anywhere in the product. Everything a portal is expected to
have is absent.

| Status | Item | Note |
|---|---|---|
| ❌ | **Profile entry point** | Clicking your email in the shell should open account settings — a page or a panel. Nothing happens today |
| ❌ | **Change password** | The reset-by-email flow exists (`zaboravljena-lozinka` → `nova-lozinka`); changing it while signed in does not. Supabase `updateUser` covers it, and the existing `validatePassword` checklist should be reused rather than re-written |
| ❌ | **Buy / add credits from the profile** | Credit packs live only on the dashboard. The profile is where a returning customer looks for them |
| ❌ | **Timezone + time display** | Job timestamps render in whatever the browser guesses. A seller in Frankfurt and one in Belgrade see different times for the same job with nothing saying which zone. Needs a stored preference and one formatting helper everything goes through |
| ❌ | **Account basics** | Email shown, sign out (currently only in the shell), and delete-my-account — the last one is a GDPR obligation, and it collides with `Storage` having no `delete` (see §5): today we could not actually erase the person's videos |
| ❌ | **Invoices / purchase history** | Lemon Squeezy is a merchant of record and issues the invoice, so this may be a link out rather than a screen we build. Decide before building anything |

Two things to settle before writing code: whether this is a full page (`/app/profil`) or a panel,
and whether "delete my account" ships in the first version — because promising it and not honouring
the file deletion is worse than not offering it yet.

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

**785 tests** (core 349, web 331, worker 105); `pnpm -r typecheck` clean on all five projects.
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
