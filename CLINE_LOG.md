# CLINE_LOG.md — delegated work, and what the audit found

Append-only, newest at the bottom. One row per Cline run that reached a commit.

**Why this file exists.** The working split is: Claude specs and reviews, Cline (z.ai GLM-5.2)
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
- Never run two Cline tasks against the same files at once; disjoint file sets only.

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
- **The public-S3 window widens if the worker dies** between `done` and the delete: the
  world-readable link then stays up indefinitely. `privacy: 'private'` plus a presigned fetch is
  the real fix, and it needs a live AWS run to get right. **STILL OPEN — deliberately left for the
  owner's AWS run** (RELEASE_PLAN L2.3); blind edits to never-run AWS auth code are the exact trap.
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
