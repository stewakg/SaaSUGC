/**
 * Tests for the credit rule — the single money check shared by the web app
 * (balance check before enqueue) and the worker (charge-on-success,
 * INFRASTRUCTURE.md §3). canAfford is literally `balance >= computeJobCost`,
 * but the tests below treat it as the question that matters: did we let
 * someone start a job they cannot pay for, or block someone who can?
 *
 * pricing.cost.test.ts already pins the exact cost numbers; this file derives
 * every cost from JOB_COST / computeJobCost so it tracks pricing changes
 * rather than restating them by hand.
 */
import { describe, it, expect } from 'vitest';
import { canAfford, insufficientBalanceMessage, LEDGER_REASONS } from './credits.ts';
import { computeJobCost, JOB_COST, JOB_DESCRIPTORS } from './pricing.ts';
import type { JobType } from './types.ts';

describe('canAfford — exact balance boundary', () => {
  // The only place an off-by-one (>= vs >) can hide is exactly at the cost.
  const type: JobType = 'matrix';
  const cost = JOB_COST[type]; // 15

  it('a balance EQUAL to the cost can afford the job', () => {
    expect(canAfford(cost, type, 1)).toBe(true);
  });

  it('one credit less than the cost cannot afford the job', () => {
    expect(canAfford(cost - 1, type, 1)).toBe(false);
  });

  it('one credit more than the cost can afford the job', () => {
    expect(canAfford(cost + 1, type, 1)).toBe(true);
  });
});

describe('canAfford — count multiplier', () => {
  const type: JobType = 'revoice';
  const unit = JOB_COST[type]; // 8

  it('a balance that affords 1 output does NOT necessarily afford 5', () => {
    // unit (8) is enough for count=1 but not for count=5 (40).
    expect(canAfford(unit, type, 1)).toBe(true);
    expect(canAfford(unit, type, 5)).toBe(false);
  });

  it('scales exactly: count=5 needs exactly unit*5, no more no less', () => {
    const five = unit * 5; // 40
    expect(canAfford(five, type, 5)).toBe(true);
    expect(canAfford(five - 1, type, 5)).toBe(false);
    expect(canAfford(five + 1, type, 5)).toBe(true);
  });

  it('a different count has its own boundary (count=3 needs unit*3)', () => {
    const three = unit * 3; // 24
    expect(canAfford(three, type, 3)).toBe(true);
    expect(canAfford(three - 1, type, 3)).toBe(false);
  });
});

describe('canAfford — default count behaves like 1', () => {
  const type: JobType = 'edit';
  const cost = JOB_COST[type]; // 18

  it('omitting count is identical to passing count=1', () => {
    expect(canAfford(cost, type)).toBe(canAfford(cost, type, 1));
    expect(canAfford(cost - 1, type)).toBe(canAfford(cost - 1, type, 1));
    expect(canAfford(cost + 1, type)).toBe(canAfford(cost + 1, type, 1));
  });

  it('default canAfford at the boundary: cost affords, cost-1 does not', () => {
    expect(canAfford(cost, type)).toBe(true);
    expect(canAfford(cost - 1, type)).toBe(false);
  });
});

describe('canAfford — zero and negative balance never afford a positive cost', () => {
  it('balance of 0 cannot afford any job with a positive cost', () => {
    expect(canAfford(0, 'quick_test', 1)).toBe(false);
    expect(canAfford(0, 'ai_video', 1)).toBe(false);
  });

  it('a negative balance cannot afford a positive-cost job', () => {
    expect(canAfford(-1, 'quick_test', 1)).toBe(false);
    expect(canAfford(-100, 'matrix', 5)).toBe(false);
  });

  it('a balance of exactly 0 with count>1 still cannot afford', () => {
    expect(canAfford(0, 'enhance', 10)).toBe(false);
  });
});

describe('canAfford — every job type at its own boundary', () => {
  // A new tool added to JOB_DESCRIPTORS must pick up its cost correctly; if
  // canAfford ever mishandles one type, this loop catches it.
  for (const descriptor of JOB_DESCRIPTORS) {
    const { type } = descriptor;
    const unit = JOB_COST[type];

    it(`${type}: a balance equal to its unit cost affords count=1`, () => {
      expect(canAfford(unit, type, 1)).toBe(true);
    });

    it(`${type}: a balance one below its unit cost cannot afford count=1`, () => {
      expect(canAfford(unit - 1, type, 1)).toBe(false);
    });
  }

  // Cover any JobType defined in JOB_COST but not surfaced as a descriptor,
  // so a future type added to JOB_COST without a descriptor still gets the
  // boundary check.
  for (const type of Object.keys(JOB_COST) as JobType[]) {
    it(`${type}: cost from JOB_COST is the true boundary (via computeJobCost)`, () => {
      const cost = computeJobCost(type, 1);
      expect(canAfford(cost, type, 1)).toBe(true);
      expect(canAfford(cost - 1, type, 1)).toBe(false);
    });
  }
});

describe('insufficientBalanceMessage', () => {
  it('contains the exact required number for the given type and count', () => {
    const type: JobType = 'matrix';
    const count = 2;
    const expectedCost = computeJobCost(type, count); // 30
    expect(insufficientBalanceMessage(type, count)).toContain(String(expectedCost));
  });

  it('matches the source string in credits.ts exactly (Serbian, verbatim)', () => {
    // Copied verbatim from credits.ts — not retyped, not "fixed".
    const type: JobType = 'matrix';
    const cost = computeJobCost(type, 1);
    expect(insufficientBalanceMessage(type, 1)).toBe(
      `Nemaš dovoljno kredita. Potrebno ${cost}, dopuni kredit da nastaviš.`,
    );
  });

  it('scales the quoted number with count, the same way canAfford does', () => {
    const type: JobType = 'revoice';
    const unit = JOB_COST[type]; // 8
    const message1 = insufficientBalanceMessage(type, 1);
    const message5 = insufficientBalanceMessage(type, 5);

    expect(message1).toContain(String(unit * 1));
    expect(message5).toContain(String(unit * 5));
    // The two messages differ precisely because the quoted cost scaled.
    expect(message1).not.toBe(message5);
  });

  it('omitting count quotes the unit cost (count defaults to 1)', () => {
    const type: JobType = 'edit';
    expect(insufficientBalanceMessage(type)).toBe(insufficientBalanceMessage(type, 1));
  });
});

describe('LEDGER_REASONS', () => {
  it('has the exact string values written into the database', () => {
    // These land in credits_ledger.reason and are used in queries/UI; a
    // rename is a data migration, not a refactor.
    expect(LEDGER_REASONS.signupBonus).toBe('signup_bonus');
    expect(LEDGER_REASONS.topup).toBe('topup');
    expect(LEDGER_REASONS.jobSpend).toBe('job_spend');
    expect(LEDGER_REASONS.refund).toBe('refund');
    expect(LEDGER_REASONS.devTopup).toBe('dev_topup');
  });

  it('values are unique (no two keys collapse to the same reason string)', () => {
    const values = Object.values(LEDGER_REASONS);
    expect(new Set(values).size).toBe(values.length);
  });
});
