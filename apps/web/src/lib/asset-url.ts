/**
 * Whitelist for the url-bearing values a client may put in a job's `params`.
 *
 * The worker fetches these urls itself (`downloadClip`, the renderer's own
 * fetches, the media-edit source). Until this guard existed, `POST /api/jobs`
 * stored `params` untouched, so any signed-in user could aim the worker at
 * `http://169.254.169.254/...` — cloud metadata, reachable from the VPS, from
 * inside the one process that holds the service-role key.
 *
 * The guard is an origin whitelist rather than a private-range check, because
 * unlike `/api/scrape` we know exactly what a legitimate value looks like: every
 * one of them was minted by our own `/api/upload` or `/api/import-clip`, so it
 * is either a relative `/api/storage/...` path (MockStorage, dev) or an absolute
 * url on our own public storage base. Anything else is a request we have no
 * reason to make.
 *
 * `sourceImages` is intentionally absent from the key list: those come from
 * scraping a shop page, so they ARE third-party origins by design — and we never
 * fetch them, the script provider does.
 */

/** Params whose values the worker turns into an outbound request. */
export const URL_PARAM_KEYS = [
  'sourceUrl',
  'sourceUrls',
  'sourceVideoUrls',
  'musicUrl',
  'sfxUrl',
] as const;

const LOCAL_STORAGE_PREFIX = '/api/storage/';

/**
 * Read from `process.env` on every call, never memoised at module load: the
 * route runs in a long-lived server process, tests set these per case, and a
 * value captured at import time would freeze whichever was set first.
 */
function allowedOrigins(): string[] {
  const raw = [
    process.env.R2_PUBLIC_URL,
    process.env.AWS_S3_PUBLIC_URL,
    process.env.WEB_PUBLIC_URL,
  ];
  const origins: string[] = [];
  for (const value of raw) {
    if (!value) continue;
    try {
      origins.push(new URL(value).origin);
    } catch {
      // A malformed env value must not widen the whitelist — skip it.
    }
  }
  return origins;
}

/** True when `value` is a url this app minted and the worker may fetch. */
export function isOwnAssetUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  if (!url) return false;

  // Relative form: MockStorage in dev returns `/api/storage/<key>`. `//host` is
  // a protocol-relative url pointing somewhere else entirely, and a backslash
  // gets normalised to `/` by some clients, so both are refused.
  if (url.startsWith('/')) {
    if (url.startsWith('//') || url.includes('\\')) return false;
    return url.startsWith(LOCAL_STORAGE_PREFIX);
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return allowedOrigins().includes(parsed.origin);
}

/**
 * Returns the first value in `params` that the worker would fetch but that is
 * not ours, or `null` when every url-bearing key is acceptable. Absent keys are
 * fine; an array key rejects on its first bad entry, including non-strings.
 */
export function findForeignAssetUrl(params: Record<string, unknown>): string | null {
  for (const key of URL_PARAM_KEYS) {
    const value = params[key];
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (!isOwnAssetUrl(entry)) return typeof entry === 'string' ? entry : String(entry);
      }
      continue;
    }

    if (!isOwnAssetUrl(value)) return typeof value === 'string' ? value : String(value);
  }
  return null;
}
