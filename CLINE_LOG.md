# CLINE_LOG.md — delegated work, and what the audit found

Append-only, newest at the bottom. One row per Cline run that reached a commit.

**Which model actually ran.** Rows below say GLM-5.2 because that is what the config says. On
2026-08-14 the endpoint was asked directly and answers `"model": "glm-5.3"` for a `glm-5.2`
request — a deliberate alias (an invented id is refused with `400 modelCode: does not exist`, and
`glm-4.6` is served as itself), so runs from at least that day were 5.3. Earlier rows cannot be
attributed with confidence; the alias could have been repointed at any time without notice. Treat
the model column of this log as "what we asked for", never as "what answered".

**Why this file exists.** The working split is: Claude specs and reviews, Cline (z.ai GLM)
writes the code. That only stays trustworthy if every run is audited and the audit is written
down — `CLAUDE.md` has a seven-bug history behind the rule "never trust Cline's self-report".
This is the record of what was actually checked, not what was claimed.

**How a run is audited.** Reading the diff is the floor, not the bar. For a test task the real
question is *would this suite fail if the code broke* — so the audit is a **mutation test**:
break the implementation on purpose, confirm the new tests fail, restore. For a code change,
prove the claimed property directly (a throwaway type probe, a runtime probe) and delete the
probe. Anything the run reports but I did not verify is written here as unverified.

**Invocation** (both traps are real and cost a run each):

```bash
cline --json -P openai-compatible --thinking medium -c "<repo>" "Read scratchpad/<spec>.md and follow it exactly." -t 900
```

- **Always pass `-P openai-compatible`.** The `zai` provider entry is a different, empty wallet;
  a bare run uses `lastUsedProvider`, and testing `-P zai` once rewrites that to the empty one.
- **Never background it with PowerShell `Start-Job`** — each PowerShell call is a fresh process,
  the job dies with it and the task is silently lost. Use the harness's own backgrounding.
- **Run ONE task at a time. Cline runs cannot be parallelised** — measured 2026-08-14, not
  assumed. Three concurrent invocations produced
  `{"type":"run_aborted","reason":"external_abort","message":"aborted by another client"}`: a new
  `cline` process kills a running one, because they share a hub. Two coexisted for a while, which
  is exactly what makes this look supported until it silently is not. The earlier failures that
  looked like provider stalls — `"The operation timed out."` at iteration 1 with **zero tokens
  used** — are almost certainly the same thing wearing a different hat.
  Symptoms to recognise: a run that dies at iteration 1 having spent nothing, or a completed run
  whose files never appeared. Check the tail of the `--json` output for `run_aborted` before
  blaming the model.
- Even sequentially, never point two tasks at the same files.
- **A run can exit 0 having done nothing.** On 2026-08-14 a task was handed the usual
  "read `<abs path>` and follow it"; the model announced it could not find
  `C:\Users\thomashardy\...\research_20250615.md` — a path from somewhere in its own head, never
  in the prompt — and stopped. The file it was actually given existed the whole time (verified
  immediately after). The CLI reported success. **So exit 0 is not evidence a task ran**: check
  `git status` and the final message, and if the run was read-only, check that the report exists at
  all. Re-running the identical command worked, as it did for the earlier silent no-op on
  2026-08-05.

---

