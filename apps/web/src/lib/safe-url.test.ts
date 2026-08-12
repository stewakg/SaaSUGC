/**
 * Tests for the SSRF guard.
 *
 * This is the most security-critical pure function in the web app and had no
 * coverage at all. It decides whether the SERVER will fetch a URL a stranger
 * typed — `/api/scrape` follows it, and `/api/import-clip` hands it to yt-dlp.
 * A hole here turns the app into a proxy for reaching things only it can reach:
 * the VPS's own Redis, a cloud metadata endpoint, anything on the private
 * network.
 *
 * The tests are written as ATTACKS rather than as a restatement of the regex,
 * so a future "simplification" of the pattern has to survive them.
 */
import { describe, expect, it } from 'vitest';
import { assertPublicHost, isPrivateAddress, isSafeTargetUrl } from './safe-url.ts';

describe('isSafeTargetUrl — what must be allowed', () => {
  it.each([
    'https://www.tiktok.com/@user/video/123',
    'https://youtube.com/watch?v=abc&t=10',
    'http://example.com/proizvod',
    'https://shop.example.co.uk/p/1?utm=x#frag',
    // Public IPs are fine — the guard blocks private ranges, not addresses.
    'https://8.8.8.8/',
    'https://172.15.0.1/',
    'https://172.32.0.1/',
  ])('allows %s', (url) => {
    expect(isSafeTargetUrl(url)).toBe(true);
  });
});

describe('isSafeTargetUrl — schemes', () => {
  it.each([
    ['file:///etc/passwd', 'reads a local file'],
    ['ftp://example.com/x', 'a protocol nothing here speaks'],
    ['gopher://example.com/', 'a classic SSRF pivot'],
    ['javascript:alert(1)', 'not a network scheme at all'],
    ['data:text/html,<script>', 'inline payload'],
    ['redis://localhost:6379', 'the queue this project actually runs'],
  ])('rejects %s — %s', (url) => {
    expect(isSafeTargetUrl(url)).toBe(false);
  });
});

describe('isSafeTargetUrl — loopback and metadata', () => {
  it.each([
    'http://localhost/',
    'http://localhost:3000/api/jobs',
    'http://127.0.0.1/',
    'http://0.0.0.0/',
    'http://[::1]/',
    // The one that turns SSRF into stolen cloud credentials.
    'http://169.254.169.254/latest/meta-data/',
  ])('rejects %s', (url) => {
    expect(isSafeTargetUrl(url)).toBe(false);
  });

  it('rejects loopback regardless of case', () => {
    expect(isSafeTargetUrl('http://LOCALHOST/')).toBe(false);
    expect(isSafeTargetUrl('http://LocalHost:8080/x')).toBe(false);
  });

  it('rejects a bracketed IPv6 loopback with a port', () => {
    // URL.hostname keeps the brackets; the guard strips them, and if that ever
    // stops happening every IPv6 check silently passes.
    expect(isSafeTargetUrl('http://[::1]:6379/')).toBe(false);
  });
});

describe('isSafeTargetUrl — RFC-1918 private ranges', () => {
  it.each([
    'http://10.0.0.1/',
    'http://10.255.255.255/',
    'http://192.168.1.1/',
    'http://192.168.0.254:8080/admin',
    'http://169.254.1.1/',
    // The 172.16–172.31 block, at both ends and in the middle.
    'http://172.16.0.1/',
    'http://172.20.10.5/',
    'http://172.31.255.254/',
  ])('rejects %s', (url) => {
    expect(isSafeTargetUrl(url)).toBe(false);
  });

  it('does not over-block the addresses adjacent to the 172.16/12 range', () => {
    // 172.15 and 172.32 are public. A lazy /^172\./ would break real sites.
    expect(isSafeTargetUrl('http://172.15.255.255/')).toBe(true);
    expect(isSafeTargetUrl('http://172.32.0.0/')).toBe(true);
  });
});

describe('isSafeTargetUrl — malformed input', () => {
  it.each(['', '   ', 'not a url', '//example.com/x', 'http://', 'https://:80'])(
    'rejects %s rather than throwing',
    (url) => {
      expect(isSafeTargetUrl(url)).toBe(false);
    },
  );
});

