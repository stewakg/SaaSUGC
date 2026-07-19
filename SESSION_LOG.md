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

REVIEWED: Matrix M2a multi-clip upload (apps/web/src/app/app/matrix/page.tsx 8 edits + apps/worker/src/index.ts 2 edits) — CLEAN @ 0353709 (2026-07-19). Cline-worker delegation, audited by Claude Code: new "Upload klipova" first step reuses the mix uploadFile/UploadedFile pattern (5 steps now: clips→import→style→transitions→generate, wizard index math shifted +1 correctly — verified canNext/nextLabel/onNext), sends sourceVideoUrls in job params; worker uses firstClipUrl ?? DEFAULT_BACKGROUND_VIDEO_URL (K1/K2 match spec). Exactly 2 files, composition/types untouched. typecheck + web build re-run independently — pass. NOTE: still single-clip render (first clip only) — real scene-detected montage is M2b/M2c.
REVIEWED: Matrix M1 product-import (apps/web/src/app/app/matrix/page.tsx full rewrite + apps/worker/src/index.ts runMatrixPipeline enrich) — CLEAN @ eb7c2db (2026-07-19). FIRST change implemented by the Cline CLI worker (z.ai GLM Coding Plan), audited by Claude Code: diff read in full (not trusting Cline's self-report), worker edit matches spec to the letter, page.tsx rewrite faithful to the provided TSX (scrape step wired to POST /api/scrape, price/description/sourceImages added to job params, canNext logic correct), exactly 2 files touched, nothing out of scope. `pnpm -r typecheck` + web build re-run by Claude Code independently — both pass.
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

**PRECISE montage mechanism (owner-confirmed 2026-07-19 — this is THE spec, don't
re-guess it):** each uploaded SOURCE video is itself a compilation of multiple SHOTS
(scene A cuts to scene B cuts to C…), each shot an arbitrary length (2s/5s/6s/3s — we
never know in advance). The pipeline is:
1. **Scene-detect every source** (ffmpeg `select='gt(scene,X)'`) → split it at every
   scene change into its constituent SHOTS. Across all N uploads this yields a **pool
   of mini-clips (shots)**.
2. **Per output variant**, randomly pick + order shots from that pool and sequence them
   to fill the voiceover-driven duration. N variants = N different random arrangements
   (× different scripts/voices/captions from M1/M3) = the "matrix".
3. Cuts land ON detected scene boundaries and use WHOLE shots → this is exactly what
   answers the owner's original "no cutting mid-action" worry.
So **scene detection is CORE to M2, not a later refinement** (an earlier note in this
file called it deferred — that was before the mechanism was understood; it is NOT
deferrable). A fixed-rhythm (e.g. cut every 2.5s) montage is WRONG — shots have natural
boundaries we must cut on. Clean implementation: don't split into physical files —
store shot boundaries as `{sourceUrl, startSec, endSec}` and let Remotion play the
sub-range via `<OffthreadVideo trimBefore/trimAfter>` inside a `<Series>`.

**M2 build breakdown (agreed):**
- **M2a** — Matrix wizard gets a multi-clip upload step (reuse `mix`'s `uploadFile` /
  `UploadedFile` pattern; `sourceVideoUrls` in job params); worker uses the uploaded
  clip(s) instead of the hardcoded `DEFAULT_BACKGROUND_VIDEO_URL` placeholder. Safe
  Cline delegation (same shape as M1). Verify: typecheck + build.
- **M2b** — ffmpeg scene detection in the worker: `detectShots(video) → [{startSec,
  endSec}]`. Use the **`ffmpeg-static` + `ffprobe-static`** npm packages (portable
  binary, works on Windows dev AND the Docker worker identically — NO system install /
  apt-get needed; ffmpeg/ffprobe confirmed NOT on PATH locally 2026-07-19). detectShots:
  download the source to a temp file → run `ffmpeg -i in -filter:v "select='gt(scene,
  0.3)',showinfo" -f null -` (or the `scdet` filter) → parse the scene-change timestamps
  from stderr → return shot ranges. Delicate (external process + stderr parsing) — NOT a
  blind Cline delegation; verify against a REAL sample compilation video (one that
  actually cuts between shots) — owner needs to provide/point at such a sample.
- **M2c** — random shot selection per variant + composition rewrite: `MatrixAdProps`
  goes from single `backgroundVideoUrl` to a shot list; `MatrixAd.tsx` renders shots via
  `<Series>` + `<OffthreadVideo trimBefore>`. Verify with a REAL local render (F4-style),
  NOT just typecheck — timing/order bugs don't show up in tsc.

**Cline-CLI-as-worker experiment (2026-07-19) — ✅ LOOP VERIFIED WORKING:**
UNBLOCKED 2026-07-19: reconfigured z.ai via `cline auth openai-compatible -b
https://api.z.ai/api/coding/paas/v4 -m glm-5.2 -k <key>` (provider id is
`openai-compatible`, confirmed from the installed package). Trivial test now passes
end-to-end from Claude Code's Bash tool: `cline --auto-approve true -c <scratch> "write
ping.txt…"` → exit 0, file written with exact content, output captured to a log I don't
read, timeout-bounded. The owner has NO Cline pass and doesn't need one — BYO
`openai-compatible` provider talks straight to z.ai with the owner's key (the earlier
"insufficient balance" was z.ai's OWN error = proof the request already reached z.ai,
just on the wrong endpoint). Delegation loop is live; next is the first REAL delegation
(M1 Matrix prompt). History below kept for context.