| # | Task | Files | Audit | Verdict | Commit |
|---|---|---|---|---|---|
| 1 | Tests for `resolveLocalStorageDir` | `packages/core/src/storage-path.test.ts` | Mutation: swapped the repo-root anchor for `process.cwd()` → the cwd-independence test failed. Import style corrected to the repo's explicit `.ts`. | ✅ accepted | `f71d048` |
| 2 | Tests for the credit rule | `packages/core/src/credits.test.ts` | Mutation: `>=` → `>` in `canAfford` → 4 tests failed, starting at the exact-balance boundary. Serbian message confirmed copied verbatim by grep. | ✅ accepted | `05aa2c2` |
| 3 | Tests for env loading | `packages/core/src/env.test.ts` | Mutation: reverted `optionalUrl()` to plain `.url().optional()`, reintroducing the historical deploy bug → 3 tests failed, named after it. Confirmed the suite never touches real `process.env`. | ✅ accepted | `aa782ff` |
| 4 | Tests for `pollJob` | `apps/web/src/lib/poll-job.test.ts` | Mutation: removed `error` from the terminal-state check → exactly 1 test failed, and took 5s instead of 8ms as it fell through to the timeout path. Checked `globalThis.fetch` is restored in `afterEach`. | ✅ accepted | `bbb2fbe` |
| 5 | **Code change:** `FORCE_MOCK` spellings + narrow `hasKey` | `packages/core/src/env.{ts,test.ts}` | Type probe confirmed `hasKey(env,'FORCE_MOCK')` and `'NODE_ENV'` are now TS2345 errors while `'OPENROUTER_API_KEY'` still compiles; runtime probe confirmed 6 true-spellings, 6 false-spellings, and that the flag still vetoes a set key. Both probes deleted. | ✅ accepted | `936cf9a` |
| 6 | Tests for `rateLimit` | `apps/web/src/lib/rate-limit.test.ts` | Three mutations: `<=`→`<`, and `EXPIRE` made conditional on `count === 1` → exactly the boundary test and the NX test failed; dropping `withTimeout` around `incr` → the hanging-Redis test failed with "Test timed out in 5000ms" instead of passing in 13ms. Implementation restored byte-identical (`git diff --stat` empty). | ✅ accepted | `8420316` |
| 7 | Tests for the provider factory | `packages/core/src/providers/factory.test.ts` | Three mutations at once: dropped the `R2_PUBLIC_URL` check, deleted the missing-`REMOTION_SERVE_URL` fallback, and changed `overrides.mediaEdit !== undefined` to a truthiness check → exactly three tests failed, one per mutated branch, and nothing else. `factory.ts` restored from a backup copy (`git diff --stat` empty). Two fixes by hand: section D was missing its closing brace so E–H nested inside it and the run reported `D. Script > E. Storage`, and a stray `});` at EOF. | ✅ accepted, after a correction round | `7b83fcd` |
| 8 | **Code change:** one shared 1s budget for all three Redis commands | `apps/web/src/lib/rate-limit.{ts,test.ts}` | Reverted the change by hand (timeout back around `incr` only) and re-ran: all three new tests hung to vitest's 5000ms ceiling, the other 11 stayed green. Restored, 180 web tests pass. | ✅ accepted | `64f2685` |
| 9 | Tests for the Lambda renderer (never executed code) | `packages/core/src/providers/renderer.lambda.test.ts` | Two mutations: returning the S3 `outputFile` as `videoUrl` and keying the upload by bucket name, plus removing the `try/catch` around `deleteRender` → 5 tests failed, exactly the ownership, key, url, best-effort-cleanup and polling ones. Restored from a backup copy (`git diff --stat` clean). | ✅ accepted | `2e82f29` |
| 10 | **Code change:** best-effort `deleteRender` on the failure paths + `progress.errors` guard | `packages/core/src/providers/renderer.lambda.{ts,test.ts}` | Mutation: removed both failure-path cleanup calls and reverted `progress.errors ?? []` → 6 tests failed, including test 15 with the exact `Cannot read properties of undefined (reading 'map')` the guard exists to prevent. Restored from a backup copy. | ✅ accepted | `446080e` |
| 11 | Tests for the ElevenLabs voice provider | `packages/core/src/providers/voice.elevenlabs.test.ts` | Four mutations: unclamping `voice_settings`, shifting the alignment-fold `endSec` index, dropping the array-length guard, neutering the TTS error guard → each failed exactly the named test (3, 1, 6, 7) and nothing else. Restored from a backup copy (`git diff --stat` empty). No findings. | ✅ accepted | `99916f5` |
| 12 | Tests for `RealScraper` (fetch + cheerio) | `packages/core/src/providers/scraper.real.test.ts` | Five mutations: the `Proizvod` title default, the price unit, the logo/icon/svg image filter, the redirect (SSRF) guard, and the 8-image cap → tests 2, 4, 7, {9,10}, 8 respectively. cheerio left real; the mock placeholder asserted by format so the seedCounter can't flake it. Restored, diff empty. No findings. | ✅ accepted | `eba3ccd` |
| 13 | Tests for the kie.ai + fal.ai router (never run against a real key) | `packages/core/src/providers/ai.kiefal.test.ts` | Nine mutations covering all 19 tests: aspect-ratio swap and no-match, each result-index shift (kie img, fal img, kie video), disabling the image and video fal fallbacks, and neutering the no-image-URL / no-video-URL / no-FAL_API_KEY / fal-terminal-status guards → each failed exactly its named test(s). Restored, diff empty. No findings. | ✅ accepted | `8eaa75c` |
| 14 | Tests for `runYtDlp` (shell-free argv) | `apps/web/src/lib/yt-dlp.test.ts` | Four mutations: reordering argv to `[...flags, target]`, a wrong executable, a shrunk `maxBuffer`, and returning `stderr` → tests 2, 1, 4, 5. `child_process` + the constants module mocked via `vi.hoisted`. Restored, diff empty. No findings. | ✅ accepted | `1f46b99` |
| 15 | Tests for the job state machine (money path) | `apps/worker/src/processor.test.ts` | Seven mutations, one per test: neutering the not-found guard, the `running` update, the empty-assets guard, the per-asset cost scaling, the charge-failure asset-rollback delete, the return-not-throw on charge failure, and the catch's `error` marking → each failed exactly the test(s) named for it. Uses the `makeProcessor` seam added by hand in `dcc9416` (Claude, not Cline). Restored, diff empty. No findings. | ✅ accepted | `9050706` |
| 16 | Tests for `LocalRemotionRenderer` (the prod renderer) | `packages/core/src/providers/renderer.local.test.ts` | Five mutations: returning the local temp path as `videoUrl` (ownership), a wrong composition id, a wrong codec, a wrong content type, and moving the cleanup out of the `finally` → tests 1, 2, 3, 4, 6 respectively. **Cline correctly flagged a portability defect in my spec** — a POSIX-literal `startsWith('/tmp/...')` that fails on a Windows dev box because the module uses `path.join`; per rule 4 it left the test failing and reported it, and I fixed the assertion (dir-name substring + basename regex), not the module. `@remotion/*` + `node:fs/promises` mocked. Restored, diff empty. | ✅ accepted, after fixing my spec's separator assumption | `7c639bf` |
| 17 | Tests for `resolveVoiceId` + `buildImageAdsPrompt` | `apps/worker/src/voice-prompt.test.ts` | Uses the export + injected-voice hooks added by hand in `df299a0` (Claude). Seven mutations: killing the requested-id early return, shifting the fallback index, the catch-path return, the label's `index + 1`, the title default, and the language pass-through → each failed exactly its test(s). **The mutation audit caught a WEAK assertion in the delegated test**: case 1 requested `'a'` = `voices[0]`, so a broken early-return would still return `'a'` via the fallback and the test would pass; strengthened to `'b'` (present but not first). Cline's run itself exited 1 on a `.cline` hub-lock timeout, but had already written the complete 10-test file (iteration 8) before the hub died — verified complete and green independently. Restored, diff empty. | ✅ accepted, after strengthening one assertion | `afa4da2` |
| 18 | Tests for `persistRemoteAsset` + `runMediaEditPipeline` | `apps/worker/src/media-edit.test.ts` | Uses the export + inject hooks in `0deb182` (Claude). Nine mutations: the non-ok fetch guard, the missing-source / no-FAL-key / localhost / video-not-supported fail-not-charge guards, flipping `faceEnhancement`, and breaking the `png` extension → each failed exactly its test(s). fetch faked with a REAL web ReadableStream body; storage + fal injected. Restored, diff empty. No findings. | ✅ accepted | `2ab6a62` |
| 19 | Tests for `runPipeline` (dispatch + the mock-renderer money guard) | `apps/worker/src/run-pipeline.test.ts` | Uses the export + inject hook in `9807287` (Claude). Five mutations: neutering the mock-renderer guard (the one that stops a placeholder being charged), changing the `count` default, flipping revoice's `montage:false`, always-persisting despite a provider-owned `storageKey`, and replacing the `?? null` storageKey fallback → each failed exactly its test. **Audit process note:** two of those mutations first landed on an identically-shaped line inside `runMatrixPipeline` (perl `s///` without `/g`) and reported a false "test does not catch this"; re-applied to the real `runPipeline` site, both failed correctly. Restored, diff empty. No findings. | ✅ accepted | `a26003f` |

