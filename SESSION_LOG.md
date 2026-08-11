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

REVIEWED: post-redesign bug hunt + worker mock guard (apps/web/src/app/globals.css + apps/web/tailwind.config.ts + apps/web/src/components/{app-shell,tool-cards}.tsx + ~18 web files for focus/ARIA + apps/worker/src/index.ts + packages/core/src/{index.ts,providers/factory.ts} + NEW packages/core/src/pricing.{cost,integrity,grammar}.test.ts) — CLEAN @ 26b1f96, 77594e9 (2026-08-11). Three UI defects found by MEASURING every text node against its composited background per page per theme, not by looking: `--txt-low` failed contrast in obsidian (3.24:1) and poluton (3.16:1) while carrying job dates, costs and step labels; the `opacity-80` added during the P7 warn/err migration pulled those sub-lines back to 3.53:1; and /app/matrix overflowed to 544px inside a 375px viewport in all three themes (flex `min-width:auto` + a nowrap `truncate` label whose min-content is the full string). ✅ RUNTIME-VERIFIED: the sweep now returns EMPTY for /, /app, /app/matrix, /app/reklame in all three themes at 1280px AND 375px; only disabled buttons remain flagged, which WCAG 1.4.3 exempts. Keyboard focus added across ~18 files (subagent, diff checked for text-node changes — none). Worker: `mockProviderSlots()` + a production refusal, ✅ VERIFIED by running the worker three ways (production+mocks → exit 1 naming all six slots; +ALLOW_MOCK_PROVIDERS=1 → warns and listens; dev → warns and listens). **That verification found a live crash**: `mediaEdit` is null without FAL_API_KEY and the startup log read `.name` off it, so since 123d0de a fresh clone could not boot the worker at all. Money-path tests 67 → 105. Gates green (dev server must be STOPPED for the web build — it shares `.next`).
REVIEWED: three-theme redesign, Prompt 7 closing sweep (apps/web/src/app/globals.css + apps/web/tailwind.config.ts + apps/web/src/app/(legal)/{layout,uslovi,privatnost,impressum} + 20 files whose `text-ok|warn|err` call sites moved to the `-text` variants) — CLEAN @ feb7dab (2026-08-11), **with two defects found and fixed, not waved through**. (a) The whole `(legal)` group was still hardcoded light-on-dark and rendered white-on-near-white in poluton; 63 className attributes migrated, diff verified className-only (63 insertions / 63 deletions, every changed line contains `className`, so the frozen legal TEXT is provably untouched). (b) **`--warn` as TEXT measured 1.65:1 on poluton's ground** — unreadable, and it was carrying the legal disclaimer notices. Fixed at the token layer with `--ok-text`/`--warn-text`/`--err-text` (each hue pulled 55% toward the per-theme `--txt-hi`), so borders and fills keep the canonical hues while text stays legible; measured after on /uslovi in all three themes: warn 13.80 / 5.56 / 14.21, err 10.17 / 8.41 / 10.45, ok 12.41 / 6.44 / 12.82. Gates green: `pnpm -r typecheck` (5 projects), `pnpm -r test` (67), `pnpm --filter @adgen/web build`. ✅ RUNTIME-VERIFIED, full matrix this time: `/`, `/app`, `/app/matrix`, `/app/reklame` × 3 themes, plus `/login` and `/signup` × 3 themes, plus `/uslovi`, `/privatnost`, `/impressum` × 3 themes — 21 page-loads, each a real navigation. **This supersedes the "auth pages are CODE-COMPLETE" caveat in the verdict below**: they were rendered for real. Still probe-based, not screenshots — see the block below. `#FFE000` deliberately NOT migrated; all 7 callers listed there.
REVIEWED: three-theme redesign, Prompts 1–6 (apps/web/src/app/globals.css + apps/web/tailwind.config.ts + NEW src/lib/theme.ts + NEW src/components/theme-switcher.tsx + src/app/layout.tsx + src/app/page.tsx + src/app/(auth)/**/page.tsx + src/app/app/{page,matrix,edit,mix,translate,enhance,remove-text,ai-slike,quick-test,reklame}/page.tsx + src/components/{app-shell,tool-cards,tool-icon,job-wizard,password-rules}.tsx + DELETED src/lib/tool-theme.ts) — CLEAN @ b903276 (2026-08-10). Prompts 1–3 written directly by Claude Code; 4, 5 and 6 delegated to subagents and every diff read line by line before committing. Gates green at each of the six commits: `pnpm -r typecheck` (5 projects), `pnpm -r test` (67 tests), `pnpm --filter @adgen/web build`. ✅ RUNTIME-VERIFIED through the browser with a REAL PAGE LOAD PER THEME (cookie + reload, never a live `data-theme` flip — see the gotcha in the block below): `/` and `/app/quick-test` in all three themes, `/app` obsidian+poluton at desktop and neon at 375px, `/app/matrix` obsidian+poluton, `/app/reklame` neon. Verification was by computed-style and DOM probes, NOT by screenshot — the Browser pane never displayed, so no human eye has seen these screens. **Auth pages are CODE-COMPLETE, not runtime-verified** (reaching them needs a logged-out session; SSR markup checked instead). **Prompt 7 is NOT done** — see the open items in the block below.
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

