# Comprehensive Project & Site Audit — AdGen (SaaSUGC)

**Date:** 2026-08-16
**Scope:** Full read-only audit of every tracked file in the monorepo: security, architecture, database, billing/business logic, worker/pipeline, infrastructure/deployment, CI/CD, frontend, legal/privacy, docs accuracy, dependencies, tests. No code, config, or doc was modified. The only artifact created is this file (explicitly commissioned by the task).

**Method:** Line-by-line reading of all 7 SQL migrations, all 12 web API routes, all security-relevant libs (`safe-url`, `rate-limit`, `admin`, `yt-dlp`, `password`), middleware + Supabase clients, the entire `packages/core` provider surface (factory, env, storage, billing, AI router, script, voice, renderer, scraper, media-edit), `packages/db` client/seed, the full worker (1021-line `index.ts`, scene-detect, montage, approved-scripts, alert, health), all infra files (both compose files, Caddyfile, both Dockerfiles, `.dockerignore`), CI workflow, `sync-env`, auth/legal/frontend pages, plus regex sweeps for XSS sinks. Verification gates (`typecheck`, `lint`, all 3 test suites) were executed read-only.

---

## 0. Verification gates (actually run, real output)

| Gate                               | Result                            |
| ---------------------------------- | --------------------------------- |
| `pnpm -r typecheck`                | ✅ all 5 workspace projects: Done |
| `pnpm --filter @adgen/core test`   | ✅ **362/362 passed** (22 files)  |
| `pnpm --filter @adgen/web test`    | ✅ **454/454 passed** (35 files)  |
| `pnpm --filter @adgen/worker test` | ✅ **108/108 passed** (11 files)  |
| `pnpm -r lint`                     | ✅ No ESLint warnings or errors   |
| `git status --short`               | clean working tree during audit   |

⚠️ One flake observed: the **first** core run had `1 failed | 361 passed` — a single 5-second test timeout under cold-start load (transform phase alone took 44.9s on that run; the same suite re-ran in 3.95s with everything green). The failing test class was the `RealScraper` redirect-guard group (each case ~608ms, near the default timeout budget). Not a product defect; worth knowing tests can flake on a busy machine.

---

## 1. Executive summary

This is an unusually well-defended codebase for its stage. The comment culture is incident-driven — nearly every guard exists because a specific bug was hit live, and the docs label claims VERIFIED vs CODE-COMPLETE honestly. The project already found and fixed its own most serious vulnerability (client-writable `profiles.balance`, migration 0007).

**The genuinely open risks, ranked:**

1. **SSRF gap in the worker pipeline** (§2.1) — job params (`sourceVideoUrls`, `musicUrl`, `sfxUrl`, `sourceUrl`) are fetched by the worker/renderer with **no SSRF validation**, unlike `/api/scrape` and `/api/import-clip` which are guarded. The worker runs on Hetzner, where `169.254.169.254` (cloud metadata) is reachable, and holds the Supabase **service-role key**.
2. **Public R2 URLs with guessable keys** (§2.2) — self-declared launch blocker; permanent, unauthenticated asset URLs.
3. **No credit reservation between enqueue and charge** (§4.2) — N concurrent jobs each pass the balance check and all spend real provider money; only one can charge. The company eats the difference.
4. **Next.js 15.0.3 is old enough to predate the middleware-bypass CVE class** (§9.1) — mitigated here by layered server-side auth, but the version should move.
5. **Production currently serves plain HTTP on port 80** (§7.3) — known/parked (no domain yet), but cookies cross the wire unencrypted until Caddy is enabled.
6. **CI never runs the 924 tests** (§8.1) — typecheck/lint/build only.

Everything else found is either already fixed (and fixed well), deliberately accepted with written rationale, or low severity.

---

## 2. Security audit

### 2.1 🔴 HIGH (open) — Worker fetches user-supplied URLs without the SSRF guard

**Where:** `apps/worker/src/index.ts` (`runMatrixPipeline` → `downloadClip` via `scene-detect.ts`; `resolveStorageUrl`; `matrixProps.voiceUrl/musicUrl/shots`), `runMediaEditPipeline` (`absoluteSource`).

**Evidence:** `/api/scrape` and `/api/import-clip` both validate with `assertPublicHost()` (DNS-resolving, private-range + metadata-aware). But `POST /api/jobs` stores `params` as-is (only `targetSeconds` and `count` are normalized), and the worker then does:

