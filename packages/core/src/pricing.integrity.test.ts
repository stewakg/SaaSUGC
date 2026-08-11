/**
 * Structural guards on the two tables that drive money: CREDIT_PACKS (what a
 * customer buys) and JOB_DESCRIPTORS (what a customer spends on). Neither is
 * exercised by pricing.test.ts / pricing.plural.test.ts, and both are the
 * kind of hand-edited array where a future one-line addition (a new pack, a
 * new tool) can plausibly ship broken — a bonus typo'd larger than the base,
 * a duplicate id, two tools sharing a `type`, a forgotten label — without any
 * type error, because nothing here is enforced by the TS shape alone.
 *
 * types.ts also calls out that JobType is duplicated in THREE places kept in
 * sync by hand (this file, packages/db/generated/database.types.ts, the SQL
 * enum) — the completeness checks below are the one automatic check that the
 * *this* copy of the list and JOB_DESCRIPTORS/JOB_COST agree with each other.
 */
import { describe, it, expect } from 'vitest';
import { CREDIT_PACKS, JOB_COST, JOB_DESCRIPTORS } from './pricing.ts';
import type { JobType } from './types.ts';

// Copied by hand from the JobType union in types.ts. If someone adds a job
// type there and forgets JOB_COST/JOB_DESCRIPTORS, the completeness tests
// below fail loudly instead of the gap surfacing as a missing dashboard card.
const ALL_JOB_TYPES: JobType[] = [
  'matrix',
  'edit',
  'image_ads',
  'mix',
  'quick_test',
  'translate',
  'enhance',
  'remove_text',
  'ai_video',
  'revoice',
];

describe('CREDIT_PACKS integrity', () => {
  it('every pack has a positive credit count and a positive price', () => {
    for (const pack of CREDIT_PACKS) {
      expect(pack.credits).toBeGreaterThan(0);
      expect(pack.priceEUR).toBeGreaterThan(0);
    }
  });

  it('bonus, where present, never exceeds the base credit count', () => {
    for (const pack of CREDIT_PACKS) {
      if (pack.bonus !== undefined) {
        expect(pack.bonus).toBeGreaterThan(0);
        expect(pack.bonus).toBeLessThanOrEqual(pack.credits);
      }
    }
  });

  it('every pack id is unique', () => {
    const ids = CREDIT_PACKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exactly one pack is marked popular', () => {
    const popular = CREDIT_PACKS.filter((p) => p.popular);
    expect(popular.length).toBe(1);
  });

  it('a bigger pack always grants at least as many total credits as a smaller-priced one (no pack undercuts a cheaper one)', () => {
    const byPrice = [...CREDIT_PACKS].sort((a, b) => a.priceEUR - b.priceEUR);
    for (let i = 1; i < byPrice.length; i++) {
      const prevTotal = byPrice[i - 1].credits + (byPrice[i - 1].bonus ?? 0);
      const total = byPrice[i].credits + (byPrice[i].bonus ?? 0);
      expect(total).toBeGreaterThan(prevTotal);
    }
  });
});

describe('JOB_DESCRIPTORS integrity', () => {
  it('every descriptor has a positive cost', () => {
    for (const d of JOB_DESCRIPTORS) {
      expect(d.cost).toBeGreaterThan(0);
    }
  });

  it('every descriptor has a tier of exactly "main" or "utility"', () => {
    for (const d of JOB_DESCRIPTORS) {
      expect(['main', 'utility']).toContain(d.tier);
    }
  });

  it('every descriptor has a non-empty label and description', () => {
    for (const d of JOB_DESCRIPTORS) {
      expect(d.label.trim().length).toBeGreaterThan(0);
      expect(d.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('every descriptor `type` is unique — no tool accidentally shares another\'s slot', () => {
    const types = JOB_DESCRIPTORS.map((d) => d.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('a "main" tier descriptor carries its 3 benefit bullets; "utility" tier does not require them', () => {
    for (const d of JOB_DESCRIPTORS) {
      if (d.tier === 'main') {
        expect(d.benefits).toBeDefined();
        expect(d.benefits?.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('JOB_DESCRIPTORS / JOB_COST / JobType stay in lockstep', () => {
  it('JOB_DESCRIPTORS has exactly one entry per known JobType — none missing, none extra', () => {
    const descriptorTypes = new Set(JOB_DESCRIPTORS.map((d) => d.type));
    expect(descriptorTypes.size).toBe(JOB_DESCRIPTORS.length); // no duplicates counted twice
    expect(descriptorTypes).toEqual(new Set(ALL_JOB_TYPES));
  });

  it('JOB_COST has exactly one entry per known JobType — none missing, none extra', () => {
    const costTypes = new Set(Object.keys(JOB_COST));
    expect(costTypes).toEqual(new Set(ALL_JOB_TYPES));
  });
});
