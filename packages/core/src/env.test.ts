/**
 * Tests for the environment loader.
 *
 * The two behaviours that matter most in this file:
 *
 * 1. `optionalUrl()` must treat an empty string as absent. `.env` files and
 *    Docker `--env-file` write unset optional keys as `KEY=`, which loads as
 *    `''` rather than `undefined`. Before `optionalUrl()` existed, that empty
 *    string failed `z.string().url()` and crashed the worker on its first real
 *    deploy (R2_PUBLIC_URL=, REMOTION_SERVE_URL=). That regression must never
 *    come back silently.
 *
 * 2. `hasKey` is the single switch that decides real-vs-mock for EVERY
 *    provider. Saying "present" on a blank credential, or "absent" on a real
 *    one, is exactly the bug class this repo has shipped twice.
 *
 * Every test passes its own object to `loadEnv({...})` — the module only caches
 * when the input IS `process.env`, so this keeps each test isolated. We never
 * touch or mutate `process.env`.
 */
import { describe, it, expect } from 'vitest';
import { loadEnv, hasKey } from './env.ts';

describe('optionalUrl — empty string is treated as absent (the deploy bug)', () => {
  // These three are the keys that were `KEY=` in the container .env that
  // crashed the worker. Each one is pinned individually so a future refactor
  // that drops `optionalUrl()` off any single key is caught.
  it('R2_PUBLIC_URL: "" loads as undefined and does NOT throw', () => {
    const env = loadEnv({ R2_PUBLIC_URL: '' });
    expect(env.R2_PUBLIC_URL).toBeUndefined();
  });

  it('REMOTION_SERVE_URL: "" loads as undefined and does NOT throw', () => {
    const env = loadEnv({ REMOTION_SERVE_URL: '' });
    expect(env.REMOTION_SERVE_URL).toBeUndefined();
  });

  it('SUPABASE_URL: "" loads as undefined and does NOT throw', () => {
    const env = loadEnv({ SUPABASE_URL: '' });
    expect(env.SUPABASE_URL).toBeUndefined();
  });
});

describe('optionalUrl — a genuinely missing key is undefined and does not throw', () => {
  it('an absent SUPABASE_URL parses to undefined', () => {
    const env = loadEnv({});
    expect(env.SUPABASE_URL).toBeUndefined();
  });
});

describe('optionalUrl — a valid URL passes through unchanged', () => {
  it('SUPABASE_URL is returned verbatim when valid', () => {
    const url = 'https://abcdefgh.supabase.co';
    const env = loadEnv({ SUPABASE_URL: url });
    expect(env.SUPABASE_URL).toBe(url);
  });
});

describe('optionalUrl — an invalid URL still throws (empty-string tolerance is not "anything goes")', () => {
  it('SUPABASE_URL: "not-a-url" throws and the message names the offending key', () => {
    expect(() => loadEnv({ SUPABASE_URL: 'not-a-url' })).toThrow();
    try {
      loadEnv({ SUPABASE_URL: 'not-a-url' });
      throw new Error('expected loadEnv to throw before this line');
    } catch (err) {
      const message = (err as Error).message;
      // The error must point at the bad key by name, so an operator reading
      // the log knows exactly which var to fix.
      expect(message).toContain('SUPABASE_URL');
    }
  });
});

describe('defaults — empty object', () => {
  it('NODE_ENV defaults to "development"', () => {
    const env = loadEnv({});
    expect(env.NODE_ENV).toBe('development');
  });

  it('FORCE_MOCK defaults to false', () => {
    const env = loadEnv({});
    expect(env.FORCE_MOCK).toBe(false);
  });
});

describe('FORCE_MOCK parsing — explicit per-value', () => {
  // This flag can silently flip a production worker into a mock one, so every
  // accepted/rejected spelling is pinned on its own line.
  it('"1" -> true', () => {
    expect(loadEnv({ FORCE_MOCK: '1' }).FORCE_MOCK).toBe(true);
  });

  it('"true" -> true', () => {
    expect(loadEnv({ FORCE_MOCK: 'true' }).FORCE_MOCK).toBe(true);
  });

  it('"0" -> false', () => {
    expect(loadEnv({ FORCE_MOCK: '0' }).FORCE_MOCK).toBe(false);
  });

  it('"false" -> false', () => {
    expect(loadEnv({ FORCE_MOCK: 'false' }).FORCE_MOCK).toBe(false);
  });

  it('"" (empty string, as written by --env-file) -> false', () => {
    expect(loadEnv({ FORCE_MOCK: '' }).FORCE_MOCK).toBe(false);
  });

  it('missing -> false', () => {
    expect(loadEnv({}).FORCE_MOCK).toBe(false);
  });
});

describe('hasKey — basics', () => {
  it('a non-empty string value is present', () => {
    const env = loadEnv({ OPENROUTER_API_KEY: 'sk-real-key' });
    expect(hasKey(env, 'OPENROUTER_API_KEY')).toBe(true);
  });

  it('an undefined value is absent', () => {
    const env = loadEnv({});
    expect(hasKey(env, 'OPENROUTER_API_KEY')).toBe(false);
  });

  it('an empty string value is absent', () => {
    const env = loadEnv({ OPENROUTER_API_KEY: '' });
    expect(hasKey(env, 'OPENROUTER_API_KEY')).toBe(false);
  });
});

describe('hasKey — respects FORCE_MOCK', () => {
  it('returns false for a SET key when FORCE_MOCK is on', () => {
    // Even with a real credential present, FORCE_MOCK must override it so a
    // dev/test run never accidentally hits a paid provider.
    const env = loadEnv({ FORCE_MOCK: '1', OPENROUTER_API_KEY: 'sk-real-key' });
    expect(hasKey(env, 'OPENROUTER_API_KEY')).toBe(false);
  });
});

describe('NODE_ENV — enum validation', () => {
  it.each(['development', 'test', 'production'])('accepts "%s"', (value) => {
    expect(loadEnv({ NODE_ENV: value }).NODE_ENV).toBe(value);
  });

  it('rejects anything outside the enum and names NODE_ENV in the error', () => {
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow();
    try {
      loadEnv({ NODE_ENV: 'staging' });
      throw new Error('expected loadEnv to throw before this line');
    } catch (err) {
      expect((err as Error).message).toContain('NODE_ENV');
    }
  });
});
