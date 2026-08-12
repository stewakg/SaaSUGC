/**
 * Tests for the ad-length limits — the ceiling on what one job can cost.
 *
 * These are money tests, not formatting tests. ElevenLabs bills per character
 * and render time is roughly linear in frames, so both halves of a job's cost
 * scale with the same thing: how much speech there is. Before these limits
 * existed, a `count=15` job's worst case was "whatever the model felt like
 * writing", multiplied by fifteen.
 */
import { describe, expect, it } from 'vitest';
import {
  AD_DURATIONS,
  DEFAULT_AD_SECONDS,
  MAX_AD_SECONDS,
  MAX_SCRIPT_CHARS,
  clampScriptForSpeech,
  scriptCharBudget,
  toAdSeconds,
} from './constants.ts';

describe('the limits themselves', () => {
  it('are ad-shaped, not API-shaped', () => {
    // A TikTok/Reels ad is 15-30s. Serbian runs ~14-15 chars per spoken second,
    // so 700 chars is ~45-50s: comfortably above any real ad, and bounded.
    expect(MAX_SCRIPT_CHARS).toBe(700);
    expect(MAX_AD_SECONDS).toBe(60);
    // The character limit must stay reachable inside the duration limit, or the
    // clamp would be the thing cutting ads short rather than the safety net.
    expect(MAX_SCRIPT_CHARS / 15).toBeLessThan(MAX_AD_SECONDS);
  });

  it('bounds the worst case of a full-size job', () => {
    const MAX_COUNT = 15; // MAX_JOB_COUNT in /api/jobs
    expect(MAX_SCRIPT_CHARS * MAX_COUNT).toBe(10_500);
    expect(MAX_AD_SECONDS * MAX_COUNT).toBe(900);
  });
});

describe('clampScriptForSpeech — leaves short scripts alone', () => {
  it('returns a normal ad script untouched', () => {
    const script = 'Ovaj proizvod rešava problem koji imaš svaki dan. Naruči odmah.';
    expect(clampScriptForSpeech(script)).toBe(script);
  });

  it('trims surrounding whitespace but changes nothing else', () => {
    expect(clampScriptForSpeech('  Kratka skripta.  ')).toBe('Kratka skripta.');
  });

  it('passes text of exactly the limit through unchanged', () => {
    const exact = 'a'.repeat(MAX_SCRIPT_CHARS);
    expect(clampScriptForSpeech(exact)).toBe(exact);
  });
});

describe('clampScriptForSpeech — never cuts mid-word', () => {
  it('ends on a sentence when one is available', () => {
    const script = `${'Prva rečenica koja se ponavlja. '.repeat(30)}Poslednja rečenica.`;
    const out = clampScriptForSpeech(script);

    expect(out.length).toBeLessThanOrEqual(MAX_SCRIPT_CHARS);
    expect(out.endsWith('.')).toBe(true);
    // A mid-word cut is audible: the voice reads the fragment and the ad stops
    // in the middle of a syllable.
    expect(script.startsWith(out)).toBe(true);
  });

  it('falls back to a word boundary when there is no sentence break', () => {
    const script = `${'reč '.repeat(400)}kraj`;
    const out = clampScriptForSpeech(script);

    expect(out.length).toBeLessThanOrEqual(MAX_SCRIPT_CHARS);
    expect(out.endsWith(' ')).toBe(false);
    expect(out.split(' ').at(-1)).toBe('reč');
  });

  it('hard-cuts only when the text has no break at all', () => {
    const script = 'x'.repeat(MAX_SCRIPT_CHARS * 2);
    const out = clampScriptForSpeech(script);
    expect(out).toHaveLength(MAX_SCRIPT_CHARS);
  });

  it('does not throw away most of the text to find a break', () => {
    // A single sentence ending early, then a long run — cutting back to that
    // first full stop would discard almost everything the customer paid for, so
    // the word-boundary fallback should win instead.
    const script = `Kratko. ${'reč '.repeat(400)}`;
    const out = clampScriptForSpeech(script);
    expect(out.length).toBeGreaterThan(MAX_SCRIPT_CHARS * 0.5);
  });
});

describe('clampScriptForSpeech — honours an explicit limit', () => {
  it('uses the caller-supplied limit', () => {
    expect(clampScriptForSpeech('Jedan dva tri četiri pet.', 10).length).toBeLessThanOrEqual(10);
  });

  it('preserves Serbian diacritics rather than splitting them', () => {
    const script = 'Šišanje čačkalicom đubretom žvakom ćuretinom '.repeat(40);
    const out = clampScriptForSpeech(script);
    // Every character kept must be one the source actually contained.
    expect(script.startsWith(out)).toBe(true);
    expect(out).toMatch(/[šđčćž]/);
  });
});

describe('toAdSeconds — an untrusted value becomes an offered length', () => {
  it.each([10, 15, 30])('keeps the offered length %i', (s) => {
    expect(toAdSeconds(s)).toBe(s);
  });

  it.each([undefined, null, 0, -5, 7, 23, 45, 999, '15', 'petnaest', {}, NaN])(
    'falls back to the default for %s',
    (v) => {
      // A job enqueued before this setting existed carries no targetSeconds and
      // must still render exactly as it always did.
      expect(toAdSeconds(v)).toBe(DEFAULT_AD_SECONDS);
    },
  );

  it('defaults to 15 seconds', () => {
    expect(DEFAULT_AD_SECONDS).toBe(15);
    expect(AD_DURATIONS).toEqual([10, 15, 30]);
  });
});

describe('scriptCharBudget — the choice is a COST choice', () => {
  it('scales with the chosen length', () => {
    expect(scriptCharBudget(10)).toBe(195);
    expect(scriptCharBudget(15)).toBe(293);
    expect(scriptCharBudget(30)).toBe(585);
  });

  it('makes a 10s ad roughly a third of a 30s one', () => {
    const ratio = scriptCharBudget(30) / scriptCharBudget(10);
    expect(ratio).toBeGreaterThan(2.5);
    expect(ratio).toBeLessThan(3.5);
  });

  it('never exceeds the absolute ceiling, whatever it is asked for', () => {
    expect(scriptCharBudget(600)).toBe(MAX_SCRIPT_CHARS);
    expect(scriptCharBudget(MAX_AD_SECONDS)).toBeLessThanOrEqual(MAX_SCRIPT_CHARS);
  });

  it('never returns a budget too small to say anything', () => {
    // A floor matters: a 1-second budget would produce a script the voice reads
    // as two words, and the customer still pays for the job.
    expect(scriptCharBudget(1)).toBeGreaterThanOrEqual(80);
    expect(scriptCharBudget(0)).toBeGreaterThanOrEqual(80);
  });

  it('is what bounds a full-size job at each length', () => {
    const MAX_COUNT = 15;
    expect(scriptCharBudget(10) * MAX_COUNT).toBe(2_925);
    expect(scriptCharBudget(30) * MAX_COUNT).toBe(8_775);
  });
});
