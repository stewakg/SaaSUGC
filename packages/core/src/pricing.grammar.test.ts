/**
 * A few specific boundary numbers the task called out for creditsWord/
 * creditsLabel that pricing.plural.test.ts does not already assert on the
 * nose: 12 (in the same "always plural" bucket as 2-4 but never checked by
 * name), and creditsLabel at 0/12/21/101 pairing the digit with the word
 * (pricing.plural.test.ts checks creditsLabel only for 1/15/11).
 *
 * Not re-asserting 1/2/3/4/5/11/21/101/111 word-only cases — those are
 * already exact-matched in pricing.plural.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { creditsLabel, creditsWord } from './pricing.ts';

describe('creditsWord — the one number pricing.plural.test.ts does not name', () => {
  it('12 is plural, same bucket as 2-4, not the endsInOne exception', () => {
    expect(creditsWord(12)).toBe('kredita');
  });
});

describe('creditsLabel — number+word pairing at every boundary the task named', () => {
  it('0 kredita', () => {
    expect(creditsLabel(0)).toBe('0 kredita');
  });

  it('2 kredita, 3 kredita, 4 kredita, 5 kredita', () => {
    expect(creditsLabel(2)).toBe('2 kredita');
    expect(creditsLabel(3)).toBe('3 kredita');
    expect(creditsLabel(4)).toBe('4 kredita');
    expect(creditsLabel(5)).toBe('5 kredita');
  });

  it('12 kredita (11-14 are all plural, including this one)', () => {
    expect(creditsLabel(12)).toBe('12 kredita');
  });

  it('21 kredit (ends in 1, not 11)', () => {
    expect(creditsLabel(21)).toBe('21 kredit');
  });

  it('22 kredita (ends in 2, plural)', () => {
    expect(creditsLabel(22)).toBe('22 kredita');
  });

  it('101 kredit, 111 kredita — the hundreds repeat the same 1 / 11 split as the units', () => {
    expect(creditsLabel(101)).toBe('101 kredit');
    expect(creditsLabel(111)).toBe('111 kredita');
  });
});
