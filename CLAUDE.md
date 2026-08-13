# CLAUDE.md — how to work in this repo

**Project:** AdGen — Serbian/Balkan AI video/image ad-generator SaaS. Mock-first pnpm
monorepo: `apps/web`, `apps/worker`, `packages/core`, `packages/db`, `remotion`. Serbian UI copy.

## Two-account workflow (read this first)
The owner alternates between **two Claude Code accounts on the SAME machine and SAME
folder** — just logs out and back in. The working tree is therefore already shared;
there is **nothing to sync for code**. What does NOT survive the account switch is
*intent* — why the last session did what it did, and what's next. That lives in
`SESSION_LOG.md`.

**But the owner ALSO works across two physical machines** (the sibling `aikutak` repo is
the case that proved it). The moment that happens here, "pushing is optional backup"
below stops being true. The rule that cost three weeks in `aikutak`:
**never end a session with uncommitted work.** Commit it anyway — `wip:` prefix, or a
`wip/<topic>` branch — then push. A commit is not a claim that something is finished; it
is the only thing that carries work to the other machine, and the only backup. Code that
exists on one disk does not exist. Verified 2026-08-08: this repo's own `/api/storage`
route had never been committed and would have vanished with the machine.

## Start-of-session ritual
0. `git fetch origin && git status -sb`. If it says `behind`, pull **before touching any
   file**. If it says `ahead`, the last session didn't push — find out why before adding
   to it.
1. Read the **top entry** of `SESSION_LOG.md` (newest first).
2. Run `git log --oneline -15` and `git status -s` to see what actually changed.
3. **Do NOT re-read source files wholesale to "get oriented."** The log + git already
   tell you the state. Read a source file only when you're about to change or reason
   about that specific file.

## End-of-session ritual
1. Append a new dated block to the **top** of `SESSION_LOG.md` — append-only, never
   rewrite old blocks.
2. Commit with a clear message — **including unfinished work** (see above).
3. **`git push origin main`.** Not optional. The account switch shares a folder, but the
   remote is the only copy that survives this machine, and the only way a second machine
   ever sees the work.
4. State in the log block whether anything was deliberately left uncommitted, and what.
   If that line is ever non-empty, it must say **what** and **where**.

## Log discipline (this is what stops the doc from lying)
Every claim in `SESSION_LOG.md` marks its verification level and anchors to a commit
hash or `file:line`, never a vague statement:
- **VERIFIED** — typecheck/build passed, or run live.
- **CODE-COMPLETE** — written + typechecks, but NEVER run against the real thing.

**CODE-COMPLETE is not "almost done".** The cautionary case: M2c was logged as "montage
wired end-to-end", passed review, and stayed that way for two weeks — the first time it
was actually run it hard-failed on a 401 and had never produced a single frame
(`SESSION_LOG.md` 2026-08-05). Three real bugs sat behind that label. If a thing has
never been executed, say so in those words and don't let a later session read it as done.

## Review reuse — never re-review unchanged code
A code review is expensive the first time; don't repeat it for code that hasn't changed
(the biggest wasted cost when alternating two accounts). Verdicts live as greppable
`REVIEWED:` lines in `SESSION_LOG.md`'s Review ledger, each anchored to a commit hash.

Before reviewing any area:
1. `grep "^REVIEWED:" SESSION_LOG.md` — find the latest verdict covering it.
2. `git log --oneline <verdict-commit>..HEAD -- <those paths>`:
   - empty → nothing changed since the verdict → trust it, **skip the review**;
   - non-empty → review ONLY the changed files, then append a fresh `REVIEWED:` line.
3. Git is authoritative: files changed since a verdict's commit with no newer verdict
   must be reviewed, even if the narrative doesn't mention them.

Verdict format (one line):
`REVIEWED: <area> (<paths/glob>) — <CLEAN | ISSUES: …> @ <commit> (<date>). <notes>`

## Sources of truth
- `INFRASTRUCTURE.md` — phases F0–F7 with checkboxes. THE status file.
- `SESSION_LOG.md` — per-session intent / next steps / gotchas.
- `howto.md` / `ACCOUNTS.md` — VPS access; which account maps to which env var.
- `BUSINESS.md` — pricing, margins, the two money-side liabilities. Rarely needs reading.
- `SESSION_LOG_ARCHIVE.md` — session blocks older than the current file. History only.

## Code changes go through Cline (CLI-automated, since 2026-07-21)

