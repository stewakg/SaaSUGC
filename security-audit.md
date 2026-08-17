# Security-Only Audit — AdGen (SaaSUGC) — Rev. 3

**Date:** 2026-08-17 · **Head audited:** `3088624` · **Rev. 2:** `ca8319c` · **Rev. 1:** `1808b67`
**Method:** attacker-model walkthrough; every runtime claim **verified by execution** (probe v2 below, BullMQ defaults from the installed package, gates re-run). Deployment facts only the owner can reach are attributed as such.

**Gates at HEAD (run fresh):** web **593/593** this session (41 files); core 385/385 and worker 123/123 verified at `ca8319c` (no changes to those packages since — `3088624` touched only `safe-url.ts` + tests + migration). Total **1101**, matching the owner's count.

---

## 0. Status of Rev. 2 findings at `3088624` — all execution-verified

| Rev. 2 finding                           | Status at `3088624`                                                    | Probe evidence (v2, real output)                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Unmapped `::1` unabbreviated bypass      | **CLOSED** — whole v6 path now judged numerically from expanded groups | `0:0:0:0:0:0:0:1`, `0000:…:0001`, `::0.0.0.1`, `0:0:…:0.0.0.1` → private ✅                       |
| Mixed-case hex                           | **CLOSED** (addr lowercased before parse)                              | `::FFFF:7F00:1`, `Fe80::1`, `Fd12::1` → private ✅                                                |
| Over-long padding                        | **CLOSED, fails closed**                                               | `00000::1`, `0:…:00001` → private (unparseable ⇒ blocked) ✅; valid padded spellings → private ✅ |
| NAT64 64:ff9b::/96                       | **CLOSED both directions**                                             | `64:ff9b::7f00:1` → private ✅; `64:ff9b::808:808` (8.8.8.8) → public ✅ (no false positive)      |
| fc00::/7, fe80::/10 by mask              | **CLOSED**                                                             | all spellings pass ✅                                                                             |
| `::a.b.c.d` (v4-compatible) judged as v4 | **CLOSED**                                                             | `::0a00:1` (10.0.0.1) → private ✅                                                                |
| Mapped `::ffff:` all spellings           | stays closed                                                           | full battery re-passed ✅                                                                         |
| Double-charge                            | **migration 0011 written, NOT yet applied** — adjudicated in §2        | —                                                                                                 |

The owner's probe claim (22 private blocked, 8 public allowed incl. NAT64-embedded 8.8.8.8) **reproduces** under my independent 60+ case battery. `3088624` is deployed (owner-verified via the `0xff9b` constant present in the production bundle — a positive check, correctly not claimed as a functional probe of the live host).

## 1. 🟠 NEW (execution-verified): 6to4 `2002::/16` embeds private v4 and reads public — the owner's hunch was right

**Probe v2 output (verbatim):**

```
FAIL  private(2002:0a00:0001::1)  [6to4 10.0.0.1]        (got false, want true)
FAIL  private(2002:a00:1::1)      [6to4 10.0.0.1]        (got false, want true)
FAIL  private(2002:7f00:1::1)     [6to4 127.0.0.1]       (got false, want true)
FAIL  private(2002:A9FE:A9FE::1)  [6to4 169.254.169.254] (got false, want true)
PASS  public (2002:0808:0808::1)  [6to4 8.8.8.8]         (got false, want false) ✓ no false positive
```

**Cause:** `3088624` handles mapped (`::ffff:`), v4-compatible (`::`), and NAT64 (`64:ff9b::`) numerically — but 6to4 (`2002::/16`, RFC 3056) is not in the list. The embedded IPv4 lives in groups 1–2; `2002:0a00:0001::…` is the 6to4 spelling of 10.0.0.1, `2002:a9fe:a9fe::1` is metadata.

**Reachability (honest):** lower than the previous three. Exploiting it needs (a) the DNS path on `/api/scrape` (import is fronted by the platform whitelist) — same as before — AND (b) the **host to actually route 2002::/16**. Modern Hetzner/cloud images do not configure 6to4 relay routing by default, so the socket would typically fail to connect rather than reach the embedded address. This is defense-in-depth completeness, not a live exploit today — but it is the fifth member of the same family, and the fix is two lines in the code that already exists:

```ts
// 6to4 (2002::/16): embedded v4 in groups 1-2.
if (g[0] === 0x2002) return isPrivateAddress(v4FromGroups(g[1], g[2]));
```

**Same-family observations (probe NOTEd, not failures):**

- **Teredo `2001:0::/32`**: client v4 sits bit-inverted in the last two groups; `2001:0::807f:fffe` encodes 127.0.0.1 → reads public. Decoding is fiddly (obfuscation); the pragmatic call is to treat the whole prefix as public-but-watch, or block it — Teredo to a _private_ address is not a legitimate product case, so `if (g[0] === 0x2001 && g[1] === 0) return true;` is defensible and simpler than decoding.
- **Operator NAT64 prefixes** (e.g. `64:ffff::/96`, site-local `/96`s): read public. Only the well-known prefix is handled. On this Hetzner deployment no operator NAT64 exists; if the infra ever moves behind NAT64/DNS64 (some managed platforms do), revisit.

