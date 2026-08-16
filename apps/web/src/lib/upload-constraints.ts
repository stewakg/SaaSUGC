/**
 * What a user may upload — the shared constraint set for BOTH upload routes:
 * `POST /api/upload` (multipart, relayed through the app server) and
 * `POST /api/upload/sign` (presigned PUT, browser straight to Storage). The two
 * must enforce identical limits: anything the signing route lets through that
 * the multipart route would refuse is a hole, not a shortcut.
 *
 * Extracted from /api/upload/route.ts so neither route can drift from the
 * other. `EXT_BY_TYPE` must also stay in lockstep with `CONTENT_TYPES` in
 * `/api/storage/[...path]`, which has to be able to serve every extension
 * this map can produce.
 */

export const MAX_SIZE_BYTES = 200 * 1024 * 1024; // 200MB

export const ALLOWED_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'image/png',
  'image/jpeg',
  'image/webp',
  // Audio: background music / CTA sound effects the user supplies for a Matrix ad.
  // `audio/mp4` and `audio/x-m4a` are both seen for .m4a depending on the browser.
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
]);

/**
 * Canonical extension per allowed MIME type. The stored key's extension is
 * derived from the type we validated, never from the client-supplied filename —
 * `/api/storage` picks the response Content-Type by extension, so letting the
 * filename choose it would let an upload be served as a type it is not.
 *
 * Keep this in lockstep with ALLOWED_TYPES above (every allowed type has exactly
 * one extension here) AND with CONTENT_TYPES in `/api/storage/[...path]`, which
 * must be able to serve every extension this can produce.
 */
export const EXT_BY_TYPE: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
};
