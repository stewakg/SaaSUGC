import { describe, it, expect } from 'vitest';
import { computeJobCost, JOB_COST, CREDIT_PACKS, eurLabel, pricePerCredit } from './pricing.ts';

describe('computeJobCost', () => {
  it('defaults to a count of 1', () => {
    expect(computeJobCost('matrix')).toBe(JOB_COST.matrix);
  });

  it('multiplies the per-job unit by the count', () => {
    expect(computeJobCost('matrix', 5)).toBe(JOB_COST.matrix * 5);
    expect(computeJobCost('matrix', 15)).toBe(JOB_COST.matrix * 15);
  });

  it('treats non-positive counts as 1', () => {
    expect(computeJobCost('matrix', 0)).toBe(JOB_COST.matrix);
    expect(computeJobCost('matrix', -3)).toBe(JOB_COST.matrix);
  });

  it('floors a fractional count', () => {
    expect(computeJobCost('matrix', 2.9)).toBe(JOB_COST.matrix * 2);
  });

  it('uses the right unit per job type', () => {
    expect(computeJobCost('image_ads', 3)).toBe(JOB_COST.image_ads * 3);
  });
});

describe('eurLabel', () => {
  it('formats with a comma, two decimals and a NON-BREAKING space before €', () => {
    expect(eurLabel(4.5)).toBe('4,50\u00A0€');
    // The exact mistake this helper exists to prevent: a plain ASCII space
    // before € is invisible in a diff and breaks the "never wrap apart" rule.
    expect(eurLabel(4.5)).not.toContain(' €');
  });

  it('pads whole and one-decimal amounts to two decimals', () => {
    expect(eurLabel(72)).toBe('72,00\u00A0€');
    expect(eurLabel(13.5)).toBe('13,50\u00A0€');
    expect(eurLabel(0)).toBe('0,00\u00A0€');
  });
});

describe('pricePerCredit', () => {
  it('counts the bonus — pack_creator is 100 + 10 credits for €13.50', () => {
    const creator = CREDIT_PACKS.find((p) => p.id === 'pack_creator')!;
    expect(pricePerCredit(creator)).toBeCloseTo(0.1227, 4);
  });

  it('is exactly 0.15 for the bonus-free starter pack (30 credits, €4.50)', () => {
    const starter = CREDIT_PACKS.find((p) => p.id === 'pack_starter')!;
    expect(pricePerCredit(starter)).toBe(0.15);
  });

  it('never goes up as the pack gets bigger — bulk discount is the whole shape of the price list', () => {
    // Compared in the array's own order (small to large today): a future typo
    // that makes a bigger pack worse value per credit must fail here.
    const rates = CREDIT_PACKS.map(pricePerCredit);
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeLessThanOrEqual(rates[i - 1]);
    }
  });
});
