/**
 * Matrix M2c — montage builder. Turns a pool of scene-detected shots (from
 * M2b detectShots, tagged with their source clip URL) into an ordered montage
 * with STRUCTURED randomness:
 *   - Opening "hook" shot is longer (>= hookMin) so the ad establishes before
 *     the fast cuts — a sub-second opening is a weak hook (see SESSION_LOG).
 *   - Middle shots are random but avoid two consecutive shots from the SAME
 *     source, and are capped for a punchy pace.
 *   - Fills up to targetSec (voiceover-driven duration), cycling the pool.
 * Pure + deterministic given `rng` (injectable for testing).
 */
import type { RawShot } from './scene-detect.ts';

/** A pool shot tagged with the source clip it came from. */
export interface PoolShot extends RawShot {
  url: string;
}

/** A shot placed in the montage: play `playSec` of `url` starting at `startSec`. */
export interface MontageShot {
  url: string;
  startSec: number;
  playSec: number;
}

export interface BuildMontageOpts {
  /** Total montage duration to fill, in seconds (driven by the voiceover). */
  targetSec: number;
  /** Opening hook shot: minimum source length to prefer (default 2.0). */
  hookMinSec?: number;
  /** Opening hook shot: on-screen cap (default 2.5). */
  hookMaxSec?: number;
  /** Middle shot on-screen floor (default 1.0). */
  midMinSec?: number;
  /** Middle shot on-screen cap for pace (default 3.0). */
  midMaxSec?: number;
  /** RNG in [0,1) — injectable for deterministic tests (default Math.random). */
  rng?: () => number;
}

export function buildMontage(pool: PoolShot[], opts: BuildMontageOpts): MontageShot[] {
  const hookMin = opts.hookMinSec ?? 2.0;
  const hookMax = opts.hookMaxSec ?? 2.5;
  const midMin = opts.midMinSec ?? 1.0;
  const midMax = opts.midMaxSec ?? 3.0;
  const rng = opts.rng ?? Math.random;
  if (pool.length === 0) return [];

  const len = (s: PoolShot): number => s.endSec - s.startSec;
  const shuffle = (arr: PoolShot[]): PoolShot[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const out: MontageShot[] = [];
  let total = 0;
  let lastUrl: string | null = null;

  // Opening hook: a shot >= hookMin if one exists, else the longest available.
  const byLenDesc = shuffle(pool).sort((a, b) => len(b) - len(a));
  const hook = byLenDesc.find((s) => len(s) >= hookMin) ?? byLenDesc[0];
  const hookPlay = Math.min(hookMax, len(hook));
  out.push({ url: hook.url, startSec: hook.startSec, playSec: hookPlay });
  total += hookPlay;
  lastUrl = hook.url;

  // Middle: random shots, avoid consecutive same-source, until targetSec.
  let queue = shuffle(pool);
  let guard = 0;
  while (total < opts.targetSec && guard++ < 2000) {
    if (queue.length === 0) queue = shuffle(pool);
    let idx = queue.findIndex((s) => s.url !== lastUrl);
    if (idx === -1) idx = 0; // only same-source shots left → allow it
    const pick = queue.splice(idx, 1)[0];
    const playSec = Math.max(midMin, Math.min(midMax, len(pick)));
    out.push({ url: pick.url, startSec: pick.startSec, playSec });
    total += playSec;
    lastUrl = pick.url;
  }

  return out;
}