## 2026-08-11 (seventh session) — the project gets a release plan, and the worker stops being able to lie
**Account:** _(unrecorded)_ · **Machine:** primary. **Commits:** `26b1f96` UI bug fixes ·
`676bbcc` RELEASE_PLAN.md · `77594e9` worker mock guard + crash fix + money-path tests · this
block. **Deliberately left uncommitted: nothing.**

**The project now has a release plan, `RELEASE_PLAN.md`.** It never had one. `INFRASTRUCTURE.md`
tracks BUILD phases F0–F7; nothing tracked the path to a paying customer, so "what is left" has
been a feeling. The plan is built from an evidence pass over the code rather than from what the
docs claim, and its headline finding is that **the product loop already works** — the missing
things are hosting, durable storage, a way to take money, and a legal surface. Five milestones
L1–L5 ordered by dependency, each row marked owner-gated or code. A visual version was
published as an artifact for at-a-glance use; the markdown file is the source of truth.

**A worker on mocks can no longer serve production.** `mockProviderSlots()` in core reports
which slots resolved to a mock; the worker refuses to boot in production if any did, with
`ALLOW_MOCK_PROVIDERS=1` as the deliberate staging escape hatch. This closes the 2026-08-10
incident *in code* rather than in a doc — a worker that is DOWN leaves the job queued, a mocked
one marks it done, charges the credits and returns a script nobody wrote.

**Verifying that guard found a live crash, which is the better find.** The startup log did
`Object.entries(providers).map(([k, v]) => [k, v.name])`, and `mediaEdit` is the one slot that
can be `null` — it has no mock counterpart, so an absent `FAL_API_KEY` leaves it unset. The
worker died with `Cannot read properties of null (reading 'name')` before reaching anything
else. That is the DEFAULT mock-first configuration: **since 123d0de a fresh clone could not
start the worker at all.** Nothing caught it because nobody had run the worker without a fal
key since the slot was added.

**Three UI defects, all found by measuring rather than looking.** With the Browser pane still
refusing to composite a frame, the method was to walk every text node in an iframe and compare
its computed colour against its properly composited background, per page, per theme, at two
viewport widths. It found: `--txt-low` failing contrast in two of three themes (3.24:1 and
3.16:1) while carrying every job date and cost on `/app/reklame`; the `opacity-80` that
yesterday's warn/err migration introduced dragging those sub-lines back under the bar; and
`/app/matrix` scrolling sideways on a phone — 544px of content in a 375px viewport, in every
theme. The last one is the classic flex trap twice over: a flex item's `min-width` defaults to
`min-content`, and a `truncate`d label is `nowrap` so its min-content is the whole untruncated
string. `min-w-0` in two places fixed it.

**Two traps in the measuring instrument itself, worth not repeating.** The first contrast
helper composited translucent layers with an `over()` that forced alpha to 1, so stacked
obsidian panels produced confident nonsense (a badge reported at 2.23:1 that is actually fine).
The second, from yesterday, is that Chrome returns `color-mix()` results as
`color(srgb 0.94 …)` floats. **Both times the tool was wrong before the code was.** Re-derive a
suspicious measurement before changing anything on the strength of it.

**Money-path tests: 67 → 105.** It had zero. The new tests assert exact costs for all ten job
types, the matrix `count` multiplier at its boundaries, credit-pack and descriptor integrity,
and the Serbian 1/11/21 grammar at the numbers that break. One documents a real asymmetry:
`computeJobCost` does NOT cap at `MAX_JOB_COUNT` — that ceiling exists only in `/api/jobs`.

