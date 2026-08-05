# SESSION_LOG.md

Append-only, newest first. One block per session. See `CLAUDE.md` for the ritual and
the **VERIFIED vs CODE-COMPLETE** discipline. When you start a session, record which
account (A or B) you're on so the history shows the alternation.

Older blocks live in `SESSION_LOG_ARCHIVE.md` — when this file passes ~4 blocks, move
the oldest ones there. **The Review ledger below stays here regardless**; it is what
`grep "^REVIEWED:"` has to find.

---

## Review ledger
Greppable review verdicts, newest first, each anchored to a commit. Before reviewing an
area, find its latest `REVIEWED:` line, then `git log <commit>..HEAD -- <paths>` — empty
means nothing changed since, so skip. See CLAUDE.md → "Review reuse — never re-review
unchanged code".

REVIEWED: matrix audio muxing (packages/core/src/{interfaces,types}.ts + providers/voice.elevenlabs.ts + apps/worker/src/index.ts + remotion/src/compositions/MatrixAd.tsx) — CLEAN @ eae4b4c (2026-08-05). Two Cline tasks (core, then worker+remotion), both diffs audited line-by-line; Claude Code fixed a doc-comment placement of its own spec's making, refreshed the file's stale "NOT live-tested" header, and re-applied an absolutize fix Cline had clobbered mid-run. ✅ RUNTIME-VERIFIED BY MEASUREMENT: `volumedetect` mean −23.4 dB / max −4.0 dB against −91.0 dB (digital silence) pre-fix; duration tracks real speech (11.99s ≈ 8.4s spoken + 3s outro); filmstrip shows the highlight advancing word by word. ElevenLabs `/with-timestamps` probed live BEFORE writing any code. **Cost change: real ElevenLabs credits per variant now.** `musicUrl`/`sfxUrl` paths remain wired-but-unfed and are still NOT runtime-verified.
REVIEWED: storage-route dev bypass + gitignore anchor (.gitignore + NEW-TO-GIT apps/web/src/app/api/storage/[...path]/route.ts) — CLEAN @ cb8f7a2 (2026-08-05). Cline-delegated, diff audited by Claude Code against the spec: serveFile() extracted, bypass inserted AFTER the path-traversal guard and BEFORE createServerClient(), auth/isOwnUpload/RLS logic byte-identical. **Cline found what the spec missed**: the route file was never in git (bare `storage/` ignore pattern matches any depth) — pattern anchored to `/storage/`, generated assets still ignored. ✅ RUNTIME-VERIFIED: /api/storage/... 401→200 (4 MB video/mp4), traversal probe still non-200, and the montage render that previously threw on 401 now completes.
REVIEWED: import-clip format selection (apps/web/src/app/api/import-clip/route.ts) — CLEAN @ fcd383f (2026-08-05). Cline-delegated, all 5 edits landed exactly; Claude Code corrected one doc-comment that referenced the prompt's own "CHANGE 2" numbering. Auth/rate-limit/SSRF guard/storage.upload/502-catch untouched. ✅ RUNTIME-VERIFIED both before and after: real YouTube link went 269.28 MB / 56.2s → 27.20 MB / 15.6s (format 18, 640x360 h264+aac). New 413 file_too_large path is a backstop only — not exercised live (would need a >200MB progressive source).
REVIEWED: worker testability hook (apps/worker/src/index.ts: export runMatrixPipeline + isDirectRun guard) — CLEAN @ 6c56f81 (2026-08-05). Written directly by Claude Code (not Cline) because it was the harness needed to verify the real pipeline. Behaviour on a real `tsx src/index.ts` start is unchanged; imports no longer open Redis or exit on a missing service key.
REVIEWED: worker/core test coverage (NEW apps/worker/src/{montage,scene-detect}.test.ts + packages/core/src/{captions,pricing}.test.ts + vitest devDep in both packages + scene-detect.ts shotsFromCuts extraction) — CLEAN @ d061fd3 (2026-07-20). First tests in the repo. Cline-delegated, each suite RUN independently by Claude Code (not trusting the report): 25 tests pass (buildMontage 8, shotsFromCuts 6, mockWordTimestamps 6, computeJobCost 5). scene-detect.ts change is a behavior-preserving pure extraction (shotsFromCuts) — detectShots output identical, so its real-footage verification @ 5bcf42e still holds; montage.ts/captions.ts/pricing.ts untouched. `pnpm -r test` green, `pnpm -r typecheck` green. Covers the whole montage chain (detect→pool→montage) that can't be runtime-verified until the yt-dlp binary + a real render land.
REVIEWED: SSRF guard dedup (NEW apps/web/src/lib/safe-url.ts + scrape/route.ts + import-clip/route.ts) — CLEAN @ 766a671 (2026-07-20). Pure refactor: isSafeTargetUrl (security-critical) was duplicated byte-for-byte in two routes; now one shared module both import, inline defs + mirror-marker removed, import-clip header doc-comment corrected. No behavior change. web build re-run independently — pass.
REVIEWED: Matrix count 5/10/15 (apps/web/src/app/app/matrix/page.tsx + apps/web/src/app/api/jobs/route.ts) — CLEAN @ 30fe4ef (2026-07-20). Wizard 1/2/3→5/10/15 (default 5, 2-digit button width). Caught + fixed two coupled breakages: MAX_JOB_COUNT 10→15 in /api/jobs (15 would 400 invalid_count), and pollJob timeout now count-scaled (max(180s, count*45s)) so a 15-variant sequential render isn't cut off in the UI. Cost auto-scales (computeJobCost matrix*count). web build re-run independently — pass.
REVIEWED: Matrix link-import L2 wizard (apps/web/src/app/app/matrix/page.tsx: linkUrl/importingLink/linkError state + handleImportLink + Step 0 "nalepi link" UI) — CLEAN @ 36ec956 (2026-07-20). Cline diff audited by Claude Code, faithful to spec: POST /api/import-clip { url } → on ok append { url, name:hostname } to the SAME `clips` list the file upload fills (→ sourceVideoUrls → montage pool, zero further wiring); scrape-step input/button styling reused; placed after upload feedback, before the clips list. Only matrix/page.tsx. web build re-run independently — pass. CODE-COMPLETE, NOT runtime-verified (needs yt-dlp binary).
REVIEWED: Matrix link-import L1 route (NEW apps/web/src/app/api/import-clip/route.ts + apps/web/package.json + pnpm-workspace.yaml + pnpm-lock.yaml) — CLEAN @ c3f3468 (2026-07-20). Cline diff audited by Claude Code: POST route mirrors /api/upload (auth→401, rateLimit import:<uid> 10/60→429, storage.upload→{url}) + the scrape route's SSRF guard duplicated verbatim inline (greppable marker); yt-dlp (youtube-dl-exec) downloads a single progressive mp4 (b[ext=mp4], ffmpeg-free) into mkdtemp → storage.upload → {url}, temp dir always rm'd, errors→502. Exactly 3 source files + forced lockfile churn. web build re-run independently — pass, route registered dynamic. **RUNTIME BLOCKER: pnpm 10 skipped youtube-dl-exec's postinstall → yt-dlp binary NOT fetched; route 502s until fetched manually (owner action, same as ffmpeg-static was). Cline's claim that ffmpeg-static's binary is ALSO missing was WRONG — independently verified ffmpeg.exe IS present in the .pnpm store (Cline checked the hoisted symlink).** CODE-COMPLETE, NOT runtime-verified.
REVIEWED: Matrix M2c-D storage-url absolutize (apps/worker/src/index.ts: resolveStorageUrl helper + sourceVideoUrls .map) — CLEAN @ cb646fc (2026-07-20). Cline diff audited by Claude Code, matches spec to the letter: WEB_PUBLIC_URL (default http://localhost:3000) prefixes only relative (leading-'/') urls; absolute R2/S3 + DEFAULT_BACKGROUND_VIDEO_URL untouched; applied ONCE at sourceVideoUrls so download loop + pool tags + montage shots + firstClipUrl fallback all get absolute urls. Only apps/worker/src/index.ts touched. worker typecheck + web build re-run independently — pass. Closes the M2c-C blocker. CODE-COMPLETE, NOT yet render-verified.
REVIEWED: Matrix M2c-C montage wiring (apps/worker/src/index.ts runMatrixPipeline: pool build + per-variant buildMontage + temp cleanup) — CLEAN @ 0cd72ad (2026-07-20). Cline diff audited by Claude Code, byte-faithful to spec: scene-detect pool built ONCE per job before the variant loop (not per-variant — detection is expensive), shots tagged with the ORIGINAL source url, buildMontage(pool,{targetSec}) per variant, single-shot fallback when pool empty, temp files unlinked best-effort after the loop. Only apps/worker/src/index.ts touched; scene-detect/montage/composition/types untouched. worker typecheck + web build re-run independently — pass. **KNOWN BLOCKER at commit time (fixed in M2c-D/cb646fc): relative MockStorage urls.** CODE-COMPLETE, NOT render-verified.
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

## 2026-08-05 — RUNTIME VERIFICATION DAY: Matrix montage actually renders now
**Account:** _(unrecorded)_
**Commits this session:** cb8f7a2 (storage route + gitignore + dev bypass), fcd383f
(import-clip format fix), 6c56f81 (worker export/guard), + this log/docs update.

**Context:** owner said "svuda imam kredite, sve može da se krene sa testom", then
"uradi sve što treba, iskoristi cline maksimalno". This session finally executed the
`ZA-TESTIRANJE.md` handover written on 2026-07-20 — which had sat undone for two weeks.

**The headline: three real bugs that only runtime execution could find.** Everything
below was CODE-COMPLETE and had passed static review; all three were invisible to it.

1. **`/api/storage` requires a session cookie; the worker and renderer have none.**
   This is the big one. Every Matrix job with uploaded clips **hard-failed** — not
   "degraded to one clip" as `ZA-TESTIRANJE.md` §5(c) predicted. Chain: `downloadClip`
   401 → caught → empty shot pool → fallback single shot **on the same unreachable
   url** → Remotion threw `Received a status code of 401`. So the product's
   differentiator had never once worked locally. M2c-D (`cb646fc`) had made these urls
   absolute but not *fetchable* — it fixed half the problem and the review couldn't see
   the other half, because an absolute url looks correct on the page.
2. **`.gitignore`'s bare `storage/` swallowed a source file.** The pattern matches a
   dir named `storage` at any depth → `apps/web/src/app/api/storage/` was NEVER
   committed. It existed only on this machine; a fresh clone has no storage route at
   all. Found by Cline while doing (1) — it noticed `git diff --stat` stayed empty
   after its edits and dug in rather than declaring success. Credit where due.
3. **`maxFilesize: '200M'` in import-clip did the opposite of its job.** Passing
   `--max-filesize` is itself what pushes yt-dlp off the small progressive format onto
   a 1080p60 HLS one (`301 | m3u8_native` vs `18 | 640x360 | https`), so the route
   downloaded **269 MB** — blowing the very cap meant to prevent it — and then
   `readFile`'d all of it into the Next process. Fixed with `[protocol=https]` + a
   `stat()` backstop. Measured before/after: **269.28 MB / 56.2s → 27.20 MB / 15.6s.**

**VERIFIED (actually run, not typechecked):**
- **yt-dlp binary fetched** — the two-week blocker. Read `postinstall.js` first
  (official `yt-dlp/yt-dlp` GitHub releases), ran it directly; no TTY / `approve-builds`
  needed. `yt-dlp.exe 2026.07.04`.
- **Link import works** — real YouTube link → valid h264+aac mp4 → MockStorage.
- **scene-detect + buildMontage on real footage** — 5 shots from each sample clip;
  montage alternates sources and varies with targetSec.
- **✅ FULL MATRIX RENDER, 2 variants** — 1080x1920, 18.05s + 23.06s, ~20 MB each, with
  audio streams. Filmstrips inspected frame-by-frame: real cuts between different source
  clips, Serbian word-highlight captions, intro transition, outro CTA card. **The two
  variants are genuinely different** (different script AND different shot selection).
  This is the first time the M2c chain has produced output. Was CODE-COMPLETE since
  2026-07-20; now VERIFIED.
- **F5 image benchmark, n=3 prompts × 2 providers, real credits** — 6/6 succeeded 1st
  try. kie.ai median 12.0s vs fal.ai 27.8s (~2.3× faster, consistent). Quality a wash,
  both production-grade incl. correct Serbian diacritics in rendered ad text. Keeps
  kie-primary/fal-fallback, now on measurement not assumption. See `tests/kie-vs-fal.md`.
- Gates green after all changes: `pnpm -r typecheck` (5/5), `pnpm -r test` (25), web build.

**Cline usage:** two tasks, each one file, fully mechanical prompts (exact FIND/REPLACE
blocks + definition-of-done), run via **PowerShell not Git Bash** — `cline` has no bash
shim, and a bash invocation fails with `command not found` while the wrapping command
still exits 0. Both diffs audited line-by-line before commit; both were faithful. The
`.gitignore` anchor and the worker export/guard Claude Code did directly (1-char and
harness changes).

**Docs cleanup (second half of the session, owner asked for token-cost reduction):**
`handover.md` deleted after a section-by-section check (its §8 business/margin analysis
was the only unique part → rescued into `BUSINESS.md`); `SESSION_LOG.md` 464→199 lines
with older blocks in `SESSION_LOG_ARCHIVE.md` and the out-of-order 07-23 block moved to
its right place; `INFRASTRUCTURE.md` §4's copied interface signatures replaced by a
pointer to `interfaces.ts` (the copy had drifted — no `orderId`, no `Logger`).
**Three stale claims found and fixed while cross-checking** — two docs said no git remote
exists (one does), and `CLAUDE.md`'s own anti-drift section cited a `loadReal('ai')`
example whose code no longer exists. Lesson worth keeping: two of the three sections I
*assumed* were duplicates were not (§0's competitor-password security rule and §2's repo
map exist nowhere else), so the `INFRASTRUCTURE.md` trim was far smaller than projected.
Check before cutting.

**Audio muxing landed (`eae4b4c`) — the last big gap in the main feature.** Probed
ElevenLabs' `/with-timestamps` against the live API *before* writing code: it returns
per-character alignment that folds cleanly into Serbian words, diacritics and real pauses
intact. So captions now run on actual speech, not `mockWordTimestamps`. **The debugging
lesson is the valuable part**: the first render had an AAC track and looked done — but
`volumedetect` read **−91.0 dB, digital silence**. Cause was a RELATIVE MockStorage url
reaching `<Audio>`, which mounts only on absolute http(s); Remotion then finds no audio
asset and writes a silent track **with no error at all**. Identical failure class to the
`/api/storage` 401 earlier the same day — `resolveStorageUrl` was the fix both times.
**Never accept "the stream exists" as proof audio works; measure it.** Two Cline traps
also hit and now written into `CLAUDE.md`: cline must run from PowerShell (Bash has no
shim and fails while still exiting 0), long prompts must go in a file with a one-line
pointer, and editing a file while Cline is mid-run gets your edit clobbered — which is
what sent me chasing a phantom Remotion bug.

**Also this session:** karaoke captions were bottom-anchored at ~88% frame height, inside
TikTok/Reels' own UI band — moved to ~46% (`304e44a`) and a caption-editor TODO added to
F4 (position props + sliders; font/anim/colour already exist, `captionScale` needs only UI).

**Next / still owner-gated:**
- **Redis is NOT a blocker and NOT needed for production** — prod Redis already runs on
  the Hetzner VPS (`infra/docker-compose.prod.yml`, LIVE-VERIFIED 2026-07-18). A local
  Redis would only exercise the `/api/jobs → queue → worker` hop through the UI; the
  pipeline itself is now verified without it. Do NOT SSH-tunnel to the VPS Redis for
  this — the prod worker consumes the same `adgen-jobs` queue and would eat test jobs.
- **F5 decision recorded, not made: public R2 bucket vs presigned urls.** `storage.r2.ts`
  `getUrl` returns a plain public url, which reintroduces exactly the guessable-key
  exposure `/api/storage`'s auth was written to prevent. Presigned urls are the real
  answer. Must be settled before F6 launch.
- Unchanged: audio muxing (credits), sound/music panel, F6 billing + Vercel deploy,
  legal pages, brand naming, `generateVideo` live-test (F7).

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

---

## 2026-07-20 — autonomous backlog pass (count 5/10/15, cleanup, first tests) — Cline-delegated
**Account:** _(unrecorded)_
**Commits this session:** 30fe4ef (count 5/10/15), 766a671 (SSRF-guard dedup), e0dea18
(vitest + buildMontage tests), f0cc99a (shotsFromCuts extraction + tests), d061fd3 (core
tests), + this log/infra update.

**Context:** owner said "radi random, popravi SVE što ne zahteva mene, sve preko Cline" —
a remote autonomous session. Scope I DELIBERATELY EXCLUDED (needs owner / spends money /
subjective): yt-dlp binary fetch, F5 benchmark + provider live-tests, audio muxing (real
ElevenLabs credits), billing, Vercel deploy, legal pages, brand naming, and subjective
visual/copy polish. Everything else in the safe backlog, done below.

**Done (each: Cline edited → Claude Code read the full diff, re-ran gates/tests
independently, committed):**
- **count 5/10/15 (`30fe4ef`)** — competitor parity. Orchestration catch: naively changing
  the wizard would have 400'd (MAX_JOB_COUNT was 10) and timed out the UI on 15 sequential
  renders — fixed both (cap→15, pollJob timeout count-scaled).
- **SSRF-guard dedup (`766a671`)** — extracted `isSafeTargetUrl` (duplicated in scrape +
  import-clip) into shared `@/lib/safe-url`. Removed the duplication I introduced in L1.
- **First tests in the repo (`e0dea18`,`f0cc99a`,`d061fd3`)** — vitest in @adgen/worker +
  @adgen/core; **25 tests, all green via `pnpm -r test`**: buildMontage (8, invariants),
  shotsFromCuts (6 — extracted pure from detectShots, behavior-preserving), mockWordTimestamps
  (6), computeJobCost (5). This is the safety net for the montage chain, which still can't be
  runtime-verified (yt-dlp binary + real render pending).
- Lint clean (`next lint` — no warnings/errors). `pnpm -r typecheck` green throughout.
- Docs: INFRASTRUCTURE.md F4 note updated (count now done); this block + 3 REVIEWED lines.

**→ OWNER CHECKLIST: `ZA-TESTIRANJE.md`** (repo root) — step-by-step za vlasnika: yt-dlp
binary fetch, pokretanje stack-a, gejtovi, i funkcionalno testiranje link-import + M2c montaže
kroz UI. Napisano ovog sesija kao handover za runtime-verifikaciju.

**Next / still owner-gated (unchanged from below):** yt-dlp binary fetch → runtime-verify
link-import + M2c montage render (both CODE-COMPLETE, NOT verified); then sound/music panel
(blocked on an audio asset source), audio muxing (credits), F5 provider live-tests, F6
billing + Vercel deploy, legal, brand naming. `pnpm -r test` is now a real gate to keep green.

---
