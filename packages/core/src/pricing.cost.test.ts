/**
 * Exhaustive cost-arithmetic coverage for computeJobCost — the function that
 * decides how many credits a customer is charged (INFRASTRUCTURE.md §3,
 * charge-on-success). pricing.test.ts already covers the mechanics
 * (default count, floor, non-positive→1) using 'matrix' as the example job
 * type; this file's job is the two things that leaves open:
 *
 *   1. every OTHER job type actually wires its own unit cost through
 *      computeJobCost, with exact expected numbers (a copy-paste error in
 *      JOB_COST would silently undercharge or overcharge one tool only);
 *   2. the matrix `count` multiplier at the wizard's real boundary values
 *      (5/10/15), MAX_JOB_COUNT (defined in apps/web/src/app/api/jobs/route.ts,
 *      not here) and above it, plus a NaN count — the shape a failed
 *      `Number(...)` parse would take if it ever reached this function directly.
 */
import { describe, it, expect } from 'vitest';
import { computeJobCost, JOB_COST, JOB_DESCRIPTORS, getJobDescriptor } from './pricing.ts';
import type { JobType } from './types.ts';

// Hardcoded, not read from JOB_COST — the point is to fail if pricing.ts
// changes a number without anyone meaning to. Copied by hand from the
// source comments in pricing.ts on the day this file was written.
const EXPECTED_UNIT_COST: Record<JobType, number> = {
  image_ads: 4,
  matrix: 15,
  edit: 18,
  enhance: 9,
  mix: 12,
  quick_test: 2,
  translate: 15,
  remove_text: 6,
  ai_video: 25,
  revoice: 8,
};

describe('computeJobCost — every job type, exact numbers', () => {
  for (const [type, expected] of Object.entries(EXPECTED_UNIT_COST) as [JobType, number][]) {
    it(`${type} costs exactly ${expected} credit(s) at count=1`, () => {
      expect(computeJobCost(type, 1)).toBe(expected);
      expect(computeJobCost(type)).toBe(expected); // default count also = 1
    });
  }

  it('multiplies a non-matrix job type by count too, not just matrix', () => {
    expect(computeJobCost('image_ads', 3)).toBe(4 * 3);
    expect(computeJobCost('enhance', 4)).toBe(9 * 4);
    expect(computeJobCost('translate', 2)).toBe(15 * 2);
  });

  it('falls back to 0 for a job type JOB_COST does not recognize', () => {
    // computeJobCost does `JOB_COST[type] ?? 0` — an unknown type must never
    // silently pick up someone else's price.
    expect(computeJobCost('nonexistent_tool' as JobType, 5)).toBe(0);
  });
});

describe('computeJobCost — matrix count multiplier at the wizard boundaries', () => {
  const unit = JOB_COST.matrix;

  it('offers 5/10/15 (competitor parity, INFRASTRUCTURE.md)', () => {
    expect(computeJobCost('matrix', 5)).toBe(unit * 5);
    expect(computeJobCost('matrix', 10)).toBe(unit * 10);
    expect(computeJobCost('matrix', 15)).toBe(unit * 15);
  });

  it('does NOT cap at MAX_JOB_COUNT (15) itself — computeJobCost has no ceiling', () => {
    // The 15-item cap is enforced only in apps/web/src/app/api/jobs/route.ts
    // (`if (count > MAX_JOB_COUNT) return 400`), one layer above this
    // function. computeJobCost will happily price a count of 16 or 1000 if
    // anything ever calls it without going through that route. Documented
    // here so the gap is visible, not silently assumed away.
    expect(computeJobCost('matrix', 16)).toBe(unit * 16);
    expect(computeJobCost('matrix', 1000)).toBe(unit * 1000);
  });

  it('treats 0, negative and fractional counts as they already are documented to (pricing.test.ts), for a second job type', () => {
    expect(computeJobCost('edit', 0)).toBe(JOB_COST.edit);
    expect(computeJobCost('edit', -7)).toBe(JOB_COST.edit);
    expect(computeJobCost('edit', 3.99)).toBe(JOB_COST.edit * 3);
  });

  it('a NaN count (the shape of a failed Number() parse) does not throw, but produces NaN — callers must guard before this function, not after', () => {
    // Math.floor(NaN) is NaN, and Math.max(1, NaN) is NaN per the JS spec, so
    // the multiplication propagates NaN rather than clamping to 1. Both real
    // callers (apps/web/api/jobs/route.ts's Number.isInteger check, and
    // runMatrixPipeline's `typeof === 'number' && > 0` check) already filter
    // NaN out before reaching computeJobCost — this test exists so that if a
    // future caller skips that guard, the failure mode (NaN credits charged,
    // which compares false against any balance check) is documented rather
    // than assumed impossible.
    expect(Number.isNaN(computeJobCost('matrix', NaN))).toBe(true);
  });
});

describe('computeJobCost / getJobDescriptor / JOB_COST stay in sync', () => {
  it('every descriptor.cost equals JOB_COST for its type — no descriptor hardcodes a stale price', () => {
    for (const d of JOB_DESCRIPTORS) {
      expect(d.cost).toBe(JOB_COST[d.type]);
    }
  });

  it('getJobDescriptor returns the same cost computeJobCost(type, 1) would charge', () => {
    for (const type of Object.keys(JOB_COST) as JobType[]) {
      expect(getJobDescriptor(type).cost).toBe(computeJobCost(type, 1));
    }
  });

  it('getJobDescriptor throws (does not silently return undefined) for an unknown type', () => {
    expect(() => getJobDescriptor('nonexistent_tool' as JobType)).toThrow(/Unknown job type/);
  });
});
