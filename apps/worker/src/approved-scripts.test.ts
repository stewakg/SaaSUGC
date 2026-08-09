/**
 * These inputs come from the browser, so the tests are mostly about what
 * happens when they're wrong — a bad payload must degrade to normal generation
 * or drop the bad entry, never crash the pipeline after the credit check.
 */
import { describe, expect, it } from 'vitest';
import { approvedScripts, speakerGenderOf, MAX_SCRIPT_CHARS } from './approved-scripts.ts';

const ok = { angle: 'hitnost', script: 'Požuri, akcija traje još tri dana!', estDurationSec: 9 };

describe('approvedScripts', () => {
  it('passes through well-formed entries', () => {
    expect(approvedScripts([ok])).toEqual([ok]);
  });

  it('returns null for anything that is not a non-empty array, so the worker generates normally', () => {
    for (const bad of [undefined, null, [], {}, 'scripts', 42, [{}], [{ script: '   ' }]]) {
      expect(approvedScripts(bad)).toBeNull();
    }
  });

  it('drops bad entries instead of failing the whole batch', () => {
    const parsed = approvedScripts([ok, { angle: 'nema teksta' }, null, 'string', { script: '' }]);
    expect(parsed).toEqual([ok]);
  });

  it('defaults a missing angle and a nonsensical duration', () => {
    const parsed = approvedScripts([{ script: 'Tekst.' }, { script: 'Tekst.', estDurationSec: -3 }]);
    expect(parsed?.[0].angle).toBe('korisnikova skripta');
    expect(parsed?.every((p) => p.estDurationSec === 15)).toBe(true);
  });

  it('caps script length — ElevenLabs bills per character, so this is a cost control', () => {
    const parsed = approvedScripts([{ script: 'a'.repeat(MAX_SCRIPT_CHARS * 3) }]);
    expect(parsed?.[0].script.length).toBe(MAX_SCRIPT_CHARS);
  });

  it('keeps Serbian diacritics intact', () => {
    const srp = { angle: 'ugao', script: 'Šalje se pouzećem, plaćaš tek kad stigne.', estDurationSec: 8 };
    expect(approvedScripts([srp])?.[0].script).toBe(srp.script);
  });
});

describe('speakerGenderOf', () => {
  it('accepts only the two valid values', () => {
    expect(speakerGenderOf('male')).toBe('male');
    expect(speakerGenderOf('female')).toBe('female');
  });

  it('treats anything else as no instruction rather than guessing', () => {
    for (const bad of ['MALE', 'muski', '', null, undefined, 1, {}]) {
      expect(speakerGenderOf(bad)).toBeUndefined();
    }
  });
});