| 20 | **Code change:** re-wire the Billing layer into core + 2 money fixes | `packages/core/src/{interfaces,env,index}.ts` + `providers/{mocks,factory,billing.lemonsqueezy}.ts` + `.env.example` | Provider file restored verbatim by Claude from `d8dfb49^` first; Cline did the integration into the CURRENT core and both hardening fixes. Audited by reading the diff (not a test task) + running the gate: 302 tests still green, including `factory.test.ts`'s 22 that assert the exact provider set, and `mockProviderSlots()` confirmed untouched (adding billing there would stop a correctly-configured render worker booting). G1 (cross-check the PAID variant against the map) and G2 (redirect back to the app) both landed as specced. | ✅ accepted | `5232a44` |
| 21 | **Code change:** restore the billing routes + 3 hardening fixes | `apps/web/src/app/api/billing/{checkout,webhook}/route.ts` + `components/add-credits-button.tsx` | Routes restored verbatim by Claude; Cline added the production mock-billing refusal (503 instead of serving a free-credits URL), stopped the 500 body echoing `err.message` (it names env vars), and split "bad signature" from "malformed payload". **Cline caught a detail my spec only half-anticipated**: `class InvalidWebhookSignatureError extends Error {}` never sets `.name`, so it matched on `constructor.name` and said so. Serbian copy verbatim. Web typecheck + 192 tests green. | ✅ accepted | `f8238b0` |
| 22 | Tests for `LemonSqueezyBilling` | `packages/core/src/providers/billing.lemonsqueezy.test.ts` | Six mutations: neutering signature verification → all 4 signature tests; dropping the paid-variant cross-check → the refusal test; removing the order_created/paid filter → both filter tests; a constant `orderId` (which would break webhook idempotency and let a retry double-grant) → 3 tests; removing `redirect_url` → the return-to-app test. **The audit found a hole in MY OWN spec:** it said "use `CREDIT_PACKS[0]`", which has no bonus, so `credits + (bonus ?? 0)` could be reduced to `credits` with all 23 tests still green — a `pack_agency` buyer would silently lose 120 credits. Added case 11b (first pack that carries a bonus); the mutation now fails. Restored, diff empty. | ✅ accepted, after closing a spec-induced coverage hole | `ec085e4` |