## 2. Migration 0011 — adjudication of the owner's two claims (as requested)

**(a) "The index guarantees the customer is never billed twice, because 0005 inserts the ledger row BEFORE updating the balance, so a unique_violation aborts before any deduction." — CONFIRMED, with the reasoning verified against the SQL.**

`0005_charge_credits_per_stage.sql` order: `insert … returning id` (L43–45) → `update profiles … balance = balance - p_amount … and balance >= p_amount` (L47+) → `if not found then delete … raise` (L56–57). A partial unique index on `(job_id) where reason='job_spend'` fires at the **insert**, i.e. before the balance update is even planned. A PL/pgSQL function runs inside the caller's transaction; an unhandled `unique_violation` aborts the function body and surfaces to supabase-js as an RPC error — **no partial state**: no ledger row, no balance delta, nothing to roll back. (The existing `if not found` cleanup is a _different_ failure — insufficient balance — and remains correct.) The worker's charge-error path then handles the RPC error exactly as it handles any charge failure.

**One nuance beyond both claims — the customer can still end up `charged once, job error, zero assets`:** with 0011 applied and the crash-between-charge-and-done scenario, the re-delivered attempt re-runs the pipeline, inserts assets #2, then hits the unique violation — and the existing charge-failure path runs `db.from('assets').delete().eq('job_id', jobId)`, which deletes **all** assets for the job _including the first attempt's_, then marks the job `error`. Net: the customer paid 15 credits (first charge stands), sees an error, and receives nothing. Not a double-bill — but a "billed for nothing." The reconciliation query in 0011's footer is the right instrument; a refund path for this state is worth a line in the same follow-up ticket as the re-entry guard.

**(b) "It does NOT stop the re-delivered attempt from re-running the pipeline and spending provider credits — that needs a job-status re-entry guard, which is not written yet." — CONFIRMED.** Verified at `3088624`: `processJob` sets `status = 'running'` unconditionally with no check of prior state (`job-state.ts`, the `await db.from('jobs').update({ status: 'running' })` line directly after the row load), and the pipeline runs before any charge. So provider spend (TTS chars, Lambda invocations, R2 copies) happens fully before 0011's rejection fires.

**Shape of the correct guard** (for the ticket): don't gate on `status === 'done'` alone — in this exact crash window the status is `running`, so that check would miss the case. Gate on what 0011 now makes authoritative: at `processJob` entry, `select 1 from credits_ledger where job_id = X and reason = 'job_spend'` — if a row exists, the charge already happened; rebuild `result` from the surviving `assets` rows, mark `done`, release any hold, and return without re-running anything. That converts the failure mode from "charged, error, nothing" to "charged, done, delivered," and eliminates the duplicate provider spend in the same stroke.

## 3. CI scanning — the exact file (owner offered to review)

Complete replacement for `.github/workflows/ci.yml` — the existing job untouched, one new `security` job added:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run typecheck
      - run: pnpm run lint
      # The suites run BEFORE the build: they are the slow-to-write, fast-to-run
      # half of the gate, and a logic regression that typechecks and lints (most
      # of them do) is invisible to every other step here.
      - run: pnpm run test
      - run: pnpm --filter @adgen/web run build

  security:
    runs-on: ubuntu-latest
    permissions:
      security-events: write # CodeQL uploads
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # gitleaks scans history, not just the tip
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      # 1) Known-vulnerable dependencies. High floor: lows are noise at this
      #    stage; raise to moderate once the backlog is clean.
      - run: pnpm audit --audit-level high
      # 2) Secrets anywhere in history. Baseline once locally first
      #    (`gitleaks detect --source . -v`): this repo has had .env near-misses
      #    (.env.bak-*, the dockerignore gap). If an OLD, already-rotated secret
      #    trips it, write a .gitleaks.toml allowlist entry — do not rotate-skip.
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      # 3) CodeQL: taint analysis for TS — the sink-side of XSS/SSRF/injection.
      #    Results land in the Security tab; first run is triage, after that it gates.
      - uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
      - uses: github/codeql-action/analyze@v3
