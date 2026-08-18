# TODO.md — what is missing for the site to actually work

One line per item. **This file is an index, not a second source of truth** — the detail, the
history and the caveats live in `INFRASTRUCTURE.md` and `RELEASE_PLAN.md`. If they ever disagree,
those win and this file is the one that is stale.

**Updated 2026-08-17.** That day added the site's icons and a deliberately-closed `robots.txt`,
fixed a CSP that had been stopping `next dev` from hydrating ANY page since `be22b61`, gave
`Storage` a `delete`, corrected six rows below that described finished work as open, re-counted the
test suite (979 → a measured **1059**), and deployed all of it to production. Details in
`SESSION_LOG.md`. The previous entry:

**Updated 2026-08-16 (evening).** A long session closed most of what the security audit opened
and changed the company behind the product. Landed since the morning: the six audit fixes, direct
browser→R2 upload, streamed clip import, a bounded search cache, a nonce CSP, migrations 0007–0009
applied, the R2 bucket made private, the old AdGen deploy removed from the second VPS, the Lambda
quota raised 10 → 1000, Lemon Squeezy put to sleep, all three legal pages re-founded on a Wyoming
LLC, and the landing trimmed to the five tools that work. What is left is below.

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
| ✅ | **VPS** — Hetzner, Nürnberg `nbg1-dc3`, Ubuntu 24.04 | — | `5.75.154.153`, hostname `adgenwebsaas`. **Measured 2026-08-16: 3819 MB RAM, 2 vCPU, 38 GB disk** — and it is NOT shared with `aikutak`, which is its own box (the "shares a VPS with aikutak" line in INFRASTRUCTURE.md was stale and is corrected). ufw (SSH/80/443 only), fail2ban, 2 GB swap. **This box is the throughput ceiling, not the AWS quota** — see the concurrency rows below |
| ✅ | **Old AdGen deploy removed from aikutak** | — | Done 2026-08-16 after checking it was actually dead: the leftover Redis had **no connected clients**, an empty queue (wait/active/delayed/paused all 0) and 7 jobs from the July test deploy, and the worker container had been exited for six days — its last log showing it on ALL MOCK providers against the real `adgen-jobs` queue name. **Backed up before deleting**: `/root/backups/aikutak-adgen-{saas,redis}-2026-08-16.tar.gz` on the box, and copies in `C:\Sa starog\D1tb\Projekti\_backups\` — deliberately OUTSIDE the git repo, because the code archive contains `apps/worker/.env`. Then containers, the `adgen_redis_data` volume and `/opt/adgen-saas` were removed; that box now runs no containers at all |
| 📝 | **Second VPS `aikutak` — an OPTION, undecided** | 👤 | `46.225.214.52`, same zone `nbg1-dc3`, and measured the same size: **3814 MB, 2 vCPU**, 75 GB disk. It is NOT the 8 GB machine it was believed to be, so there is no "big box" to move load onto. Same zone means a Hetzner private network between them is trivial and its traffic is free; aikutak also already runs Tailscale. **Two federated 4 GB boxes are not one 8 GB box** — twice the failure surface and a shared fate with the other project — so the standing advice is: direct upload, then measure, then resize, and only then federate. ⚠️ Blocking cruft if it ever happens: `/opt/adgen-saas` on aikutak still holds an old AdGen deploy whose container NAMES (`adgen-worker-prod`, `adgen-redis-prod`) would collide, and whose dead worker's last log shows it running on ALL MOCK providers while listening on the real `adgen-jobs` queue. Its Redis is bound to loopback only, so nothing is exposed. Removal needs the owner's go-ahead |
| ✅ | **Web + worker + Redis in Docker** | — | `adgen-web-prod`, `adgen-worker-prod`, `adgen-redis-prod` at `/srv/adgen`; web answers 200 on port 80 |
| ✅ | **R2 bucket** — `adgenwebsaas`, EU jurisdiction | — | Verified by a real upload. EU buckets need their own S3 endpoint (`R2_ENDPOINT`); the derived form fails with "bucket not found" |
| ✅ | **Remotion Lambda** — function + site, `eu-central-1` | — | First real render 26.8s; the mp4 landed in R2 and the AWS copy was deleted |
| ✅ | **Supabase cloud** — auth, DB, migrations 0001–0010 | — | All ten applied as of 2026-08-16 (0007 + 0009 verified by querying `pg_policies` and `information_schema.column_privileges`; 0008 on the owner's report) |
| ✅ | **Migration 0007 applied — and 0009 finished it** | — | Confirmed against the live DB 2026-08-16: `pg_policies` for `profiles` returns only `profiles_select_own`, so there is no UPDATE policy and RLS denies every client write. **0007's second statement turned out to be a no-op** — PostgreSQL cannot subtract a column from a table-level grant, and Supabase grants these roles at table level, so `revoke update (balance, id)` had nothing to revoke and the column-privileges query still showed anon/authenticated holding UPDATE. `0009_revoke_profiles_update.sql` does it at table level; applied the same day and the check query now returns zero rows |
| ✅ | **AWS Lambda concurrency quota — APPROVED 2026-08-16, now 1000** | 🤖 tunes, later | AWS approved the increase the same day: concurrent executions in eu-central-1 went **10 → 1000**. ⚠️ **Nothing has been changed or tested yet — the owner asked to hold off.** When the time comes: raise `REMOTION_LAMBDA_CONCURRENCY` in `/srv/adgen/.env` and restart the worker (env only, no rebuild), and measure one render at the current 3 vs ~25 before settling on a number. Remember the ceiling below is now the box, not AWS. Original row: |
| ~~🔄 ⛔~~ | ~~**AWS Lambda concurrency quota — increase REQUESTED**~~ | — | Measured, not guessed: `get-service-quota` returned **`Value: 10.0`** in eu-central-1 — the new-account default, and the reason the first full-chain run could not render a ten-second ad at all. One render costs `concurrency + 1` executions (chunk Lambdas + launcher), so at today's cap of 3 that is **4 per render: two customers at once already sit at 8 of 10, and the third fails.** Increase to 1000 requested via CloudShell, request id `808f14502cca4879991991ce7168b4b6MKs29MiW`, which became `CASE_OPENED` (support case `178689720700826`) within a minute — the normal path for this quota on a new account. If AWS replies asking what the concurrency is for, answer it: an unanswered question is the usual reason one of these sits for days. `aws support describe-cases` will NOT work — the Support API needs a paid support plan — so read the case in the console or by email. Check it with `aws service-quotas get-requested-service-quota-change --request-id <id> --region eu-central-1`. **When it lands:** raise `REMOTION_LAMBDA_CONCURRENCY` in `/srv/adgen/.env` and restart the worker — env only, no rebuild — and measure one render at 3 vs ~25 before settling on a number. Note the credentials the app holds cannot read this quota (`lambda:GetAccountSettings` is denied to the `remotion` IAM user, deliberately), so this check is always a console/CloudShell job |
| ❌ | **Raising the quota alone does NOT buy throughput** | 🤖 then 👤 | The render box is **2 vCPU / 3 GB with `WORKER_CONCURRENCY=1`**, measured on the live container 2026-08-16. That 1 was chosen when matrix rendered LOCALLY (Chromium + ffmpeg on the same cores); matrix now renders on Lambda, so the worker mostly waits on the network — but it still runs scene-detect through ffmpeg locally and buffers uploads up to 200 MB in RAM. With the quota at 1000 and this box unchanged, customer number two still waits for customer number one while Lambda sits idle. Needs: a bigger box or a second worker, a re-measured `WORKER_CONCURRENCY`, and the streamed-upload fix below |
| ❌ ⛔ | **Domain + DNS** | 👤 | Nothing reserved. Blocks HTTPS, the Supabase auth callback, the Lemon Squeezy webhook URL, a sending address, and the R2 custom domain |
| 🟡 | **TLS / reverse proxy** | 👤 | **Written and staged** (`bd61c53`): `infra/Caddyfile` + a `caddy` service behind the `tls` compose profile, so nothing starts until asked. Verified on the VPS's real Docker that the profile adds caddy and nothing else changes. Switch-on steps are in the Caddyfile — the one that bites is that `web` must give up `80:3000` first. Still blocked on the domain |
| ❌ | **Sending email address** | 👤 | Supabase auth mail still goes out on Supabase defaults |
| ✅ | **Worker survives a deploy, and a wedged one is detected** | — | Fixed 2026-08-14 (`115cb25`, `03a3bbc`) and **proven with a real SIGTERM to the live container**: exits 0, drains first, and Node is PID 1 so Docker's signal is not filtered through pnpm. Liveness is a Redis heartbeat the compose healthcheck reads — "the loop beat recently", not "the process exists" |
| 🟡 | **Error alerting** | 👤 | Shipped and deployed 2026-08-14 (`d47815e`, 6 tests): a failed job POSTs one line to `ALERT_WEBHOOK_URL`. **It is unset on the live box, so nothing is reported today** — paste a Discord/Slack/Telegram relay url into `/srv/adgen/.env` and restart the worker. One line, no rebuild |
| 🟡 | **R2 public URL is still the `r2.dev` dev subdomain** | 👤 then 🤖 | Cloudflare rate-limits it and says not for production. Swap to `cdn.<domain>` once the domain exists |
| ✅ | **R2 bucket is PRIVATE** | — | Done 2026-08-16 by the owner: Settings → **Public Development URL** → Disable (the control is named that now, not "public access"; Custom Domains was empty). Verified from the VPS — `$R2_PUBLIC_URL/<anything>` returns **401** where it returned 404 an hour earlier, and the app still answers 200. With the deploy and 0008 both done first, nothing broke. Original item: |
| ~~❌ ⛔~~ | ~~**Make the R2 bucket PRIVATE**~~ | 👤 | Added 2026-08-16. The code stopped handing out permanent public urls (`26a0f34`: uploads return `/api/storage/<key>`, the route 302s to a signed url after the ownership check, the worker signs keys itself). **None of that closes anything while the bucket still answers anonymously** — the old `${R2_PUBLIC_URL}/uploads/<uid>/<timestamp>.mp4` form is guessable and still works. Cloudflare → the bucket → disable public access. Do it together with the row below, and after the deploy below |
| ✅ | **Rewrite pre-2026-08-16 asset urls — migration 0008** | — | `supabase/migrations/0008_asset_urls_through_route.sql`, **applied by the owner 2026-08-16** (reported, not verified by me — I have no DB access from here). Covers two tables, not one: `assets.url` is the ownership record, but every screen a customer looks at renders `jobs.result -> assets[] -> url`. New urls are built from the stored `storage_key`, rows without a key are untouched, re-running is a no-op. ⚠️ It was applied BEFORE the deploy, so between the two the app served links to a route that did not exist. That window is closed |
| ✅ | **Production is at `2484475`** | — | Deployed 2026-08-18 by Claude over SSH from the SECOND machine (the VPS key was already there, which `TODO.md` §8 warns is machine-local — it happened to be present). Both images rebuilt, all three containers `healthy` within 20s. **This deploy carried the money fix**: the re-entry guard, plus the Teredo SSRF branch, the storage traversal guard, and new dependency versions (undici 7.29, sharp 0.35.3, postcss 8.5.26) — which is why the build was long, it re-installed rather than re-compiled. Verified, not assumed: `/` and `/robots.txt` 200; all ten API routes present in `.next/server/app/api` including `storage` (the route a `.dockerignore` pattern once hid from every image ever built); the guard's own log strings found INSIDE the worker container; the NAT64 (`65435`) and Teredo (`8193`) constants both present in the compiled web chunk; and an unauthenticated traversal answering **401 rather than 400**, which is the discriminator proving the signing branch is live AND that the new guard runs after `authorise` as designed. Build cache pruned afterwards: 9.03 GB, disk 55% → 33%. Previous deploy: |
| ✅ | **Production was at `c3c2012`** | — | Deployed 2026-08-17 by Claude over SSH — icons, `robots.txt`, the dev-CSP fix and `Storage.delete`. The box had been at `4507717`, so this also shipped everything between. Both images rebuilt, all three containers `healthy`, verification and the failed first attempt written up in `SESSION_LOG.md` (2026-08-17). Disk 54% → 33% after pruning 11.15 GB of build cache. Previous deploy: |
| ✅ | **Signed-url change deployed** | — | Done 2026-08-16 by Claude over SSH: `/srv/adgen` pulled to `2741dba`, both images rebuilt, all three containers `healthy`. Verified on the box: `/` 200, `/api/storage/...` answers `401 {"error":"unauthenticated"}` (our route, not Next's 404), and a traversal payload also returns 401 rather than `400 invalid_path` — which is the discriminator proving the SIGNING branch is live and not the local-disk one. Worker startup logs `storage: s3-storage`, `renderer: remotion-lambda-renderer`. Build cache pruned afterwards (4.88 GB, disk 46% → 35%) |
| ✅ | **`/api/storage` was missing from every web image ever built** | — | Found 2026-08-16 while verifying the deploy above, and it is the reason that verification was worth doing. `.dockerignore` carried `**/storage` for the LOCAL_STORAGE_DIR working directory, and that pattern also matched `apps/web/src/app/api/storage/`, so the route never reached the image — `.next/server/app/api` listed nine routes and not this one. Harmless while production served assets from R2's public base url; **instantly fatal once asset urls became `/api/storage/<key>`**. Fixed at `2741dba` with anchored patterns (`/storage`, `apps/*/storage`) |

## 1b. Security review 2026-08-17 — what it found

Six independent read-only sweeps (auth ×2, API routes, storage/SSRF, money, infra/RLS), then every
claim re-verified against the code by hand — two of the six disagreed with each other about the
mapped-IPv6 case, and the one that was right is the one that had actually RUN the guard. **Nothing
below was accepted on a reviewer's word.**

| Status | Finding | Note |
|---|---|---|
| ✅ | **HIGH — SSRF: IPv4-mapped IPv6 walked through the guard** | Fixed `76dbb1d`. `isPrivateAddress` matched only the DECIMAL spelling `::ffff:127.0.0.1`, but `new URL()` normalises every mapped literal to HEX (`::ffff:7f00:1`) — even when the user types decimal — so the regex could never match a URL-sourced host and the address fell through to the IPv6 branch, whose default is "public". **Proven, not theorised:** `assertPublicHost('http://[::ffff:7f00:1]/')` returned `true`. No DNS record to control, no redirect to arrange — a signed-in user posts the URL and the server connects to its own loopback (Redis on `127.0.0.1:6379`) or to `169.254.169.254`. Hit `/api/scrape` and `/api/import-clip`. Now decodes hex to octets, plus a fail-CLOSED catch-all for any other `::ffff:` shape. 10 tests; the old unit tests could never have caught it because they pass the decimal string straight in and never see the normalisation |
| ✅ | **MED — SSRF: yt-dlp follows redirects, nothing re-validated them** | Fixed `76dbb1d`. `assertPublicHost` only judges the host the USER typed; yt-dlp then follows 302s with no flag to forbid them or pin an IP, so `http://evil.example/clip` → `http://169.254.169.254/…` was fetched from inside the VPS. `/api/scrape` closes this with `redirect: 'manual'`, which a spawned binary cannot use. Fixed by denying the attacker the first hop: `isAllowedClipHost` requires a platform we advertise (TikTok / YouTube / Instagram + `youtu.be` + the `vm.`/`vt.` shorteners — exactly what the paste box offers, so nothing shipped stops working, and a test walks all six URL shapes to prove it). Exact-match, never a suffix test — `endsWith('tiktok.com')` also accepts `eviltiktok.com`. `assertPublicHost` kept behind it |
| ✅ | **MED — credit minting failed OPEN on `NODE_ENV`** | Fixed. `/api/dev/credits/add` gated on `NODE_ENV === 'production' && !isAdminEmail`, so **every** other value — unset, empty, a typo, `NODE_ENV=test`, a container started without the var — left unlimited credit minting open to any authenticated user. Now `!== 'development'`: anything unrecognised lands on the safe side, and `next dev` sets `development` itself so local testing is unchanged. The old test suite had *encoded* the bug — it relied on vitest's `NODE_ENV=test` falling through — so it had to change with the fix |
| ✅ | **LOW — Redis had no password** | Fixed. `--requirepass` + both `REDIS_URL`s built from `REDIS_PASSWORD`, using compose's `${VAR:?}` form so an unset value **fails the deploy loudly instead of starting an open queue** — verified on the box: exit 1 with the named error unset, exit 0 with it set. The healthcheck had to change too: `redis-cli ping` answers NOAUTH once a password is set, so the bare probe would never go healthy and `depends_on: service_healthy` would have blocked the whole stack. ⚠️ **NOT DEPLOYED — see the blocker row below** |
| ✅ | **`REDIS_PASSWORD` set on the VPS, and the whole lot deployed** | — | Done 2026-08-17. `.env` backed up first (`.env.bak-20260817-093102`), one line appended, other 56 keys untouched. **Generated as HEX, and the first attempt was wrong in a way worth remembering:** `openssl rand -base64 32` emits `+`, `/` and `=`, and this value is embedded in a URL (`redis://:PASSWORD@redis:6379`) where `/` and `@` terminate the userinfo section — the client would not error, it would connect to a wrong host derived from the password's own characters. Caught by checking the generated charset before deploying rather than after; `openssl rand -hex 32` is URL-safe by construction and still 256 bits. Deployed at `731175b`: all three containers `healthy`, and **`redis-cli ping` from inside the container now answers `NOAUTH Authentication required`** while the worker connects fine and logs `listening` on both queues — which together prove the password is enforced AND correct. Disk 42% after the build |
| 📝 | **MED — `generate-scripts` spends provider money with no credit charge** | 👤 decides | Only control is `rateLimit('scripts:…', 6/60)`, which **fails open** when Redis is down. A zero-balance account = ~8.6k OpenRouter generations/day; during a Redis outage, uncapped. The route's own docstring says metering was blocked on migration 0005 — **which now exists**, so it is implementable today. Left alone deliberately: pricing was parked by the owner (§F5), and charging per script is a product decision, not a security patch |
| 📝 | **Plain HTTP in production** | 👤 | Session cookies traverse in the clear. Correctly gated in-code behind the inert `tls` profile until a domain exists. **Do not onboard a real user before TLS is live** |
| 📝 | Not fixed, recorded: `/api/dev/credits/add` is a CSRF-able GET (self-limiting — credits go to the victim's own account, admin-only in production); password rules are client-side + Supabase dashboard config, so a direct GoTrue POST bypasses the checklist; password reset has no captcha or app-side rate limit; the signed-storage branch has no path normalisation (rests on R2 treating keys literally) | 🤖 later |

**Confirmed solid, so nobody re-audits them:** RLS on the money tables — a browser client **cannot** UPDATE `profiles.balance` (0007 dropped the policy, 0009 fixed 0007's no-op revoke), `credits_ledger`/`credits_holds` locked, every mutation a `SECURITY DEFINER` RPC revoked from `anon`/`authenticated` · webhook HMAC verified **before** `JSON.parse`, timing-safe, idempotent on `external_ref`, paid variant cross-checked · overspend race closed by `reserve_credits`' `SELECT … FOR UPDATE` · no IDOR on `/api/jobs/[id]` · **no secret ever committed to git history** (the repo is public) · service-role key server-only (`next/headers` forces it) · open-redirect whitelist holds against `//`, `\`, `@`, control chars · Next 15.5 patches CVE-2025-29927 · CI has no secrets and uses plain `pull_request` · both worker `spawnSync` calls are argv arrays with a hardcoded numeric threshold, and ffmpeg only ever receives a worker-created temp path · `describeImage` does **not** fetch `sourceImages` from our VPS — it hands the URL to OpenRouter, who fetch it, which is why that key is exempt from the origin whitelist.

## 2. Money

| Status | Item | Who | Note |
|---|---|---|---|
| ✅ | **Billing layer restored** — Lemon Squeezy | — | Idempotent webhook (order id → `add_credits_idempotent`), paid-variant cross-check, redirect back to the app, production refusal when billing resolves to the mock. 24 tests |
| 📝 | ~~Never called with a real Lemon Squeezy key~~ — moot, it is asleep | — | Kept only so nobody re-discovers it as news: the provider is dormant and Stripe replaces it. If Lemon Squeezy is ever woken, this caveat returns |
| ❌ ⛔ | **Whose company takes the money — DECIDED 2026-08-16: an LLC, owner Serbian and resident in Serbia** | 👤 | **This project no longer has a German angle.** Everything written before today that reasons from Frankfurt, a Gewerbe, a Steuerberater or EU VAT on a Serbian entity is superseded by this row. What has NOT changed: **no euro may be taken and no real user onboarded until the entity exists and the payment account is in its name** — otherwise the operator, the taxpayer and the data controller are all the owner personally. Waiting on LLC confirmation |
| 🟡 | **Lemon Squeezy is ASLEEP; Stripe once the LLC is confirmed** | 👤 opens Stripe | Done 2026-08-16 (`16dee4f`): `createBillingProvider` now requires `BILLING_PROVIDER=lemonsqueezy`, so a full set of valid keys with the switch unset still resolves to the mock — and production refuses checkout on a mock provider. Dormant rather than deleted, because this layer was already deleted once (2026-08-10) and restored three days later at the cost of a full re-wire. Original decision: | Owner's decision 2026-08-16: Lemon Squeezy is out, Stripe goes in after LLC confirmation. It was chosen as a merchant of record because that carried EU VAT for a Serbian entity — the reasoning the new structure replaces. ⚠️ **Read this before deleting anything: this exact layer was deleted on 2026-08-10 and restored on 2026-08-13**, and the restore cost a full re-wiring plus re-hardening (webhook variant cross-check, mock refusal in production, opaque 500). Deleting it a second time means a third build when Stripe lands, and a Stripe webhook is not shaped like Lemon Squeezy's anyway. **The cheaper shape is to leave the code dormant behind the provider factory and delete only the env vars and the checkout entry point** — one line in the factory keeps it unreachable. Owner's call; recorded here rather than done, because the deletion is not reversible from the app's side |
| ✅ | **Migration 0007 + 0009 (credit self-grant)** | — | `profiles_update_own` let any logged-in user set their own `balance` and spend it on real provider calls. **Both applied and verified 2026-08-16** — see the row in §1 for why 0009 exists: 0007's column-level revoke was a no-op against a table-level grant, so the second lock only landed with 0009 |
| ❌ | **Refunds / chargebacks (L3.6)** | 👤 then 🤖 | Needs a decision first: a reversal arriving after the credits were SPENT → negative balance, clamp at zero, or freeze the account |
| ✅ | **Credit reservation is a real database hold** | — | Finished 2026-08-16 (`32a6db6`, migration `0010_credit_holds.sql`, applied by the owner and deployed the same evening). `reserve_credits` takes the profile row's write lock, sweeps expired holds and admits the job only if `balance - held >= cost`, so two enqueues in the same millisecond are serialised by Postgres — the thing no application-side check could do. Holds live in their own table because a hold is not a charge, and they expire after an hour so a killed worker cannot freeze a customer's balance. The worker releases on every terminal path, and a failing release is logged and swallowed rather than turning a delivered job into a failed one. **VERIFIED 2026-08-16**, not just reported: both functions exist in `pg_proc`, `information_schema.routine_privileges` returns no grant to `anon`/`authenticated`, and `pg_policies` returns nothing for `credits_holds` — so the hold is unreachable from a browser, which is the same class of hole 0007 closed on `profiles.balance` |
| ✅ | **Migration 0011 — one charge per job — APPLIED 2026-08-18** | — | Applied by the owner in the SQL editor of the ACTIVE project `iqfzhnndhhrprkrkfygd`. ⚠️ **Two Supabase project ids appear in this repo's docs and the older one is a trap**: `gczikdrskcpqqlyzvnby` was PAUSED under a different account and abandoned, and `PODSETNIK.md` (2026-08-09) still claims only 0001–0006 are applied, which was eight days stale. Nothing here trusted a document — the live DB was asked directly, and answered that 0001–0010 were all present. Reconciliation ran BEFORE applying and returned **zero rows**, so no customer had ever been double-charged. Then verified in BOTH directions: the index appears in `pg_indexes` with its partial `WHERE ((reason = 'job_spend') AND (job_id IS NOT NULL))`, AND a rolled-back transaction duplicating a REAL `job_spend` row was refused with `23505` — proving it rejects a second charge rather than merely existing. The file's own reconciliation query named a column `amount` that does not exist (`delta` does) and was corrected |
| ✅ | **The re-entry guard is DEPLOYED — 2026-08-18** | — | `10bd75a`, live at `2484475`. The window between applying 0011 and this deploy lasted about half an hour and nothing ran through it. **Verified INSIDE the running image rather than assumed** — the deploy that mattered most here is the one where a `.dockerignore` pattern once silently kept a whole route out of the image, so: `docker exec adgen-worker-prod grep "job was already charged" src/job-state.ts` returns a hit, and `charged_no_result` appears 3×. Both containers `Up … (healthy)`, worker logs real providers on both queues (`s3-storage`, `remotion-lambda-renderer`, `elevenlabs-voice`, `openrouter-script`) at concurrency 1 heavy / 4 light. Original row: |
| ~~🟡 ⛔~~ | ~~**The re-entry guard is written but NOT DEPLOYED — and 0011 makes that matter more, not less**~~ | 🤖 deploys | `10bd75a`. With 0011 applied and the OLD worker still on the box, a stalled re-delivery now ends as **charged once, error, nothing delivered**: the pipeline re-runs, the index refuses the second charge, and the existing charge-failure path deletes assets by `job_id` — taking the FIRST attempt's rows with it. That is better than double-billing (the money is right) but it is not the intended outcome, and applying 0011 is what turned it from theoretical into reachable. A worker deploy converts it to "charged once, delivered". Needs a stall on a long render to fire, so it is not an emergency — but it should not wait for the domain |
| ❌ | **Per-job cost compared against real invoices** | 👤 | The worker logs units (characters, render seconds); nobody has held them next to an ElevenLabs or OpenRouter bill |

## 3. Tools — does the card tell the truth?

Trimmed 2026-08-14 by the functional audit: a card links to a wizard ONLY if a pipeline exists.

| Status | Tool | Note |
|---|---|---|
| ✅ | **Video reklame** (`matrix`) | Renamed from "Matrix" 2026-08-13. Real script, real TTS, scene-detect montage, Lambda render |
| ✅ | **AI slike** (`image_ads`) | ✅ LIVE through `runPipeline` 2026-08-14: 196.3s, 1.17 MB png on our own url. **kie.ai timed out at 180s and the fal.ai fallback carried it** — the first time that fallback has fired for real. 196s for one image is a bad wait. ~~consider lowering the kie timeout so the fallback starts sooner~~ — **done the same day, confirmed 2026-08-17**: `ai.kiefal.ts:41` splits the one timeout in two, `KIE_IMAGE_MAX_WAIT_MS` 60 s for the PRIMARY (giving up is cheap — the fallback is right there) and `FAL_IMAGE_MAX_WAIT_MS` 3 min for the FALLBACK (when it gives up the job fails). Not re-measured live since |
| ✅ | **Poboljšaj kvalitet** (`enhance`) | ✅ LIVE through the WHOLE pipeline 2026-08-14: 14.6s, 543 KB on our url. The earlier ✅ on this row was overstated — it had only exercised the fal provider, and the ownership copy into R2 was in fact broken for every customer until `81a023b` |
| ✅ | **Skini tekst** (`remove_text`) | ✅ LIVE through the WHOLE pipeline 2026-08-14: 14.6s, 335 KB on our url. Same correction as the row above — the earlier ✅ covered the provider only. Images by design; video erasers are negative margin |
| ❌ | **Brzi test · Edit videi · Mix · Prevod** | Wizard exists, pipeline does not. Now badged USKORO instead of linking to a wizard that ends in an error |
| ✅ | **Preozvuči** (`revoice`) | ✅ LIVE through the WHOLE pipeline 2026-08-14: 90.7s, 9.6 MB mp4 on our own url (`ttsCharacters 185`, `renderSeconds 81.4`). Reachable via the montage switch in step 3 of the Video-reklame wizard, which sends this job type and quotes its own cheaper price. **All five working tools have now been run end to end through `runPipeline`** |

## 3a. Renaming the two video tools, and telling the customer what each one DOES

Owner's decision, 2026-08-18, after testing the competitor's product by hand. **Names are not
final — the owner has not settled on them yet.** What IS decided is that both must change and
that each needs explanatory copy.

| Status | Item | Who |
|---|---|---|
| ❌ | **`matrix` — rename away from "Matrix"** | 👤 names it, 🤖 does it |
| ❌ | **`revoice` — rename, and say plainly that ONLY the audio changes** | 👤 names it, 🤖 does it |
| ❌ | **Each tool gets instructions + "what you get"** | 👤 approves copy |

**Why now, and it is not the same reason as last time.** The 2026-08-13 rename (Matrix → "Video
reklame") was about the word telling the customer nothing. This one is worse than a vague name —
**the same word means the OPPOSITE thing at the competitor.** Established by the owner's hands-on
test of their product on 2026-08-18:

| Their tool | What it actually does | Our equivalent |
|---|---|---|
| **"matrix video"** | ONE clip, not combined with anything: original audio muted, then script + voiceover + music + captions over it | our **`revoice`** |
| **"edit video"** | joins 2–3 clips, then script + voiceover + music | our **`matrix`** |

So a customer arriving from the competitor reads "Matrix" as *the tool that only changes the
sound*, and in our product clicks into *the tool that cuts and reassembles their footage*. That is
not ambiguity, it is a name pointing at the wrong product. Working titles from the owner:
something like **"Nova reklama"** for `matrix` and **"Voiceover reklama"** for `revoice`.

**The distinction the copy has to carry.** Against their `edit` — the one our `matrix` actually
competes with — the difference is narrower than "they don't combine, we do", and the copy must not
overclaim:

- They **concatenate**: whole clip after whole clip.
- We scene-detect every uploaded clip into a pool of shots (`detectShots`, then `buildMontage` per
  variant, `apps/worker/src/pipelines.ts`) and assemble each variant from shots taken across ALL
  the clips, so different variants get genuinely different cuts.
- **Whole clips joined vs. scenes mixed** is the sentence the card has to say out loud, because a
  customer cannot see it from a product name. ⚠️ And it is a claim nobody has verified with their
  eyes yet — see the standing item that no human has run our wizard end to end. If our montage
  does not visibly beat a concatenation on the same three clips, this copy is a promise the
  product does not keep.

For `revoice` the copy problem is the opposite — it must UNDERSELL, clearly: the video you get
back is your own clip, unchanged, with the original audio muted and a new voice, music and
captions over it. That is exactly what the owner observed the competitor's whole flagship doing.
A customer who expects new footage from this tool will feel cheated even though the tool did its
job.

⚠️ **Implementation constraint — rename the LABEL, never the job type.** The display names live in
`JOB_DESCRIPTORS` in `packages/core/src/pricing.ts:48+` (`label`, `description`, `benefits`). The
strings `'matrix'` and `'revoice'` are load-bearing identifiers and must NOT be touched: they are
`jobs.type` in the database (migration 0006 added `revoice`), they key `JOB_COST`, and
`HEAVY_JOB_TYPES` in `packages/core/src/queue.ts:23` routes both to the heavy lane by that exact
string. This is the same trap the queue rename hit — a job already sitting in Redis under the old
name is stranded silently, with no error anywhere. The route path `/app/matrix` is a third,
separate decision: changing it breaks any bookmark and needs a redirect, and it can be left alone
even after the label changes.

## 3b. Profil / podešavanja — MISSING ENTIRELY

Requested by the owner 2026-08-14 and built the same day. **Verified against the code 2026-08-16: all four
rows below that were still marked "in progress" are DONE** — the page is titled "Moj profil", `CREDIT_PACKS`
is rendered only by `app/profil/page.tsx` (so the packs did leave Početna), the sidebar collapse is real
(`desktopCollapsed`, with `aria-expanded`), and the instant-credit button is gated by `isAdminEmail` outside
development. The file had been carrying them as open for two days.

| Status | Item | Note |
|---|---|---|
| ✅ | **Profile entry point** | `/app/profil` shipped 2026-08-14. Reached by clicking the email in the topbar — and ALSO from the sidebar, because the email sits in a `hidden sm:block` container and on a phone there was nothing to click at all |
| ✅ | **Renamed to "Moj profil"** | Owner's wording, 2026-08-14. Everywhere it is named: the nav entry, the topbar link title, the page heading |
| ✅ | **Credits moved off the dashboard into the profile** | Owner's decision, 2026-08-14. The packs currently sit at the bottom of Početna; that is not where a returning customer looks for them, and it pushes the tools down |
| ✅ | **Collapsible sidebar** | Owner's request, 2026-08-14. A toggle slides the left nav out of view and stays visible so it can be brought back. Today it is fixed on desktop and only the mobile hamburger can hide it |
| ✅ | **Change password** | Done 2026-08-14. Reuses the existing `validatePassword` checklist and `PasswordRules`, maps Supabase's English through `authErrorMessage`, and announces both failure and success (`role="alert"` / `role="status"`) |
| ✅ | **Buy / add credits from the profile** | In progress — the packs move off Početna entirely. The production admin gate on the instant-credit button has to move WITH them, or every production user gets free credits |
| ✅ | **Timezone + time display** | Done 2026-08-14, and actually wired: the job list formats through `formatDateTime` with the picked zone, read server-side off the cookie. An unknown zone falls back instead of throwing — `Intl` raises `RangeError`, which would have broken every page showing a date |
| 🟡 | **Account basics** | Email and sign-out shipped 2026-08-14. **Delete-my-account is the one still missing.** The technical half of the blocker is gone as of 2026-08-17 — `Storage.delete` exists and both providers implement it (§5) — so erasing a person's files is now possible. What remains is entirely a decision: WHICH rows and objects go (assets only, or the profile and its credit ledger too — a spent-credit history is also an accounting record), whether deletion is immediate or a grace period, and what happens to a job that is mid-render. Nothing should be built until those are answered; a GDPR obligation half-honoured is worse than one not yet offered |
| ❌ | **Invoices / purchase history** | Lemon Squeezy is a merchant of record and issues the invoice, so this may be a link out rather than a screen we build. Decide before building anything |

Two things to settle before writing code: whether this is a full page (`/app/profil`) or a panel,
and whether "delete my account" ships in the first version — because promising it and not honouring
the file deletion is worse than not offering it yet.

## 3c. Homepage — the first thing a stranger sees

Raised by the owner 2026-08-14. Two problems, both measured on the live page.

### A. It shows every tool, half of which do not exist — ✅ RESOLVED 2026-08-16 (`844c1c8`), A1 was taken
Confirmed against the code 2026-08-17: the landing renders only the tools with a pipeline, the
dashboard keeps the full list with its badges, and the landing has a test of its own now. The
options table below is kept because it is what the decision was made against.

The original problem: the landing renders all 10 cards, and **5 carry an USKORO badge**. A visitor's first impression is
a catalogue that is half "coming soon", which reads as a product that is not ready — and it buries
the five that do work. The dashboard is the right place for the full list; the landing is a pitch.

| Option | What it does | Cost of being wrong |
|---|---|---|
| **A1 (recommended)** | Show ONLY the tools with a pipeline — the five that work. Drop USKORO from the landing entirely; the dashboard keeps showing them | If a tool ships later, one line adds it back. Nothing is lost — the badge already exists on the dashboard |
| A2 | Show three headline tools (Video reklame, AI slike, Poboljšaj kvalitet) and a "vidi sve alate" link | Strongest pitch, but hides two working tools from someone who came for them |
| A3 | Keep all ten, collapse the five USKORO into one line of text under the grid | Least change, still admits half the catalogue is unbuilt on the front page |

A1 needs no new mechanism: `isToolSoon()` already exists and the landing already imports it.

### B. The 9:16 slot is an empty box
`apps/web/src/app/page.tsx:67-71` renders a `phone-frame` div containing the text `1080×1920` (the
line number was 58 when this was written; re-checked 2026-08-17 — still there, and it is the only
row in §3c still open). It
occupies the hero's most valuable space and shows a placeholder where the product's actual output
belongs. **We now have real renders in R2** — the verification runs produced finished mp4s.

| Option | What it does | The catch |
|---|---|---|
| **B1 (recommended)** | A poster frame from a real render, with a play control that starts the video on click | No autoplay bandwidth on every visit. `r2.dev` is rate-limited and Cloudflare says not for production, so a 9.6 MB autoplaying file on the landing page is a real risk |
| B2 | A short muted autoplay loop, 2–4 seconds, re-encoded small (target < 1.5 MB) | Best impression, but needs someone to produce and store that asset, and it still spends `r2.dev` requests on every visit |
| B3 | Drop the frame; give the hero space to the offer and CTA | Honest and cheapest. Loses the "this is what you get" signal that sells a video product |

Both B1 and B2 depend on **one decision the owner has to make: which render to use as the sample.**
No code can pick that — it is the shop window.

### C. The landing cards and the dashboard cards do not look alike — ✅ FIXED 2026-08-16 (`844c1c8`)
Verified against the code 2026-08-17: `apps/web/src/app/page.tsx:108-109` now passes both
`benefits={t.benefits}` and `theme={t.theme}`, and the main grid matches the dashboard's 2 columns.
Kept as the record of what drifted and why, because the mechanism is the interesting part:

Both screens render the SAME component (`MainToolCard`), and `page.tsx`'s own comment says they
reuse it "so the two screens cannot drift". They drifted anyway, through props rather than through
code: the dashboard passes `benefits={t.benefits}` and `theme={t.theme}`, and **the landing passes
neither**, so the component falls back to the neutral `card` class with no benefit bullets and no
per-tool colour wash. Both values already exist on `JOB_DESCRIPTORS` — nothing needs designing,
they are simply not being handed over.

| | Dashboard | Landing |
|---|---|---|
| `theme` | passed → `.card-tool--<hue>` wash + coloured edge | omitted → flat neutral card |
| `benefits` | passed → three check-marked lines | omitted → one description line |
| main grid | 2 columns | 3 columns, so cards are narrower |

Fix: pass both props on the landing and match the main-tier grid to the dashboard's 2 columns.
Mechanical and small. **One thing to decide while doing it:** §3c-A above already decided the
landing should show only the tools that WORK — doing that first changes which cards this even
applies to, so do A then C, not C then A.

| ✅ | **Favicon + robots.txt — DEPLOYED** | — | Live on the VPS 2026-08-17 (`c3c2012`, both images rebuilt, all three containers healthy). Verified against production, not just locally: `/` 200, `/robots.txt` 200 serving `User-Agent: *` + `Disallow: /` (27 bytes), `/favicon.ico` 200 `image/x-icon` 2543 B, `/icon.svg` 200 `image/svg+xml`, `/apple-icon.png` 200 `image/png` 4347 B. **So the site now tells crawlers to stay out** — that was the reason to deploy this at all. Build detail below: `/favicon.ico` (2543 B, `image/x-icon`), `/icon.svg`, `/apple-icon.png` (180²) and `/robots.txt` all answer 200 with the right content types, and the page emits all three `<link rel>` tags. The mark is obsidian's own `--action-grad` (#7c5cff → #4dd6ff) with a white play triangle, and it carries its OWN background — a transparent glyph disappears into either a white or a near-black tab strip. The rasters are generated by `scratchpad/gen-icons.mjs` (dependency-free: sharp is not resolvable in this workspace and `.clinerules` forbids adding a dependency), so the mark can be regenerated rather than redrawn. **`robots.txt` currently says `Disallow: /` on purpose** — no domain, an Impressum of labelled blanks, and no wizard clicked end to end; an early index entry outlives the state that produced it. One line flips it at launch: `ALLOW_INDEXING = true` in `apps/web/src/app/robots.ts`, and `/app`, `/api/` and `/auth/` stay disallowed either way. ⚠️ Note the literal path `/apple-touch-icon.png` still 404s — Next serves the icon at `/apple-icon.png` and points iOS at it with a link tag, which every iOS since 4 reads; only a bare root-path probe would miss |
| ✅ | **Nothing hydrated in `next dev` — the CSP was blocking it** | — | Found 2026-08-17 by clicking in a real browser while verifying the favicon, and it had been true since the nonce CSP landed (`be22b61`): the dev client bundle runs through `eval`, the policy had no `'unsafe-eval'`, so main-app.js threw `EvalError`, the client bootstrap died, `window.next` never appeared and **no React handler was ever attached on any page**. Every screen rendered perfectly and every button did nothing — clicking a theme switch changed no attribute and set no cookie. Free in production (the production bundle contains no eval, which is why the 2026-08-16 check passed) and expensive everywhere else: it made local browser verification lie, since a dead page is indistinguishable from a broken component. Fixed by parameterising the policy — `buildCsp(nonce, { dev })` adds `'unsafe-eval'` and `ws:` in development ONLY, with four tests pinning that production carries neither and that the two policies are otherwise byte-identical. Verified after the fix: `window.next` present, a theme click set `data-theme="poluton"` and the cookie. **And verified on PRODUCTION after the 2026-08-17 deploy — the half that actually needed proving:** the deployed policy reads `script-src 'self' 'nonce-…' 'strict-dynamic' https: 'unsafe-inline'` and `connect-src 'self' https:` — no `'unsafe-eval'`, no `ws:`, so the development loosening is genuinely absent from the shipped app rather than merely absent from a test |

## 4. Output quality

| Status | Item | Note |
|---|---|---|
| ✅ | **The script model sees the product** | Wired 2026-08-14: the first product image is described once per job and appended to the prompt. Degrades to no-extra-context on any failure — a vision hiccup must never fail a paid job |
| ❌ | **Third-party watermarks in imported clips** | Decision recorded (exclude dirty shots, never erase); nothing built |
| 🟡 | **No music/SFX library — approach DECIDED 2026-08-18, blocked on a key** | Bring-your-own only today, and the Matrix description no longer claims otherwise. **The plumbing is already complete** — `upload-constraints.ts` accepts mp3/wav/ogg/m4a, the wizard has a music picker with a volume slider (warning above 45%, where music starts beating the voice) and an SFX picker, and `MatrixAd.tsx` mounts both. Nothing needs building except a SOURCE of audio. See §4a |
| 🟡 | **Script quality** | The blind eval concluded "no model produced broken Serbian", NOT "the cheapest is as good as the best". Re-run scoring each axis if a bad script ever ships |

## 4a. Music + SFX — the approach is decided, the blocker is a key

Owner's decision 2026-08-18, after finding that the competitor offers a music picker and we do
not. **Chosen: generate a small library ONCE, curate it by ear, store it in R2** — not a licensed
catalogue, and not per-job generation.

| Status | Item | Who |
|---|---|---|
| ⛔ | **The local `ELEVENLABS_API_KEY` is a key ID, not a key** | 👤 |
| ❓ | **Licence question, unanswered — gate before shipping to customers** | 👤 |
| ❌ | Generate ~6 moods + 4 cues, listen, keep the good ones, upload to R2 | 🤖 after both above |
| ❌ | Wire the picker to the stored library instead of upload-only | 🤖 |

**Why generate rather than licence a catalogue.** Most "royalty-free" subscriptions (Epidemic,
Artlist and similar) license the SUBSCRIBER for their own productions — not redistribution to
customers as part of a SaaS, which is exactly what a music picker inside this product does. That
distinction is where the money and the risk are, and it is why a catalogue was not chosen.

**Why generate ONCE rather than per job.** Per-job generation adds latency and cost to every paid
job and another provider in the paid path. A one-time batch costs pennies, adds zero latency, and
the picker the wizard already has does not change at all.

**The provider is already paid for and already wired**: ElevenLabs does both.
`POST /v1/music` (3 s–10 min, `force_instrumental` — a vocal track fights the voiceover for the
same frequencies) and `POST /v1/sound-generation` (0.5–30 s). Music V2 is trained on licensed data
only, backed by Merlin Network and Kobalt deals, and paid plans carry a commercial licence.

⛔ **BLOCKER, and it is not one of the seven missing keys — it is worse.** The seven are ABSENT;
this one is PRESENT with the wrong value, which looks correct until it is called. The local `.env`
holds the key **ID** (83 chars, starts `a38`); the real key is 51 chars and starts `sk_`, and
ElevenLabs shows it only at creation or rotation. **The working key is already on the VPS** —
`/srv/adgen/.env` was checked and holds the `sk_` form — so nothing needs rotating, the line just
has to be copied down:

```bash
ssh root@5.75.154.153 'grep "^ELEVENLABS_API_KEY=" /srv/adgen/.env'
```

⚠️ Two traps found while diagnosing this, both worth keeping: the `.env` line carries an **inline
comment** (`KEY=value  # note`), and a parser that keeps it sends a corrupted key that comes back
as a flat `401 invalid_api_key` — indistinguishable from a revoked key. Only after stripping the
comment did the API return the real message (`API key ID used as API key`). **A 401 from this
provider is not evidence that a key is dead.**

❓ **The licence question that is still open, and it is the one that decides whether this ships.**
Paid plans grant commercial use of generated output — but our use is not "we put music in our own
video". We would **redistribute** generated tracks embedded in videos delivered to paying
customers. Self-serve plans exclude film/TV/Studio Games and point large-scale commercial
distribution at Enterprise. Where a SaaS music picker falls is not something I can read off the
docs, and it is not something to assume: it is a question for ElevenLabs' Music Terms or their
sales. Generating SAMPLES for internal evaluation raises none of this; shipping them to customers
does.

The generation probe is written and ready to run the moment the key lands:
`scratchpad/gen-audio-samples.mjs` — 6 moods × 15 s instrumental, plus whoosh/pop/ding/riser.

## 5. Legal (before any real customer)

| Status | Item | Who |
|---|---|---|
| ✅ | **Legal pages re-founded on the Wyoming LLC** | — | Done 2026-08-16 (`699d28c`). Every German statute reference removed rather than translated: `/impressum` is now "Podaci o pružaocu usluge" (US company identification, no § 5 DDG / § 27a UStG / Gewerbe), `/uslovi` names Wyoming as governing law with the consumer carve-out kept and strengthened, `/privatnost` states the controller is outside the EU and that this removes neither GDPR (we offer the service to people in the EU) nor Serbian ZZPL. The Terms also gained the clauses the competitor comparison found missing — successful-delivery definition, age rule, price-change notice, rights assignment, expanded prohibitions with a consequence ladder, account closure, contact block — and Privacy gained security, children, policy-updates, server logs and anonymisation. **What is still blank is only identity**: legal name, address, filing id, registered agent, responsible person, contact email |
| ~~❌ ⛔~~ | ~~**All three legal pages were written for the OLD structure**~~ | — | Decided 2026-08-16: the operator is an LLC whose owner is Serbian and resident in Serbia, and this project has no German angle any more. Every page that assumed otherwise is now wrong at the top, not just unreviewed: `/uslovi` names a governing law and forum, `/impressum` is built around **§5 DDG, a German statute**, and `/privatnost` names the controller. Which of the three is even required, and under whose law, is a question for whoever advises the LLC — I will not guess a jurisdiction into a statutory page |
| ❌ ⛔ | **Gaps found by comparing against EcomAlati (2026-08-16)** | 👤 decides, 🤖 drafts nothing | Their pages were fetched and compared clause by clause. **We are not behind overall** — we have an Impressum, an EU withdrawal-right mechanism, per-processor jurisdiction detail, legal basis per data category, a governing-law clause with a consumer carve-out, and a liability structure that would survive EU consumer law where their flat 12-month cap likely would not. **What they have and we do not:** an age rule; a definition of "successfully delivered" output (theirs: a technically delivered result counts, remedy is free regeneration, never a refund — this is the clause that decides credit disputes); a price-change notice period; explicit assignment of any rights the provider might hold in the output; scraping/reverse-engineering/resale prohibitions with a stated consequence ladder; user-initiated account closure; a full contact block inside the Terms; server-log collection declared; a **security section**; a **children clause**; a privacy-policy update mechanism; and bilingual pages. Two of theirs must NOT be copied: their flat liability cap and their silence on statutory withdrawal rights would both be regressions for a seller into the EU |
| ⚠️ | **No legal review — accepted risk, owner's decision 2026-08-16** | 👤 | "Advokata nema i verovatno ga neće ni biti." Recorded rather than argued: the three pages were written by an LLM against what the product actually does, and nobody with a licence has read them. That is a business risk the owner has taken knowingly. It is not re-raised anywhere else in this file |
| ❌ ⛔ | **Six identity facts to fill in** | 👤 | Legal name, street address, Wyoming filing id, registered agent, responsible person, contact email. Every `[[POPUNITI]]` left in the three pages is one of these. They are statements of fact about a real company and cannot be invented; the pages carry a red warning until they are filled |
| ✅ | Impressum re-scoped (was: decide whether it applies, then name the operator) | — | The page ships as labelled blanks (`[[POPUNITI: …]]`) with a red warning, deliberately — an invented Impressum is an offence and, worse, looks finished. That was the right call and it still is; what changed is that the statute it cites may no longer be the applicable one |
| ❌ | GDPR / cookie consent | 🤖 after the lawyer |
| ❌ | 30-day retention | 👤 sets the bucket rule; 🤖 does the expired-asset UI, which would lie until the rule exists |
| 🟡 | **`Storage` CAN delete now — but nothing calls it** | 👤 decides the policy, 🤖 wires it. Added 2026-08-17: `Storage.delete(key)` is on the interface and implemented by both providers (`S3CompatibleStorage` sends a `DeleteObjectCommand`; `MockStorage` removes the file and REFUSES a key that resolves outside the storage root). Idempotent by contract — a missing key is a success, because every real caller (retention sweep, GDPR erasure, a retry after a partial failure) runs twice on the same key sooner or later — while a transport failure still rejects. 6 tests, and all four ways of breaking it were tried on purpose: dropping the traversal guard, dropping `force: true`, deleting from the wrong bucket, and swallowing the SDK error each failed exactly one test and nothing else. **Deliberately not wired to anything** — no route, no worker path, no UI. The capability was the blocked half; who may call it is still the decision below. Original row: |
| ❌ | ~~**`Storage` has no `delete` method at all**~~ | 🤖 after a 👤 decision. Found 2026-08-14. Retention by R2 lifecycle rule is legitimate and is the plan — but it means the APP cannot delete a file on request, so a GDPR erasure or a "remove this video" button has nothing to call. Decide whether deletion is bucket-only or the app needs the capability before a real user asks. One artifact is already stranded by this: `renders/lambda-dqbz7jwul1.mp4`, ~1 MB, from the live render verification |

Deliberately not drafted by me: this carries real legal weight, and generated placeholder text is
worse than none because it reads as if it were coverage. **Updated 2026-08-16:** the cross-border
question is no longer DE/RS/EU but LLC/RS/EU — and note that GDPR does not follow the company's
address: it follows the customers, so selling to buyers in the EU keeps those obligations whatever
the entity is. Do not let "we are not in Germany any more" be read as "GDPR no longer applies".

## 6. Testing

**1059 tests** (core 385, web 551, worker 123) — **counted from a real run 2026-08-17**, and the
number this line carried before (979 / 365 / 495 / 119) was already 67 tests stale before this
session added 21. Treat any census here as a claim to re-measure, not a fact. `pnpm -r typecheck`
clean on all five projects, and **CI actually runs them now** (`a7f22e2` — until that commit the workflow ran only
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
| 🟡 ⛔ | **The dashboard has been seen; the six WIZARDS have not** (owner sent a dashboard screenshot 2026-08-16, which is how the landing/dashboard card mismatch was found). Original note: **Nobody has seen the SIGNED-IN screens** — dashboard and all six wizards. I cannot reach them: they are behind auth, and I do not create accounts or type passwords on the owner's behalf. **The owner works remotely from a second machine and cannot log in from the browser pane either**, so this waits until he is at the home machine. One login is enough — after that every page can be walked and screenshotted in one pass |
| ❌ ⛔ | **No human has clicked a wizard end to end** |
| 🟡 | **Signup click-tested by the owner 2026-08-16 — password recovery still not** | 👤 | Registration works, reported by the owner. Recovery is the untested half and it sends a REAL email, which is why nobody has poked it |

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
7. **Only then**: watermark handling, a music library, the expired-asset state. ~~per-job-type worker
   concurrency (cheap tools 4, matrix 1 — BullMQ does it with separate queues)~~ — **already built,
   checked 2026-08-17.** `packages/core/src/queue.ts:11-27` runs two queues (`adgen-jobs` for the
   heavy types `matrix`/`revoice`, `adgen-jobs-light` for everything else, unknown types defaulting
   to light), `apps/worker/src/index.ts:121-141` gives each its own Worker, connection and
   concurrency env (`WORKER_CONCURRENCY` / `WORKER_CONCURRENCY_LIGHT`, both defaulting to 4), and
   `infra/docker-compose.prod.yml:54` sets `WORKER_CONCURRENCY: '1'` — so production already runs
   one render at a time next to four cheap jobs. What is genuinely left is not code but the
   MEASUREMENT in the §1 throughput row: nobody has timed a render on this box to pick the number.

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
ssh root@5.75.154.153 'cd /srv/adgen && set -a && . ./.env && set +a && docker compose -f infra/docker-compose.prod.yml -p adgen up -d --build'
ssh root@5.75.154.153 'cd /srv/adgen && set -a && . ./.env && set +a && docker compose -f infra/docker-compose.prod.yml -p adgen ps'
```

⚠️ **Since 2026-08-17 EVERY compose command against this file needs the env sourced — `ps` and
`logs` included, not just `up`.** `REDIS_PASSWORD` is referenced with `${VAR:?}`, so compose refuses
to even interpolate the file without it and prints
`required variable REDIS_PASSWORD is missing a value` four times. That is the fail-closed guard
doing its job (the alternative was silently starting an unauthenticated queue), but it means a bare
`docker compose … ps` now errors where it used to work.

⚠️ **`set -a && . ./.env && set +a` is not optional, and this file used to omit it** — which cost a
failed build on 2026-08-17. The web image bakes `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` in as BUILD args, and compose reads its own default `.env` relative
to the compose file (`infra/`), where there is none — so without exporting them the build reaches
`apps/web/Dockerfile:68` and stops with *"NEXT_PUBLIC_SUPABASE_URL build arg is empty"*. That guard
is doing its job: the alternative is an image that builds fine and serves an app with no Supabase
URL compiled into it. The compose file's own comment above the `args:` block has always said this;
this file was the one that was wrong. Note also that `ps` needs `cd /srv/adgen` too, or compose
resolves the relative `env_file` paths from the wrong directory.

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
