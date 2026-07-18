# SESSION_LOG.md

Append-only, newest first. One block per session. See `CLAUDE.md` for the ritual and
the **VERIFIED vs CODE-COMPLETE** discipline. When you start a session, record which
account (A or B) you're on so the history shows the alternation.

---

## Review ledger
Greppable review verdicts, newest first, each anchored to a commit. Before reviewing an
area, find its latest `REVIEWED:` line, then `git log <commit>..HEAD -- <paths>` — empty
means nothing changed since, so skip. See CLAUDE.md → "Review reuse — never re-review
unchanged code".

REVIEWED: billing webhook idempotency — ISSUE CLOSED @ 5fc43fc (2026-07-23): the webhook now dedups on the Lemon Squeezy order id via migration 0004 (credits_ledger.external_ref + partial unique index + add_credits_idempotent RPC that no-ops on unique_violation). parseWebhook returns data.id; route passes it as p_external_ref. Cline diff matched spec, typecheck+build pass. Supersedes the ISSUE in the F5/F6-infra verdict below. ⚠️ OWNER ACTION before F6 launch: run migration 0004 in the Supabase SQL Editor (no CLI link).
REVIEWED: script.claude.ts — refusal gap CLOSED @ e388114 (2026-07-23): added `stop_reason:"refusal"` check before parsing (Cline diff matched spec, typecheck passes). Supersedes the "low-pri gap" note in the F5-provider-clients verdict below — that verdict otherwise still stands (rest of file unchanged).
REVIEWED: F5/F6 infra (packages/core/src/{env,logger}.ts, packages/core/src/providers/factory.ts, apps/web/src/lib/rate-limit.ts, apps/web/src/app/api/billing/{checkout,webhook}/route.ts, apps/worker/Dockerfile, infra/docker-compose.prod.yml) — CLEAN @ 4500e0e (2026-07-23) EXCEPT one ISSUE: **billing/webhook/route.ts is not idempotent** — Lemon Squeezy retries/replays the same paid order (at-least-once + retry-on-non-2xx), and each valid delivery re-runs `add_credits` → credits granted 2+ times per purchase. `parseWebhook` doesn't even return the order id (`data.id`) to dedup on. Latent (F6 billing not live yet) but WILL fire on first real launch. Everything else correct: env optionalUrl empty-string fix, factory partial-config fallbacks + warnings, rate-limit EXPIRE-NX race fix + fail-open, Docker (Node22/pnpm/monorepo-layout/loopback-Redis).
REVIEWED: F5 real provider clients (packages/core/src/providers/{script.claude,voice.elevenlabs,storage.r2,billing.lemonsqueezy,renderer.lambda}.ts) — static CLEAN @ 591e2cd (2026-07-23). Auth headers, endpoints, request/response shapes, Lemon Squeezy HMAC-SHA256 webhook (timing-safe), and the Remotion Lambda poll loop all match the real APIs. One low-pri gap: ClaudeScriptProvider has no `stop_reason:"refusal"` handling (degrades to a thrown parse error, not a crash). NONE ever called with a real key — static review only.
NOT-REVIEWED: the whole F5/F6 code layer is now reviewed. Un-reviewed only: things not yet touched this project (none significant). Re-review any file whose latest REVIEWED anchor is older than its last commit (git log <anchor>..HEAD -- <path>).

---

## 2026-07-23 — review reconciliation + session-sync setup
**Account:** _(unrecorded — fill in going forward)_
**Commits this session:** 8e5617d (count cap + honest asset kind), 591e2cd (CLAUDE.md +
SESSION_LOG.md), + this update (review-reuse mechanism + F5 verdict).

**Done:**
- Reconciled state against git + code: working tree clean at `aba9455`; `origin/main`
  now exists → handover.md §7 ("no remote configured") is STALE. (VERIFIED)
- Re-ran gates: `pnpm -r typecheck` (all 5 packages) + `pnpm --filter @adgen/web build`
  → both PASS. (VERIFIED)
- Set up cross-session workflow: added `CLAUDE.md` (auto-loaded ritual) + this file.
- Added the **review-reuse mechanism**: greppable `REVIEWED:` verdicts anchored to commits
  (Review ledger above) + a CLAUDE.md rule to review only the git-diff since the last
  verdict — so unchanged-and-clean code isn't re-reviewed across sessions/accounts.
- Statically reviewed the 5 F5 real provider clients → all CLEAN (see ledger). (VERIFIED, static-only)

**Correction to handover.md (it drifted):**
- handover §6 says the kie.ai + fal.ai `AIProvider` client "already exists" — **FALSE**.
  No `ai.kie.ts` / `ai.fal.ts`; `packages/core/src/providers/factory.ts` still calls
  `loadReal('ai')`, which throws. INFRASTRUCTURE.md F5 correctly shows it `[ ]`. This is
  the one real provider still unwritten. (VERIFIED by reading the dir + factory.)

**Open items (F0–F4 review) — ALL CLOSED this session:**
- #1 orphaned asset rows on charge failure → was **ALREADY FIXED** in
  `apps/worker/src/index.ts` (~line 204 deletes asset rows on `chargeError`). (VERIFIED)
- #2 no upper bound on `count` in `apps/web/src/app/api/jobs/route.ts` → **DONE** via
  Cline Prompt A (`MAX_JOB_COUNT = 10`, rejects above with 400, route.ts:64-68).
  typecheck + build pass. (VERIFIED)
- #3 enhance/remove_text image-source-yields-video → **DONE** via Cline Prompt B: worker
  routes image sources (by `params.sourceUrl` ext) through `AIProvider` with
  `kind:'image'`; enhance + remove-text UIs switch `<img>`/`<video>` on `asset.kind`.
  typecheck + build pass; diff matches spec. (VERIFIED)
- #4 balance check uses `computeJobCost(type,count)` (pre-auth) while the worker charges
  by actual output → **INTENTIONALLY LEFT AS-IS** (standard pre-auth/hold pattern;
  changing it risks under-auth or coupling the API to mock-provider internals).

**Minor nit (not fixed):** Cline stripped the trailing newline on
`apps/worker/src/index.ts` — harmless, but `pnpm format:check` (prettier) would flag it.

**F5/F6 review:** the 5 real provider clients were statically reviewed this session —
all CLEAN (see the Review ledger up top, `REVIEWED: … @ 591e2cd`). Still un-reviewed:
factory.ts, rate-limit.ts, logger.ts, env.ts, `api/billing/*`, Dockerfile/compose
(see the `NOT-REVIEWED:` line in the ledger). All F5/F6 code is still CODE-COMPLETE —
none ever called with a real key.

**Next:**
- Prompts A + B are DONE and committed (8e5617d); F5 provider clients reviewed (clean).
- Remaining options: review the rest of the F5/F6 infra (rate-limit / env / billing routes
  — see the ledger's NOT-REVIEWED line), OR wait for kie.ai/fal.ai accounts (owner action)
  to write + live-test the real `AIProvider`.