| 23 | Tests for `POST /api/jobs` | `apps/web/src/app/api/jobs/route.test.ts` | First test any API route had. Six mutations: flipping the balance comparison, neutering the balance gate, enqueueing despite an insert failure, raising the count cap, swapping `hasOwnProperty` for `in`, dropping the `toAdSeconds` normalisation → each failed its own test. | ✅ accepted | `990296f` |
| 24 | Tests for `GET /api/dev/credits/add` | `apps/web/src/app/api/dev/credits/add/route.test.ts` | Four mutations: neutering the production admin gate, inverting it, dropping the bonus term, accepting an unknown pack. The prod gate had only ever been checked by hand against a live server. | ✅ accepted | `82d17d3` |
| 25 | Tests for the billing routes | `apps/web/src/app/api/billing/routes.test.ts` | Four mutations: the production mock-billing refusal, the `err.message` leak, `p_external_ref`, and the signature/malformed split. **The first run on this spec was a SILENT NO-OP** — read the files, stopped after 3 iterations, empty report, exit 0, nothing written. `git status` clean + empty `text` in `run_result` is the tell; re-running the same spec unchanged worked. | ✅ accepted on retry | `1c7748e` |
| 26 | **Code change:** upload extension from the validated MIME + storage `nosniff` | `apps/web/src/app/api/upload/route.ts` + `apps/web/src/app/api/storage/[...path]/route.ts` | Diff-audited. Cline left a duplicated comment block (tidied by hand). **The audit caught a trap the change itself introduced**: `nosniff` makes the storage allowlist absolute, and that allowlist was missing `.mov/.webp/.ogg/.m4a` — a Matrix ad's own background music would have been served as octet-stream with sniffing disabled. Added all four; verified mechanically that the three maps are in lockstep. | ✅ accepted, after completing the change | `c25d4f7` |
| 27 | Tests for `POST /api/upload` | `apps/web/src/app/api/upload/route.test.ts` | Four mutations: restoring the filename-derived extension (failed 6 tests), dropping the size guard, dropping the type allowlist, de-namespacing the key. | ✅ accepted | `562bbe1` |
| 28 | Tests for `GET /api/storage/[...path]` | `apps/web/src/app/api/storage/[...path]/route.test.ts` | Four mutations: the traversal guard, the ownership check, letting the DEV BYPASS run in production (failed 4), and dropping `nosniff`. | ✅ accepted | `22346a4` |
| 29 | Tests for the two SSRF-guarded routes | `apps/web/src/app/api/ssrf-routes.test.ts` | Three mutations: dropping `assertPublicHost` from scrape and from import-clip (the guard must run BEFORE the fetch), and removing the 200 MB cap. | ✅ accepted | `585adb9` |
| 30 | Tests for the last four routes | `apps/web/src/app/api/remaining-routes.test.ts` | Six mutations across generate-scripts / search-clips / voices / jobs[id]. Two initially looked like misses because the caps are `Math.min` helpers rather than `.slice` — the perl never hit the code. Same lesson as run 19: confirm WHICH line a mutation changed before believing a negative. **Route coverage now 12/12.** | ✅ accepted | `203ebb0` |