**The seam that blocked more testing, recorded not fixed:** `matrixRenderer` is a hardcoded
module-level `new LocalRemotionRenderer(providers.storage)` (`apps/worker/src/index.ts:43`)
instead of coming from `createProviders()` like every other provider, so `runMatrixPipeline`
cannot be driven in a unit test without a real Chromium and ffmpeg. `MockRenderer` already
exists and is unused for matrix. That is a design change, not a test.

**Operational note that has now cost three separate debugging detours:** `next build` and
`next dev` share `apps/web/.next`. Running the build gate with the dev server up 404s
`main-app.js`, kills hydration, and serves pages with NO stylesheet — which made an audit
report every element as unstyled black-on-black. **Stop the dev server before the build gate,
every time.**

**Still open:** nobody has LOOKED at the redesign. Every visual claim across three sessions
rests on DOM and computed-style probes. Also open: the `alt=""` on generated result images —
those are the artefact the customer paid for, and a screen reader is told they are decorative;
fixing it needs Serbian copy, which is the owner's call.

---

## 2026-08-11 (sixth session) — the sweep that found the redesign's one real bug
**Account:** _(unrecorded)_ · **Machine:** primary. **Commits:** `feb7dab` Prompt 7 sweep +
fixes · this block. **Deliberately left uncommitted: nothing.**

**The redesign is now complete: all seven prompts of `design/redesign-prompts.md` have run.**
Prompt 7 was the closing sweep, and it earned its place — it found a bug the previous six
stages had shipped clean past.

**The bug: `--warn` as TEXT measures 1.65:1 on poluton's ground.** The brief said the
semantic ok/warn/err hues stay identical across all three themes, and they were faithfully
identical — but those hues were chosen against a DARK ground. `#F5B83D` on poluton's
`#F6F6F9` is not a style preference, it is text nobody can read, and it was carrying the
legal disclaimer notices on `/uslovi`, `/privatnost` and `/impressum`. The two earlier
stages that introduced `text-warn`/`text-err` both "passed" because everything was checked
in obsidian first and the light theme was only ever checked on chrome, never on a state
colour.

**The fix stays inside the architecture rather than working around it.** `--ok`/`--warn`/
`--err` keep the canonical hues and remain what borders and 10% fills use, in every theme.
What was missing was a text variant, so `--ok-text`/`--warn-text`/`--err-text` pull each hue
55% toward `--txt-hi`. Because `--txt-hi` is already per-theme, that single declaration
lightens the hue on a dark ground and darkens it on a light one — no conditional, no second
palette. Measured after, on `/uslovi`, all three themes: warn 13.80 / 5.56 / 14.21, err
10.17 / 8.41 / 10.45, ok 12.41 / 6.44 / 12.82. Every `text-ok|warn|err` call site across 20
files moved to the variant; `border-warn/40` and `bg-warn/10` were left alone on purpose.

**The `(legal)` group is migrated** — the open decision left hanging yesterday. It was still
hardcoded light-on-dark (`text-white`, `border-white/10`, `bg-white/5`, amber, red) and
rendered white-on-near-white in poluton. 63 className attributes changed. The legal TEXT is
frozen and that is now provable, not merely asserted: the diff is 63 insertions and 63
deletions and **every changed line contains `className`**, checked with
`git diff -U0 | grep -v className` returning empty. Worth reusing that check any time this
group is touched.

**Two verification techniques worth keeping, both invented because screenshots still do not
work** (the Browser pane has never composited a frame across two sessions — `screenshot`
fails with *"the Browser pane is not displayed"*):
1. **Same-origin iframes turn a 21-page verification into three tool calls.** Set the
   `adgen-theme` cookie, then load each page into a hidden iframe and read
   `contentWindow.getComputedStyle` inside it. Real navigations, real SSR, real cascade —
   and it sidesteps the stale-recalc trap from yesterday's block, because every page is a
   fresh document rather than a live attribute flip.
