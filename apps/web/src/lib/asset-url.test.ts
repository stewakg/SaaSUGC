/**
 * Tests for the job-params url whitelist.
 *
 * POST /api/jobs stores whatever `params` a signed-in client sends, and the
 * worker later FETCHES several of those values (`downloadClip`, the renderer,
 * the media-edit source) from the one process that holds the service-role key.
 * Before this guard, `sourceVideoUrls: ['http://169.254.169.254/...']` was a
 * working way to make that process read cloud metadata.
 *
 * Unlike safe-url.ts (a private-range check for urls a STRANGER typed), the
 * whitelist here knows what a legitimate value looks like: minted by our own
 * /api/upload or /api/import-clip, so either a relative `/api/storage/...`
 * path or an absolute url on our own storage origin. The tests are written as
 * the values a client would actually try to smuggle in.
 *
 * `allowedOrigins()` reads process.env on every call, so each case controls
 * the whitelist directly. beforeEach wipes the three env vars (a value set in
 * the developer's shell must not silently decide what a test accepts) and
 * afterEach restores the originals — nothing leaks into other test files.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { findForeignAssetUrl, isOwnAssetUrl } from './asset-url.ts';

const ENV_KEYS = ['R2_PUBLIC_URL', 'AWS_S3_PUBLIC_URL', 'WEB_PUBLIC_URL'] as const;

const savedEnv = new Map<string, string | undefined>();

beforeEach(() => {
  savedEnv.clear();
  for (const key of ENV_KEYS) {
    savedEnv.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('isOwnAssetUrl — what the worker may fetch', () => {
  it('accepts the relative MockStorage form /api/storage/uploads/u1/1.mp4', () => {
    expect(isOwnAssetUrl('/api/storage/uploads/u1/1.mp4')).toBe(true);
  });

  it('accepts an absolute url on the R2_PUBLIC_URL origin', () => {
    process.env.R2_PUBLIC_URL = 'https://cdn.example.com';
    expect(isOwnAssetUrl('https://cdn.example.com/uploads/u1/1.mp4')).toBe(true);
  });

  it('rejects http://169.254.169.254/hetzner/v1/metadata — the attack this guard exists for', () => {
    // Cloud metadata, reachable from the worker's Hetzner VPS — and the
    // whitelist means it is refused even with a storage base configured.
    process.env.R2_PUBLIC_URL = 'https://cdn.example.com';
    expect(isOwnAssetUrl('http://169.254.169.254/hetzner/v1/metadata')).toBe(false);
  });

  it('rejects http://127.0.0.1:6379/ and http://localhost:3000/api/storage/x', () => {
    // WEB_PUBLIC_URL is deliberately NOT localhost:3000 here: loopback is
    // allowed only when that origin is genuinely configured as ours.
    process.env.R2_PUBLIC_URL = 'https://cdn.example.com';
    process.env.WEB_PUBLIC_URL = 'https://app.example.com';
    expect(isOwnAssetUrl('http://127.0.0.1:6379/')).toBe(false);
    expect(isOwnAssetUrl('http://localhost:3000/api/storage/x')).toBe(false);
  });

  it('rejects another public origin: https://evil.example/x.mp4', () => {
    // Public, resolvable, http(s) — and still not ours, so still refused.
    process.env.R2_PUBLIC_URL = 'https://cdn.example.com';
    expect(isOwnAssetUrl('https://evil.example/x.mp4')).toBe(false);
  });

  it('rejects file:///etc/passwd and gopher://x/', () => {
    expect(isOwnAssetUrl('file:///etc/passwd')).toBe(false);
    expect(isOwnAssetUrl('gopher://x/')).toBe(false);
  });

  it('rejects relative paths outside storage: /etc/passwd and /api/jobs', () => {
    expect(isOwnAssetUrl('/etc/passwd')).toBe(false);
    expect(isOwnAssetUrl('/api/jobs')).toBe(false);
  });

  it('rejects //evil.example/x.mp4 and backslash forms', () => {
    // `//host` is protocol-relative and points at another origin entirely; a
    // backslash is normalised to `/` by some clients, so it must never pass
    // as a storage path — or as a url at all.
    expect(isOwnAssetUrl('//evil.example/x.mp4')).toBe(false);
    expect(isOwnAssetUrl('/api/storage/..\\..\\etc\\passwd')).toBe(false);
    expect(isOwnAssetUrl('\\evil.example/x.mp4')).toBe(false);
  });

  it('rejects non-strings: 42, null, {}', () => {
    expect(isOwnAssetUrl(42)).toBe(false);
    expect(isOwnAssetUrl(null)).toBe(false);
    expect(isOwnAssetUrl({})).toBe(false);
  });

  it('with NO storage env set: an absolute url is rejected, the relative /api/storage/ form still passes', () => {
    // beforeEach wiped every var — the dev-without-config case must not be
    // locked out of their own local (relative) uploads.
    expect(isOwnAssetUrl('https://cdn.example.com/uploads/u1/1.mp4')).toBe(false);
    expect(isOwnAssetUrl('/api/storage/uploads/u1/1.mp4')).toBe(true);
  });
});

describe('findForeignAssetUrl — what the route actually calls', () => {
  it('returns null for {} — absent keys are fine', () => {
    expect(findForeignAssetUrl({})).toBeNull();
  });

  it('returns null when every sourceVideoUrls entry is ours', () => {
    process.env.R2_PUBLIC_URL = 'https://cdn.example.com';
    expect(
      findForeignAssetUrl({
        sourceVideoUrls: ['/api/storage/uploads/u1/1.mp4', 'https://cdn.example.com/uploads/u1/2.mp4'],
      }),
    ).toBeNull();
  });

  it("returns the offending entry for { sourceVideoUrls: ['/api/storage/ok.mp4', 'http://169.254.169.254/x'] }", () => {
    expect(
      findForeignAssetUrl({ sourceVideoUrls: ['/api/storage/ok.mp4', 'http://169.254.169.254/x'] }),
    ).toBe('http://169.254.169.254/x');
  });

  it.each([
    ['sourceUrl', 'https://evil.example/x.mp4'],
    ['musicUrl', 'https://evil.example/m.mp3'],
    ['sfxUrl', 'https://evil.example/s.mp3'],
  ] as const)('returns the offending value for the scalar key %s', (key, value) => {
    expect(findForeignAssetUrl({ [key]: value })).toBe(value);
  });

  it('returns the offending value for sourceUrls (array key, rejects on first bad entry)', () => {
    expect(
      findForeignAssetUrl({ sourceUrls: ['https://evil.example/a.mp4', '/api/storage/b.mp4'] }),
    ).toBe('https://evil.example/a.mp4');
  });

  it('reports a non-string array entry via String() coercion', () => {
    expect(findForeignAssetUrl({ sourceVideoUrls: [42] })).toBe('42');
  });

  it('ignores sourceImages entirely: { sourceImages: [third-party] } returns null', () => {
    // We never fetch sourceImages — the script provider does — and they come
    // from scraping a real shop page, so third-party origins are by design.
    expect(findForeignAssetUrl({ sourceImages: ['https://someshop.example/p.jpg'] })).toBeNull();
  });
});