**(historical, now resolved) Cline-CLI-as-worker experiment (2026-07-19) — was blocked on z.ai config:**
Idea: instead of the owner manually copy-pasting Cline prompts, let Claude Code (me)
orchestrate and delegate implementation to **Cline CLI** running on the owner's z.ai
GLM Coding Plan (cheap), so the heavy generation stays on z.ai while I stay lean.
- **VERIFIED the mechanics work on MY side:** installed `cline` CLI globally
  (`npm i -g cline` → v3.0.46). It runs headless via the Bash tool (non-interactive,
  no TTY needed for a bare prompt — but `cline config`/interactive subcommands DO need
  a TTY so I can't run those). Flags: `--auto-approve <bool>` (default true = the yolo
  behaviour, no `-y` in v3), `--json`, `-c/--cwd`, `-P/--provider`, and `cline auth`
  takes `-p/-b/-m/-k` so it can be run non-interactively. Config lives at
  `~/.cline/data/settings/providers.json` — SEPARATE from the VS Code extension (does
  NOT inherit it).
- **BLOCKER (owner's side — credentials/plan config, my boundary):** every real run
  fails with z.ai `"Insufficient balance or no resource package. Please recharge."` —
  even though the owner's GLM Coding Plan quota is FULL (dashboard 2026-07-19: 5-hour
  0%, weekly 54%). Root cause: Cline's built-in `zai` provider preset hits the GENERAL
  endpoint `https://api.z.ai/api/paas/v4` (pay-as-you-go, zero balance), NOT the
  Coding-Plan endpoint. Re-running `cline auth zai` does NOT fix it (the zai preset's
  base URL is fixed to the general endpoint).
- **FIX (documented, not yet applied):** configure Cline as an **OpenAI-Compatible**
  provider with base URL `https://api.z.ai/api/coding/paas/v4` (the coding endpoint —
  NOT interchangeable with the general one), model `glm-5.2` (correct — Coding Plan
  serves it, 1M ctx), owner's z.ai key. Do it via interactive `cline auth` in a REAL
  terminal (picks "OpenAI Compatible" from a menu, sidesteps needing the exact provider
  id, and handles the key = owner's job). Then re-run the trivial test
  (`cline --auto-approve true -c <scratch> "write ping.txt…"`) — if it writes the file,
  the loop is live.
- **Intended delegation pattern once unblocked (agreed with owner):** I write the task
  → run `cline --auto-approve true` in the repo, stdout to a log I DON'T read → bounded
  by the Bash tool's ≤10-min timeout (foreground) or background+watchdog (long tasks) →
  Cline writes a compact `scratchpad/cline-report-<id>.md` I read INSTEAD of its chatter
  → I review `git diff` + report, typecheck/build, commit. **Safety rails:** the worker
  only does file edits + local typecheck; NEVER push/deploy/migrate/call paid APIs —
  those stay gated on me/owner. Everything git-revertible.

**Next:**
- **Cline-worker:** owner reconfigures z.ai as OpenAI-Compatible + coding base URL (see
  above), then I re-run the trivial test; if green, first real delegation is the M1
  Matrix prompt (already written: `scratchpad/cline-prompt-matrix-M1-product-import.md`).
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