/**
 * The string check alone still cannot see where a name RESOLVES — that is what
 * assertPublicHost below is for, and both routes now use it. Kept as a test so
 * nobody "simplifies" a route back to the sync check.
 */
describe('isSafeTargetUrl — what the STRING check alone cannot see', () => {
  it('passes a hostname that may resolve to a private address', () => {
    expect(isSafeTargetUrl('http://internal.attacker.example/')).toBe(true);
  });

  it('passes a public URL that may redirect to a private one', () => {
    // Not a live hole: the scraper fetches with `redirect: 'manual'` and throws
    // on any 3xx (scraper.real.ts), so nothing follows a redirect unchecked.
    expect(isSafeTargetUrl('https://example.com/redirect-to-localhost')).toBe(true);
  });

});

describe('isSafeTargetUrl — alternate spellings of 127.0.0.1', () => {
  // I expected these to be a gap and asserted so; the test proved otherwise.
  // WHATWG `new URL()` normalises decimal, octal and hex host forms to dotted
  // quad BEFORE the pattern ever sees them, so the guard catches all three.
  // Pinned because that protection is inherited, not written here: swapping
  // `new URL` for any hand-rolled parser would silently reopen it.
  it.each([
    ['http://2130706433/', 'decimal'],
    ['http://0177.0.0.1/', 'octal'],
    ['http://0x7f.0.0.1/', 'hex'],
  ])('rejects %s (%s form of loopback)', (url) => {
    expect(new URL(url).hostname).toBe('127.0.0.1');
    expect(isSafeTargetUrl(url)).toBe(false);
  });
});

describe('isPrivateAddress', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['127.1.2.3', 'the whole 127/8, not just .0.1'],
    ['0.0.0.0', 'this network'],
    ['10.1.2.3', 'private'],
    ['172.16.0.1', 'private, low end'],
    ['172.31.255.254', 'private, high end'],
    ['192.168.1.1', 'private'],
    ['169.254.169.254', 'cloud metadata'],
    ['100.64.0.1', 'CGNAT — reaches the provider network'],
    ['::1', 'IPv6 loopback'],
    ['::', 'IPv6 unspecified'],
    ['fc00::1', 'unique-local'],
    ['fd12:3456::1', 'unique-local'],
    ['fe80::1', 'link-local'],
    ['::ffff:127.0.0.1', 'IPv4 loopback written as IPv6'],
    ['::ffff:10.0.0.1', 'IPv4 private written as IPv6'],
  ])('blocks %s (%s)', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each([
    ['8.8.8.8', 'public'],
    ['1.1.1.1', 'public'],
    ['172.15.0.1', 'just below the private block'],
    ['172.32.0.1', 'just above the private block'],
    ['100.63.255.255', 'just below CGNAT'],
    ['100.128.0.1', 'just above CGNAT'],
    ['2606:4700::1111', 'public IPv6'],
    ['::ffff:8.8.8.8', 'public IPv4 written as IPv6'],
  ])('allows %s (%s)', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe('assertPublicHost — the check the routes actually use', () => {
  it('resolves a real name and blocks it when it points at loopback', async () => {
    // A genuine DNS lookup, offline: every machine resolves localhost to
    // 127.0.0.1. This is the bypass the string check could not see.
    await expect(assertPublicHost('http://localhost:8080/x')).resolves.toBe(false);
  });

  it('still rejects everything the string check rejected', async () => {
    await expect(assertPublicHost('file:///etc/passwd')).resolves.toBe(false);
    await expect(assertPublicHost('http://169.254.169.254/')).resolves.toBe(false);
    await expect(assertPublicHost('not a url')).resolves.toBe(false);
  });

  it('allows a public IP literal without touching DNS', async () => {
    await expect(assertPublicHost('https://8.8.8.8/')).resolves.toBe(true);
  });

  it('fails closed when a name does not resolve', async () => {
    await expect(
      assertPublicHost('http://nonexistent.invalid-tld-that-cannot-resolve/'),
    ).resolves.toBe(false);
  });
});
