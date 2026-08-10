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

REVIEWED: matrix wizard cost display (apps/web/src/app/app/matrix/page.tsx: new `effectiveCount`) — CLEAN @ cb3bcfb (2026-08-10). Written directly by Claude Code during a click-test, not delegated — 4 call sites, one expression. ✅ RUNTIME-VERIFIED through the browser over HMR: with one kept script the footer went "Cena: 75 kredita (5 × 15)" → "Cena: 15 kredita (1 × 15)", directly under the existing "Napraviće se 1 video" line. **Billing itself was never wrong** — `/api/jobs` was already sent the kept-script count (12d27d4); only the number quoted to the user before the click was. `pnpm -r typecheck` green on all 5 projects. **Closes the "NOT click-tested" caveat in the sound-panel verdict @ e04f865** for the caption controls and both audio pickers (see the block below); the *rendered* effect of music/SFX still rests on the 08-05 dB measurements, not on this test.
REVIEWED: yt-dlp shell escape + rate-limiter fail-open (packages/core/src/queue.ts + apps/web/src/lib/rate-limit.ts + NEW apps/web/src/lib/yt-dlp.ts + NEW apps/web/src/types/youtube-dl-exec-constants.d.ts + apps/web/next.config.mjs + api/{search-clips,import-clip}/route.ts) — CLEAN @ 4683cb3 (2026-08-10). Written directly by Claude Code while click-testing, not delegated — each fix was the thing blocking the next observation. ✅ RUNTIME-VERIFIED end-to-end through the browser: search "masazer za vrat" → 8 Serbian results → "Uzmi" → POST /api/import-clip 200 in 13.5s → card leaves the grid, clip enters the list. Measured before/after on the rate limiter: 223011ms → 740ms. **Supersedes the fail-open claim in the F5/F6-infra verdict @ 4500e0e**, which was CLEAN on a path that could not execute.
REVIEWED: sound panel + sfx sequencing fix (packages/core/src/types.ts + remotion/src/compositions/MatrixAd.tsx + apps/web/src/app/api/upload/route.ts + apps/web/src/app/app/matrix/page.tsx + apps/worker/src/index.ts) — CLEAN @ e04f865 (2026-08-05). musicVolume prop + sfx url guard Cline-delegated (diff audited, clean); upload audio types, wizard panel, worker wiring and the sfx Sequence fix by Claude Code. ✅ RUNTIME-VERIFIED by measuring the video TAIL, after the voiceover stops, so the sources are distinguishable: voice-only −91.0 dB (silence), +music −33.7 dB, sfx before −91.0 dB, sfx after −30.3 dB. **Found a latent bug doing it:** the CTA sfx `<Audio>` sat inside `OutroCard` with no enclosing `<Sequence>`, so Remotion treated it as starting at frame 0 and it played nothing — broken since F4, invisible because the prop was never set. **NOT click-tested**: the wizard's music/SFX pickers and volume slider are behind auth.
REVIEWED: voice-id regression fix + caption editor (NEW apps/web/src/app/api/voices/route.ts + apps/web/src/app/app/matrix/page.tsx + apps/worker/src/index.ts + packages/core/src/types.ts + remotion/src/compositions/MatrixAd.tsx) — CLEAN @ 18a004a,8cc7a94 (2026-08-05). Render side Cline-delegated (diff audited, clean); voices route + worker resolve + wizard UI written by Claude Code. ✅ RUNTIME-VERIFIED: a job with the stale `voice_srp_f1` logs the fallback warning and renders with audio (−23.5 dB) instead of dying; captionY 0.3 visibly moves captions to the upper third. **NOT click-tested**: the wizard's new sliders/presets are behind auth and were not exercised in a browser — owner pass needed. `/api/voices` verified only as far as 401-unauthenticated + route registered in the build.
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

## 2026-08-10 (second session) — click-tests 2 and 4 pass; OpenRouter writes a script from inside the app for the first time
**Account:** _(unrecorded)_ · **Machine:** primary. **Commits:** `cb3bcfb` matrix cost
display · this block. Started from a clean `main...origin/main`, no divergence.