2. **The auth pages CAN be verified without destroying the session.** They were logged as
   CODE-COMPLETE yesterday because `/login` redirects an authenticated user to `/app`.
   The Supabase cookie is not HttpOnly, so it can be read out of `document.cookie`, deleted,
   the logged-out pages rendered, and the cookie written back byte-for-byte — all inside one
   JS call so there is no window where the session is half-gone. Restoration was confirmed
   by `fetch('/app')` returning 200 afterwards. `/login` and `/signup` are now VERIFIED in
   all three themes, which **supersedes the CODE-COMPLETE claim in commit `b903276`'s
   message**.

**A caution about the measuring instrument itself.** The first contrast helper parsed colours
with `/[\d.]+/g` and assumed 0–255. Modern Chrome returns `color-mix()` results as
`color(srgb 0.94 0.83 0.62)` — floats in 0–1 — so the helper silently reported 1.05:1 and
19.4:1 for the same colour depending on which notation came back. Both numbers were garbage.
Any future contrast check has to handle `color(srgb …)` explicitly; the corrected helper
agreed with hand-computed values to within 0.1.

**`#FFE000` is deliberately NOT migrated, and here is the full caller list** (the brief asked
for the list rather than a blind migration). Every one is render DATA, not web styling:
`apps/web/src/app/app/edit/page.tsx:34` and `apps/web/src/app/app/matrix/page.tsx:248` (the
default `captionColor` sent as job params), `packages/core/src/constants.ts:30`
(`DEFAULT_MATRIX_CAPTION_STYLE`), `packages/core/src/providers/mocks.ts:23` (mock placeholder
URL), `packages/core/src/types.ts:155` (doc-comment example), and
`remotion/src/compositions/MatrixAd.tsx:36` (caption colour fallback) and `:162` (the CTA
card gradient). Changing any of them changes what the finished VIDEO looks like. If the brand
yellow is ever retired, that is a render-side decision with its own before/after check, not a
CSS sweep.

**Still open, and unchanged from yesterday:** nobody has LOOKED at any of this. Every claim
in both blocks rests on DOM and computed-style probes. The first thing worth doing with a
working Browser pane is a plain visual pass over all three themes — a probe cannot see
spacing that collapsed, text that wrapped badly, or a layout that is merely ugly. Also still
open: the brief asked for "one variable grotesk" and the app uses a system stack
(`Segoe UI Variable Text/Display` first) because `next/font/google` would put a build-time
network fetch on the critical path. That deserves a deliberate yes or no.

---

## 2026-08-10 (fifth session) — the redesign lands: three themes, one CSS block each, six of seven prompts done
**Account:** _(unrecorded)_ · **Machine:** primary. **Commits, one per prompt, all pushed:**
`69ec18c` P1 tokens · `46f9a3e` P2 theme switcher · `f9ead0d` P3 primitives ·
`6892c8a` P4 dashboard · `c276021` P5 wizards · `b903276` P6 landing+auth · this block.
**Deliberately left uncommitted: nothing.**

**What this was.** `design/redesign-prompts.md` staged the whole redesign as seven prompts.
Six ran, in order, each gated and committed before the next started. **Prompt 7 (the closing
sweep + verdict) did NOT run** — the owner called a stop for the day. Picking it up is the
first thing tomorrow; the findings are already collected below so it starts from evidence,
not from a fresh grep.

**The owner's three open questions are answered and recorded in
`design/redesign-prompts.md`:** sidebar stays always-visible on desktop / overlay on mobile;
a new visitor follows the OS (`prefers-color-scheme: light` → poluton) until they pick, and
an explicit pick then wins forever; the hero phone-frame is a neutral CSS placeholder with a
mono `1080×1920` caption and no fake screenshot.

**The one architectural claim, and it held.** No component branches on the theme. A theme is
one `[data-theme="…"]` block in `globals.css` and nothing else. Two conventions carry it:
- `--x-c` holds bare RGB channels so Tailwind's opacity modifiers still work on token
  colours (`bg-accent/10`), while `--x` is the ready colour derived from it.
- `--action-grad` and `--text-grad` are ALWAYS `background-image` values, even in the themes
  whose "gradient" is a single flat colour. That is the whole trick behind poluton having a
  black primary button and obsidian a violet→cyan one from identical markup, and behind the
  hero's "prodaju" being a gradient in one theme and flat accent in the others.

**Three gotchas worth not rediscovering:**
1. **Custom properties inherit ALREADY-SUBSTITUTED.** A derived token declared only on
   `:root` hands a nested element `<html>`'s colour even when that element carries its own
   `data-theme`. The derived block is therefore `:root, [data-theme]` (`globals.css`
   ~line 163). Without it the theme-switcher swatches all painted in the active theme
   instead of the one they advertise — which is exactly how the bug was found.
