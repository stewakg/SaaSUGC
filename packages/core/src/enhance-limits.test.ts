/**
 * `enhance` input limits — the money rules from MARGINS.md "Nalaz #1".
 *
 * These tests are written against the LOSS, not against the implementation:
 * every case below names a clip a customer could really upload and asserts what
 * it costs us. The four rows in MARGINS.md's ⚠️ table appear verbatim as cases,
 * so if someone widens a limit the test that fails says which invoice it moves.
 */
import { describe, expect, it } from 'vitest';
import {
  ENHANCE_MAX_FPS,
  ENHANCE_MAX_HEIGHT,
  ENHANCE_MAX_SECONDS,
  planEnhanceVideo,
  topazVideoCostUsd,
} from './enhance-limits.ts';

/** What one enhance job earns, from pricing.ts (9 credits) and BUSINESS.md's €0.20/credit floor. */
const REVENUE_EUR_FLOOR = 1.5;
const USD_PER_EUR = 0.925;

describe('topazVideoCostUsd — fal price bands', () => {
  it('charges the ≤720p band at $0.01/s', () => {
    expect(topazVideoCostUsd(15, 720)).toBeCloseTo(0.15, 5);
  });

  it('charges the 1080p band at $0.02/s — the 15s clip MARGINS.md prices at $0.30', () => {
    expect(topazVideoCostUsd(15, 1080)).toBeCloseTo(0.3, 5);
  });

  it('charges anything above 1080p at $0.08/s', () => {
    expect(topazVideoCostUsd(60, 2160)).toBeCloseTo(4.8, 5);
  });

  it('doubles above 30fps — the $9.60 worst case', () => {
    expect(topazVideoCostUsd(60, 2160, 60)).toBeCloseTo(9.6, 5);
  });
});

describe('planEnhanceVideo — refusals', () => {
  it('refuses a clip longer than the limit', () => {
    const plan = planEnhanceVideo({ durationSec: ENHANCE_MAX_SECONDS + 1, height: 720 });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.code).toBe('input_too_long');
    expect(plan.message).toContain('Nije naplaćeno');
  });

  it('accepts a clip exactly at the limit — the boundary is inclusive', () => {
    const plan = planEnhanceVideo({ durationSec: ENHANCE_MAX_SECONDS, height: 720 });
    expect(plan.ok).toBe(true);
  });

  it('refuses a source taller than 1080p — the $0.08/s band is unreachable, not merely unlikely', () => {
    const plan = planEnhanceVideo({ durationSec: 10, height: 2160 });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.code).toBe('input_too_large');
  });

  it('refuses an unmeasurable clip rather than guessing — fail CLOSED', () => {
    for (const meta of [
      { durationSec: 0, height: 720 },
      { durationSec: 10, height: 0 },
      { durationSec: Number.NaN, height: 720 },
      { durationSec: Number.POSITIVE_INFINITY, height: 1080 },
    ]) {
      const plan = planEnhanceVideo(meta);
      expect(plan.ok).toBe(false);
      if (!plan.ok) expect(plan.code).toBe('unreadable');
    }
  });
});

describe('planEnhanceVideo — parameters sent to fal', () => {
  it('clamps a 720p source to x1 so the output cannot leave the 1080p band', () => {
    const plan = planEnhanceVideo({ durationSec: 30, height: 720 }, 4);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.upscaleFactor).toBe(1);
    expect(plan.outputHeight).toBeLessThanOrEqual(ENHANCE_MAX_HEIGHT);
  });

  it('honours the requested factor when the output still fits — 360p x2 = 720p', () => {
    const plan = planEnhanceVideo({ durationSec: 30, height: 360 }, 2);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.upscaleFactor).toBe(2);
    expect(plan.outputHeight).toBe(720);
  });

  it('never exceeds fal\'s own 1..4 range, whatever the request says', () => {
    const tiny = { durationSec: 5, height: 120 };
    expect(planEnhanceVideo(tiny, 99)).toMatchObject({ upscaleFactor: 4 });
    expect(planEnhanceVideo(tiny, 0)).toMatchObject({ upscaleFactor: 1 });
    expect(planEnhanceVideo(tiny, -3)).toMatchObject({ upscaleFactor: 1 });
  });

  it('pins a 60fps source back to 30 — the fps pin is what stops the ×2 price', () => {
    const plan = planEnhanceVideo({ durationSec: 60, height: 1080, fps: 60 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.targetFps).toBe(ENHANCE_MAX_FPS);
    // Same clip unpinned would be $2.40.
    expect(plan.estimatedUsd).toBeCloseTo(1.2, 5);
  });

  it('leaves a 24/30fps source alone — no needless interpolation', () => {
    expect(planEnhanceVideo({ durationSec: 10, height: 1080, fps: 24 })).toMatchObject({ targetFps: undefined });
    expect(planEnhanceVideo({ durationSec: 10, height: 1080, fps: 30 })).toMatchObject({ targetFps: undefined });
  });
});

describe('the guarantee: nothing that passes can cost more than it earns', () => {
  it('holds for the worst clip the limits still admit', () => {
    const plan = planEnhanceVideo({ durationSec: ENHANCE_MAX_SECONDS, height: ENHANCE_MAX_HEIGHT, fps: 60 }, 4);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.estimatedUsd).toBeLessThan(REVENUE_EUR_FLOOR * USD_PER_EUR);
  });

  it('holds across a sweep of admissible clips', () => {
    for (const height of [240, 360, 480, 720, 1080]) {
      for (const durationSec of [1, 15, 30, ENHANCE_MAX_SECONDS]) {
        for (const fps of [24, 30, 60]) {
          for (const requested of [2, 4]) {
            const plan = planEnhanceVideo({ durationSec, height, fps }, requested);
            expect(plan.ok).toBe(true);
            if (!plan.ok) continue;
            expect(plan.outputHeight).toBeLessThanOrEqual(ENHANCE_MAX_HEIGHT);
            expect(plan.estimatedUsd).toBeLessThan(REVENUE_EUR_FLOOR * USD_PER_EUR);
          }
        }
      }
    }
  });
});
