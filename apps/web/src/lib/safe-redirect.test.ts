import { describe, expect, it } from 'vitest';
import { DEFAULT_REDIRECT, safeNextPath } from './safe-redirect';

describe('safeNextPath', () => {
  it('returns the path unchanged for legitimate values', () => {
    expect(safeNextPath('/app')).toBe('/app');
    expect(safeNextPath('/app/matrix')).toBe('/app/matrix');
    expect(safeNextPath('/app?tab=jobs')).toBe('/app?tab=jobs');
    expect(safeNextPath('/app#section')).toBe('/app#section');
  });

  it('falls back to /app for an absolute url', () => {
    expect(safeNextPath('https://evil.example')).toBe(DEFAULT_REDIRECT);
    expect(safeNextPath('http://evil.example/x')).toBe(DEFAULT_REDIRECT);
  });

  it('falls back to /app for a protocol-relative url', () => {
    expect(safeNextPath('//evil.example')).toBe(DEFAULT_REDIRECT);
  });

  it('falls back to /app for the userinfo trick: @evil.example', () => {
    // This is the exact value that defeats the callback's `origin + next`
    // concatenation: `${origin}@evil.example` is a url whose host is
    // evil.example — the site name ends up as the userinfo part.
    expect(safeNextPath('@evil.example')).toBe(DEFAULT_REDIRECT);
  });

  it('falls back to /app for a backslash anywhere', () => {
    expect(safeNextPath('/app\\..\\evil')).toBe(DEFAULT_REDIRECT);
    expect(safeNextPath('/\\evil.example')).toBe(DEFAULT_REDIRECT);
  });

  it('falls back to /app for javascript:alert(1)', () => {
    expect(safeNextPath('javascript:alert(1)')).toBe(DEFAULT_REDIRECT);
  });

  it('falls back to /app for a control character', () => {
    // Built with an escape sequence: a newline here would split the Location header.
    expect(safeNextPath('/app\nLocation: https://evil.example')).toBe(DEFAULT_REDIRECT);
  });

  it('falls back to /app for null, undefined and ""', () => {
    expect(safeNextPath(null)).toBe(DEFAULT_REDIRECT);
    expect(safeNextPath(undefined)).toBe(DEFAULT_REDIRECT);
    expect(safeNextPath('')).toBe(DEFAULT_REDIRECT);
  });
});
