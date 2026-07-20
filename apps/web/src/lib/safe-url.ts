/**
 * SSRF guard for user-supplied URLs that the server will fetch (product scrape,
 * clip import via yt-dlp). Blocks non-http(s) schemes, localhost, RFC-1918
 * private ranges, and the cloud metadata address. Shared by /api/scrape and
 * /api/import-clip so the two never drift.
 */
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
