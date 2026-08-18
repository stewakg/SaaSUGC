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
 * If `addr` is an IPv4-mapped IPv6 address, return the IPv4 it maps to;
 * otherwise null.
 *
 * Expands the address to its eight 16-bit groups first, so EVERY spelling of the
 * same address reduces to the same answer — `::ffff:127.0.0.1`, its hex
 * `::ffff:7f00:1`, the unabbreviated `0:0:0:0:0:ffff:7f00:1`, and zero-padded
 * variants like `0000:0000:0000:0000:0000:ffff:7f00:0001`. Mapped means the
 * first five groups are zero and the sixth is ffff (RFC 4291 §2.5.5.2); the last
 * two groups carry the four IPv4 octets.
 *
 * Deliberately NOT a regex. Two successive regexes here each missed a different
 * spelling of loopback, and each miss was a live SSRF.
 */
function expandIPv6(addr: string): number[] | null {
  if (!addr.includes(':')) return null;

  // A trailing dotted quad (`::ffff:127.0.0.1`) is the one form that is not pure
  // hex groups. Convert it to two hex groups up front so the expansion below
  // sees a uniform shape.
  let normalised = addr;
  const dotted = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(addr);
  if (dotted) {
    const octets = [dotted[2], dotted[3], dotted[4], dotted[5]].map(Number);
    if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return null;
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    normalised = `${dotted[1]}${hi}:${lo}`;
  }

  // Expand `::` into the zero groups it stands for.
  const halves = normalised.split('::');
  if (halves.length > 2) return null; // more than one `::` is not a valid address
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : [];
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    groups = [...head, ...Array<string>(missing).fill('0'), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;

  return groups.map((g) => parseInt(g, 16));
}

/** The IPv4 that the last two groups of an expanded IPv6 encode. */
function v4FromGroups(hi: number, lo: number): string {
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

/**
 * True when an IP literal points somewhere only this server can reach.
 *
 * Covers both families, because a v6-only check that forgets `::ffff:10.0.0.1`
 * (an IPv4 address written as IPv6) is a check that does nothing.
 */
export function isPrivateAddress(ip: string): boolean {
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, '');

  // IPv4-mapped IPv6, in EVERY spelling. Judged as the IPv4 the kernel actually
  // routes to.
  //
  // This is the check that was broken, and the history is worth keeping because
  // it explains why it is written as an expansion and not as a regex. It used to
  // match only the literal decimal form `::ffff:127.0.0.1` — and `new URL()`
  // NORMALISES every mapped literal to hex (`::ffff:7f00:1`), even when the user
  // types decimal, so the pattern could never match a URL-sourced host. The
  // address fell through to the IPv6 branch below, whose default is "public":
  //
  //   assertPublicHost('http://[::ffff:7f00:1]/')    -> true   (127.0.0.1)
  //   assertPublicHost('http://[::ffff:a9fe:a9fe]/') -> true   (169.254.169.254)
  //
  // A no-prerequisite SSRF on /api/scrape and /api/import-clip. Fixing it with a
  // second regex for the hex form then left a THIRD hole — the unabbreviated
  // `0:0:0:0:0:ffff:7f00:1`, which `new URL()` compresses but a DNS resolver can
  // hand back raw, and `assertPublicHost` passes resolver output straight in.
  // Two regexes missing two spellings is the signal to stop pattern-matching and
  // parse the address properly.
  if (addr.includes(':')) {
    const g = expandIPv6(addr);
    // Not a parseable IPv6 but contains a colon: fail CLOSED. An address we
    // cannot understand is not an address we can vouch for.
    if (!g) return true;

    // IPv4-MAPPED (::ffff:a.b.c.d) — first five groups zero, sixth ffff.
    if (g.slice(0, 5).every((v) => v === 0) && g[5] === 0xffff) {
      return isPrivateAddress(v4FromGroups(g[6], g[7]));
    }

    // Everything else with the top six groups zero. This is where the SECOND
    // family of spelling bugs lived: the check used to be `addr === '::1'`, a
    // STRING compare, so the unabbreviated `0:0:0:0:0:0:0:1` — which a DNS
    // resolver may return and which `assertPublicHost` passes in raw — read as
    // public. Same class as the mapped bug, missed because only the mapped
    // branch got rewritten. Judged numerically now, so every spelling agrees.
    if (g.slice(0, 6).every((v) => v === 0)) {
      if (g[6] === 0 && g[7] === 0) return true; // :: unspecified
      if (g[6] === 0 && g[7] === 1) return true; // ::1 loopback
      // ::a.b.c.d — deprecated IPv4-compatible, still routed via the v4 stack
      // on some hosts. Judge it as the IPv4 rather than trusting the form.
      return isPrivateAddress(v4FromGroups(g[6], g[7]));
    }

    // Numeric prefix tests, not string prefixes — `/^f[cd]/` on the text would
    // also have to be re-taught every alternative spelling.
    if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
    if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    // NAT64, local-use (64:ff9b:1::/48, RFC 8215). Blocked WHOLESALE rather
    // than decoded, and the choice is deliberate.
    //
    // RFC 6052 embeds the IPv4 at a position that depends on the prefix
    // LENGTH — /32, /40, /48, /56, /64 and /96 each put the octets somewhere
    // different, with a reserved `u` byte interrupting them in the middle
    // lengths. This file has already produced six spelling bugs by decoding
    // things one position at a time, and a /48 decoder would be a seventh
    // candidate for no gain: nothing this product fetches (a TikTok, YouTube
    // or Instagram clip, a shop page) is ever reachable ONLY through a
    // local-use NAT64 prefix, so refusing the whole /48 costs nothing real.
    //
    // It must be tested BEFORE the /96 branch below and cannot be folded into
    // it: they share the first two groups, so the /96 test alone matches these
    // addresses too and would decode them from groups 6-7 — the wrong bits for
    // a /48 embedding, i.e. a confident answer computed from the wrong place.
    if (g[0] === 0x0064 && g[1] === 0xff9b && g[2] === 0x0001) return true;
    // NAT64 well-known (64:ff9b::/96) carries an embedded IPv4 that the
    // translator will reach on our behalf, so judge the address it actually
    // delivers to.
    //
    // Matched on the first two groups only, on purpose. An earlier version of
    // this branch also required `g[2] === 0x0000`, to "distinguish it from the
    // local-use /48 above" — but the /48 branch runs first and already returns
    // for every 64:ff9b:1:: address, so that condition never separated anything.
    // What it DID do was let unassigned spellings like `64:ff9b:2::7f00:1` fall
    // through to "public", where the wider match decodes them and blocks the
    // embedded loopback. Removing it is the fail-closed direction, and a
    // mutation audit is what surfaced it: dropping the condition broke zero of
    // 113 tests, which is how a change that only ever loosens things hides.
    if (g[0] === 0x0064 && g[1] === 0xff9b) {
      return isPrivateAddress(v4FromGroups(g[6], g[7]));
    }
    // 6to4 (2002::/16) — the embedded IPv4 sits in groups 1-2, NOT 6-7 like the
    // two prefixes above, which is why it needed its own branch and not another
    // entry in theirs. `2002:7f00:1::1` is loopback and used to read as public.
    // Fifth spelling in this family, found by an external audit probing 6to4
    // specifically after the fourth. Reachability is lower than the others — the
    // host has to actually route 2002::/16, which Hetzner does not by default —
    // but "does not route it today" is a property of the network, not of this
    // guard, and the guard is the thing that has to stay true.
    if (g[0] === 0x2002) {
      return isPrivateAddress(v4FromGroups(g[1], g[2]));
    }
    // Teredo (2001:0::/32) — the SIXTH member of the same family, and the last
    // transition mechanism that embeds a v4 address. Blocked wholesale rather
    // than decoded, which is a deliberate trade:
    //
    // Teredo hides the client's IPv4 in the last two groups BIT-INVERTED
    // (`2001:0::807f:fffe` is 127.0.0.1), and the server's in groups 2-3 plainly.
    // Decoding is fiddly and each fiddly step is another spelling to get wrong —
    // this file has now had five of those. The product case decides it: nothing
    // we fetch (a TikTok/YouTube/Instagram clip, a shop page) is ever legitimately
    // reachable only over Teredo, so refusing the whole /32 costs nothing real
    // and cannot be got wrong.
    //
    // Note the mask must be BOTH groups: 2001::/16 alone would also swallow
    // 2001:db8:: and much of the ordinary global v6 space.
    if (g[0] === 0x2001 && g[1] === 0x0000) return true;
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
