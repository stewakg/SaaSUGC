/**
 * Tests for the "Moje reklame" money-display helpers. The one that matters is
 * costLabel: it must never show a bare credit figure for a job that was not
 * `done`, because the worker charges on success only — anything else has not
 * been billed, and showing "N kredita" reads as if it had (a real bug once).
 *
 * jobFileState is the same bug on the files side: a job that never produced
 * files (error/queued/running) must never be told they were deleted.
 */
import { describe, it, expect } from 'vitest';
import { creditsLabel } from '@adgen/core/pricing';
import { RETENTION_DAYS, RETENTION_MS } from '@adgen/core';
import { costLabel, humanError, jobFileState, expiryCountdownLabel, fileStateLabel } from './job-display.ts';

describe('costLabel', () => {
  it('shows the real credit figure ONLY for a done job', () => {
    expect(costLabel('done', 10)).toBe(creditsLabel(10));
  });

  it('says "nije naplaćeno" for an error job — never a figure', () => {
    const label = costLabel('error', 10);
    expect(label).toBe('nije naplaćeno');
    // The bug this guards: an errored job must not read as if it cost anything.
    expect(label).not.toContain(String(creditsLabel(10)));
  });

  it('marks queued/running as an estimate, not a charge', () => {
    expect(costLabel('queued', 10)).toBe(`procena: ${creditsLabel(10)}`);
    expect(costLabel('running', 10)).toBe(`procena: ${creditsLabel(10)}`);
  });
});

describe('humanError', () => {
  it('strips the machine code prefix, keeping the Serbian message', () => {
    expect(humanError('tool_not_implemented: Alat je u izradi')).toBe('Alat je u izradi');
    expect(humanError('charge_failed: nema dovoljno kredita')).toBe('nema dovoljno kredita');
  });

  it('leaves a message with no code prefix untouched', () => {
    expect(humanError('nema prefiksa ovde')).toBe('nema prefiksa ovde');
  });

  it('falls back to the original when nothing survives stripping the prefix', () => {
    // `code_only:` is all prefix, no message — show it rather than an empty string.
    expect(humanError('code_only:')).toBe('code_only:');
  });
});

/** Fixed clock — every „days ago” below is measured from here, so the suite cannot age out. */
const NOW = Date.parse('2026-06-15T12:00:00Z');
const DAY_MS = RETENTION_MS / RETENTION_DAYS;
const HOUR_MS = 60 * 60 * 1000;

/** A created_at exactly `days` before NOW — built from RETENTION_MS, never a hardcoded 30. */
const daysAgo = (days: number) => new Date(NOW - days * DAY_MS).toISOString();

/** A created_at whose file has `remainingMs` left before the bucket deletes it. */
const expiresIn = (remainingMs: number) => new Date(NOW - (RETENTION_MS - remainingMs)).toISOString();

describe('jobFileState', () => {
  it('a failed job never had files, so it is never told they expired', () => {
    // THE defect: a 40-day-old error row used to read „Fajlovi obrisani — rok
    // od 30 dana je istekao” right next to „nije naplaćeno” — a promise about
    // files that never existed.
    expect(jobFileState('error', daysAgo(40), undefined, NOW)).toBe('none');
  });

  it('an old queued job has no files YET — also none, not expired', () => {
    expect(jobFileState('queued', daysAgo(40), undefined, NOW)).toBe('none');
  });

  it('a done job past the retention boundary is expired', () => {
    expect(jobFileState('done', daysAgo(40), undefined, NOW)).toBe('expired');
  });

  it('expiry wins over a customer deletion — the bucket deleted them either way', () => {
    expect(jobFileState('done', daysAgo(40), true, NOW)).toBe('expired');
  });

  it('a fresh done job the customer emptied is deleted, not expired', () => {
    expect(jobFileState('done', daysAgo(5), true, NOW)).toBe('deleted');
  });

  it('a fresh done job with its files still there is available', () => {
    expect(jobFileState('done', daysAgo(5), undefined, NOW)).toBe('available');
  });
});

describe('expiryCountdownLabel', () => {
  it('rounds the days left DOWN — 6 days and 5 hours reads „6 dana”, never „7”', () => {
    const label = expiryCountdownLabel(expiresIn(6 * DAY_MS + 5 * HOUR_MS), NOW);
    expect(label).toBe('Ističe za 6 dana');
    // Naming a day the file will not survive is the bug this guards against.
    expect(label).not.toBe('Ističe za 7 dana');
  });

  it('reads „Ističe za 7 dana” with 7 days and 23 hours left — inside the window, floored', () => {
    expect(expiryCountdownLabel(expiresIn(7 * DAY_MS + 23 * HOUR_MS), NOW)).toBe('Ističe za 7 dana');
  });

  it('is null with 8 days left — more than a week, the countdown is final-week information', () => {
    expect(expiryCountdownLabel(expiresIn(8 * DAY_MS), NOW)).toBe(null);
  });

  it('says „Ističe sutra” with 1 day and 5 hours left — floored to one whole day', () => {
    expect(expiryCountdownLabel(expiresIn(DAY_MS + 5 * HOUR_MS), NOW)).toBe('Ističe sutra');
  });

  it('says „Ističe danas” with 5 hours left — „sutra” would be a lie before midnight', () => {
    expect(expiryCountdownLabel(expiresIn(5 * HOUR_MS), NOW)).toBe('Ističe danas');
  });

  it('is null once retention has passed — the file-state label takes over', () => {
    expect(expiryCountdownLabel(expiresIn(-DAY_MS), NOW)).toBe(null);
  });
});

describe('fileStateLabel', () => {
  it('the expired string carries the promised number via RETENTION_DAYS — no second 30', () => {
    expect(fileStateLabel('expired')).toBe(`Fajlovi obrisani — rok od ${RETENTION_DAYS} dana je istekao`);
  });

  it('a customer deletion is the bare „Fajlovi obrisani”', () => {
    expect(fileStateLabel('deleted')).toBe('Fajlovi obrisani');
  });

  it('says nothing while files are there, and nothing for jobs that never had files', () => {
    expect(fileStateLabel('available')).toBe(null);
    expect(fileStateLabel('none')).toBe(null);
  });
});