| 31 | **Code change:** vision — `describeImage` over OpenRouter | `packages/core/src/{interfaces.ts,providers/{script.openrouter,mocks}.ts}` + NEW vision test | Three mutations: sending `content: userText` instead of the multimodal array (i.e. quietly NOT showing the model the image, which would still produce plausible output) failed test 1; dropping the 120-char clamp and the quote-stripping each failed their own test. 9 tests. | ✅ accepted | `7539d96` |
| 32 | **Code change:** free wizard navigation, gate on Generate | `apps/web/src/components/job-wizard.tsx` + `app/app/matrix/page.tsx` | Diff-audited: `canNext` reduced to "not running", `missingForGenerate`/`canGenerate` added, `allowJumpAhead` opt-in so no other wizard changes. The production `clipsRequired` rule and its comment survived intact — that was the thing worth protecting, since removing it would let someone pay for ads over stock footage. | ✅ accepted | `d6655c2` |
| 33 | Drag-and-drop dropzone + Matrix wiring | NEW `apps/web/src/components/file-dropzone.tsx` + `app/app/matrix/page.tsx` | Diff-audited. Correct on the three things that are easy to get wrong: a depth COUNTER for drag state (a boolean flickers when the pointer crosses a child), `preventDefault` on dragover (without it the browser opens the file instead of firing drop), and a real `<button>` so focus and Enter/Space work without hand-rolled a11y. Uploads still append rather than replace. | ✅ accepted | `8789681` |
| 34 | Dropzone in the five remaining wizards | `app/app/{enhance,remove-text,edit,mix,translate}/page.tsx` | Diff-audited. The thing the spec was most likely to lose is per-page accuracy, and it held: each page kept its own `accept` string and its own append-vs-replace behaviour, and the Serbian copy follows what the page actually takes (`sliku` on the image pages, not a blanket `video`). No upload endpoint, payload or step order touched. | ✅ accepted | `203bbbc` (bundled) |
| 35 | **Code change:** alert on a failed job | NEW `apps/worker/src/alert.{ts,test.ts}` + `index.ts` + `.env.example` | Two mutations: making the catch rethrow failed exactly *"a rejecting fetch does NOT throw"* — the whole point, since this is `void`-called from an event handler where a rejection is unhandled; replacing the unset-url guard with `if (false)` failed both no-alert tests. Nothing else moved either time. Cline correctly found the job type on `bullJob.name` rather than `bullJob.data` and said so. 6 tests. | ✅ accepted | `d47815e` |

