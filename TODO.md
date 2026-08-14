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
| ❌ ⛔ | **Domain + DNS** | 👤 | Nothing reserved. Blocks HTTPS, the Supabase auth callback, the Lemon Squeezy webhook URL, a sending address, and the R2 custom domain |
| ❌ ⛔ | **TLS / reverse proxy** | 🤖 | Caddy in front of the web container; ten minutes of work, blocked entirely on the domain |
| ❌ | **Sending email address** | 👤 | Supabase auth mail still goes out on Supabase defaults |
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

Deliberately not drafted by me: this carries real legal weight across DE/RS/EU, and generated
placeholder text is worse than none because it reads as if it were coverage.

## 6. Testing

**764 tests** (core 337, web 331, worker 96); `pnpm -r typecheck` clean on all five projects.
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
| ❌ | **No end-to-end test** — nothing exercises signup → job → asset against a real stack |
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

⚠️ **One Redis, one queue.** If a worker runs on your laptop AND on the VPS against the same Redis,
both pull from the same queue and whichever grabs a job answers it. That is how a job once got
answered with mocks. Run one worker at a time, or point them at different Redis instances.
