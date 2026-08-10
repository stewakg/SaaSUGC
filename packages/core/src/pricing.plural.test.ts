import { describe, it, expect } from 'vitest';
import { creditsLabel, creditsWord } from './pricing.ts';

describe('creditsWord — Serbian plural for "kredit"', () => {
  it('uses the singular for numbers ending in 1', () => {
    expect(creditsWord(1)).toBe('kredit');
    expect(creditsWord(21)).toBe('kredit');
    expect(creditsWord(101)).toBe('kredit');
    expect(creditsWord(721)).toBe('kredit');
  });

  it('uses the plural for 11, which is the exception to that rule', () => {
    expect(creditsWord(11)).toBe('kredita');
    expect(creditsWord(111)).toBe('kredita');
    expect(creditsWord(211)).toBe('kredita');
  });

  it('uses the plural everywhere else, including 2-4 and 5+', () => {
    for (const n of [0, 2, 3, 4, 5, 9, 10, 15, 22, 100, 708]) {
      expect(creditsWord(n)).toBe('kredita');
    }
  });

  it('pairs the number with the right word', () => {
    expect(creditsLabel(1)).toBe('1 kredit');
    expect(creditsLabel(15)).toBe('15 kredita');
    expect(creditsLabel(11)).toBe('11 kredita');
  });

  it('is not confused by a negative or fractional input', () => {
    // Ledger deltas are negative for spends, and a caller could hand one over.
    expect(creditsWord(-1)).toBe('kredit');
    expect(creditsWord(-15)).toBe('kredita');
    expect(creditsWord(1.9)).toBe('kredit');
  });
});