| 36 | Serbian string audit across the whole app — READ-ONLY | (none — report only) | Read 18 pages, 8 components and `pricing.ts`, returned 22 findings and changed nothing; `git status` empty afterwards. Three of the heaviest claims were verified by hand and all three held, including the empty state of "Moje reklame" pointing new users at a tool with no pipeline. It also declined to flag loanwords the audience actually uses and said so. | ✅ accepted | — |
| 37 | Copy fixes from that audit, exact strings | landing, reklame, matrix, dashboard, `pricing.ts`, 7 wizards | Diff-audited: exactly 17 lines across 12 files, every one on the spec's list, nothing else touched. | ✅ accepted | `2317b19` |
| 38 | **Code change:** Serbian auth errors | NEW `apps/web/src/lib/auth-errors.{ts,test.ts}` + 4 auth pages | Two mutations: letting the raw English through the fallback failed exactly the two tests that forbid it, and a case-sensitive match failed five. 17 tests. | ✅ accepted | `ff124af` |
| 39 | Dropzone hardening — guard, accept-on-drop, tests | `file-dropzone.tsx` + NEW test + `mix/page.tsx` | **Cline refused to write the six DOM tests and said why: there was no DOM environment.** That was correct and is exactly what `.clinerules` asks for — the alternative was six tests that pass without proving anything. I added `jsdom` (a dependency Cline is not allowed to add) and re-ran it. | ✅ accepted | `5642595` |
| 40 | The six DOM tests, with jsdom available | `file-dropzone.test.tsx` | Two provider timeouts before it landed (exit 1 with zero tokens, then exit 255 with the file already complete — the known "verify independently" case). Mutations: silencing `onFiles` failed the 3 delivery tests, dropping the accept filter failed 2, removing the guard's dropzone check failed 1. **Its guard assertion failed against the code and Cline was right, not the code** — my spec had assumed a disabled zone would be left alone, and a second mounted dropzone's guard did in fact prevent it. Fixed the component. | ✅ accepted | `5642595` |

| 41 | **Code change:** worker SIGTERM + heartbeat + healthcheck + `stalled` | NEW `apps/worker/src/health.{ts,test.ts}` + `index.ts` + `infra/docker-compose.prod.yml` | Mutations: a throwing heartbeat write failed exactly the never-fatal test; treating a future timestamp as stale failed exactly the clock-skew test. 9 tests. Cline also wrote a correct healthcheck one-liner after I deliberately handed it a broken one to fix, and reported the final line. **Then the LIVE test found what no test could**: SIGTERM logged correctly but the container exited 1, because `pnpm` was PID 1 — fixed by hand in `03a3bbc`, re-tested with a real signal, exit 0. | ✅ accepted | `115cb25`, `03a3bbc` |