2. **Never verify a theme by flipping `data-theme` live and reading computed styles.** In a
   Browser pane that is not compositing, `background-color` updates but `color`,
   `border-color` and `box-shadow` stay frozen at the previous theme's values. Two probes
   were wasted chasing a "bug" that did not exist. Verify by setting the `adgen-theme`
   cookie and RELOADING; that is also what a real user does.
3. **`next build` and `next dev` share `.next`.** Running the build gate while the dev server
   is up 404s `main-app.js` and silently kills hydration — the theme switcher looked dead
   for several minutes for exactly this reason. Gate first, restart the dev server after.

**Verification level, stated plainly.** Everything below was RUN, not just compiled — but
run through DOM and computed-style probes, because the Browser pane never displayed and
`computer{action:"screenshot"}` failed all session with *"the Browser pane is not displayed,
so the page is not compositing frames"*. **No human eye has seen any of these screens.**
Runtime-checked with a real load per theme: `/` and `/app/quick-test` in all three; `/app`
obsidian+poluton desktop and neon at 375px (sidebar at −256px, hamburger shown, no
horizontal overflow); `/app/matrix` obsidian+poluton; `/app/reklame` neon.
`--txt-mid` on `--ground` measures 8.14:1 obsidian, 8.09:1 poluton, 7.84:1 neon.
**CODE-COMPLETE, never rendered:** the four `(auth)` pages — reaching them needs a logged-OUT
session and signing the owner out was not on the table. Their SSR markup was checked instead
(`.panel`, `.input`, `.btn-primary`, both ambient layers, `data-theme` on `<html>`).

**A real cost of Prompt 2, do not discover this in production:** reading the theme cookie in
the root layout makes EVERY route dynamic. `/`, `/login`, `/signup` and the three legal pages
were prerendered (`○`) before and are server-rendered (`ƒ`) now. The prompt explicitly ruled
out the blocking-inline-script alternative, and middleware already ran on all of them, so
this was the intended trade — but it is a trade.

**Prompt 7's findings are already gathered.** The sweep greps ran; the fixes did not. What is
left, and nothing else:
- **The whole `(legal)` route group is un-migrated** — `layout.tsx`, `uslovi`, `privatnost`,
  `impressum` still carry `zinc-*`, `brand-*`, `text-white`, `border-white/10`, `bg-white/5`,
  `amber-*`, `red-*`. `zinc`/`brand` are aliased to tokens so they read correctly in all
  three themes; **`text-white`, the `white/N` borders and the amber/red notices do NOT** and
  will look wrong in poluton. Prompt 6 scoped this group out because the legal TEXT is
  frozen — but classNames are not text, and this needs an explicit decision.
- **`#FFE000` (the old brand yellow) survives in exactly two places**, and both are DATA, not
  styling: `app/app/edit/page.tsx:34` and `app/app/matrix/page.tsx:248`, the default
  `captionColor` sent to the renderer. Per the prompt these are LISTED, not force-migrated —
  changing them changes what the rendered video looks like, which is behaviour.
- **Two hexes in `app/layout.tsx:24-25`** are the `themeColor` meta values. A `<meta>` tag
  cannot take a `var()`, so these stay literal by necessity; they track the two grounds a
  first-time visitor can land on.
- Everything else is clean: zero raw hex in TSX outside those, zero `toolGradientClass` /
  `tool-theme` references, zero per-tool gradient nodes in the rendered DOM, zero theme
  conditionals in TSX (`layout.tsx`'s `data-theme={theme}` is the SSR attribute, not a
  branch), and the three hardcoded Serbian credit words are gone — topbar, credit packs and
  matrix's `EXTRA_SCRIPTS_COST` all route through `creditsWord()`/`creditsLabel()` now.

**Also open, smaller:** the brief asked for "one variable grotesk" and the app instead uses a
system grotesk stack (`Segoe UI Variable Text/Display` first). No webfont was added because
`next/font/google` would put a build-time network fetch on the critical path. Worth a
deliberate yes/no rather than leaving it as an accident.