- `downloadClip(url)` → plain `fetch(url)` for every entry of `params.sourceVideoUrls` (matrix/revoice),
- the Remotion renderer fetches `shots[].url`, `voiceUrl`, `musicUrl`, `sfxUrl`,
- `runMediaEditPipeline` checks only that the source _isn't localhost_ (for fal's benefit), not that it isn't private/metadata.

A signed-in user can enqueue a matrix job with `sourceVideoUrls: ["http://169.254.169.254/hetzner/v1/metadata/..."]`. The production worker runs on Hetzner Cloud (per `INFRASTRUCTURE.md`), where that address answers. The bytes are fed to ffmpeg (crash/DoS surface) and the response influences scene detection (a weak timing/covert channel, not a direct exfil path — the response body never reaches the client). Internal port scanning of the VPS (`aikutak` stack shares the box) is also possible.

**Aggravator:** the worker process holds `SUPABASE_SERVICE_ROLE_KEY` (full DB bypass). SSRF here is server-side request forgery _inside the most privileged process in the system_.

**Recommendation:** validate every URL-bearing param at enqueue (reject non-storage origins outright — legitimate values are always our own storage URLs or R2), and/or run `assertPublicHost` in the worker before any fetch. This mirrors exactly the guard the two import routes already share.

### 2.2 🔴 HIGH (open, self-declared launch blocker) — Public, permanent, guessable asset URLs

**Where:** `packages/core/src/providers/storage.r2.ts` (`getUrl`), `S3CompatibleStorage.upload` returns `getUrl(key)`.

Keys are `uploads/<userId>/<timestamp>.mp4`, `renders/…`, `voice/<timestamp>-<voiceId>.mp3` — enumerable by anyone who knows (or brute-forces) a user id + timestamp. `INFRASTRUCTURE.md` F5 already flags this as a launch blocker: it reintroduces cross-user asset exposure that `/api/storage`'s ownership check was written to prevent. Signed-URL helpers (`signedDownloadUrl`, 1h TTL) exist in the same class but are not used on the upload/asset path.

Also note: voice MP3s are persisted under a shared `voice/` prefix with no `assets` row at all — nothing but URL unguessability protects them (see `voice.elevenlabs.ts` header comment).

### 2.3 🟠 MEDIUM (open) — DNS rebinding + redirect-following residual SSRF

**Where:** `apps/web/src/lib/safe-url.ts` (self-documented), `runYtDlp`.

- `assertPublicHost` resolves the name at check time; `fetch`/yt-dlp resolve again at connect time. An attacker-controlled short-TTL record can pass the check and rebound to a private IP. The file says so plainly ("raises the bar… not airtight").
- yt-dlp itself follows redirects internally; only the _initial_ URL is validated (the scraper path uses `redirect: 'manual'` — the yt-dlp path cannot).

Accepted residual risk, correctly documented. Listed for completeness.

### 2.4 🟠 MEDIUM (open) — No credit reservation: concurrent jobs overspend provider money

**Where:** `apps/web/src/app/api/jobs/route.ts` (balance check at enqueue) + `apps/worker/src/index.ts` `processJob` (charge after success).

The check-then-act window spans the entire queue latency + render time. A user with 15 credits can enqueue 15 matrix jobs (15 credits each) in one minute (rate limit 20/60 allows it): every job passes `balance >= cost`, every job runs the real pipeline (ElevenLabs chars, Lambda invocations, kie/fal images), and only the first `charge_credits` succeeds — the rest fail with `insufficient_balance`, get their assets deleted, and cost the business real provider money with zero revenue. `charge_credits` itself correctly protects the _user's_ balance from going negative; nothing protects the _company's_ provider spend. Recommendation: reserve/hold credits at enqueue (or cap outstanding uncharged jobs per user).

### 2.5 🟠 MEDIUM (open) — Double-charge/double-asset window on job retry after crash

**Where:** `apps/worker/src/index.ts` `processJob` ordering: `update running → runPipeline → insert assets → charge → update done`.

If the process dies **between** the successful `charge_credits` and the `done` update, BullMQ's stall detection redelivers the job; the retry re-runs the whole pipeline (fresh provider spend), inserts a second set of `assets` rows, and charges again. Narrow (a crash inside a ~millisecond window after a multi-second charge RPC), but real. The `stalled` handler deliberately only logs (to avoid double refunds), which is right — but nothing marks the job idempotent at the asset/charge layer. A `charge_credits`-side uniqueness per `(job_id)` would close it.

