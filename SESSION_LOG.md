# SESSION_LOG.md

Append-only, newest first. One block per session. See `CLAUDE.md` for the ritual and
the **VERIFIED vs CODE-COMPLETE** discipline. When you start a session, record which
account (A or B) you're on so the history shows the alternation.

---

## 2026-07-23 — review reconciliation + session-sync setup
**Account:** _(unrecorded — fill in going forward)_
**Commits this session:** _(this doc + CLAUDE.md about to be committed)_

**Done:**
- Reconciled state against git + code: working tree clean at `aba9455`; `origin/main`
  now exists → handover.md §7 ("no remote configured") is STALE. (VERIFIED)
- Re-ran gates: `pnpm -r typecheck` (all 5 packages) + `pnpm --filter @adgen/web build`
  → both PASS. (VERIFIED)
- Set up cross-session workflow: added `CLAUDE.md` (auto-loaded ritual) + this file.

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

**NOT yet reviewed at all — the F5/F6 "dodaci":** real provider clients
(`script.claude.ts`, `voice.elevenlabs.ts`, `storage.r2.ts`, `renderer.lambda.ts`,
`billing.lemonsqueezy.ts`), billing routes, rate-limit, logger, deploy infra. All
CODE-COMPLETE, none ever called with a real key. A static review of this layer is the
obvious next big task (most likely source of "works-only-on-first-real-call" bugs —
auth headers / response shapes, same class as handover §4's three deploy bugs).

**Next:**
- Run Cline Prompt A (count cap) + Prompt B (asset kind) — both already written in chat.
- Then either: static review of the F5/F6 provider layer, OR wait for kie.ai/fal.ai
  accounts (owner action) to write + live-test the real `AIProvider`.
