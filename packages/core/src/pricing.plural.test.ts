import { describe, it, expect } from 'vitest';
import { creditsLabel, creditsWord, freeVideosLabel, SIGNUP_BONUS_CREDITS } from './pricing.ts';

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

describe('freeVideosLabel — Serbian plural for the signup offer', () => {
  it('1 and other numbers ending in 1 take the singular adjective and noun', () => {
    expect(freeVideosLabel(1)).toBe('1 besplatan video');
    expect(freeVideosLabel(21)).toBe('21 besplatan video');
    expect(freeVideosLabel(101)).toBe('101 besplatan video');
  });

  it('2-4 take the paucal — the form the current copy is hard-coded to', () => {
    expect(freeVideosLabel(2)).toBe('2 besplatna videa');
    expect(freeVideosLabel(3)).toBe('3 besplatna videa');
    expect(freeVideosLabel(4)).toBe('4 besplatna videa');
    expect(freeVideosLabel(34)).toBe('34 besplatna videa');
  });

  it('5 and up take the genitive plural', () => {
    for (const n of [0, 5, 9, 10, 25, 100]) {
      expect(freeVideosLabel(n)).toBe(`${n} besplatnih videa`);
    }
  });

  it('11-14 take the five-plus form despite ending in 1-4', () => {
    for (const n of [11, 12, 13, 14, 111, 213]) {
      expect(freeVideosLabel(n)).toBe(`${n} besplatnih videa`);
    }
  });

  it('the shipped SIGNUP_BONUS_CREDITS renders correctly today', () => {
    // The whole point: this must stay right if the constant is ever changed.
    expect(freeVideosLabel(SIGNUP_BONUS_CREDITS)).toBe(`${SIGNUP_BONUS_CREDITS} besplatna videa`);
  });
});
