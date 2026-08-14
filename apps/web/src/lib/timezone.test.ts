/**
 * Tests for the timezone helper.
 *
 * The point of the feature is #3: the same instant must read differently in
 * different zones, or the cookie the user set is doing nothing. #4 pins the
 * other load-bearing property — a stale/invalid cookie must not throw, because
 * this formatter runs on every page that shows a date.
 */
import { describe, expect, it } from 'vitest';
import { formatDateTime, isTimezoneId, resolveTimezone } from './timezone.ts';

describe('isTimezoneId', () => {
  it('accepts a zone from the list', () => {
    expect(isTimezoneId('Europe/Belgrade')).toBe(true);
  });

  it.each(['Mars/Olympus', '', null, 42])('rejects %s', (value) => {
    expect(isTimezoneId(value)).toBe(false);
  });
});

describe('resolveTimezone', () => {
  it('passes a zone from the list through unchanged', () => {
    expect(resolveTimezone('Europe/Belgrade')).toBe('Europe/Belgrade');
  });

  it('returns undefined when the cookie is unset', () => {
    expect(resolveTimezone(undefined)).toBeUndefined();
  });

  it('returns undefined for a tampered or stale zone — it must never reach Intl', () => {
    // Intl.DateTimeFormat throws RangeError on an unknown zone; if a stale
    // cookie value slipped through, every page showing a date would die.
    expect(resolveTimezone('Mars/Olympus')).toBeUndefined();
  });

  it('returns undefined for an empty cookie value', () => {
    expect(resolveTimezone('')).toBeUndefined();
  });
});

describe('formatDateTime', () => {
  it('with an explicit zone returns a non-empty string containing the year', () => {
    const out = formatDateTime('2026-01-15T12:00:00Z', 'Europe/Belgrade');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('2026');
  });

  it('formats the same instant differently in Europe/Belgrade and in UTC', () => {
    // 23:30 UTC is already past midnight in Belgrade (CET, UTC+1), so the two
    // strings differ on the date itself — the assertion cannot pass by accident
    // of time formatting alone.
    const instant = '2026-01-15T23:30:00Z';
    const belgrade = formatDateTime(instant, 'Europe/Belgrade');
    const utc = formatDateTime(instant, 'UTC');
    expect(belgrade).not.toEqual(utc);
  });

  it('does not throw on an invalid timeZone and still returns a string', () => {
    let out = '';
    expect(() => {
      out = formatDateTime('2026-01-15T12:00:00Z', 'Mars/Olympus');
    }).not.toThrow();
    expect(out.length).toBeGreaterThan(0);
  });

  it('returns an em dash for an unparseable date', () => {
    expect(formatDateTime('not-a-date', 'Europe/Belgrade')).toBe('—');
  });
});