**The harness was fixed before any repo work, and it was not cosmetic.**
`~/.claude/settings.json` pointed both its `PreToolUse` hook and its statusLine at
`C:\Users\Stevan\` — a profile that does not exist on this box (it is `C:\Users\stewa\`).
The force-push guard had therefore **never executed once**; a `git push --force origin main`
would have gone straight through. Paths corrected and the guard **PROVEN, not assumed**:
feeding it a `{"tool_name":"Bash","tool_input":{"command":"git push --force origin main"}}`
payload now exits 2 with `BLOCKED`. It deliberately still permits `--force-with-lease`.
Note this only matters because two machines are now in play — the exact class of loss
`aikutak` paid three weeks for.

**No password was ever typed.** The dev server on :3000 was already up from another
session *and already authenticated* (Supabase cookie for `iqfzhnndhhrprkrkfygd`), so the
whole wizard was reachable. Worth recording as method: the first probe of
`/api/generate-scripts` returned **200 while I believed I was anonymous**, which is what
revealed the live session — the route 401s without a user, so the 200 was the evidence.

**✅ CLICK-TEST 2 PASSED — the OpenRouter ScriptProvider has now run from the application.**
Until today it had only ever run from the blind-eval harness; INFRASTRUCTURE.md F5 records
that every Matrix ad ever produced used `MockScriptProvider`'s canned lines. Voice was set
to **Charlie (male)** on purpose, so the test was the hard one rather than the cosmetic one.
`POST /api/generate-scripts → 200`, UI showed `1/10 · muški rod`, and the text came back:

> "Celo jutro sam **proveo** za kompjuterom i vrat mi je ukočen! Konačno sam **našao** spas
> u ovom šijacu masažeru sa grejanjem… Sada je samo 3.490 dinara, dostava je besplatna, a
> plaćaš tek kad stigne na adresu."

Both gender-bearing forms are masculine, cases hold, no ijekavica leakage, diacritics
intact, and the price + offer typed into step 2 reached the copy. The chain
**ElevenLabs voice → server-side `resolveGender` → Serbian prompt** works end-to-end; the
gender is resolved from `labels.gender` on the server, never trusted from the client.

**✅ CLICK-TEST 4 PASSED — caption and sound controls, both behind auth and never clicked
until now** (the `@ e04f865` verdict says so explicitly). Font Impact→Montserrat, animation
Pop→Smooth, position preset "Centar" (which correctly dragged the vertical slider 46→50),
size 130%, colour input present. Both audio pickers: `POST /api/upload → 200` each, both
filenames render, and the **"Jačina muzike" slider only appears once music exists** (25%
default). The WAV used was synthesised in-page rather than uploaded by hand, since the pane
was not displayed and no file dialog was drivable — `audio/wav` is in the route's
`ALLOWED_TYPES`, so the path exercised is the real one.

**`/api/voices` is now RUNTIME-VERIFIED beyond the 401-plus-registered check** it had at
`@ 18a004a`: it returns 50+ real voices including the owner's own clones (Milojica, Matori
pripovedač, Slobodan, "Stari ja"). A mock could not know those names.

**BUG FOUND AND FIXED — the wizard quoted a price for videos it wasn't going to make**
(`cb3bcfb`, see the ledger). Only visible once a script is actually kept, which is why
static review never caught it and why the click-test did.

**No finished video was produced, and here is exactly why** — the owner asked. Three
blockers, all measured, none of them the renderer:
1. **Redis is not running** — 127.0.0.1:6379 refused, `REDIS_URL` empty in `.env`.
2. **No worker process** — only the Next dev server is up.
3. **Credits: 3, and one Matrix video costs 15.** Account `stewa_kg@yahoo.com`. Lemon
   Squeezy is entirely unconfigured, so topping up means touching Supabase directly.

The renderer is *not* a blocker: the worker bypasses the factory and constructs
`LocalRemotionRenderer` directly (`apps/worker/src/index.ts:41`), which is how the 08-05
renders were produced. `docker` is absent on this machine; `ssh` is present, so the VPS
Redis tunnel used on 07-18 remains the viable route.

**Aside, no repo impact:** the owner asked for the `caveman` skill
(github.com/JuliusBrussee/caveman, MIT). It was installed by hand into `~/.claude/skills/`
rather than via the project's `irm … | iex`, verified byte-identical to source, then
**deleted again** once the owner chose the official plugin install — `claude plugin install`
targets `~/.claude/plugins/`, so leaving the hand copy would have meant two skills named
`caveman`. Read the installer before it runs: it backs `settings.json` up to `.bak` once,
merges only `SessionStart` + `UserPromptSubmit` (our `PreToolUse` guard is untouched), and
**will not replace an existing statusLine** — it prints a NOTE and skips its own badge. It
detects Cline via the VS Code extension, which is absent here, so the `cline` CLI pipeline
this repo depends on is unaffected.

**Still open, in priority order:**
1. **Click-test 3 (password recovery by email) NOT STARTED** — it needs a real mail sent to
   the owner's address and access to that inbox, so it is owner-gated, not blocked on code.
2. The burned-in-UI defect remains untouched and **the owner explicitly declined to start it
   this session** — do not open it unprompted. Same standing instruction as image-driven
   clip search.
3. The Serbian blind eval (`tests/serbian-script-eval/2026-08-09-11-30-blind.md`) is still
   **ungraded**, every axis `_`. Until it is graded the script model is an unvalidated
   default — note that today's single sample was good, which is evidence but not the eval.

**Deliberately left uncommitted:** `.claude/launch.json` (machine-local absolute paths to
sibling projects, same as every prior session) and `scratchpad/` (untracked).

---

## 2026-08-10 — back on the primary machine; clip search actually runs for the first time
**Account:** _(unrecorded)_ · **Machine:** primary (`C:\Sa starog\D1tb\Projekti\1. WebSaas`) —
the box that was idle on 08-09. Pulled 29 commits, fast-forward, no conflict.

**Environment rebuilt for the new Supabase project.** `.env` does not travel through git, so
this machine still pointed at the abandoned `gczikdrskcpqqlyzvnby` with keys that were revoked
on 08-09. Root `.env` regenerated (old one kept as `.env.bak-20260810`), `env:sync` run.
**VERIFIED live, with a control:** publishable → `/auth/v1/health` 200; secret →
`/auth/v1/admin/users` 200, so it really resolves to `service_role`; and publishable against the
same admin endpoint → 401, which is what makes the first 200 mean anything.
Correction worth keeping: `SUPABASE_ANON_KEY` (no `NEXT_PUBLIC_`) is read by **no code at all** —
only declared in `env.ts:34`. `PODSETNIK.md §3` asks for it out of habit.

**⚠️ I leaked two live keys into the session transcript — the SAME masking bug as 08-09.**
A diagnostic printed a "prefix" by splitting the value on `_`; a JWT and an OpenRouter key contain
no `_`, so the split returned the whole string. Owner replaced both. A mask whose output is
*derived from* the value will eventually print the value. `scratchpad/check-env.mjs` now does the
job with a regex **test** and prints only a label + length; use it instead of writing a fresh
one-liner. Also caught: `.env.bak-20260810` was **not** covered by `.gitignore` (`.env` does not
match it) and held live provider keys — `.env.bak*` added.

**Owner also pasted the legacy `service_role` JWT instead of the `sb_secret_` key** — same project,
wrong tab in the dashboard, and legacy was disabled on 08-09 so it would have failed with a
confusing error. Confirmed against the live Supabase docs, not from memory: publishable replaces
`anon`, secret replaces `service_role`, and Supabase prescribes env var names only for Edge
Functions (`SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS`) — this repo has none, so our
legacy-shaped names holding new-style keys are fine.

**✅ CLICK-TEST 1 PASSED — clip suggestions, the first time the feature has ever run.**
`masazer za vrat` → 8 real Serbian results ("Masažer za leđa i vrat", "Vatreni Shop",
"Shiatsu Masazer … maliali.rs") → `Uzmi` → 200 in 13.5s → the card leaves the grid and the clip
appears in the list. **Three real bugs stood in a row between "written" and "works", and every one
of them was invisible to static review:**

1. **The rate limiter hung every rate-limited route** — all six: `jobs`, `upload`, `import-clip`,
   `generate-scripts`, `checkout`, `search-clips`. `createRedisConnection` sets
   `maxRetriesPerRequest: null` because **BullMQ requires it** for blocking commands; with that
   set, ioredis *queues* a command against a dead Redis instead of rejecting it. `rate-limit.ts`
   catches to fail open — but `catch` only fires on a REJECTED promise, so the fail-open path was
   unreachable **in the exact scenario it was written for**. Measured: 223011ms → 740ms. Fixed with
   a separate `createRedisCommandClient` (`enableOfflineQueue: false`, bounded retry, error
   listener) plus a 1s ceiling in the limiter. BullMQ keeps the old connection.
2. **yt-dlp was looked up inside `.next/server/bin/`.** webpack bundled `youtube-dl-exec`, moving
   the `__dirname` its binary path is built from. `serverExternalPackages` in `next.config.mjs`.
3. **User input reached `cmd.exe` unquoted — a shell-injection hole, not just a bug.**
   `youtube-dl-exec` turns on `shell: true` whenever **the binary's own path** contains whitespace
   (`src/index.js:20-31`), then quotes only the binary. **Both checkouts qualify** —
   `C:\Sa starog\…` and `D:\Projekti\2. SaaSUGC`. So `ytsearch16:masazer za vrat` searched for
   "masazer" and reported `'za' is not a valid URL`, exiting 1 → 502 even though stdout held good
   results. Any query with a space failed. Worse, `&` is a command separator to `cmd.exe` and `&`
   is ordinary inside a YouTube URL. New `lib/yt-dlp.ts` spawns the binary via `execFile` with argv
   as an array — no shell, no splitting, no metacharacters. Both routes use it.
   **This also explains why link import "passed" on 08-05: a URL has no spaces.** One accidental
   success is not coverage.

**Two documented claims corrected:**
- `ACCOUNTS.md:13` still sent the owner to open an Anthropic account. Now OpenRouter.
- **The pnpm diagnosis in the 08-09 block is inverted.** pnpm 10.0.0 on this machine prints
  *"The `pnpm` field in package.json is no longer read"* and points at `pnpm-workspace.yaml` —
  the opposite of what `7ab6b1e` concluded. Nothing is broken, because 08-09 **mirrored** the
  setting rather than moving it, so it still sits in both files and the workspace copy is the one
  in force. But the explanation would send the next session the wrong way. Not yet edited in the
  08-09 block itself — it is append-only, so this is the correction of record.

**Still open from today, in priority order:**
1. **The burned-in-UI defect is NOT fixed** — owner asked directly. 08-09 (`22e07df`) *analysed*
   it into `INFRASTRUCTURE.md:304-308`; all four sub-items are `[ ]` and no code exists. The only
   thing shipped is the wizard's warning label (`matrix/page.tsx:517`), which moves the work to the
   user. Owner's evidence: `storage/renders/matrix-ad-1785935577320.mp4` at 00:14 shows a TikTok
   reply-to-comment bubble ("Reply to Bells bells's comment / Love mine"). Note that file is dated
   **08-05**, so it predates 08-09 and could not have shown a fix either way.
2. **Image-driven clip search — DECIDED, NOT STARTED. Owner explicitly deferred it today to work
   on other features; do not start it unprompted.** Design: the wizard already scrapes the product
   page and holds `images: string[]` (`matrix/page.tsx:122`), so no upload UI is needed. Two hops —
   image → real product name (reverse image search), then name → the YouTube search that now works.
   **Owner's decisions:** provider is a **Google Lens scraper service, not Google Cloud Vision**;
   the text box **stays as an editable fallback** so a bad hop 1 doesn't strand the user.
   Recommended vendor **Apify** — one account also covers the TikTok/Instagram search still open
   from 08-09, versus SerpApi's $75/mo floor. Needs `APIFY_API_TOKEN`; owner has not created the
   account. Plan: `ImageSearchProvider` in `packages/core` behind the mock-first gate, a
   `POST /api/identify-product` route, then prefill the query.
3. Click-tests 2–4 untouched: script step, password recovery by email, caption/sound controls.

**Committed and pushed as `4683cb3`.** Deliberately left out, both machine-local:
`.claude/launch.json` (holds absolute paths to *sibling* projects on this box) and `scratchpad/`
(untracked here and on 08-09; note `scratchpad/check-env.mjs` therefore does NOT travel — rewrite
it from the description above rather than trusting the path on another machine).

---

## 2026-08-09 — new machine, new Supabase project, auth holes closed
**Account:** _(unrecorded)_ · **Machine:** NEW — first session on a second physical box
(repo freshly cloned to `D:\Projekti\2. SaaSUGC`, so nothing local was carried over).
**Commits (5):** `7ab6b1e` pnpm build-scripts fix · `6758aad` design review §8 ·
`bdddea0` emailRedirectTo · `790a3e6` password recovery flow · `8998ad2` signup confirm field.

**The Supabase blocker from PODSETNIK.md §3 is resolved — but not the way §3 predicted.**
The project was NOT deleted: it was paused and sitting under a **different Supabase account
(different email)**, org "stewankg ORG". §3 warned about multiple *organisations*; nobody
checked for a second *account*, which is why a sweep of every org came back empty. Owner
decided to abandon it (test data only, legacy keys, same free-tier pause timer) and stay on
a new project `iqfzhnndhhrprkrkfygd`. The old one is left to expire.

**New project is on the NEW API keys** (`sb_publishable_` / `sb_secret_`), not legacy
anon/service_role. Env var NAMES are unchanged (`SUPABASE_ANON_KEY` still holds what is now
a publishable key) — renaming would touch web, worker, VPS and docs, deferred. Note
`SUPABASE_ANON_KEY` is dead weight: it is declared in `packages/core/src/env.ts:34` but no
code reads it; every real consumer reads `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**VERIFIED live against the new project** (probe scripts, service key read from `.env`, never
printed): all 4 tables + `credits_ledger.external_ref` (0004) + `assets.storage_key` (0003) +
all 3 RPCs present · `sb_secret_` really resolves to `service_role` (Auth admin API 200 vs
401 for publishable — PostgREST RPC does NOT discriminate here, it 404s on the signature
before checking grants) · signup → `handle_new_user()` → `profiles.balance = 3` →
`credits_ledger` `delta=3 reason=signup_bonus`, ledger sum matches balance · **RLS proven on
a REAL row**, not an empty table: publishable key sees 0 rows in `profiles`/`credits_ledger`
while service_role sees them · password login works (`last_sign_in_at` moved) ·
`@supabase/ssr 0.5.2` handles opaque non-JWT keys fine.

