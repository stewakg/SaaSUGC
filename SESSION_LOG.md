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

REVIEWED: apps/worker/src/index.ts (Matrix tts() credit-leak fix, matrixVoiceTracker) — CLEAN @ 080f855 (2026-07-19). Cline diff matched spec exactly (import MockVoiceProvider, dedicated mock instance with warning comment, swap the one call site, doc-comment update); Cline additionally typed the instance as `VoiceProvider` — fine, documents intent. Only `providers.voice` reference left is in a comment. typecheck + web build pass.
REVIEWED: packages/core/src/providers/ai.kiefal.ts (KieAIFalRouter) + factory.ts's createAIProvider — static CLEAN @ f49eebf (2026-07-19). Real AIProvider replacing the loadReal('ai') stub: kie.ai (generic Jobs API, nano-banana-2) primary, fal.ai (queue API, fal-ai/nano-banana-2) fallback for generateImage; kie.ai's DEDICATED Veo endpoints (different response shape than the image Jobs API — verified, not assumed) primary, fal.ai veo3.1/image-to-video fallback for generateVideo (unexercised — ai_video is F7). All endpoints/fields cross-verified against kie.ai + fal.ai's live docs (WebFetch, 2026-07), not guessed. Diff matched spec exactly (new file byte-identical, factory.ts's 4 edits — import, ai wiring, createAIProvider helper, loadReal deletion — all landed correctly). typecheck + build pass. **✅ LIVE-TESTED 2026-07-19**: `generateImage` called for real against kie.ai-only and fal.ai-only independently (throwaway script driving `getAI()`/direct `KieAIFalRouter` construction, deleted after use) — both succeeded 1st try (13.9s / 14.2s), outputs visually confirmed correct (see `tests/kie-vs-fal.md`). `generateVideo` still CODE-COMPLETE / not live-tested (no wired caller — ai_video is F7).
REVIEWED: billing webhook idempotency — ISSUE CLOSED @ 5fc43fc (2026-07-23): the webhook now dedups on the Lemon Squeezy order id via migration 0004 (credits_ledger.external_ref + partial unique index + add_credits_idempotent RPC that no-ops on unique_violation). parseWebhook returns data.id; route passes it as p_external_ref. Cline diff matched spec, typecheck+build pass. Supersedes the ISSUE in the F5/F6-infra verdict below. ✅ Migration 0004 APPLIED to the real cloud project (gczikdrskcpqqlyzvnby) 2026-07-23 — this also confirmed 0001–0003 are present there (the earlier "no credits_ledger" error was a wrong-project/wrong-account mixup in the dashboard, not doc drift).
REVIEWED: script.claude.ts — refusal gap CLOSED @ e388114 (2026-07-23): added `stop_reason:"refusal"` check before parsing (Cline diff matched spec, typecheck passes). Supersedes the "low-pri gap" note in the F5-provider-clients verdict below — that verdict otherwise still stands (rest of file unchanged).
REVIEWED: F5/F6 infra (packages/core/src/{env,logger}.ts, packages/core/src/providers/factory.ts, apps/web/src/lib/rate-limit.ts, apps/web/src/app/api/billing/{checkout,webhook}/route.ts, apps/worker/Dockerfile, infra/docker-compose.prod.yml) — CLEAN @ 4500e0e (2026-07-23) EXCEPT one ISSUE: **billing/webhook/route.ts is not idempotent** — Lemon Squeezy retries/replays the same paid order (at-least-once + retry-on-non-2xx), and each valid delivery re-runs `add_credits` → credits granted 2+ times per purchase. `parseWebhook` doesn't even return the order id (`data.id`) to dedup on. Latent (F6 billing not live yet) but WILL fire on first real launch. Everything else correct: env optionalUrl empty-string fix, factory partial-config fallbacks + warnings, rate-limit EXPIRE-NX race fix + fail-open, Docker (Node22/pnpm/monorepo-layout/loopback-Redis).
REVIEWED: F5 real provider clients (packages/core/src/providers/{script.claude,voice.elevenlabs,storage.r2,billing.lemonsqueezy,renderer.lambda}.ts) — static CLEAN @ 591e2cd (2026-07-23). Auth headers, endpoints, request/response shapes, Lemon Squeezy HMAC-SHA256 webhook (timing-safe), and the Remotion Lambda poll loop all match the real APIs. One low-pri gap: ClaudeScriptProvider has no `stop_reason:"refusal"` handling (degrades to a thrown parse error, not a crash). NONE ever called with a real key — static review only. **✅ voice.elevenlabs.ts LIVE-TESTED 2026-07-19**: `listVoices()` (58 real voices) + `tts()` (Serbian sentence, 1.5s, real ID3 MP3 verified on disk) both succeeded via a throwaway script driving `createProviders().voice`. `speed` field re-verified against current ElevenLabs docs beforehand — correct. The other 4 clients (script.claude, storage.r2, billing.lemonsqueezy, renderer.lambda) remain static-only — no key/account for any of them yet.
NOT-REVIEWED: the whole F5/F6 code layer (incl. the new ai.kiefal.ts) is reviewed as of the verdicts above. Re-review any file whose latest REVIEWED anchor is older than its last commit (git log <anchor>..HEAD -- <path>).