| 42 | **Code change:** private Lambda render + presigned ownership fetch | `packages/core/src/providers/renderer.lambda.{ts,test.ts}` | Three mutations: reverting to `privacy: 'public'` failed exactly its assertion; fetching the raw `outputFile` failed exactly the test forbidding it; skipping the bucket-segment strip failed the path-style key test and the presign-arguments test. 8 new tests. The spec handed Cline the real `presignUrl` signature read out of the installed 4.0.490 types, so nothing was guessed. **Then I RAN it against live AWS + R2** (`52b7829`) — 21.5s, our url back, 1 079 954 bytes of mp4 — which is what moved this file from CODE-COMPLETE to VERIFIED. | ✅ accepted | `9ec9fb9` |
| 43 | **Code change:** `safeNextPath` — open-redirect whitelist | NEW `apps/web/src/lib/safe-redirect.{ts,test.ts}` + `login/page.tsx` + `auth/callback/route.ts` | Two mutations: removing the rooted-path check failed the absolute-url, userinfo (`@evil.example`), `javascript:` and empty-string tests; removing the backslash check failed the backslash test and nothing else. 8 new tests. Faithful to spec, four files, nothing else touched. @ `198c191` |
| 44 | **Code change:** origin whitelist for job params (worker SSRF) | NEW `apps/web/src/lib/asset-url.{ts,test.ts}` + `api/jobs/route.{ts,test.ts}` | Two mutations: accepting any origin failed nine unit tests plus both route tests including the `169.254.169.254` one; accepting any relative path failed the `/etc/passwd` case alone. 23 new tests. @ `b01d909` |
| 45 | **Code change:** in-flight jobs counted against the balance | `api/jobs/route.{ts,test.ts}` | Mutation: dropping `reserved` from the comparison failed exactly the two tests named for it. Required extending the suite's supabase mock past `.single()` to `.in()`, which it did correctly. 5 new tests. @ `35bdf4c` |
| 46 | **Code change:** error-text hygiene (webhook + `jobs.error`) | `billing/webhook/route.ts` + `billing/routes.test.ts` + `worker/src/index.ts` + `processor.test.ts` | Two mutations: returning the raw message from `jobErrorForUser` failed six worker tests including the duplicate-key one; restoring `error.message` in the webhook failed its 500-body test. Two existing expectations were updated — authorised explicitly in the spec, since the behaviour they described was the thing being changed. @ `06d5572` |
| 47 | **Code change:** signed asset urls, part A (core + route) | `storage.r2.{ts,test.ts}` + `api/storage/[...path]/route.{ts,test.ts}` | Two mutations: skipping `authorise` failed the 401 and 404 signing tests; returning `getUrl` from `upload` failed the core route-path tests. Also updated the route's own header comment, which had claimed R2 bypasses this route entirely. @ `26a0f34` |
| 48 | **Code change:** signed asset urls, part B (worker) | `worker/src/index.ts` + `matrix-pipeline.test.ts` + `media-edit.test.ts` | Mutation: disabling the signing branch failed exactly its two tests. It found the fourth call site (`voiceUrl`) that the spec only gestured at, and correctly avoided `.map(resolveStorageUrl)` — which would have passed the array index as the storage argument. @ `26a0f34` |

## Audits run by Claude, not delegated (2026-08-13)

Two sweeps the owner asked for. Both found real defects, and both are worth repeating whenever the
infrastructure changes — because in each case the bug was created by a change made the SAME DAY.

**Security.** One critical: `profiles_update_own` let any authenticated user set their own
`balance` (RLS is row-level, not column-level) and spend it on real provider calls. Closed by
migration 0007 — drop the policy, revoke UPDATE on the columns, and note that NOTHING writes to
`profiles` from a client so nothing legitimate is lost. Plus a rate limit on the credit-minting
route. Everything else clean.

**Functional.** The `tool_not_implemented` guard asked `renderer.name === 'mock-renderer'`.
Deploying Lambda that morning made it always false, so four unimplemented tools began calling
Lambda with an undeployed composition id. Fixed by asking about the TOOL instead. **The pattern to
remember: a guard written as a proxy for a condition rots the moment the thing it proxies
changes** — and it fails OPEN, silently.