**Legacy keys disabled + legacy JWT secret revoked.** Done because a service_role JWT was
leaked into the session transcript by a masking bug in a diagnostic command (the mask was
written for `sb_secret_` and the value was a legacy `eyJ…` JWT). Note for anyone doing this
again: *disabling* legacy keys only stops them working in the `apikey` header — the dialog
says so — they stay valid as JWTs until the legacy JWT secret itself is revoked. Both steps
are needed. Free with 0 users; with real users it logs everyone out.

**AUTH BUG, found live and fixed (`bdddea0`):** `signUp()` was called without
`options.emailRedirectTo`, so Supabase pointed the confirmation link at the Site URL and it
landed on `/?code=…`. Only `/auth/callback` calls `exchangeCodeForSession`, so the code
expired unused and "confirming" left the user logged out. Signature in the data: two accounts
with `email_confirmed_at` set and `last_sign_in_at` NULL. The callback route itself was
correct all along — nothing was hitting it. **Dashboard config still owner-gated:** the
redirect URLs must be allow-listed in Auth → URL Configuration or the redirect is rejected.

**Two launch-blocking auth holes closed, both surfaced by one locked-out test account:**
signup had a single password field (a typo created an unreachable account, and email
confirmation masked it by letting the user in exactly once), and there was no password
recovery route at all. Both `CODE-COMPLETE` — typecheck (5 pkgs) + web build pass, both new
routes appear in the build output, but **neither has been exercised against a real recovery
email**. Do not read them as done.

