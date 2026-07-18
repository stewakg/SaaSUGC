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

## Sources of truth
- `INFRASTRUCTURE.md` — phases F0–F7 with checkboxes. THE status file.
- `SESSION_LOG.md` — per-session intent / next steps / gotchas.
- `handover.md` — older one-shot snapshot (2026-07-18); useful context but cross-check
  against git before trusting — parts have drifted.
- `howto.md` / `ACCOUNTS.md` — VPS access; which account maps to which env var.

## Code changes go through Cline
Established flow: Claude writes a complete, self-contained prompt (exact file paths,
find/replace, rationale, definition-of-done) → the owner runs it in Cline (VS Code) →
Claude reviews the diff. Claude edits app code directly only when asked. Meta/workflow
docs (this file, `SESSION_LOG.md`) Claude may edit directly.

## Baseline gates
`pnpm -r typecheck` and `pnpm --filter @adgen/web build` must pass before calling
anything done. All F5/F6 real providers (kie.ai/fal.ai/Claude/ElevenLabs/R2/Lambda/
LemonSqueezy) are CODE-COMPLETE but have NEVER been called with a real key — treat
them as unverified until a real call happens.
