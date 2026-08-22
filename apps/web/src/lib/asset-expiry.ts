/**
 * Retention on the APP side: how old a raw upload is, read out of the storage
 * key. The bucket's lifecycle rules delete customer data 30 days after it is
 * written (packages/core/src/retention.ts is that promise's single source of
 * truth) — this module lets /api/storage answer for a file that no longer
 * exists instead of redirecting to a signed url that 404s.
 */

/** No object in this bucket predates the app itself — an earlier "stamp" is a parse accident. */
const MIN_PLAUSIBLE_MS = Date.parse('2020-01-01T00:00:00Z');

/** Slack for clock skew between the machine that wrote a key and this process. */
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

/**
 * The moment an `uploads/<user id>/…` object was written, read out of the key itself.
 *
 * Raw uploads have no `assets` row (assets.job_id is NOT NULL and no job exists at upload time),
 * so the database cannot say how old one is — but every key this app writes carries a
 * `Date.now()` stamp: `/api/upload` and `/api/upload/sign` write
 * `uploads/<uid>/<millis><ext>`, and `/api/import-clip` writes
 * `uploads/<uid>/imported-<millis><ext>`.
 *
 * Returns null when the stamp is not there or is not a plausible time. Null means "cannot tell",
 * and the caller must let the request through: the bucket is the authority on whether an object
 * still exists, and refusing a key we merely failed to parse would break a live upload.
 */
export function uploadKeyWrittenAtMs(key: string): number | null {
  // Only uploads/ keys carry a stamp; job outputs (renders/, voice/, …) have an
  // `assets` row whose created_at says how old they are.
  if (!key.startsWith('uploads/')) return null;

  // The stamp lives in the LAST path segment, and /api/import-clip writes it
  // behind an `imported-` prefix.
  const lastSegment = key.slice(key.lastIndexOf('/') + 1);
  const name = lastSegment.startsWith('imported-')
    ? lastSegment.slice('imported-'.length)
    : lastSegment;

  // A short run of digits is a filename like `123.mp4`, not a Date.now() stamp.
  const digits = /^[0-9]+/.exec(name)?.[0] ?? '';
  if (digits.length < 10) return null;

  const writtenAtMs = Number.parseInt(digits, 10);
  if (!Number.isFinite(writtenAtMs)) return null;

  // Plausible as a TIME, not just as a number: a stamp from the future is a
  // parse accident, not a file.
  if (writtenAtMs < MIN_PLAUSIBLE_MS || writtenAtMs > Date.now() + FUTURE_SLACK_MS) return null;
  return writtenAtMs;
}
