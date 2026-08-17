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

  // IPv4-mapped IPv6 in DECIMAL form, e.g. ::ffff:127.0.0.1 — judge as the IPv4.
  const mappedDecimal = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (mappedDecimal) return isPrivateAddress(mappedDecimal[1]);

  // IPv4-mapped IPv6 in HEX form. This is the one that mattered: `new URL()`
  // NORMALIZES every mapped literal to hex (`::ffff:127.0.0.1` -> `::ffff:7f00:1`),
  // so the decimal regex above NEVER matches a URL-sourced host, and the address
  // fell through to the IPv6 branch below which returned "public". Verified
  // exploit before this fix: `assertPublicHost('http://[::ffff:7f00:1]/')` was
  // true (loopback — Redis, the app itself) and `::ffff:a9fe:a9fe` reached the
  // cloud metadata endpoint 169.254.169.254 — no DNS, no redirect, a signed-in
  // user just posts the URL. Decode the two trailing 16-bit groups to the four
  // IPv4 octets and judge as the IPv4 the kernel actually routes to.
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(addr);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    const v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateAddress(v4);
  }
  // Any OTHER `::ffff:` form we could not decode still denotes an IPv4 address
  // the kernel routes through the v4 stack. Fail CLOSED — treat it as private —
  // rather than let it fall through to the IPv6 branch below, whose default is
  // "public" for anything it does not recognise. A genuinely public mapped
  // address (`::ffff:8.8.8.8` or its hex `::ffff:0808:0808`) is already handled
  // by the two branches above, so nothing legitimate is lost here.
  if (addr.startsWith('::ffff:')) return true;

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
/**
 * The video platforms `/api/import-clip` accepts, and nothing else.
 *
 * **Why a whitelist is the real fix for the yt-dlp redirect gap.**
 * `assertPublicHost` validates only the host the USER typed. yt-dlp then follows
 * HTTP redirects itself, and there is no yt-dlp flag that forbids them or pins a
 * resolved IP — so before this list existed, `http://evil.example/clip` passed
 * the guard (evil.example really is public) and its 302 to
 * `http://169.254.169.254/…` or `http://127.0.0.1:6379/` was fetched from inside
 * the VPS. `/api/scrape` closes the same hole with `redirect: 'manual'`
 * (`scraper.real.ts`), which a spawned binary cannot use.
 *
 * Requiring the FIRST host to be a platform we actually support removes the
 * attacker-controlled redirector entirely: they never get to host the hop. A
 * platform's own open redirect would still be needed, which is a far higher bar
 * than registering a domain.
 *
 * These are exactly the three the UI offers — the paste box is labelled
 * "TikTok / YouTube / Instagram" (`app/matrix/page.tsx`) — so this narrows the
 * accepted set to what is advertised, not below it. Adding a platform later is
 * one line here, and doing so is a deliberate decision rather than a default.
 */
export const ALLOWED_CLIP_HOSTS = new Set([
  // YouTube, including the mobile and no-cookie forms and the short link.
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  // TikTok. `vm.`/`vt.` are its own share shorteners and redirect INTO
  // www.tiktok.com — a redirect inside the whitelist, not one an attacker owns.
  'tiktok.com',
  'www.tiktok.com',
  'm.tiktok.com',
  'vm.tiktok.com',
  'vt.tiktok.com',
  // Instagram.
  'instagram.com',
  'www.instagram.com',
]);

/**
 * True when a URL points at a supported clip platform.
 *
 * Host-only and exact-match against `ALLOWED_CLIP_HOSTS`. Deliberately NOT a
 * suffix test: `endsWith('tiktok.com')` would also accept
 * `eviltiktok.com` and `tiktok.com.attacker.example`, which is the classic way a
 * domain whitelist gets bypassed.
 */
export function isAllowedClipHost(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return ALLOWED_CLIP_HOSTS.has(url.hostname.toLowerCase().replace(/^\[|\]$/g, ''));
}

export async function assertPublicHost(raw: string): Promise<boolean> {
  if (!isSafeTargetUrl(raw)) return false;

  const host = new URL(raw).hostname.replace(/^\[|\]$/g, '');

  // A real IP literal never reaches DNS, so judge it directly. `\d+\.\d+\.\d+\.\d+`
  // and not `[\d.]+`: a name like `1.2.3.4.5` is digits and dots but is NOT an
  // address, and the looser test skipped the DNS lookup for it entirely.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) {
    return !isPrivateAddress(host);
  }

  try {
    const addresses = await lookup(host, { all: true });
    if (addresses.length === 0) return false;
    return !addresses.some((a) => isPrivateAddress(a.address));
  } catch {
    // A name that will not resolve cannot be fetched anyway; fail closed.
    return false;
  }
}
