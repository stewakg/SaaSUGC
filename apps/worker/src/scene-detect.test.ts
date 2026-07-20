import { describe, it, expect } from 'vitest';
import { shotsFromCuts } from './scene-detect.ts';

describe('shotsFromCuts', () => {
  it('no cuts → one shot spanning the whole video (when long enough)', () => {
    expect(shotsFromCuts([], 10, 0.8)).toEqual([{ startSec: 0, endSec: 10 }]);
  });

  it('no cuts + whole video shorter than minShotSec → dropped', () => {
    expect(shotsFromCuts([], 0.5, 0.8)).toEqual([]);
  });

  it('splits at each cut into consecutive ranges', () => {
    expect(shotsFromCuts([3, 7], 10, 0.8)).toEqual([
      { startSec: 0, endSec: 3 },
      { startSec: 3, endSec: 7 },
      { startSec: 7, endSec: 10 },
    ]);
  });

  it('drops shots shorter than minShotSec but keeps the neighbours', () => {
    // 0–0.5 (0.5s, dropped), 0.5–4 (kept), 4–4.3 (0.3s, dropped), 4.3–10 (kept)
    expect(shotsFromCuts([0.5, 4, 4.3], 10, 0.8)).toEqual([
      { startSec: 0.5, endSec: 4 },
      { startSec: 4.3, endSec: 10 },
    ]);
  });

  it('drops a trailing zero-length shot when a cut equals the duration', () => {
    expect(shotsFromCuts([5], 5, 0.8)).toEqual([{ startSec: 0, endSec: 5 }]);
  });

  it('uses minShotSec as an inclusive floor (exactly minShotSec is kept)', () => {
    expect(shotsFromCuts([0.8], 1.6, 0.8)).toEqual([
      { startSec: 0, endSec: 0.8 },
      { startSec: 0.8, endSec: 1.6 },
    ]);
  });
});
