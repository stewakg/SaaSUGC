/**
 * Caption timing (F4). Real word-level timestamps come from Whisper (run
 * locally, e.g. whisper.cpp / faster-whisper — wired when that binary is
 * available on the render host). Until then, this evenly distributes each
 * word across an estimated speaking duration — INFRASTRUCTURE.md §5 F4
 * explicitly allows mocking timings when Whisper is unavailable.
 */
import type { CaptionWord } from './types.ts';

/** ~2.5 spoken words/sec is a reasonable average pace for short ad scripts. */
const WORDS_PER_SECOND = 2.5;

/**
 * Splits `script` into words and assigns each an even time slice. If
 * `durationSec` is omitted, it's estimated from word count.
 */
export function mockWordTimestamps(script: string, durationSec?: number): CaptionWord[] {
  const words = script
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return [];

  const total = durationSec ?? words.length / WORDS_PER_SECOND;
  const perWord = total / words.length;

  return words.map((text, i) => ({
    text,
    startSec: Number((i * perWord).toFixed(3)),
    endSec: Number(((i + 1) * perWord).toFixed(3)),
  }));
}
