# SESSION_LOG_ARCHIVE.md

Older session blocks, split out of `SESSION_LOG.md` on 2026-08-05 so the file the
start-of-session ritual reads stays small. **Newest first, append-only — same discipline
as the live log**: when `SESSION_LOG.md` grows past ~4 session blocks, move the oldest
ones here rather than deleting them.

History only. Nothing here is a source of truth about the current state — read
`INFRASTRUCTURE.md` for that, and `SESSION_LOG.md` for recent intent. The **Review
ledger stays in `SESSION_LOG.md`** (it is greppable and still live); do not move
`REVIEWED:` lines here.

---

## 2026-07-20 — Matrix M2c-C + M2c-D: montage wired into the worker (Cline-delegated)
**Account:** _(unrecorded)_
**Commits this session:** 0cd72ad (M2c-C montage wiring), cb646fc (M2c-D storage-url
absolutize), + this log update.

**Done (orchestrated: Claude Code wrote the prompts + audited/gated; Cline CLI on z.ai
GLM did the edits):**
- **M2c-C (`0cd72ad`)** — replaced the M2c-B single-shot bridge in `runMatrixPipeline`
  with the REAL montage: per job, `downloadClip`+`detectShots` (0.3/0.8s) every
  `sourceVideoUrls` into a pool tagged with the source url; per variant
  `buildMontage(pool,{targetSec})` drives `matrixProps.shots`; empty-pool fallback keeps
  the single placeholder; temp files unlinked after the loop. Only `apps/worker/src/
  index.ts`. worker typecheck + web build re-run by Claude Code independently — pass.
  (VERIFIED gates; CODE-COMPLETE pipeline)
- **Caught a real latent blocker while auditing M2c-C** (this is the orchestration win):
  `MockStorage.getUrl` returns a **relative** `/api/storage/...` url. `downloadClip`'s
  `fetch()` rejects a relative url (Node), and the renderer's `<OffthreadVideo>` can't
  fetch one either → every uploaded-clip job would have silently degraded to the
  single-shot fallback. Pre-existing since M2a; M2c-C was just the first to exercise the
  download side. Confirmed no url-absolutization existed anywhere (grep) and that web
  serves `/api/storage` at `:3000`.
- **M2c-D (`cb646fc`)** — fix: `resolveStorageUrl` helper prefixes relative urls with
  `WEB_PUBLIC_URL` (default `http://localhost:3000`); absolute R2/S3 +
  DEFAULT_BACKGROUND_VIDEO_URL pass through. Applied once at `sourceVideoUrls` so the
  whole downstream chain gets absolute urls. Only `apps/worker/src/index.ts`. gates
  re-run independently — pass. (VERIFIED gates; CODE-COMPLETE)
- Both diffs read in full (not trusting Cline self-report), matched spec byte-for-byte,
  exactly 1 file each. REVIEWED ledger lines added for both.

**Done (link-import — owner picked this as the next Matrix feature after M2c):**
- **L1 (`c3f3468`)** — NEW `POST /api/import-clip`: yt-dlp (`youtube-dl-exec`) downloads a
  user link (TikTok/YT/IG/any URL) → `storage.upload` → `{ url }` (same shape as
  /api/upload). Auth + rate-limit + scrape's SSRF guard; single progressive mp4 (ffmpeg-free
  in web). Added `youtube-dl-exec` dep + onlyBuiltDependencies entry.
- **L2 (`36ec956`)** — wizard Step 0 gets a "…ili nalepi link" input+button that calls L1 and
  appends the result to `clips` → flows into the montage pool with zero worker changes.
- Both CODE-COMPLETE + gated (web build re-run independently). **NOT runtime-verified.**
- **yt-dlp BINARY NOT FETCHED (blocks runtime):** pnpm 10 skipped `youtube-dl-exec`'s
  postinstall, so the route 502s until the binary is fetched — OWNER ACTION (Claude was
  correctly blocked by the safety classifier from downloading/executing the binary itself).
  Options: `pnpm approve-builds` in a real terminal (approves youtube-dl-exec + also
  ffmpeg-static's scripts, pnpm 10's canonical path), OR run its scripts directly:
  `node scripts/preinstall.mjs && node scripts/postinstall.js` inside
  `node_modules/.pnpm/youtube-dl-exec@3.1.9_debug@4.4.3/node_modules/youtube-dl-exec`
  (the ffmpeg-static precedent @ 5bcf42e was `node install.js`). ffmpeg-static's ffmpeg.exe
  IS already present in the .pnpm store (verified), so scene-detect/render are unaffected.

