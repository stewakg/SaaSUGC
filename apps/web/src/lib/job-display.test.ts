/**
 * Tests for the "Moje reklame" money-display helpers. The one that matters is
 * costLabel: it must never show a bare credit figure for a job that was not
 * `done`, because the worker charges on success only — anything else has not
 * been billed, and showing "N kredita" reads as if it had (a real bug once).
 */
import { describe, it, expect } from 'vitest';
import { creditsLabel } from '@adgen/core/pricing';
import { costLabel, humanError } from './job-display.ts';

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
