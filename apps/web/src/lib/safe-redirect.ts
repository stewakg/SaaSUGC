/**
 * Whitelist for the `next` redirect parameter used by the login page and the
 * auth callback.
 *
 * Both used to trust the value. `?next=https://evil.example` sent a freshly
 * authenticated user off-site straight from the password screen, and the
 * callback's `${origin}${next}` concatenation was no protection either:
 * `?next=@evil.example` becomes `https://oursite@evil.example`, which is a url
 * whose HOST is `evil.example` — the site name is only the userinfo part.
 *
 * So the rule is a whitelist, not a blacklist: the value must be a path on this
 * site and nothing else. Anything unexpected falls back to `/app` rather than
 * erroring — a login that lands on the dashboard is a fine outcome; a login that
 * lands on a phishing page is not.
 */
export const DEFAULT_REDIRECT = '/app';

/** Rejects C0 controls and DEL: a newline here would split the Location header. */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function safeNextPath(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return DEFAULT_REDIRECT;
  const value = raw.trim();

  // Must be a rooted path. This alone rejects `https://evil.example`,
  // `//evil.example`, `@evil.example` and `javascript:alert(1)`.
  if (!value.startsWith('/')) return DEFAULT_REDIRECT;

  // `//host` is a protocol-relative url: the browser reads it as "some other
  // host", not as a path on this one.
  if (value.startsWith('//')) return DEFAULT_REDIRECT;

  // A backslash is never legitimate in our paths, and browsers have
  // historically normalised it to `/`, which reopens the case above.
  if (value.includes('\\')) return DEFAULT_REDIRECT;

  if (hasControlChar(value)) return DEFAULT_REDIRECT;

  return value;
}
