/**
 * Matrix M2b — scene detection. Splits a source video into its constituent
 * SHOTS at every scene change (each uploaded source is usually a compilation
 * of multiple shots). Uses ffmpeg-static / ffprobe-static (portable binaries,
 * no system install). Shots shorter than minShotSec are dropped as too brief
 * to use as montage material. Verified on real sample compilations 2026-07-19.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const ffmpegPath = require('ffmpeg-static') as string;
const ffprobePath = (require('ffprobe-static') as { path: string }).path;

/** A detected shot: a scene-coherent sub-range of a source video, in seconds. */
export interface RawShot {
  startSec: number;
  endSec: number;
}

/** Probe a local video file's duration in seconds (0 if it can't be read). */
export function probeDuration(videoPath: string): number {
  const res = spawnSync(
    ffprobePath,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath],
    { encoding: 'utf8' },
  );
  return Number((res.stdout || '').trim()) || 0;
}

/**
 * Pure: turn scene-change cut times + a total duration into shot ranges,
 * dropping any shorter than minShotSec. Boundaries are [0, ...cuts, duration].
 * Exported so the montage chain's shot-splitting is unit-testable without ffmpeg.
 */
export function shotsFromCuts(cuts: number[], durationSec: number, minShotSec: number): RawShot[] {
  const bounds = [0, ...cuts, durationSec];
  const shots: RawShot[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const startSec = bounds[i];
    const endSec = bounds[i + 1];
    if (endSec - startSec >= minShotSec) shots.push({ startSec, endSec });
  }
  return shots;
}

/**
 * Scene-detect a LOCAL video file: split it at every scene change into shots,
 * dropping any shorter than minShotSec. Runs ffmpeg's
 * `select='gt(scene,threshold)',showinfo` and parses the pts_time of each
 * scene-change frame from STDERR (ffmpeg writes showinfo to stderr, not stdout).
 */
export function detectShots(
  videoPath: string,
  opts: { threshold?: number; minShotSec?: number } = {},
): RawShot[] {
  const threshold = opts.threshold ?? 0.3;
  const minShotSec = opts.minShotSec ?? 1.0;

  const dur = probeDuration(videoPath);
  if (dur <= 0) return [];

  const res = spawnSync(
    ffmpegPath,
    ['-i', videoPath, '-filter:v', `select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const stderr = res.stderr || '';

  const cuts: number[] = [];
  for (const m of stderr.matchAll(/pts_time:([\d.]+)/g)) cuts.push(Number(m[1]));

  return shotsFromCuts(cuts, dur, minShotSec);
}

/**
 * Download a remote clip URL to a temp .mp4 file and return its local path.
 * Uploaded Matrix clips arrive as Storage URLs; scene detection (and the
 * render) need a local file. Caller is responsible for cleanup.
 */
export async function downloadClip(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download clip (${res.status}): ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const path = join(tmpdir(), `matrix-clip-${randomUUID()}.mp4`);
  await writeFile(path, buf);
  return path;
}
