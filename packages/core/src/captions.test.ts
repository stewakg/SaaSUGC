import { describe, it, expect } from 'vitest';
import { mockWordTimestamps } from './captions.ts';

describe('mockWordTimestamps', () => {
  it('returns [] for empty or whitespace-only script', () => {
    expect(mockWordTimestamps('')).toEqual([]);
    expect(mockWordTimestamps('   \n\t ')).toEqual([]);
  });

  it('produces one entry per word, preserving order and text', () => {
    const out = mockWordTimestamps('kupi ovaj proizvod danas', 4);
    expect(out.map((w) => w.text)).toEqual(['kupi', 'ovaj', 'proizvod', 'danas']);
  });

  it('distributes words evenly across an explicit duration', () => {
    const out = mockWordTimestamps('a b c d', 4); // 4 words over 4s → 1s each
    expect(out[0].startSec).toBe(0);
    expect(out[0].endSec).toBe(1);
    expect(out[3].endSec).toBe(4);
  });

  it('emits contiguous slices (each word ends exactly where the next begins)', () => {
    const out = mockWordTimestamps('a b c d e', 3.3);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].startSec).toBe(out[i - 1].endSec);
    }
  });

  it('estimates duration from word count when omitted (~2.5 words/sec)', () => {
    const out = mockWordTimestamps('a b c d e'); // 5 words → ~2s total
    expect(out[out.length - 1].endSec).toBeCloseTo(2, 3);
  });

  it('collapses irregular whitespace between words', () => {
    const out = mockWordTimestamps('  a   b\tc  ', 3);
    expect(out.map((w) => w.text)).toEqual(['a', 'b', 'c']);
  });
});
