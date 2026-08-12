/**
 * SSRF guard for user-supplied URLs that the server will fetch (product scrape,
 * clip import via yt-dlp). Blocks non-http(s) schemes, localhost, RFC-1918
 * private ranges, and the cloud metadata address. Shared by /api/scrape and
 * /api/import-clip so the two never drift.
 *
 * There are TWO checks here and they are not interchangeable:
 *
 *   isSafeTargetUrl(url)   — synchronous, looks at the STRING only.
 *   assertPublicHost(url)  — async, additionally RESOLVES the hostname and
 *                            rejects if it points anywhere private.
 *
 * The string check alone is not enough: `http://internal.attacker.example/`
 * looks perfectly public and can have a DNS A record pointing at 127.0.0.1.
 * Anything that is about to actually fetch must use the async one.
 */
import { lookup } from 'node:dns/promises';

const PRIVATE_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '169.254.169.254']);
const PRIVATE_IP_PATTERN = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/;

export function isSafeTargetUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  // IPv6 hostnames come back bracketed (e.g. "[::1]") — strip that before
  // matching, or the loopback/private checks below never fire.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (PRIVATE_HOSTS.has(host)) return false;
  if (PRIVATE_IP_PATTERN.test(host)) return false;
  return true;
}

/**
 * True when an IP literal points somewhere only this server can reach.
 *
 * Covers both families, because a v6-only check that forgets `::ffff:10.0.0.1`
 * (an IPv4 address written as IPv6) is a check that does nothing.
 */
export function isPrivateAddress(ip: string): boolean {
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, '');

  // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1 — judge it as the IPv4 it is.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (mapped) return isPrivateAddress(mapped[1]);

  if (addr.includes(':')) {
    if (addr === '::' || addr === '::1') return true; // unspecified, loopback
    if (/^f[cd]/.test(addr)) return true; // fc00::/7 unique-local
    if (/^fe[89ab]/.test(addr)) return true; // fe80::/10 link-local
    return false;
  }

  const parts = addr.split('.');
  if (parts.length !== 4) return false;
  const [a, b] = parts.map(Number);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return false;

  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  return false;
}

/**
 * The check to use before actually fetching: string rules PLUS a DNS lookup,
 * rejecting if ANY address the name resolves to is private.
 *
 * `all: true` matters — a name can return several addresses, and checking only
 * the first lets an attacker put one public address in front of a private one.
 *
 * **What this still does not stop: DNS rebinding.** The name is resolved here,
 * and resolved again by whatever fetches afterwards; an attacker controlling
 * the record with a very short TTL can answer differently the second time.
 * Closing that means pinning the resolved IP and connecting to it directly with
 * a Host header, which neither `fetch` nor the yt-dlp binary lets us do. This
 * raises the bar a long way; it does not make the door airtight.
 */
export async function assertPublicHost(raw: string): Promise<boolean> {
  if (!isSafeTargetUrl(raw)) return false;

  const host = new URL(raw).hostname.replace(/^\[|\]$/g, '');

  // An IP literal never reaches DNS; the string check above already judged it.
  if (/^[\d.]+$/.test(host) || host.includes(':')) return !isPrivateAddress(host);

  try {
    const addresses = await lookup(host, { all: true });
    if (addresses.length === 0) return false;
    return !addresses.some((a) => isPrivateAddress(a.address));
  } catch {
    // A name that will not resolve cannot be fetched anyway; fail closed.
    return false;
  }
}
