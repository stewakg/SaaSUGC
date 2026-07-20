import { describe, it, expect } from 'vitest';
import { buildMontage, type PoolShot } from './montage.ts';

// Deterministic PRNG (mulberry32) so tests are reproducible across runs/machines.
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Multi-source pool: 3 sources (a/b/c), varied shot lengths.
const poolMulti: PoolShot[] = [
  { url: 'a', startSec: 0, endSec: 3 },   // len 3
  { url: 'a', startSec: 3, endSec: 5 },   // len 2
  { url: 'b', startSec: 0, endSec: 4 },   // len 4
  { url: 'b', startSec: 4, endSec: 6 },   // len 2
  { url: 'c', startSec: 0, endSec: 1.5 }, // len 1.5
];

// Every emitted shot must correspond to a real pool shot (same url + startSec).
function isFromPool(out: { url: string; startSec: number }, pool: PoolShot[]): boolean {
  return pool.some((p) => p.url === out.url && p.startSec === out.startSec);
}

describe('buildMontage', () => {
  it('returns [] for an empty pool', () => {
    expect(buildMontage([], { targetSec: 20 })).toEqual([]);
  });

  it('only emits shots that exist in the pool, each with positive playSec', () => {
    const out = buildMontage(poolMulti, { targetSec: 20, rng: mulberry32(1) });
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) {
      expect(isFromPool(s, poolMulti)).toBe(true);
      expect(s.playSec).toBeGreaterThan(0);
    }
  });

  it('fills to at least targetSec', () => {
    const target = 20;
    const out = buildMontage(poolMulti, { targetSec: target, rng: mulberry32(7) });
    const total = out.reduce((sum, s) => sum + s.playSec, 0);
    expect(total).toBeGreaterThanOrEqual(target);
  });

  it('opens with a hook shot: playSec capped at hookMax, source length >= hookMin', () => {
    const out = buildMontage(poolMulti, { targetSec: 20, rng: mulberry32(3) });
    const hook = out[0];
    // default hookMax 2.5; pool has sources >= hookMin (2.0), so hook is capped at 2.5.
    expect(hook.playSec).toBeLessThanOrEqual(2.5);
    const src = poolMulti.find((p) => p.url === hook.url && p.startSec === hook.startSec)!;
    expect(src.endSec - src.startSec).toBeGreaterThanOrEqual(2.0);
  });

  it('clamps middle shots into [midMin, midMax]', () => {
    const out = buildMontage(poolMulti, { targetSec: 25, rng: mulberry32(5) });
    for (const s of out.slice(1)) {
      expect(s.playSec).toBeGreaterThanOrEqual(1.0);
      expect(s.playSec).toBeLessThanOrEqual(3.0);
    }
  });

  it('never places two consecutive shots from the same source (multi-source pool)', () => {
    const out = buildMontage(poolMulti, { targetSec: 40, rng: mulberry32(9) });
    for (let i = 1; i < out.length; i++) {
      expect(out[i].url).not.toBe(out[i - 1].url);
    }
  });

  it('is deterministic for a given rng seed', () => {
    const a = buildMontage(poolMulti, { targetSec: 20, rng: mulberry32(42) });
    const b = buildMontage(poolMulti, { targetSec: 20, rng: mulberry32(42) });
    expect(a).toEqual(b);
  });

  it('handles a single-source pool without looping forever (consecutive same-source allowed)', () => {
    const single: PoolShot[] = [
      { url: 'only', startSec: 0, endSec: 3 },
      { url: 'only', startSec: 3, endSec: 6 },
    ];
    const out = buildMontage(single, { targetSec: 15, rng: mulberry32(2) });
    const total = out.reduce((sum, s) => sum + s.playSec, 0);
    expect(total).toBeGreaterThanOrEqual(15);
    for (const s of out) expect(s.url).toBe('only');
  });
});