**Build fix that unblocks every future machine (`7ab6b1e`):** `onlyBuiltDependencies` lived
in `pnpm-workspace.yaml`, which pnpm@10.0.0 (pinned) does not read — settings there arrived
in a later 10.x. So it was never in effect and `pnpm install` silently skipped build scripts:
no `ffmpeg.exe`, no `yt-dlp.exe`. This is the "two-week blocker" of
`SESSION_LOG_ARCHIVE.md:200`, whose note concluded pnpm blocks the scripts "even with
onlyBuiltDependencies" — it had never actually seen the setting. Mirrored into `package.json`;
verified by the binaries landing (ffmpeg 6.1.1, yt-dlp 2026.07.04).

**VPS updated and VERIFIED.** `/opt/adgen-saas/apps/worker/.env` still pointed at the dead
project. Contrary to the worry that it held real provider keys, it holds only the two Supabase
values plus `REDIS_URL` — everything else blank, exactly as `howto.md:94` says. Rebuilt from
the local `.env` preserving `REDIS_URL` and LF endings (a trailing `\r` becomes part of the
value under Docker `--env-file`), backed up to `.env.bak-20260809-101211`, uploaded (md5
matched), worker restarted: running, 0 errors in the log, 0 restart loops.

**Password rules added** (`eed4587`, `76eaad3`): 8 chars + one capital + one symbol, one
module shared by signup and reset so they can't drift, with a live checklist. The capital
test is `/[A-ZČĆŠŽĐ]/`, not `/[A-Z]/` — a password starting with `Č` would otherwise be told
it has no capital letter. **The enforceable copy still has to be set in Supabase** (Auth →
Sign In / Providers → Email); the client-side rules are UX only.

