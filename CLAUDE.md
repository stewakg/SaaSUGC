# CLAUDE.md — how to work in this repo

**Project:** AdGen — Serbian/Balkan AI video/image ad-generator SaaS. Mock-first pnpm
monorepo: `apps/web`, `apps/worker`, `packages/core`, `packages/db`, `remotion`. Serbian UI copy.

## Two-account workflow (read this first)
The owner alternates between **two Claude Code accounts on the SAME machine and SAME
folder** — just logs out and back in. The working tree is therefore already shared;
there is **nothing to sync for code**. What does NOT survive the account switch is
*intent* — why the last session did what it did, and what's next. That lives in
`SESSION_LOG.md`.

## Start-of-session ritual
1. Read the **top entry** of `SESSION_LOG.md` (newest first).
2. Run `git log --oneline -15` and `git status -s` to see what actually changed.
3. **Do NOT re-read source files wholesale to "get oriented."** The log + git already
   tell you the state. Read a source file only when you're about to change or reason
   about that specific file.

## End-of-session ritual
1. Append a new dated block to the **top** of `SESSION_LOG.md` — append-only, never
   rewrite old blocks.
2. Commit with a clear message. Pushing to `origin/main` is optional backup (same
   folder = no sync needed across accounts).

## Log discipline (this is what stops the doc from lying)
Every claim in `SESSION_LOG.md` marks its verification level and anchors to a commit
hash or `file:line`, never a vague statement:
- **VERIFIED** — typecheck/build passed, or run live.
- **CODE-COMPLETE** — written + typechecks, but NEVER run against the real thing.

`handover.md` drifted exactly by blurring this (it claims the kie.ai/fal.ai client
"exists" — it does not; `packages/core/src/providers/factory.ts` still throws from
`loadReal('ai')`). Don't repeat that.

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
- `handover.md` — older one-shot snapshot (2026-07-18); useful context but cross-check
  against git before trusting — parts have drifted.
- `howto.md` / `ACCOUNTS.md` — VPS access; which account maps to which env var.

## Code changes go through Cline (CLI-automated, since 2026-07-21)
Claude launches Cline **itself** via the `cline` CLI — the owner no longer copy-pastes
prompts. Invocation: `cline --json -c "<repo>" "<self-contained task>"` (act mode,
`--auto-approve` default true; add `--thinking medium|high` for multi-step tasks and
`-t <sec>` as a safety cap sized to the task; run long tasks in the background).
Provider is z.ai GLM-5.2 (`~/.cline/data/settings/providers.json` — `cline config` needs
a TTY, so read that file directly; never print its apiKey). GLM-5.2 is weaker than
Claude → keep each task explicit and mechanical: one clearly-scoped unit, exact file
paths, full code/commands, and a "definition of done". Have Cline write its report to
`CLINE_REPORT.md`; audit every run via the `--json` stream + `git diff` + the changed
files — never trust Cline's self-report on non-deterministic work. Cline auto-reads a
`.clinerules` file in the cwd if present. Claude edits app code directly only when
asked; meta/workflow docs (this file, `SESSION_LOG.md`) Claude may edit directly.

## Baseline gates
`pnpm -r typecheck`, `pnpm -r test` (vitest in `@adgen/core` + `@adgen/worker` — 25 tests
as of 2026-07-20, covering the montage chain + caption/cost logic), and
`pnpm --filter @adgen/web build` must pass before calling anything done. All F5/F6 real providers (kie.ai/fal.ai/Claude/ElevenLabs/R2/Lambda/
LemonSqueezy) are CODE-COMPLETE but have NEVER been called with a real key — treat
them as unverified until a real call happens.
