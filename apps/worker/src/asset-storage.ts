import { Readable } from 'node:stream';
import { consoleLogger } from '@adgen/core';
import { providers } from './providers.ts';

/**
 * Copy a provider's result into OUR storage and return our own url + key.
 *
 * Every external media provider hands back a URL on its own CDN, and those
 * expire: fal's are temporary by design, and kie.ai's live under
 * `tempfile.aiquickdraw.com` — the name says it. Writing one of those straight
 * into `assets.url` is what makes a paid asset turn into a dead link in "Moje
 * reklame" weeks later, which is exactly the state `image_ads` was in until
 * 2026-08-10.
 *
 * Failure here fails the job on purpose. Falling back to the provider url would
 * "succeed", charge the user, and quietly hand them the same expiring link.
 */

/**
 * Hard ceiling on persistRemoteAsset's buffered fallback, in bytes (200 MB).
 * Exported so the tests assert against the real number instead of a copy of
 * it drifting out of sync.
 */
export const PERSIST_BUFFERED_FALLBACK_CAP_BYTES = 200 * 1024 * 1024;

export async function persistRemoteAsset(
  remoteUrl: string,
  keyPrefix: string,
  // Injected for tests; defaults to the active storage so callers are unchanged.
  storage: Pick<typeof providers.storage, 'upload'> = providers.storage,
): Promise<{ url: string; storageKey: string }> {
  const res = await fetch(remoteUrl);
  if (!res.ok) {
    throw new Error(`could not fetch provider result for ${keyPrefix} (${res.status})`);
  }
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';

  // Extension from the content type, not from the url — provider urls carry
  // query strings and signed-token suffixes that make path parsing unreliable.
  const ext = contentType.includes('png')
    ? 'png'
    : contentType.includes('webp')
      ? 'webp'
      : contentType.includes('jpeg') || contentType.includes('jpg')
        ? 'jpg'
        : contentType.includes('mp4') || contentType.includes('video')
          ? 'mp4'
          : 'bin';

  const storageKey = `${keyPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  if (!res.body) throw new Error(`empty response body for ${keyPrefix}`);

  /**
   * Streamed when the provider tells us the size; buffered (bounded) when it
   * does not.
   *
   * Streaming is the default because `Buffer.from(await res.arrayBuffer())`
   * holds the WHOLE file in memory before a byte is written — fine for a 2 MB
   * image, a multi-hundred-megabyte spike for an upscaled video, and with
   * several jobs running at once that spike is what gets the worker killed by
   * the kernel rather than any single job failing.
   *
   * But a Node stream has no known length, and the AWS SDK cannot sign a
   * PutObject body it cannot measure — R2 rejects it with `Invalid value
   * "undefined" for header "x-amz-decoded-content-length"`, which is exactly
   * how image_ads / enhance / remove_text all died in production. So the
   * stream is only usable when the provider sent a `content-length`; it is
   * passed through as the 4th upload argument so storage can set
   * `ContentLength` on the command.
   */
  const contentLengthHeader = res.headers.get('content-length');
  const contentLength =
    contentLengthHeader !== null && Number.isFinite(Number(contentLengthHeader))
      ? Number(contentLengthHeader)
      : undefined;

  if (contentLength !== undefined) {
    const body = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
    const { url } = await storage.upload(storageKey, body, contentType, contentLength);
    return { url, storageKey };
  }

  /**
   * BUFFERED FALLBACK — exists because the provider answered with a CHUNKED
   * response (no content-length header). That is legal HTTP and some providers
   * do it, and a plain PutObject cannot stream a body of unknown length. So we
   * buffer after all — but bounded, so an unbounded provider response cannot
   * decide the worker's memory: anything over 200 MB is refused with an error
   * naming the key prefix instead of being pulled into RAM. The warn makes the
   * slower path visible in the logs rather than silently slower.
   *
   * Do not "simplify" this away: removing it brings back either the signing
   * failure (stream with no length) or the OOM kill (unbounded buffer).
   */
  consoleLogger.warn(
    `persistRemoteAsset: provider sent no content-length for ${keyPrefix} — taking the buffered fallback (chunked response), capped at ${
      PERSIST_BUFFERED_FALLBACK_CAP_BYTES / (1024 * 1024)
    } MB`,
    { keyPrefix, remoteUrl },
  );
  const raw = await res.arrayBuffer();
  if (raw.byteLength > PERSIST_BUFFERED_FALLBACK_CAP_BYTES) {
    throw new Error(
      `provider result for "${keyPrefix}" is ${Math.ceil(raw.byteLength / (1024 * 1024))} MB but arrived ` +
        `with no content-length (chunked response) — over the ${
          PERSIST_BUFFERED_FALLBACK_CAP_BYTES / (1024 * 1024)
        } MB buffered-fallback cap, refusing to hold it in worker memory`,
    );
  }
  const { url } = await storage.upload(storageKey, Buffer.from(raw), contentType);
  return { url, storageKey };
}

/** True when the source looks like a still image rather than a video. */
export function isImageSource(sourceUrl: string): boolean {
  return /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(sourceUrl);
}

/** Must match S3CompatibleStorage.assetPath / MockStorage's publicPrefix. */
const STORAGE_PATH_PREFIX = '/api/storage/';

const WEB_PUBLIC_URL = process.env.WEB_PUBLIC_URL ?? 'http://localhost:3000';

/**
 * Turn a stored asset url into something this process (and the renderer, and
 * fal) can actually fetch.
 *
 * Storage urls are relative — `/api/storage/<key>` — for both providers. In dev
 * that path is served by the web app off local disk, so prefixing
 * WEB_PUBLIC_URL is enough. In production the bytes live in a PRIVATE R2 bucket
 * and that route requires a session cookie, which no headless process here has:
 * so the key is signed directly instead. The signature is computed locally from
 * the credentials — no network call — and the link expires within the hour.
 *
 * Absolute urls (a provider CDN link, the default background clip) are returned
 * untouched.
 */
export async function resolveStorageUrl(
  url: string,
  storage: unknown = providers.storage,
): Promise<string> {
  if (!url.startsWith('/')) return url;

  const candidate = storage as { signedDownloadUrl?: (key: string) => Promise<string> };
  if (url.startsWith(STORAGE_PATH_PREFIX) && typeof candidate.signedDownloadUrl === 'function') {
    return candidate.signedDownloadUrl(url.slice(STORAGE_PATH_PREFIX.length));
  }

  return `${WEB_PUBLIC_URL}${url}`;
}