**Delegation note.** Prompts 4, 5 and 6 ran as subagents in parallel on disjoint file sets,
which is why this fits in one session at all. `globals.css` was the one shared file: two
agents appended to it, and the additions were split back apart by hand so each stage's CSS
landed in its own commit rather than being smeared across two.

---

## 2026-08-10 (fourth session) — the first video made from the wizard, and the bug that was charging for Big Buck Bunny
**Account:** _(unrecorded)_ · **Machine:** primary. **Commits:** `d8dfb49` Lemon Squeezy
removal · `e276301` TODO.md · `f38e89f`, `bd04dca`, `0a22208` click-test findings ·
`edd4e59` fal catalogue · `71692b3` new tools · `90fe378` aspect ratio + billing guard ·
`6a46e62` media-edit provider + decisions · this block.

**✅ A REAL AD WAS PRODUCED FROM THE WIZARD, first time ever.** Clip search → yt-dlp import →
OpenRouter script → ElevenLabs voice → scene-detect montage → Remotion render → charge →
history, in one click-through. Verified as a *file*, not from the UI's word:
`matrix-ad-1786378804132.mp4`, 10.7 MB, `ftyp isom`, **h264 + aac** (so not a silent render),
18.67s, and a frame at 6s shows the word-synced Serbian caption matching the generated script.
The voice file name carries the voice id chosen in the wizard (`IKne3meq5aSn9XLyUdCD`, Charlie),
which is what proves the ElevenLabs call was real. Balance 723 → 708.

**Redis, which had blocked this for two sessions, was never the hard part.** SSH tunnel to the
VPS Redis (`howto.md` §5), `REDIS_URL` written into all three `.env` files, worker run locally
with the real keys. **The VPS worker had to be stopped**: it was running on all mocks
(`script: mock-script`, `voice: mock-voice`) and listening to the same queue, so it would have
stolen jobs and answered them with canned text that looks like success. Restart it with
`ssh root@46.225.214.52 "docker start adgen-worker-prod"`. That the production worker has no
real keys is itself a live defect, now in `TODO.md` §1.

**🔴 THE WORST FIND: four tools were taking money for Big Buck Bunny.** Brzi test charged 2
credits and returned `https://www.w3schools.com/html/mov_bbb.mp4`. One line explains it —
every non-matrix, non-image job rendered through `providers.renderer`, which is `MockRenderer`
while the Remotion Lambda env is empty; `matrix` escapes only because a `LocalRemotionRenderer`
is constructed separately for it. Edit, Mix and Prevod share that line and were **deliberately
not run** — 45 credits to re-prove one line is waste. Fixed by throwing instead: the handler
marks the job `error` and returns *before* `charge_credits`. Re-verified live — job shows
"Greška", balance unchanged at 702. This knowingly breaks mock-first for those tools; a job
that says "Gotovo!" over a placeholder lies to the user even when it is free.

**Lemon Squeezy deleted entirely** on the owner's decision — provider, both routes, the
`Billing` interface, `MockBilling`, the factory switch, four env vars. It was code-complete and
never called with a real key, so nothing working was lost. The "Dodaj kredit" button now goes
straight to `/api/dev/credits/add` (404s in production). **There is now no way for a real user
to buy credits** — a launch blocker, recorded as one.

**Owner decisions this session, all recorded in `TODO.md`:**
- Pricing/per-stage billing: **parked**. Do not price a product still being built.
- Burned-in social-media UI: **exclude the dirty shots, never erase them.** Backed by measured
  prices — the only video erasers cost $0.14/s, and `remove_text` earns 6 credits ≈ €1.20–1.80,
  so erasing is negative margin before a frame renders.
- Capabilities that do not fit Matrix's margin become **their own tools, priced separately**:
  video object removal, product photography.
- Aspect ratio is the user's choice. **Done and verified**: a real 16:9 job rendered 1920×1080.

**On Serbian users driving English models:** the answer is usually *not* translation. Video
object removal takes `{x, y}` keypoints — the user taps the watermark, nothing to translate.
Where description is unavoidable (product photography), Serbian goes through OpenRouter into an
English prompt behind Serbian preset buttons. A parallel agent then corrected this reasoning for
`remove_text` and it was accepted: that prompt would be a hardcoded constant we write, never
user input, so the language argument does not apply there — fal still wins, but on failure
modes, not on language.