## When the spec is wrong, not the code (run 7)

Worth recording because it is the failure mode that costs the most: my brief said "with no keys,
every slot **including `scraper`** is the mock". Cline wrote that test, it failed, and Cline
refused to weaken it — reporting instead that `factory.ts` was arguably wrong and recommending a
fix. The refusal was right; the conclusion was not. `RealScraper` needs no key and no paid
account, so "no key" says nothing about that slot, and `mockProviderSlots()` is right to stay
quiet about it: the guard exists to stop a worker serving **canned output**, and a real scraper
is not canned output. `FORCE_MOCK` is the gate for that slot, and it was already covered.

The correction round fixed the two test expectations and added a third test pinning the line
between "no key" (`real-scraper`) and the kill switch (`mock-scraper`, and the slot does appear
in the guard). Nothing in `factory.ts` changed. Lesson for future specs: state the expected
behaviour of a slot only after checking whether that slot needs a key at all.

## Open findings on `renderer.lambda.ts` — code that has still never run

Raised by run 9 and worth fixing, but deliberately not folded into a test commit:

- ~~`deleteRender` runs only on the success path.~~ **Fixed in run 10** — best-effort cleanup on
  both failure branches, wrapped so it can never become the error the caller sees.
- ~~`progress.errors` is read without a guard.~~ **Fixed in run 10** — a fatal with no `errors`
  array now surfaces a clear message naming the renderId instead of a TypeError.
- ~~**`MAX_WAIT_MS` is a flat wall-clock ceiling**, not progress-aware.~~ **Fixed @ `d28a20f`**
  (Claude, with tests) — the ceiling is now `NO_PROGRESS_TIMEOUT_MS`: the stall clock resets every
  time `overallProgress` advances, so only a genuinely stuck render is failed. Tests 16-17 pin
  both halves (advancing render never fails; frozen render still does). Still unrun against AWS.
- ~~**The public-S3 window widens if the worker dies** between `done` and the delete.~~ **Fixed @
  `9ec9fb9`** (run 42). The reason this stayed open — "needs a live AWS run, and guessing at a
  never-executed API is the worse risk" — expired when Lambda went live on 2026-08-13. Renders are
  `privacy: 'private'` and ownership is taken through a 15-minute presigned url, so the object is
  never readable at its plain url at any point. The key is DERIVED from the url Remotion reports
  (`objectKeyFromOutputUrl`, both addressing styles, throws rather than guessing) and the
  `presignUrl` signature was read out of the installed 4.0.490 type definitions first. 8 new tests.
  **Still never executed against AWS** — the presign path is CODE-COMPLETE like everything else
  here until a real render runs through it.
- ~~**No retry on the ownership `fetch`.**~~ **Fixed @ `d28a20f`** (Claude, with tests) — the fetch
  retries up to 3× with linear backoff on a 5xx or a network error; a 4xx stays permanent and
  fails at once; exhausting the retries still fails the job (never falls back to S3). Tests 18-21.

None of this is compiler-checked either: `RenderProgress` comes from `@remotion/serverless-client`,
which is not installed here, so `skipLibCheck` is carrying those field names. The tests pin the
code's internal consistency; only the first real deploy validates the SDK fit.

## Findings Cline surfaced that I did NOT act on

Kept here so they are not rediscovered as if new:

- `loadEnv()` caches module-level and has no reset hook, so any call with no argument poisons
  the cache process-wide. Latent; no caller does it today.
- That cache is keyed by `input === process.env` reference equality, so the common defensive
  `loadEnv({ ...process.env })` silently re-parses every call. A performance surprise, not a bug.
- `computeJobCost` floors fractional counts and treats `0`/negative as `1`, so `count: 0` is
  charged as one output. Already documented and tested in `pricing.cost.test.ts`.
