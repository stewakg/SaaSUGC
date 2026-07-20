import { describe, it, expect } from 'vitest';
import { computeJobCost, JOB_COST } from './pricing.ts';

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
