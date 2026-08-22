/**
 * 30-day retention — the rules behind the promise both legal pages make
 * ("Fajlove čuvamo 30 dana … posle 30 dana brišu se automatski").
 *
 * Two kinds of suite here:
 *  - the pure rules: what ages out, what never does, when "gone" starts;
 *  - THE GUARD: the describe named `every storage prefix the app writes is
 *    either expiring or permanent` reads the REAL source files and extracts
 *    every storage prefix the app currently writes, so adding a new prefix
 *    without adding a rule turns this file red.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EXPIRING_PREFIXES,
  PERMANENT_PREFIXES,
  RETENTION_DAYS,
  RETENTION_MS,
  expiresAtMs,
  isExpired,
  isExpiringKey,
  isPermanentKey,
  lifecycleRules,
} from './retention.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('previews are catalogue content, never customer data', () => {
  it('a voice preview key is permanent and not covered by any expiring prefix', () => {
    expect(isPermanentKey('previews/voices/abc.mp3')).toBe(true);
    expect(isExpiringKey('previews/voices/abc.mp3')).toBe(false);
  });

  it('NO rule from lifecycleRules() has a Prefix that a voice-preview key starts with', () => {
    // Asserted against the literal key, not just the PERMANENT_PREFIXES
    // constant: this is the test that stops someone deleting the voice
    // catalogue, so it must not stay green merely because a constant was
    // renamed or a list emptied.
    const rules = lifecycleRules();
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect('previews/voices/x.mp3'.startsWith(rule.Filter.Prefix)).toBe(false);
    }
  });
});

describe('lifecycleRules — one Enabled 30-day rule per expiring prefix', () => {
  const rules = lifecycleRules();

  it('has exactly one rule per expiring prefix, in the same order', () => {
    expect(rules.map((r) => r.Filter.Prefix)).toEqual([...EXPIRING_PREFIXES]);
  });

  it('every rule is Enabled and expires after RETENTION_DAYS', () => {
    for (const rule of rules) {
      expect(rule.Status).toBe('Enabled');
      // The literal pins the legal promise; the constant pins the linkage —
      // changing RETENTION_DAYS must be a deliberate act that fails this test.
      expect(rule.Expiration.Days).toBe(30);
      expect(rule.Expiration.Days).toBe(RETENTION_DAYS);
    }
  });

  it('rule IDs are unique and derive from the prefix', () => {
    const ids = rules.map((r) => r.ID);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('adgen-retention-uploads');
    expect(ids).toContain('adgen-retention-remove-text');
  });
});

describe('isExpired — fails closed at a >= boundary', () => {
  const now = Date.UTC(2026, 7, 22); // fixed clock: 2026-08-22, so the cases are exact

  it('a 29-day-old file is still alive', () => {
    expect(isExpired(new Date(now - 29 * DAY_MS), now)).toBe(false);
  });

  it('exactly 30 days counts as expired — the boundary is inclusive', () => {
    expect(isExpired(new Date(now - RETENTION_MS), now)).toBe(true);
  });

  it('31 days is expired', () => {
    expect(isExpired(new Date(now - 31 * DAY_MS), now)).toBe(true);
  });

  it('an unparseable date is expired — fail CLOSED', () => {
    expect(isExpired('not-a-date', now)).toBe(true);
    expect(isExpired('', now)).toBe(true);
  });
});

describe('expiresAtMs', () => {
  it('a valid ISO string expires exactly RETENTION_MS after creation', () => {
    const iso = '2026-08-01T12:00:00.000Z';
    expect(expiresAtMs(iso)).toBe(new Date(iso).getTime() + RETENTION_MS);
  });
});

/* ============================================================================
   THE GUARD. Reads the real source files and extracts every storage prefix
   the app writes, so a new prefix without a rule (or on neither list) turns
   the suite red. The regexes are the two shapes a prefix appears in: a
   template-literal storage key, and a string argument to deps.persist(…).
   ========================================================================== */

// Repo root from this file: packages/core/src → three levels up, the same
// resolution storage-path.test.ts uses.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Every file the app currently writes storage keys from. */
const SCAN_TARGETS = [
  'apps/worker/src/pipelines.ts',
  'packages/core/src/providers/voice.elevenlabs.ts',
  'packages/core/src/providers/renderer.lambda.ts',
  'packages/core/src/providers/renderer.local.ts',
  'apps/web/src/app/api/upload/route.ts',
  'apps/web/src/app/api/upload/sign/route.ts',
  'apps/web/src/app/api/import-clip/route.ts',
];

// a template-literal storage key: `renders/${…}`, `voice/${…}`, `uploads/${user.id}/…`
const TEMPLATE_KEY = /`([a-z][a-z0-9-]*)\/(?:\$\{|[a-z0-9-]+\/?\$\{)/g;
// a prefix passed as a string argument: deps.persist(remoteUrl, 'enhance')
const PERSIST_ARG = /persist\([^,]+,\s*'([a-z][a-z0-9-]*)'\s*\)/g;

/** Every prefix the scan found, deduplicated. Computed once, asserted twice. */
const found = new Set<string>();
for (const rel of SCAN_TARGETS) {
  const text = readFileSync(path.join(REPO_ROOT, rel), 'utf8');
  for (const m of text.matchAll(TEMPLATE_KEY)) found.add(m[1]);
  for (const m of text.matchAll(PERSIST_ARG)) found.add(m[1]);
}

describe('every storage prefix the app writes is either expiring or permanent', () => {
  it('the scan still sees the real call sites — a guard that captures nothing is worthless', () => {
    expect(found.size).toBeGreaterThanOrEqual(5);
    for (const expected of ['uploads', 'renders', 'voice', 'enhance']) {
      // If a refactor moved a call site so the regexes miss it, FIX THE
      // REGEXES — never this assertion, and never the scanned source files.
      expect(
        found.has(expected),
        `scan no longer finds "${expected}/" — fix the scan regexes, not this assertion`,
      ).toBe(true);
    }
  });

  it('every captured prefix is on one of the two lists in retention.ts', () => {
    const known = new Set<string>([...EXPIRING_PREFIXES, ...PERMANENT_PREFIXES]);
    const unknown = [...found].filter((p) => !known.has(`${p}/`));
    expect(
      unknown,
      `the app writes storage under ${unknown.map((p) => `${p}/`).join(', ')} but it is on neither ` +
        `list — add it to EXPIRING_PREFIXES or PERMANENT_PREFIXES in packages/core/src/retention.ts`,
    ).toEqual([]);
  });
});