---

### Second half — continued with the owner away

**`ScriptProvider` was ticked `[x]` and had never run once.** `factory.ts:95` gated it on
`ANTHROPIC_API_KEY`; the owner has no Anthropic account and never did, so the branch always
returned `MockScriptProvider` and **every Matrix ad script ever produced was canned text**.
The dashboard sells "AI piše skriptu i čita je glasom" — ElevenLabs really does read it
aloud (measured 08-05), but what it read was pre-written. The owner's actual LLM access is
OpenRouter.

- `3d43fa7` — **`script.openrouter.ts` replaces `script.claude.ts`.** OpenAI-compatible
  endpoint, plain fetch. Gate is now `OPENROUTER_API_KEY`, with `OPENROUTER_SCRIPT_MODEL` as
  an override so the Serbian eval can sweep models without a code change. Serbian prompt
  lifted verbatim — it was the part worth keeping, and the eval must measure that exact text.
  Requests strict `json_schema` but keeps the fence-stripping parser, because a swappable
  model may ignore `response_format`; the parser now takes both the bare array and
  `{ variants: [...] }`. Also handles OpenRouter returning **HTTP 200 with an error body**
  when an upstream provider fails. 8 new parser tests. **NOT live-tested — no key here.**
- `6b340d7` — **blind Serbian eval harness** (`scripts/eval-serbian-scripts.mts`). Drives the
  *shipped* provider, not a copied prompt. Shuffles output and writes the model mapping to a
  separate key file; `MockScriptProvider`'s canned lines go in as a control, added **once**
  (the mock ignores its input, so repeating it would print identical text and give the
  control away). Grading sheet names the two disqualifying axes: **padeži**, and
  **ekavica/ijekavica leakage** — the app sells Serbian/Bosnian/Croatian as separate
  languages, so "mlijeko" in Serbian output disqualifies regardless of other scores.
  Verified only as far as possible without a key: module graph loads, missing-key path exits
  1 with an actionable message.

**Clip suggestions — new feature, owner's design decision.** Source is **platform search**,
not stock libraries and not AI generation (owner was explicit; do not re-propose either). We
only *suggest* — the user watches a candidate before taking it.