**Research, done in parallel by three agents** (owner asked for it explicitly):
`research/fal-ai-catalogue.md`, `research/kie-ai-catalogue.md`, `research/provider-decisions.md`.
**Method finding worth more than the catalogues:** both platforms publish machine-readable
surfaces — fal has `llms.txt` per model with live schema and price, plus an MCP server; kie
returns all 408 pricing rows from one unauthenticated POST and has `docs.kie.ai/llms.txt`.
Hand-browsing the galleries, which is how half of this was gathered, was the slow way.

**Verification levels, stated plainly:**
- **VERIFIED (run live):** Matrix end-to-end, the 16:9 render, AI slike (real kie.ai image),
  the credits button (3 → 723), the `tool_not_implemented` guard, `/api/voices`, clip search
  and import.
- **CODE-COMPLETE, never executed:** `media-edit.fal.ts` — 21 unit tests with a mocked `fetch`,
  **not one real call to fal**. It is not wired to the worker either. Do not read the tests as
  evidence the endpoints behave as documented.

**Deliberately left uncommitted:** `scratchpad/` (24 MB of Cline logs and benchmark frames;
scanned for secret-shaped strings, the only hit is `check-env.mjs`'s own regex patterns) and
`.claude/launch.json` (absolute paths to two sibling projects on this machine).

**Next session picks up at `TODO.md` §7.**

---

## 2026-08-10 (third session) — INFRASTRUCTURE.md caught up with reality; pricing deliberately parked
**Account:** _(unrecorded)_ · **Machine:** primary. **Commits:** this block + the
`INFRASTRUCTURE.md` correction. Started clean, `main...origin/main` in sync at `5459efe`.

**No code was written.** The whole session was status-file repair plus one scoping decision,
and that is worth recording precisely because the file had drifted far enough to mislead a
session into re-doing finished work.

**The trigger:** the owner asked what migration 0005 actually is, having been told it
"blocks" script billing. It does not — **0005 was applied and live-verified on 2026-08-09**
(`SESSION_LOG.md`, closing-stretch block). The claim that it blocks anything was stale by a
day and would have sent this session to write a migration that already exists.

**Corrected in `INFRASTRUCTURE.md` F4/F5** — every one of these was `[ ]` while the work was
done, which is the exact failure mode the log discipline exists to prevent:
- `ScriptProvider` + the OpenRouter provider bullet — `[x]`. `script.openrouter.ts` exists
  with a unit test, `factory.ts:100` gates on `OPENROUTER_API_KEY`, `script.claude.ts` is
  deleted. Verified by reading the files, not by trusting the previous block's narrative.
- Feminine-gender default — `[x]`, resolved server-side from the voice id.
- Script review (5 candidates, edit, keep) — `[x]`, with the rate limit and
  `FREE_SCRIPTS`/`MAX_SCRIPTS` recorded.
- Caption timing — `[x]`, confirmed no code was needed.
- Migration 0005 — `[x]`, with the live verification method spelled out.
- Caption/sound wizard controls — the "NOT click-tested" caveat replaced by what click-test 4
  actually exercised.
- Blind Serbian eval — `[~]`, not `[x]`: **the harness ran, the grading did not.** 30 shuffled
  variants sit on disk with every axis blank. Only the owner can fill them. Until then the
  production model choice is a guess.

**Pricing is PARKED, by the owner's explicit decision:** "ne želim sad da sređujemo cene
nečeg što još pravimo." Script billing therefore stays unimplemented, and the bullet now says
so along with the two questions that must be answered first — both business, not technical:
(1) how the server enforces the free allowance, given it cannot trust the client's
`scripts.length` (reloading the wizard resets it, making every script free forever) and there
is no `job_id` to count against at script-generation time; (2) whether a script's credit adds
to the video price or comes out of it.

**One real defect found while reading, NOT fixed (pricing is parked, and this is only
reachable from that work):** `packages/db/src/generated/database.types.ts:158` still declares
`charge_credits` with three arguments. The live function takes four. Any caller passing
`p_reason` fails typecheck until that is regenerated or hand-corrected.

**Deliberately left uncommitted:** `scratchpad/` (24 MB of Cline run logs, benchmark PNGs and
extracted frames — scanned for secret-shaped strings first, the only hit is `check-env.mjs`'s
own regex patterns, not a value) and `.claude/launch.json` (absolute paths to two sibling
projects on this machine; they would be dead paths on the second machine).

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