### 2.6 🟠 MEDIUM (open) — Open redirect via `next` param (client-side)

**Where:** `apps/web/src/app/(auth)/login/page.tsx` (`router.push(next)` with `next` from the query string), `apps/web/src/app/auth/callback/route.ts` (`NextResponse.redirect(`${origin}${next}`)`).

The value is never validated as an internal path. A crafted `https://site/login?next=https://evil.example` performs a client-side navigation after successful login — a credible phishing vector on the exact screen where credentials were just entered. The callback variant concatenates onto `origin`, which mostly neutralizes absolute URLs, but backslash/slash tricks deserve a whitelist: accept only paths starting with `/` and not `//`.

### 2.7 🟡 LOW (open) — Billing webhook returns raw Postgres error text

**Where:** `apps/web/src/app/api/billing/webhook/route.ts` — `return NextResponse.json({ error: error.message }, { status: 500 })` on RPC failure. Every other credit-touching route (`/api/jobs`, `/api/dev/credits/add`) deliberately logs PG messages server-side and returns an opaque error; the webhook is the one inconsistency (reachable only with a valid signature, so impact is minimal — but the pattern break is exactly how leaks start).

### 2.8 🟡 LOW (open) — Job error strings (incl. DB internals) surfaced to users

`processJob` stores `charge_failed: ${chargeError.message}` and raw pipeline exception messages into `jobs.error`, which `/api/jobs/[id]` returns verbatim. Provider/DB error text (URLs, constraint names) can reach the customer. Consider a user-facing summary + detailed server log.

### 2.9 🟡 LOW (open) — `search-clips` in-process cache is unbounded

`Map` with 10-minute TTL checked only on read; entries never evicted. Rate-limited per user (8/60) so growth is slow, but a motivated multi-account client can bloat worker memory. Cap the map size.

### 2.10 🟡 LOW (open) — 200MB files buffered in RAM on two paths

`/api/upload` (`Buffer.from(await file.arrayBuffer())`) and `/api/import-clip` (`readFile` into memory) each hold up to 200MB per request; the same class of spike was engineered out of `persistRemoteAsset` (streamed when `content-length` exists, buffered fallback capped). Documented as fine on the self-hosted box, but several concurrent uploads + renders on an 8GB VPS is exactly the OOM profile the worker comments warn about elsewhere.

### 2.11 🟡 LOW (open) — No CSP header