**Next (TWO things still un-runtime-verified — do NOT mark VERIFIED until they happen):**
- **Render-verify the full montage path end-to-end** — timing/order bugs + the
  MockStorage-url fix only show up in a real render, not tsc (the M2c discipline). Need:
  web dev server up (serves `/api/storage`), 2–3 real source clips uploaded, a Matrix
  job run, then WATCH the output MP4 / extract frames to confirm it actually cuts between
  genuinely different shots from the uploaded clips (not the single-shot fallback, not
  DEFAULT_BACKGROUND_VIDEO_URL). Owner's sample compilations live in `Video samples/`
  (gitignored). Only after this does M2c-C/M2c-D graduate CODE-COMPLETE → VERIFIED.
- After M2c is VERIFIED: the rest of the real-Matrix rework (still open) — link import
  (TikTok/YT/IG) in the wizard, the sound/music panel, count 5/10/15, real audio muxing
  (voiceover currently tracked-but-discarded). See the CRITICAL/spec notes in the
  2026-07-19 block below — those remain the headline backlog.

---

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
  endSec}]`. **APPROACH VERIFIED 2026-07-19 @ 5bcf42e** (deps committed; detectShots
  module itself NOT written yet). `ffmpeg-static` + `ffprobe-static` (portable binaries,
  no system install — ffmpeg/ffprobe were NOT on PATH). Verified command on 5 REAL owner
  sample compilations (`Video samples/`, gitignored, 576x1024/1080x1920 vertical, 10-28s):
  `ffmpeg -i in -filter:v "select='gt(scene,0.3)',showinfo" -f null -` → parse `pts_time:X`
  from **stderr** (NOT stdout — use spawnSync + res.stderr). Build shots as ranges
  [0,cut1],[cut1,cut2],…,[lastCut,duration]; **drop shots < 0.8s** (sub-second flashes,
  useless as material). Result: 5 sources → **31 usable mini-clips** (the shot pool) — the
  exact montage model the owner described, PROVEN on real footage. Threshold 0.3 + minShot
  0.8s are the verified tuning. TODO for M2b: write `apps/worker/src/scene-detect.ts`
  (`detectShots(localPath, {threshold=0.3, minShotSec=0.8})`) + a download-URL-to-temp
  helper (clips arrive as Storage URLs) + verify it reproduces the 31-shot pool.
  **DOCKER GOTCHA (see 5bcf42e msg):** ffmpeg-static's download postinstall is blocked by
  pnpm even with onlyBuiltDependencies — needed a manual `node .../install.js` locally;
  Dockerfile will need an explicit download step.
- **M2c** — random shot selection per variant + composition rewrite: `MatrixAdProps`
  goes from single `backgroundVideoUrl` to a shot list; `MatrixAd.tsx` renders shots via
  `<Series>` + `<OffthreadVideo trimBefore>`. Verify with a REAL local render (F4-style),
  NOT just typecheck — timing/order bugs don't show up in tsc. **✅ PROTOTYPED &
  WATCHED 2026-07-19:** a throwaway render (remotion/proto-entry.tsx + proto-render.mjs,
  both DELETED after) did the full chain — scene-detect the 5 samples → 31-shot pool →
  randomly pick 11 shots (~20s, each capped at 3s for pace, trimBefore = shot start) →
  `<Series>`/`<OffthreadVideo>` render at 1080x1920 → real MP4. Extracted frames confirm
  it cuts between genuinely different scenes. Sample clips served to OffthreadVideo over a
  tiny local http server (range-capable) since they're local files. Output was
  `Video samples/montage-test.mp4` (gitignored). So M2c is DE-RISKED end-to-end — the real
  version just needs: MatrixAdProps shot-list type (packages/core), the composition change,
  per-variant randomization in the worker (calling detectShots from M2b), captions/outro
  overlaid on top, and clips served via the real Storage URLs (not the throwaway http
  server).

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