> ✅ **UNBLOCKED 2026-08-12 (later the same day): the owner recharged and delegation works.**
> The earlier "insufficient balance" block is history. **Always pass `-P openai-compatible`** —
> there are TWO wallets, and the `zai` entry is the empty one; worse, running `-P zai` once to
> test rewrites `lastUsedProvider`, so a later bare invocation silently uses the empty wallet
> and the failure looks like a fresh outage. Nine tasks ran this way on 2026-08-12; the ledger
> is `CLINE_LOG.md`.
>
> **`.clinerules` (repo root) is the standing contract** — Cline auto-reads it every run, so it
> holds whatever must be true even when a task spec forgets to say it: git is entirely off
> limits, the task's file list is exhaustive, the project's own docs and migrations are
> untouchable, no new dependencies, no reformatting, Serbian copy is copied verbatim, and **a
> failing test is a finding to REPORT, never a thing to weaken.** That last rule earned its
> place on the first day: Cline refused to weaken a test, and it turned out the *spec* was
> wrong, not the code.
Claude launches Cline **itself** via the `cline` CLI — the owner no longer copy-pastes
prompts. Invocation: `cline --json -P openai-compatible -c "<repo>" "<self-contained task>"` (act mode,
`--auto-approve` default true; add `--thinking medium|high` for multi-step tasks and
`-t <sec>` as a safety cap sized to the task; run long tasks in the background).
Provider is z.ai GLM-5.2 (`~/.cline/data/settings/providers.json` — `cline config` needs
a TTY, so read that file directly; never print its apiKey). GLM-5.2 is weaker than
Claude → keep each task explicit and mechanical: one clearly-scoped unit, exact file
paths, full code/commands, and a "definition of done". Cline reports in its FINAL MESSAGE
only — `CLINE_REPORT.md` is obsolete and `.clinerules` now forbids writing it. Audit every
run via the `--json` stream + `git diff` + the changed files — never trust Cline's
self-report on non-deterministic work. Claude edits app code directly only when asked;
meta/workflow docs (this file, `SESSION_LOG.md`, `CLINE_LOG.md`) Claude may edit directly.

**Auditing a delegated TEST task means mutation testing, not reading the diff.** A test file
that passes proves nothing about whether it would FAIL when the code breaks. So: break the
implementation on purpose (invert the boundary, delete the guard, return the wrong url), run
the new tests, confirm the ones named after that behaviour fail and nothing else does, then
restore — `git diff --stat` empty is the proof you restored it. Back the file up first
(`cp` to the scratchpad) when the mutation spans several hunks. Every run on 2026-08-12 was
audited this way and every one caught the mutation at the right test.

**Two invocation traps, both hit on 2026-08-05:**
1. **Run `cline` from PowerShell, never the Bash tool** — there is no working bash shim,
   and a Bash invocation dies with `command not found` while the wrapping command still
   exits 0, so it looks like a silent no-op run.
2. **Never pass a long prompt as an argument.** PowerShell splits it on newlines and
   cline rejects it (`Unknown command or unquoted prompt`). Write the spec to
   `scratchpad/cline-prompt-<x>.md` and pass a ONE-LINE prompt telling Cline to read that
   file and follow it exactly. More robust and it survives any quoting.

**Do not edit files while a Cline run is still in flight.** Cline writes the file again
when it finishes and will silently clobber your edit — this cost a wrong-diagnosis cycle
on 2026-08-05 (an absolutize fix vanished, and the symptom looked like a Remotion bug).
Wait for the completion notification, then edit.

## Baseline gates
`pnpm -r typecheck`, `pnpm -r test` (vitest in `@adgen/core`, `@adgen/worker` and now
`@adgen/web` — **550 tests as of 2026-08-13** (core 302, web 192, worker 56), covering the montage chain, caption/cost
logic, approved scripts, the OpenRouter provider, the matrix pipeline end to end with a fake
renderer, R2 signed-URL generation, the SSRF guard and admin identification, the ad-length cost ceiling, the yt-dlp search parser + the shell-free `runYtDlp` argv contract, the password checklist, the rate limiter's fail-open behaviour, the provider factory including `mockProviderSlots()`, the Lambda renderer's ownership transfer + its progress-aware timeout and fetch-retry, the LOCAL Remotion renderer's ownership + temp-cleanup contract, the worker's voice-id fallback + image-ads prompt builder, the ElevenLabs voice provider, the RealScraper heuristics + SSRF redirect guard, the kie.ai/fal.ai router fallback contract, and the worker job state machine's charge/refund/rollback), and
`pnpm --filter @adgen/web build` must pass before calling anything done.

**Stop the dev server before running the web build.** `next build` and `next dev` share
`apps/web/.next`; building while dev is up 404s `main-app.js`, kills hydration, and serves
pages with NO stylesheet — which has now cost three separate debugging detours, once producing
an audit that reported every element as unstyled. Provider reality as of 2026-08-10: **kie.ai, fal.ai, ElevenLabs and
OpenRouter have all been called live** (see `INFRASTRUCTURE.md` F5); **R2 and Remotion
Lambda are still CODE-COMPLETE and have never been called with a real key** — treat those
two as unverified until a real call happens. Billing no longer exists at all: Lemon Squeezy
was deleted 2026-08-10 and nothing replaced it.