Caddy sets HSTS (no preload, deliberately), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` — good baseline, but no `Content-Security-Policy` anywhere (and none until the `tls` profile is enabled, see §7.3). A nonce-based CSP would materially reduce stored-XSS blast radius if any user content ever reaches HTML.

### 2.12 ✅ Verified strengths (security)

- **The big one is closed:** `profiles.balance` was client-writable via the 0001 `profiles_update_own` RLS policy (browser-console exploitable); migration **0007** drops the policy _and_ revokes column-level `UPDATE (balance, id)` from `anon`/`authenticated` — genuine defense in depth. All credit mutations now flow through `SECURITY DEFINER` RPCs with `search_path` pinned and `revoke … from public, anon, authenticated`.
- **RLS posture:** select-only policies on `profiles`, `credits_ledger`, `jobs`, `assets`; no client insert/update policies anywhere; every write goes through the service role. RPCs are properly revoked.
- **Webhook crypto:** HMAC-SHA256 over the raw body, length-checked then `timingSafeEqual`; idempotent grant via unique index on `external_ref` (migration 0004); grants cross-check the **paid variant id** against `LEMONSQUEEZY_VARIANT_MAP` so a stale map can't mint a bigger pack; production refuses mock checkout (503) rather than serve free credits.
- **`charge_credits` correctness:** migration 0005 fixed the rollback that deleted by `(user_id, job_id, reason)` instead of the inserted row id — the per-stage-billing double-charge-silent-refund bug is closed, with the old signature explicitly dropped to avoid overload ambiguity.
- **Shell-injection closed:** `runYtDlp` uses `execFile` with argv array (no shell), documented against the `youtube-dl-exec` `shell:true` trap under paths containing spaces.
- **Path traversal guarded** in `/api/storage` (`path.resolve` + prefix check), with `X-Content-Type-Options: nosniff` and an extension→content-type allowlist kept in lockstep with `/api/upload`'s MIME map (SVG deliberately excluded — blocks script-bearing uploads).
- **Upload hardening:** extension derived from the validated MIME type, never the client filename; 200MB cap; per-user rate limit 15/60; unbilled route is the tighter-limited one.
- **yt-dlp import:** SSRF-guarded URL, `--no-playlist`, `--max-filesize` **plus** an on-disk re-check (correctly distrusting yt-dlp's own cap), temp dir always cleaned in `finally`.
- **Rate limiting everywhere** (jobs 20/60, upload 15/60, checkout 10/60, scripts 6/60, scrape 8/60, search 8/60, import 10/60, voices 30/60, dev-credits 10/60) — Redis fixed-window, `EXPIRE NX` (crash-safe TTL), single 1s timeout budget, **fail-open** by design with the unreachable-fail-open bug (BullMQ-style infinite-wait connection) already fixed via `createRedisCommandClient` (`enableOfflineQueue: false`).
- **Admin gate:** `isAdminEmail` is env-driven (no committed emails), enforced server-side in the route, not just the UI; empty list = nobody. `dev/credits/add` 404s for non-admins in production.
- **Secrets hygiene:** only `.env.example` tracked; `.env.bak*` ignore rule exists (born from a real near-miss); `.dockerignore` covers root _and nested_ env files (fixed 2026-08-14 after secrets baked into an image layer); the web Dockerfile takes only the two `NEXT_PUBLIC_*` values as build args and asserts non-emptiness; worker gets everything at runtime via `env_file`. Service-role client factory throws loudly if the key is missing.
- **Mock-safety:** production worker refuses to start on mocked provider slots (`ALLOW_MOCK_PROVIDERS=1` escape hatch for staging) — born from a real incident where a mocked worker on the shared queue answered paid jobs.
- **Auth flows:** PKCE-style code exchange in `/auth/callback`; recovery session checked before rendering the new-password form; Supabase error messages mapped to Serbian with a vague fallback (no raw English/stack leakage); `role="alert"` on auth errors.
- **No XSS sinks:** zero `dangerouslySetInnerHTML`/`innerHTML`/`eval` in `apps/web/src`; all external links carry `rel="noreferrer"`; React escapes everything else.

---

## 3. Database & data audit

- **Schema (0001):** clean relational core (`profiles` ← `credits_ledger`, `jobs` ← `assets`), cascade deletes, sensible indexes (`jobs_user_status_idx`, partial `credits_ledger_job_idx`). `balance` is a cached total reconstructable from the ledger — good auditability.
- **`handle_new_user` trigger:** `SECURITY DEFINER`, `search_path = public`, idempotent insert (`on conflict do nothing`) + ledger row for the 3-credit bonus. Correct.
- **`add_credits` / `add_credits_idempotent`:** single-transaction ledger+balance; idempotent variant catches `unique_violation` and returns the current balance instead of double-granting. Correct for at-least-once webhook delivery.
- **Migration quality:** all idempotent (`create or replace`, `if not exists`, `drop policy if exists`); 0006 documents the enum-in-transaction PostgreSQL trap; 0007 documents its own exploit. Exemplary.
- **Seed script:** dev-only; direct ledger insert + balance update via service client (bypasses RPCs — acceptable for dev, would be a smell in prod).
- **Types:** `database.types.ts` **is current** — `charge_credits` has 4 args with `p_reason?`. ⚠️ `INFRASTRUCTURE.md` F5 still claims the generated type is stale at 3 args; that note is itself stale (docs finding, §10).
- **Gaps:** no FK from `credits_ledger.job_id` → `jobs` (deliberate? allows ledger rows for deleted jobs — fine for audit trails); `profiles.email` duplicated from `auth.users` (drift possible if email changes); no `updated_at` on `profiles`/`assets` (cosmetic).

---

## 4. Billing & business-logic audit

- **Charge-on-success** is consistently enforced: pipeline throws → job `error` → **no charge**; empty-asset result treated as failure (the "Gotovo with no video" bug is closed); assets inserted before charge are deleted if the charge fails (unpaid output unreachable); `actualCost = unit × assets.length` bills what was delivered, not what was requested.
- **Unimplemented tools fail honestly:** `RENDERABLE_COMPOSITIONS` is empty and the guard asks about the _tool_, not the renderer — the Lambda deploy could not silently re-arm the placeholder-delivery path that once charged 2 credits for Big Buck Bunny.
- **Cost ceilings:** `MAX_SCRIPT_CHARS=700` + `scriptCharBudget(targetSeconds)` + `MAX_AD_SECONDS=60` clamp the two spend axes (TTS chars, render frames); approved scripts are validated as untrusted input with the same cap (a 15× multiplier on TTS spend was the explicit rationale).
- **Open items (all self-documented):** `order_refunded` is NOT handled — a refund/chargeback leaves credits in place (RELEASE_PLAN L3.6, owner decision required); per-stage billing parked; `generate-scripts` charges nothing today while the UI already advertises "prvih 5 besplatno, pa 1 kredit" — and the server cannot enforce that allowance yet (client `scripts.length` resets on reload; no `job_id` to count against). This UI-promises/server-enforces mismatch is the one billing inconsistency I'd resolve before launch.
- **Money math:** `CREDIT_PACKS` bonus arithmetic consistent between checkout (`credits + bonus`) and webhook grant; `dev/credits/add` uses the same math. `creditsWord`/`freeVideosLabel` Serbian pluralization is correct incl. 11–14 exceptions.

---

## 5. Worker & pipeline audit

- **Two-lane queue** (heavy: matrix/revoice; light: everything else) with the safe-default direction documented (unlisted type → light; the failure direction is wait, not OOM).
- **Provider-result ownership:** every external media URL is copied into our storage (`persistRemoteAsset`) — streamed when `content-length` exists, buffered fallback capped at 200MB — because kie/fal CDN links expire. Lambda renderer takes ownership too (presigned 15-min fetch, copy, delete). The "paid asset becomes a dead link" failure class has been systematically engineered out.
- **Renderer selection:** factory result unless it's the mock (mock → force real local render) — the hardcoded-local-renderer bug that made Lambda unreachable is closed and documented.
- **Graceful degradation with the right polarity:** voice-id fallback (invalid id → first voice, catalogue outage → pass-through), `describeImage` optional, scene-detect failure skips a clip, `speakerGender` neutral on unknown. Degrade-to-worse-output everywhere, die only where money/billing honesty is involved.
- **Ops:** event-loop heartbeat + compose healthcheck (liveness ≠ process-exists), SIGTERM/SIGINT drain with double-signal guard, `allSettled` close, fire-and-forget alerts with capped payloads, stalled-job logging only (avoids double-refund). Worker refuses to start without `SERVICE_KEY` or on mocks in production.
- **`LOCAL_STORAGE_DIR` anchoring:** `storage-path.ts` resolves both processes to the same absolute root — the cross-cwd bug class is closed by construction.

---

## 6. Architecture & code quality

- **Provider abstraction is the crown jewel:** every external dependency behind an interface; factory mock-first with `hasKey` gating; partial configs warn-and-fall-back rather than crash; `mockProviderSlots()` makes mock-mode introspectable at the process boundary.
- **Empty-string-vs-undefined env semantics** handled twice (`optionalUrl` preprocessor; `resolveRedisUrl` `|| undefined`) — both born from real deploy crashes. Zod schema with explicit `FORCE_MOCK` allow-list parsing.
- **Test seams without production cost:** injectable renderer/deps/voices/storage in the worker; `makeProcessor` isolated from DB and pipeline. The money path (charge/refund/rollback) is unit-tested.
- **Error-message hygiene** in providers: OpenRouter 200-with-error-body checked; fal terminal-vs-pending statuses distinguished (no polling a dead job for 10 minutes); `response_url` used over constructed URLs (both learned from live 405s).
- **Concerns:** the 1021-line `apps/worker/src/index.ts` mixes entry point, pipelines, persistence helper, and state machine — everything is coherent but this file is the natural next split. `packages/core/src/index.ts` is a wide barrel; fine at this scale.

---

## 7. Infrastructure & deployment audit

- **Compose prod:** Redis bound to loopback only (correct); isolated project/container names; worker `WORKER_CONCURRENCY=1` with the OOM rationale; per-service liveness healthchecks using only in-image tooling; Caddy behind the `tls` profile with three-step enable instructions and certificate-volume warnings.
- **Worker image:** Playwright base (Chromium deps) + NodeSource Node 22 (supabase-js WebSocket requirement) — the crash-loop fix is documented inline; Node as PID 1 with the SIGTERM-drain rationale (and the deliberate _contrast_ with web's `pnpm start` documented). Base tag `v1.48.0-jammy` is old — the file itself says to re-verify before building.
- **Web image:** only public build args; the yt-dlp binary fetched at build time (pnpm-10-skips-postinstall trap documented); `test -n` guard on the Supabase URL.
- **7.3 🟠 Deployment reality:** production web publishes **port 80 plain HTTP** (no domain → no TLS → session cookies in cleartext). Known, parked, and Caddy is staged — but until the domain lands this is the single biggest _practical_ exposure of the running site. Treat as a hard launch blocker alongside §2.2.
- **Local compose:** Redis + redis-commander; commander on :8081 has **no auth** — dev-only, but it exposes the queue if someone runs this on a shared host.

---

## 8. CI/CD & process audit

- **8.1 🟠 CI never runs tests.** `.github/workflows/ci.yml` = install → typecheck → lint → `web build`. The repo's **924 tests — including every API route and the money-path state machine — gate nothing.** A regression that typechecks and lints (most logic regressions do) merges green. This is the cheapest high-value fix available: add `pnpm -r test` (and it would also have caught nothing so far only by luck of local discipline).
- No `pnpm audit`/dependency scanning, no secret-scanning step, no CodeQL. Given the repo is public on GitHub, a gitleaks/audit step is cheap insurance.
- Docs-as-process (SESSION_LOG verification levels, REVIEWED ledger, append-only archive) is a genuine strength — this repo has better institutional memory than most commercial codebases.

---

## 9. Dependency & supply-chain audit

- **9.1 🟠 Next.js 15.0.3** (Nov 2024). Predates the `x-middleware-subrequest` middleware-bypass CVE class fixed in 15.1.6+ (CVE-2025-29927). **Impact here is contained** — the middleware only does redirects; `app/layout.tsx` independently redirects without a session, and every API route calls `getUser()` itself, so no data path depends on middleware alone — but an unauthenticated visitor can reach auth-page logic. Upgrade when convenient; the layered design means it's not an emergency.
- **9.2 🟡 React 19.0.0-rc + `types-react@rc` overrides.** Shipping a release-candidate React (Nov 2024 RC pin) with a workspace-wide override shim (`pnpm-workspace.yaml`) to keep Remotion on React 18 types. Works, typechecks, tests — but it's a pinned pre-release in the production path and a standing compatibility tax on every upgrade.
- `supabase-js ^2.45.4`, `@supabase/ssr ^0.5.2`, `bullmq ^5.21.0`, `ioredis ^5.4.1` — reasonable, caret-ranged; lockfile committed. `pnpm audit` was **not** run (avoided network calls to be safe with the "no real API calls" rule) — recommend running it locally.
- `pnpm.onlyBuiltDependencies` duplicated in `package.json` (ignored by current pnpm — warning on every run) and `pnpm-workspace.yaml` (effective). Cosmetic duplication.

---

## 10. Documentation accuracy audit

The docs are exceptional in intent but drifting in a few spots (all doc-only findings — no code touched):

1. `INFRASTRUCTURE.md` F6 still says **"Lemon Squeezy was DELETED 2026-08-10"** and "no payment provider" — but `billing.lemonsqueezy.ts`, both billing routes, env vars, and 24 tests exist and `CLAUDE.md` records the 2026-08-13 restore. F6 is the status file; it currently understates reality in both directions (billing exists; legal pages exist).
2. Same file claims `charge_credits` is "still declared with 3 arguments" in generated types — **false**, the file has 4 args.
3. `CLAUDE.md` test census: "705 tests as of 2026-08-13 (core 326, web 296, worker 83)" — now **924 (362/454/108)**. Normal drift; the count is used as a gate reference, so it should be dated-checked.
4. Legal pages: F6 says "deliberately NOT drafted" — `uslovi/`, `privatnost/`, `impressum/` now exist with substantive, provider-accurate content (the privacy page's processor list is assembled from the actual providers). Good news, stale bullet.
5. `middleware.ts` comment says the matcher excludes "api webhooks" — the regex excludes no `/api` path. Harmless (the webhook needs no middleware), but the comment lies.

---

## 11. Frontend, i18n & accessibility

- Serbian copy is consistent and grammatically maintained (pluralization helpers, gender in past tense handled server-side from the voice id — a whole bug class closed in `generate-scripts`).
- Auth pages: `role="alert"` on errors, `aria-hidden` on decorative ambients, `focus-ring` utility classes, `autoComplete` attributes everywhere, password checklist with a live region, `lang="sr"` in the root layout, theme flash prevented by server-side cookie read. Above-average a11y baseline. (Not a full WCAG pass — wizards were spot-checked, not exhaustively audited.)
- Legal pages exist and are honest about product limits (unimplemented tools, credit rollover liability).
- **GDPR gap (🟡):** no user-facing data-export or account-deletion flow. Cascades exist at the DB level (`auth.users` delete cascades everything), but a user cannot trigger it themselves; the privacy page promises things (EU residency, retention) that depend on the R2 EU endpoint choice — which is correctly enforced in `factory.ts`/env docs.

---

## 12. What this codebase does unusually well

1. **Incident-driven comments** — every non-obvious guard cites the live failure that created it (the `&`-in-URL shell trap, the unreachable fail-open, the constructed-vs-provided fal URL, the silent mock worker on the shared queue). This is the best comment discipline I have audited.
2. **Honest verification labels** — VERIFIED vs CODE-COMPLETE, with the M2c cautionary tale kept visible. The docs police themselves.
3. **Billing honesty as an invariant** — fail-before-charge, delete-orphaned-assets, refuse-mock-in-production, bill-what-was-delivered, empty-result-is-failure.
4. **Defense in depth where money moves** — policy drop **and** column revoke (0007); signature **and** idempotency **and** variant cross-check (billing); rate limit **and** admin gate (dev credits).
5. **Test culture** — 924 tests including every route and the state machine, with mutation-testing audits of test tasks.

---

## 13. Consolidated action list (priority order)

| #   | Severity | Finding                                                                                                              | Where                                 |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1   | 🔴 High  | Worker SSRF: unvalidated user URLs fetched server-side (incl. Hetzner metadata)                                      | worker pipeline, `/api/jobs` params   |
| 2   | 🔴 High  | Public permanent R2 URLs, guessable keys (self-declared blocker)                                                     | `storage.r2.ts` `getUrl` path         |
| 3   | 🟠 Med   | No credit reservation between enqueue and charge → provider-spend overrun                                            | `/api/jobs` + `processJob`            |
| 4   | 🟠 Med   | Plain-HTTP production until domain/Caddy lands                                                                       | compose web `80:3000`                 |
| 5   | 🟠 Med   | Retry-after-crash double-charge/double-assets window                                                                 | `processJob` ordering                 |
| 6   | 🟠 Med   | Open redirect via `next` (login, callback)                                                                           | auth pages                            |
| 7   | 🟠 Med   | CI runs no tests (924 tests gate nothing)                                                                            | `ci.yml`                              |
| 8   | 🟠 Med   | Next 15.0.3 predates middleware-bypass CVE (mitigated by layering)                                                   | `apps/web/package.json`               |
| 9   | 🟡 Low   | Refunds (`order_refunded`) unhandled — credits not clawed back                                                       | billing webhook                       |
| 10  | 🟡 Low   | Free-script allowance advertised in UI, unenforceable server-side                                                    | wizard vs `/api/generate-scripts`     |
| 11  | 🟡 Low   | Webhook returns raw PG error; job errors surface internals to users                                                  | webhook route, `jobs.error`           |
| 12  | 🟡 Low   | No CSP; unbounded search cache; 200MB RAM buffering on upload/import; redis-commander unauthenticated in dev compose | various                               |
| 13  | 🟡 Low   | React 19 RC pin + type-override tax; Playwright base tag aging                                                       | workspace/web deps, worker Dockerfile |
| 14  | 🟡 Low   | GDPR export/delete flow absent                                                                                       | app                                   |
| 15  | 📝 Docs  | F6/CLAUDE.md/type-staleness/test-census drift (§10)                                                                  | docs                                  |

---

## 14. Audit integrity statement

- **Zero code, config, migration, or documentation files were modified.** The working tree was clean before and after (`git status --short` empty both times).
- All gates were actually executed during this audit; pass counts above are from the real runs (core `362 passed (362)`, web `454 passed (454)`, worker `108 passed (108)`).
- No `.env` or secret file was read at any point; secret-related findings are structural (tracking status, ignore rules, build-arg flow), verified via `git ls-files` and file metadata only.
- One flaky test occurrence observed and attributed (§0) — reported as flakiness, not investigated further per the change-nothing rule.