- `7cdebf2` — **`POST /api/search-clips`**, YouTube only. That is a capability limit, not a
  preference: yt-dlp has a search extractor for YouTube (`ytsearchN:`) and **none for TikTok
  or Instagram**, which it resolves from a URL only. Those need a third-party API (EnsembleData,
  SocialCrawl, TikHub, Apify all cover the three) and stay a separate decision. Metadata only
  via `flatPlaylist` + `dumpJson` — no frame downloaded, so a dozen previews are ~free.
  Rate limit 8/60 (tighter than import's 15/60) plus a 10-min per-query cache, because
  repeated yt-dlp searches from one VPS IP are what gets an IP throttled.
  **VERIFIED against live yt-dlp output, not fixtures** — a fixture would keep passing if
  yt-dlp changed its shape: 6/6 parsed, every UI-rendered field present, 6/6 still parsed
  after two corrupted lines were spliced in.
- `61aa54f` — **wired into the Matrix wizard**, beside upload and link import. Taking a
  suggestion goes through `/api/import-clip` — a suggestion is just a link the user didn't
  type — via a shared `importClipByUrl()` so a second download path can't drift into
  existence. Grid is captioned with the reason to review: check for someone else's comments
  or a watermark first. **NOT click-tested — behind auth.**

**Search-by-image: an earlier claim in this file's TODO was wrong and is corrected**
(`bc10239`). Reverse image search *does* work for this, and the reason is specific to the
business: dropshipping listings reuse the **supplier's** stock photos across hundreds of
resellers, so the query image is already indexed all over the web. Two hops — reverse image
search identifies the exact product, then its real name drives the platform search. Do NOT
substitute a vision-model caption for hop 1: a caption yields "black massage gun", reverse
image search yields the actual listing title. Options recorded in INFRASTRUCTURE F5.

**Provider list prices captured** (`f40dc8d`), and the stale F5 benchmark status corrected —
the image-side kie-vs-fal benchmark had been done since 08-05 while the checkbox still said
`_pending_`.

---

### Third stretch — script review, per-stage billing groundwork

**`OPENROUTER_API_KEY` arrived mid-session**, so the LLM side stopped being theoretical.

- **Serbian blind eval RAN** (`scripts/eval-serbian-scripts.mts`): 3 models × 3 products × 3
  variants + control, 9/9 calls first try, well under $0.10. Sheet handed to the owner for
  grading; the key file is unopened. **Noted on delivery:** the `*ugao: …*` line leaks model
  identity through diacritics (one model writes "Problem-Resenje", another "Društveni dokaz")
  — grade the script text, not the label. That a model drops diacritics even in metadata is
  itself a finding.
- `7747f4c` — **`speakerGender` on ScriptProvider.** Every script came out feminine ("našla
  sam", "sigurna"), so a male voice read a woman's lines. Owner caught it in the eval output.
  Serbian marks gender on past tense and adjectives, English marks neither, so the model has
  no signal a choice is being made. **VERIFIED BY MEASUREMENT** against the live API: female →
  3 feminine speaker forms / 0 masculine; male → 0 feminine, masculine throughout.
  *The first run of the checker reported the male case as failing on "Sigurna". That was the
  checker's bug, not the model's — Serbian adjectives agree with the noun they modify, so
  "sigurna kupovina" is correct in a male-voiced script. Only predicative adjectives track the
  speaker. Worth remembering before anyone writes another gender check.*
- `83e9791` — **`POST /api/generate-scripts`.** Speaker gender is resolved server-side from the
  voice id, not trusted from the client — the wizard had already dropped that exact field once
  (fetched `gender` from `/api/voices`, discarded it while mapping). Unknown gender yields no
  instruction rather than a guess.
- `16893e6` — **worker prefers `params.scripts`.** Validation is its own tested module because
  the input is untrusted. The 2000-char cap is a cost control: ElevenLabs bills per character,
  so an unbounded `script` field is a route from a crafted request to a large TTS bill, ×15.
- `8abf242` — **script review step in the wizard.** Owner's design: generate ONE at a time,
  append, older ones collapse but stay available (a rejected script is often the best starting
  point for an edit). 5 free, 10 max. **Also removed the hardcoded step indices** —
  `stepIndex === 4 && …` silently attaches the wrong rule to the wrong step when a step is
  inserted, and compiles and builds either way. Gating is on step **id** now.
- `c0c2f47` — **migration 0005, NOT APPLIED.** `charge_credits` cannot safely bill one job
  twice: its rollback deletes by `user_id + job_id + reason` instead of by the row it inserted,
  so a failed later charge refunds an earlier one the user already received. Fix deletes by id
  and adds `p_reason`. Drops the old 3-arg signature explicitly — a defaulted parameter creates
  an *overload*, and leaving both makes every existing call ambiguous.

**Product decisions locked this session — do not re-litigate:**
- Suggested clips come from **platform search**, not stock libraries and not AI generation.
- **The competitor's Matrix is NOT a montage editor** — the F4 note claiming so was wrong and
  is corrected. It takes one clip, strips the audio, and returns N copies with new audio and
  captions. Our montage engine is not parity; it is something they don't have. Their simpler
  flow is a **separate tool inside AdGen** (owner confirmed), not a mode of Matrix.
- Credit prices are **all placeholders**. Pricing gets decided after the build, so nothing
  should treat a number in `pricing.ts` as settled.

**A mistake worth not repeating:** an import was added to `apps/worker/src/index.ts` through
PowerShell. PowerShell 5.1 reads BOM-less UTF-8 as ANSI, so the rewrite double-encoded every
non-ASCII character — 432 changed lines for a one-line import. Caught by `git diff --numstat`,
restored, redone with the editor. **Never rewrite a source file through `Get-Content`/
`Set-Content` in this repo.**

**Closing stretch — migrations applied, ninth tool, password rules corrected:**

- **Migrations 0005 and 0006 APPLIED by the owner and VERIFIED against the live database**, not
  taken on trust: `job_type` now carries `revoice`, and `charge_credits` reports parameters
  `p_amount, p_job_id, p_reason, p_user_id` — four, with the reason. Read out of PostgREST's
  OpenAPI spec rather than by calling the function, which would have deducted credits. A
  control check (`add_credits_idempotent`, from 0004, visible the same way) confirms the method
  works — without it the first result would prove nothing.
- `fa56cfa` — **ninth tool, `revoice` ("Preozvuči")**: one clip, N copies with new voice and
  captions. Implemented as `runMatrixPipeline(params, { montage: false })` — skipping scene
  detection is the entire difference, because the single-shot fallback already present for the
  empty-pool case plays the clip whole. A separate function would have duplicated the
  TTS/caption/render chain and drifted. Card renders as **USKORO** on purpose: `revoice` is
  deliberately absent from `LIVE_TOOL_LINKS` until its wizard page exists, so it cannot 404.
  **Trap found doing this:** the job-type list lives in THREE places nothing keeps in step —
  `packages/core/src/types.ts`, the generated `database.types.ts`, and the SQL enum.
- `12d27d4` — **billing bug I introduced with the script step.** Cost is computed from `count`,
  but the worker loops over the scripts it is given. Pick 5 variants, keep 3 scripts → 3 videos,
  billed for 5. The job now sends the kept-script count, and the step states the resulting video
  count in words.
- `6b3c137` — **password rules were looser than Supabase in four ways.** Owner set the policy to
  "Lowercase, uppercase letters, digits and symbols", which maps to GoTrue's
  `GOTRUE_PASSWORD_REQUIRED_CHARACTERS` — a list of **literal ASCII sets**, not character
  classes. Every check here was broader: `[A-ZČĆŠŽĐ]` counted `Č`, `\p{N}` counted any Unicode
  digit, and `[^\p{L}\p{N}]` counted a **space** as a symbol. So `Testovi!` and `Test tes1`
  went all-green here and would have failed on submit. Sets are now transcribed verbatim, as
  strings rather than regexes so they can be eyeballed against the dashboard.
  **This inverts an earlier decision on purpose:** the script-gender check deliberately includes
  `Č` because *we* define that rule; here *Supabase* defines it, so including `Č` is wrong.
  Same instinct, opposite answer — the difference is who holds the authority.

**Left open / owner-gated:**
1. **Grade the Serbian eval sheet** (`tests/serbian-script-eval/2026-08-09-11-30-blind.md`),
   open the key file only afterwards, then set `OPENROUTER_SCRIPT_MODEL` to the winner and
   record the verdict the way `tests/kie-vs-fal.md` records its own.
2. **Click-test — the one that gates everything.** Nothing added on 08-09 has been clicked, and
   a passing build says nothing about any of it. In order of value:
   1. **Clip suggestion grid** (`/app/matrix`, step 1) — the only piece that works with no API
      key at all, so it proves the chain fastest. Thumbnails load from YouTube's servers;
      "Uzmi" downloads through `/api/import-clip` and should remove the card.
   2. **Script step** (`/app/matrix`, step 4) — generate, then generate again and check the
      first collapses; click a collapsed header; **press "Ukloni" on the expanded one** (the
      focus arithmetic there is the most fragile thing written today); check the button changes
      at 5 and disables at 10; check the blue box names the right video count.
   3. **Password recovery** end-to-end by email — written, never once run.
   4. Caption/sound controls, outstanding since 08-05.
3. Wizard page for `revoice`, then add it to `LIVE_TOOL_LINKS` so the card stops saying USKORO.
4. Decide Google Cloud Vision `WEB_DETECTION` vs a Google Lens scraper API for the
   reverse-image hop — owner's call after testing both on five real products.
5. R2 public-bucket vs presigned — still the launch blocker from F5, untouched.
6. Brand naming: "Matrix" is the competitor's product name **and** inaccurate for what we
   built, now that the montage engine is confirmed to be ours alone.
7. TikTok/Instagram search — separate decision once YouTube v1 is proven.

**Gotcha for the next machine:** `pnpm` is not on PATH here and `corepack enable` fails with
EPERM (it writes to `C:\Program Files\nodejs`). `corepack pnpm <args>` works without any
install and needs no admin — use that.

---

## 2026-08-05 — RUNTIME VERIFICATION DAY: Matrix montage actually renders now
**Account:** _(unrecorded)_
**Commits this session (15):** `cb8f7a2` storage route + gitignore + dev bypass ·
`fcd383f` import-clip format fix · `6c56f81` worker export/guard · `00fffa0` log ·
`304e44a` captions off the bottom edge · `ba59d39` caption TODO · `9e86315` retire
handover.md + split session log · `efa07d5` infra §4 pointer · `b1784a9` log ·
`eae4b4c` **audio muxing** · `60182c2` log · `18a004a` caption position props ·
`8cc7a94` **voice-id regression fix** + caption controls · `0cc8e2b` log ·
`e04f865` **sound panel + sfx fix** · `5c805fe` log.

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

**Sound panel (`e04f865`) — and the "blocker" that wasn't.** This sat as "blocked on a
music/SFX asset source" for weeks. It wasn't: `musicUrl` already reached the composition,
and users can upload their own track through the same `/api/upload` the clip uploader
uses. Licensed library not required. Worth remembering — re-read old blockers before
accepting them, the constraint may have dissolved. Testing it surfaced a bug that had
been latent since F4: the CTA sound effect **had never played once**, because its
`<Audio>` was inside `OutroCard` with no enclosing `<Sequence>` and Remotion therefore
timed it from frame 0. Nobody noticed because the prop was never set. **Third silent-audio
failure of the day** — Remotion drops audio it cannot place or fetch without any error, so
audio work here must always end in `volumedetect`, never in "the stream exists".

**Caption editor + a regression I caused and caught (`18a004a`, `8cc7a94`).** Captions are
now user-positionable (captionX/captionY as frame fractions, clamped; size slider; three
safe-zone presets; a warning below 72% height). While wiring it I found that the audio
commit had **broken every Matrix job launched from the UI**: the wizard shipped a hardcoded
copy of the MOCK voice list, and once TTS became real, ElevenLabs answers
`404 voice_not_found` for `voice_srp_f1` — confirmed against the live API. It had been
invisible because Matrix previously forced the mock provider. Fixed at both ends so neither
alone can break it again: a new `GET /api/voices` serving the ACTIVE provider's catalogue,
and the worker resolving an unknown id to the provider's first voice with a warning.
**Generalisable:** when a provider goes from mock to real, grep for anything that hardcoded
the mock's data — ids, urls, shapes. The type system will not catch it; both are strings.

**Also this session:** karaoke captions were bottom-anchored at ~88% frame height, inside
TikTok/Reels' own UI band — moved to ~46% (`304e44a`) and a caption-editor TODO added to
F4 (position props + sliders; font/anim/colour already exist, `captionScale` needs only UI).

---

## 🔴 BLOCKER — the Supabase project is GONE (found 2026-08-08)

`gczikdrskcpqqlyzvnby.supabase.co` **does not resolve**. Confirmed against three
independent public resolvers (Google 8.8.8.8, Cloudflare 1.1.1.1, Quad9 9.9.9.9) — all
NXDOMAIN — while the sibling aikutak project (`wfpsbmwhdzzfgwudzkfq`) resolves through the
same resolver. Not DNS cache, not the router, not local. The owner confirmed it is not
listed in their Supabase dashboard either. `.env` is self-consistent (URL, anon and
service keys all carry `ref=gczikdrskcpqqlyzvnby`, valid to 2036), so the keys were issued
for a project that really existed — migration 0004 was applied to it on 2026-07-23.

**Consequence:** no auth, no `jobs`/`profiles`/`credits_ledger`. Nobody can log in, and the
worker cannot read or write a job. The UI path is dead until it is rebuilt.

**What is NOT affected:** everything verified on 2026-08-05 deliberately bypassed Supabase
— the montage/audio/caption work was driven straight through `runMatrixPipeline`, the
storage route returns before its auth check outside production, and kie/fal/ElevenLabs are
external. Those verifications stand.

> ⚠️ One earlier claim was weaker than stated: `/api/voices` returning 401 was reported as
> "the route is wired correctly". That 401 is equally consistent with Supabase being
> unreachable. The `/api/storage` 401 diagnosis still holds regardless — a headless worker
> has no session cookie either way — but the evidence did not distinguish the two causes.

**Recovery (owner steps — everything needed is in the repo):**
1. Create a new Supabase project. *(Claude cannot create accounts or projects.)*
2. Run `supabase/migrations/0001` → `0004` **in order** in the SQL Editor. Repo convention:
   AI never executes SQL migrations.
3. Hand over the new Project URL + anon key + service_role key → `.env` gets updated,
   then `pnpm db:seed` recreates the dev user.

No storage bucket is needed (dev uses local disk; R2 is F5 and unwired).

---

## ▶ PICK UP HERE TOMORROW

**Where Matrix stands:** montage renders, voiceover is muxed, captions follow real
speech, position/size are user-controllable, music + CTA SFX work. All measured, not
assumed. `pnpm -r typecheck` (5/5), `pnpm -r test` (25), `pnpm --filter @adgen/web build`
were green at `5c805fe`.

**THE one gap in everything shipped today:** none of the new **wizard UI** was clicked in
a browser — the caption sliders/presets and the music/SFX pickers. `/app/matrix` is behind
auth and Claude does not enter passwords. The render side they drive IS verified; the
controls feeding it are not. **This is the first thing to do tomorrow**, and it needs the
owner (or a session where the owner logs in first).

**Ready to pick up with no owner input** (in the order I'd take them):
1. Wizard visual polish — INFRASTRUCTURE.md §8 has the brief; wizards are "plain/functional".
2. Copy pass on job-type labels/descriptions (§8, wants a "kako korisnik priča" voice).
3. F7 `ai_video` skeleton — `generateVideo` already exists in `KieAIFalRouter` but has no
   caller and has never been live-tested.

**Owner-gated, unchanged:**
- **Redis** — NOT needed for production (prod Redis already runs on the VPS,
  LIVE-VERIFIED 2026-07-18). Only buys the `/api/jobs → queue → worker` hop through the
  UI. Do NOT SSH-tunnel to the VPS Redis: the prod worker consumes the same `adgen-jobs`
  queue and would eat test jobs.
- **F5 decision: public R2 bucket vs presigned urls** — `storage.r2.ts` `getUrl` returns a
  plain public url, reintroducing the guessable-key exposure `/api/storage`'s auth exists
  to prevent. Presigned is the real answer. Blocks F6 launch.
- kie/fal **cost per call** (neither API returns a price — read the dashboards), F6 billing
  + Vercel deploy, legal pages, brand naming (`matrix` is the competitor's product name).

### Environment recipes (save yourself the rediscovery)
- **A render needs `pnpm --filter @adgen/web dev` running.** MockStorage urls are served by
  `/api/storage`, and both the worker's fetch and Remotion's headless Chrome go through it.
- **Drive the pipeline without Redis** by importing the real `runMatrixPipeline`:
  `node node_modules/.pnpm/tsx@*/node_modules/tsx/dist/cli.mjs --env-file=../../.env <script>.mts`
  from `apps/worker`. It is exported and `main()` is guarded, so importing does not start
  a queue consumer.
- **Prefix that with `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*"`** if any argument looks
  like a POSIX path — Git Bash rewrites `/api/storage/...` into `C:/Program Files/Git/api/...`
  and the failure looks like an app bug.
- **Binaries:** `node_modules/.pnpm/ffmpeg-static@5.3.0/node_modules/ffmpeg-static/ffmpeg.exe`,
  ffprobe under `ffprobe-static@3.1.0/.../bin/win32/x64/`, yt-dlp under
  `youtube-dl-exec@3.1.9_debug@4.4.3/.../bin/yt-dlp.exe` (fetched today).
- **Checking audio:** `ffmpeg -sseof -2 -i <mp4> -af volumedetect -vn -f null NUL`. Reading
  the TAIL is what separates music/SFX from the voiceover. −91.0 dB means digital silence.
- **`.claude/launch.json` is intentionally left uncommitted** — the owner added dev-server
  entries for two OTHER projects (Market-reseller, BlaBlaCalendar). Their absolute paths
  don't belong in this repo. Don't commit it, don't revert it.

---

_Older blocks (2026-07-23 and earlier) live in `SESSION_LOG_ARCHIVE.md`._
_Rotated 2026-08-10 under the "past ~4 blocks" rule in `CLAUDE.md`. The Review
ledger above deliberately stays here — it is what `grep "^REVIEWED:"` has to find._