```

Notes for review: `pnpm audit` reads the lockfile and hits the npm registry — CI-only, which is why this audit never ran it locally. Gitleaks v2 needs no extra secret beyond `GITHUB_TOKEN` for public repos. CodeQL is free on public repos; `security-events: write` is required only for it, and the job is kept in one place so a future `permissions` tightening is one edit. Optional extra (not in the file, one line each): Dependabot config for weekly version PRs, and pinning the yt-dlp release in `apps/web/Dockerfile` (currently `releases/latest` — the last unpinned binary entering the web image).

## 4. Residual risk register (Rev. 3)

| #   | Risk                                                                                                                                              | Severity | Notes                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **No TLS/HTTPS**                                                                                                                                  | 🔴       | The one deployment blocker; waits on the domain (unchanged)                                                                            |
| 2   | ~~6to4 `2002::/16` embedded-private-v4 reads public~~ — **FIXED**                                                                                 | ✅       | Closed at `4fc664c`, before this register was written                                                                                  |
| 3   | ~~Teredo `2001:0::/32` reads public~~ — **FIXED 2026-08-18**                                                                                      | ✅       | Closed at `871bae0`. Blocked as a whole prefix rather than decoded (the client v4 is bit-inverted, and every decoding step is another spelling to get wrong — this file has produced five). Mask is BOTH groups: widening it to `g[0]` alone fails three tests including the pre-existing `2001:4860:4860::8888`. **Operator NAT64 prefixes are still open** and deliberately so — only the well-known `64:ff9b::/96` is handled; revisit if the infra ever moves behind NAT64/DNS64 |
| 4   | ~~0011 **not yet applied**~~ — **APPLIED AND PROVEN 2026-08-18**                                                                                  | ✅       | Applied by the owner in the SQL editor of the ACTIVE project `iqfzhnndhhrprkrkfygd` (not the abandoned `gczikdrskcpqqlyzvnby` — two project ids live in this repo's docs and the older one is a trap). Reconciliation ran FIRST: **zero rows**, so no customer had ever been double-charged. Verified in BOTH directions rather than one: `pg_indexes` shows the index carrying its partial `WHERE ((reason = 'job_spend') AND (job_id IS NOT NULL))`, and a rolled-back transaction that tried to duplicate a REAL existing `job_spend` row was refused with `23505 duplicate key … credits_ledger_one_job_spend_per_job`. So it demonstrably REJECTS a second charge rather than merely existing. ⚠️ The migration file's own reconciliation query was wrong and would have errored on first use — it named a column `amount` where the ledger column is `delta` (0005 writes it negative). Corrected in the file |
| 5   | "Charged once, error, nothing": the re-entry guard is written but **NOT DEPLOYED**                                                                | 🟠       | Guard landed 2026-08-18 (`10bd75a`): `processJob` asks the ledger before touching anything and rebuilds an already-charged job from its surviving assets. ⚠️ **Applying 0011 without deploying it makes this state REACHABLE rather than theoretical** — the old worker still re-runs the pipeline, the index now refuses the second charge, and the charge-failure path deletes assets by `job_id`, taking the first attempt's rows with it. Money is correct; delivery is not. One worker deploy closes it, and until then this is the most important open item on the money path |
| 6   | ~~CI scanning absent~~ — **ADDED 2026-08-18**                                                                                                     | 🟡       | `e3ddd57` + `d4f67b2`. Found 26 advisories on its first run, 2 of them false (Remotion criticals naming `<4.0.410` against a lockfile holding 4.0.490, printing an EMPTY dependency path — ignored via `pnpm.auditConfig.ignoreGhsas` with the reason written down). Runtime-path advisories fixed by pinned overrides, **`undici` being the one that mattered**: cheerio fetches customer-supplied URLs with it. **Still red on 10 dev-only findings**, all tracing to two roots that never ship — `vitest` 2.1.9 (pulling vite + esbuild) and `typescript-eslint` (pulling brace-expansion + js-yaml). ⚠️ Ordering flaw found by the job's own first run: `pnpm audit` ran FIRST, failed, and GitHub SKIPPED gitleaks and CodeQL — a dependency backlog silencing the scanners that matter. Audit is last now |
| 7   | Free-tier farming; `enable_confirmations` cloud check                                                                                             | 🟡       | Unchanged                                                                                                                              |
| 8   | No alerting/monitoring; retention sweep; GDPR export/delete; volumetric DoS posture                                                               | 🟡       | Unchanged                                                                                                                              |

## 5. Verdict

Unchanged in substance, now three verified fixes deep: the application layer is genuinely strong and getting stronger each round — this exchange alone closed the unmapped-spelling hole and produced a tested migration for the money path, and the probe-first method has now caught real bugs in code both of us had just reviewed. What stands between this project and a clean bill, in order: **the domain/TLS**, **applying 0011**, **the two-line 6to4 fix**, and the **re-entry guard** that turns 0011's loud failure into a correct outcome. Everything else is hygiene.

## 6. Integrity statement

- No repo file modified; only `security-audit.md` (this file) rewritten. Probe artifacts: `scratchpad/audit-probe.mts` (v1), `scratchpad/audit-probe2.mts` (v2 — the one that matters now), `scratchpad/audit-probe.test.ts` (obsolete draft) — all gitignored, owner may delete.
- Execution evidence: probe v2 run against `3088624`'s real module (results quoted verbatim in §0/§1); migration 0011 and 0005 read in full, adjudications in §2 grounded in the quoted statement order; `job-state.ts` re-entry absence re-verified at HEAD; web suite 593/593 fresh.
- Claims I could not verify from this machine (deployment of 3088624, bucket privacy, live 401s) remain attributed to the owner's stated verification.