---

## 2026-07-19 — live-tested KieAIFalRouter + ElevenLabsVoiceProvider (real API calls)
**Account:** _(unrecorded)_
**Commits this session:** 03f150a (F5/F7 doc reconciliation, uncommitted-from-other-
session), 4efed7d (KieAIFalRouter live-test results), 1750f8a (ElevenLabs live-test
results), 080f855 (Matrix tts() credit-leak fix), + this update (Matrix architecture gap).

**Done:**
- Found `KIE_API_KEY`/`FAL_API_KEY` already set in root `.env` (owner sorted these
  earlier) but `apps/worker/.env` was stale (0 chars for both) — ran `pnpm env:sync`
  to refresh it. (VERIFIED)
- Wrote a throwaway script (`apps/worker/src/test-ai-provider.ts`, deleted after use)
  driving the real production code path — `getAI()` then direct `KieAIFalRouter`
  construction — to call `generateImage` against kie.ai and fal.ai **independently**
  (not just "kie succeeded so fal was never exercised"). Same prompt as the existing
  `tests/kie-vs-fal.md` scenario for comparability.
- **Both succeeded on the first try**: kie.ai 13.9s, fal.ai 14.2s. Downloaded both
  output images and visually inspected them (not just HTTP 200) — both photorealistic,
  on-prompt, correct vertical framing, legible product label. (VERIFIED — real call,
  real output, eyeballed)
- This confirms the kie.ai `createTask`/`recordInfo` contract AND the fal.ai
  submit/status/result contract are both coded correctly — the F5 AIProvider is no
  longer "code-complete, never called," it actually works. `generateVideo` (Veo path)
  remains untested — no wired caller yet (`ai_video` is F7).
