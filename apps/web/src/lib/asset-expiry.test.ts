/**
 * Tests for uploadKeyWrittenAtMs — the age of a raw upload, read out of the
 * storage key because no `assets` row exists to say it (assets.job_id is NOT
 * NULL and no job exists at upload time).
 *
 * The parser is deliberately asymmetric: a key that carries a real stamp must
 * yield it (a live upload failing to parse would be refused by /api/storage
 * for no reason), while anything that merely looks odd must yield null —
 * "cannot tell" lets the request through and leaves existence to the bucket.
 * The plausibility window matters as much as the digit count: `123.mp4` and a
 * stamp from the far future are both parse accidents, not files.
 */
import { describe, expect, it } from 'vitest';
import { uploadKeyWrittenAtMs } from './asset-expiry.ts';

describe('uploadKeyWrittenAtMs — keys that carry a real stamp', () => {
  it('reads /api/upload keys: uploads/u1/1755000000000.mp4 → 1755000000000', () => {
    expect(uploadKeyWrittenAtMs('uploads/u1/1755000000000.mp4')).toBe(1755000000000);
  });

  it('skips the imported- prefix: uploads/u1/imported-1755000000000.mp4 → the same stamp', () => {
    expect(uploadKeyWrittenAtMs('uploads/u1/imported-1755000000000.mp4')).toBe(1755000000000);
  });

  it('reads a stamp written a minute ago (a live upload must parse)', () => {
    const stamp = Date.now() - 60_000;
    expect(uploadKeyWrittenAtMs(`uploads/u1/${stamp}.mp4`)).toBe(stamp);
  });
});

describe('uploadKeyWrittenAtMs — keys that must yield null ("cannot tell")', () => {
  it('a key outside uploads/ (renders/x.mp4 — job outputs have an assets row instead)', () => {
    expect(uploadKeyWrittenAtMs('renders/x.mp4')).toBeNull();
  });

  it('a filename with no leading digits (uploads/u1/nostamp.mp4)', () => {
    expect(uploadKeyWrittenAtMs('uploads/u1/nostamp.mp4')).toBeNull();
  });

  it('too few digits (uploads/u1/123.mp4): a short number is a filename, not a stamp', () => {
    expect(uploadKeyWrittenAtMs('uploads/u1/123.mp4')).toBeNull();
  });

  it('the imported- prefix does not rescue a digitless name (uploads/u1/imported-nostamp.mp3)', () => {
    expect(uploadKeyWrittenAtMs('uploads/u1/imported-nostamp.mp3')).toBeNull();
  });

  it('a stamp far in the future (year 5138) is a parse accident, not a file', () => {
    expect(uploadKeyWrittenAtMs('uploads/u1/99999999999999.mp4')).toBeNull();
  });
});
