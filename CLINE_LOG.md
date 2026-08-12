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
| 7 | Tests for the provider factory | `packages/core/src/providers/factory.test.ts` | Three mutations at once: dropped the `R2_PUBLIC_URL` check, deleted the missing-`REMOTION_SERVE_URL` fallback, and changed `overrides.mediaEdit !== undefined` to a truthiness check → exactly three tests failed, one per mutated branch, and nothing else. `factory.ts` restored from a backup copy (`git diff --stat` empty). Two fixes by hand: section D was missing its closing brace so E–H nested inside it and the run reported `D. Script > E. Storage`, and a stray `});` at EOF. | ✅ accepted, after a correction round | `<see below>` |

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

## Findings Cline surfaced that I did NOT act on

Kept here so they are not rediscovered as if new:

- `loadEnv()` caches module-level and has no reset hook, so any call with no argument poisons
  the cache process-wide. Latent; no caller does it today.
- That cache is keyed by `input === process.env` reference equality, so the common defensive
  `loadEnv({ ...process.env })` silently re-parses every call. A performance surprise, not a bug.
- **`rate-limit.ts`: only `incr` is wrapped in `withTimeout`.** `expire` and `ttl` are awaited
  bare, so a socket that stalls on either one hangs the request past the 1s ceiling the module
  documents. Real gap, worth fixing; queued as its own task rather than smuggled into a test run.
- `computeJobCost` floors fractional counts and treats `0`/negative as `1`, so `count: 0` is
  charged as one output. Already documented and tested in `pricing.cost.test.ts`.