- Updated `INFRASTRUCTURE.md` F5 checkbox, `tests/kie-vs-fal.md` (new "Live code-path
  test" section), and the Review ledger's `ai.kiefal.ts` line to reflect VERIFIED
  status.
- Checked `.env` for what else is actually configured: `ELEVENLABS_API_KEY` turned out
  to already be SET (51 chars) and never live-tested — same opportunity as kie/fal.
  `ANTHROPIC_API_KEY`, all three `LEMONSQUEEZY_*`, and all `R2_*` vars are still empty.
- Re-verified the `speed` field in ElevenLabs' `voice_settings` against their current
  API docs (WebFetch, 2026-07-19) BEFORE testing, per the known-risk note on this
  provider — confirmed correct (default 1.0, documented range), not assumed.
- Wrote a second throwaway script (`apps/worker/src/test-voice-provider.ts`, deleted
  after use) driving `createProviders().voice` (the real production path) —
  `listVoices()` returned 58 real voices from the account; `tts()` with a Serbian
  sentence succeeded in 1.5s. (VERIFIED)
- Confirmed the output wasn't just an HTTP 200: found the actual file on disk at
  `<repo root>/storage/voice/...mp3` (MockStorage resolves to repo root regardless of
  cwd — see `storage-path.ts`), checked its magic bytes (`ID3` tag = real MP3, not an
  error page), 71KB ≈ 4-5s of audio for the test sentence. (VERIFIED)
- Deleted the throwaway script and the test-generated `storage/` directory. Updated
  `INFRASTRUCTURE.md`'s `VoiceProvider` line to VERIFIED.
- **Matrix ElevenLabs credit-leak fix (`080f855`, Cline diff reviewed, matched spec):**
  because `ELEVENLABS_API_KEY` is now real, `runMatrixPipeline`'s `tts()` call was
  resolving to the REAL `ElevenLabsVoiceProvider` — but its `audioUrl` is discarded
  (Matrix doesn't mux voice into the render yet). Every Matrix run would silently burn
  real ElevenLabs credits on throwaway audio. Fix: a dedicated `matrixVoiceTracker =
  new MockVoiceProvider()` (apps/worker/src/index.ts) that the Matrix tracking-call
  always uses; rest of the app still uses the real voice provider. typecheck + web
  build pass. (VERIFIED)

**⚠️ CRITICAL — our Matrix is architecturally WRONG, not just incomplete (2026-07-19):**
Owner walked me through the REAL Matrix UI (3 screenshots of the competitor VideoGen).
The real Matrix is a **multi-clip MONTAGE editor**, and INFRASTRUCTURE.md's F4 checkboxes
that call it "done" are misleading. The real flow:
- **Step 1 (missing entirely from ours):** user supplies MULTIPLE source video clips —
  drag-drop MP4/MOV/WEBM (≤200MB each) OR **import from a link** (TikTok / YouTube /
  Instagram / any URL). This is the raw B-roll pool.
- **Step 2:** scrape the PRODUCT url (title/price/images) + optional offer notes → feeds
  the AI script writer. (Ours makes the user TYPE the product by hand; no scrape in the
  Matrix wizard.)
- **Step 3:** output settings — voice (ElevenLabs M/F/Mix + "try voice"), **count 5/10/15**
  (ours: 1/2/3), subtitles (font/anim/color + live preview), and a whole **sound & music**
  panel we don't have at all (bg music auto-per-creative, keep-original-audio, SFX-on-CTA,
  sound-on-keywords, Edit+ smart effects, video transitions, review-scripts-before-render,
  color-pop, outro CTA card).
- **Generate → N creatives, each a DIFFERENT montage** of the source clips + different AI
  script + voiceover + captions/music. "Od više snimaka napraviš jedan" = cut/sequence
  the source clips together into one ad, N times.

**What we actually built (F4):** `MatrixAd.tsx` takes a SINGLE `backgroundVideoUrl:
string` (see `packages/core/src/types.ts:128`), plays it full-length with
`objectFit:cover`, overlays karaoke captions + intro transition + outro card. It is a
**single-clip caption-overlay renderer, NOT a multi-clip montage editor.** The very
premise (one clip, singular) is wrong. The matrix wizard (`apps/web/src/app/app/matrix/
page.tsx`) has NO upload step, NO link import, NO scrape step, count 1-3, no audio panel.
This is a **core rework**, not a patch. The "does it cut half a second of something
important" question the owner raised earlier only makes sense in THIS (correct) framing:
a montage engine must choose per-clip in/out points + order + duration synced to the
voiceover — which is exactly where **source-clip analysis** (scene/motion/silence
detection) becomes relevant. That design discussion is the next big topic (deferred,
not started). Owner was explicit: Matrix must montage user-supplied real clips — NOT
generate AI video from them.

**Next:**
- **BIG: design the Matrix multi-clip montage rework** (see the CRITICAL note above) —
  multi-clip upload + link import (TikTok/YT/IG), scrape in the wizard, the montage
  engine (per-clip in/out/order/duration synced to voiceover), and the sound/music
  panel. Decide the source-clip analysis approach as part of this. Not started — this
  is the headline item.
- Video path (Veo3/Kling) still untested — lower priority now since the harness code
  itself is proven correct on the image side and no job wires `ai_video` yet.
- Provider choice for `enhance`/`remove_text` still open (candidates noted in F5).
- Next cheap live-test candidates once keys exist: Anthropic (`ClaudeScriptProvider`),
  Lemon Squeezy (test-event feature), R2 (`Storage`) — none are configured yet.
- Waiting on Anthropic key to live-test `ClaudeScriptProvider`.

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
