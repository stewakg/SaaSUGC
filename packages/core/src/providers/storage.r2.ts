/**
 * Real Storage (F5): Cloudflare R2 (S3-compatible) or plain AWS S3 — same
 * class, S3Client's `endpoint` option is what makes R2 work (set it for
 * R2, omit it for real AWS S3). See INFRASTRUCTURE.md §1.
 *
 * Written now so it's ready to wire in once R2_BUCKET or AWS_S3_BUCKET
 * exists (see ACCOUNTS.md) — never instantiated until then. NOT live-tested.
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';
import type { Storage } from '../interfaces.ts';

/**
 * How long a signed link stays usable. Long enough that a customer can start a
 * download, open it in another tab, or come back from a phone notification —
 * short enough that a link pasted into a group chat stops working the same day.
 */
export const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

/** Upload links are handed out at the start of one upload and used immediately. */
export const SIGNED_UPLOAD_TTL_SECONDS = 15 * 60; // 15 minutes

export class S3CompatibleStorage implements Storage {
  readonly name = 's3-storage';
  /**
   * The S3 endpoint actually in use, exposed for diagnostics. Cloudflare serves
   * a different endpoint per bucket JURISDICTION (an EU bucket lives at
   * `<account>.eu.r2.cloudflarestorage.com`), and pointing the default form at
   * an EU bucket fails every request with "bucket not found" — a failure that
   * only shows up on the first real call. Surfacing it lets the startup log and
   * the tests state which one was chosen instead of guessing.
   */
  readonly endpoint?: string;
  private readonly client: S3Client;

  constructor(
    private readonly config: {
      bucket: string;
      publicBaseUrl: string;
      region?: string;
      endpoint?: string;
      accessKeyId: string;
      secretAccessKey: string;
    },
  ) {
    this.endpoint = config.endpoint;
    this.client = new S3Client({
      region: config.region ?? 'auto',
      endpoint: config.endpoint,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async upload(
    key: string,
    data: Buffer | NodeJS.ReadableStream,
    contentType: string,
    contentLength?: number,
  ): Promise<{ url: string }> {
    // The Storage interface types streams as the broad `NodeJS.ReadableStream`
    // interface, but the AWS SDK's `Body` wants Node's `Readable` class (which
    // implements that interface). Every real producer in this repo passes
    // either a Buffer or a Node `Readable` (e.g. fs.createReadStream), so this
    // narrowing is sound at runtime — no `any` cast.
    const isBuffer = Buffer.isBuffer(data);
    const body: Buffer | Readable = isBuffer ? data : (data as Readable);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // A streamed body has no measurable length, and SigV4 cannot sign
        // what it cannot measure — without ContentLength the SDK signs
        // `x-amz-decoded-content-length: undefined` and R2/S3 rejects the PUT.
        // So a caller that knows the byte count (e.g. from the provider's
        // content-length) states it here. A Buffer already carries its own
        // length; do not override it.
        ...(isBuffer || contentLength === undefined ? {} : { ContentLength: contentLength }),
      }),
    );
    return { url: this.assetPath(key) };
  }

  /**
   * The PUBLIC, permanent url for a key.
   *
   * No longer what `upload` returns — that is `assetPath`, our ownership-checked
   * route — so a customer is never handed a permanent public url for guessable
   * keys. Kept for diagnostics and for callers that genuinely want the public
   * form (a bucket that is meant to be world-readable).
   */
  getUrl(key: string): string {
    return `${this.config.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }

  /**
   * Where the APP should point at this object: our own ownership-checked route,
   * not the bucket.
   *
   * `getUrl` is the bucket's public url, and the keys here are guessable enough
   * (`uploads/<userId>/<timestamp>.mp4`) that handing it to a customer exposes
   * every other customer's uploads to anyone who knows a user id. The route
   * checks ownership and then redirects to a signed, expiring url, so this is
   * the form that goes into `assets.url` and into job params. MockStorage has
   * always returned exactly this shape, so both providers now agree.
   */
  assetPath(key: string): string {
    return `/api/storage/${key}`;
  }

  /**
   * A time-limited download link for one object.
   *
   * The signature is computed locally from the credentials — no network call,
   * so this is cheap enough to do per request and does not need caching.
   */
  async signedDownloadUrl(key: string, ttlSeconds = SIGNED_URL_TTL_SECONDS): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      { expiresIn: ttlSeconds },
    );
  }

  /**
   * A time-limited link the BROWSER can PUT straight to, so a 200 MB video
   * never travels through the app server.
   *
   * This is what removes the upload ceiling from the hosting decision: today
   * `POST /api/upload` buffers the whole file in the Node process, which is why
   * a serverless host with a ~4.5 MB body cap cannot serve this app as written.
   *
   * `signableHeaders` is load-bearing and was NOT obvious: passing ContentType
   * to PutObjectCommand alone does not bind it — the SDK signs only `host` by
   * default, which a test caught. Without the explicit set, one signed link
   * would accept ANY content type, so a link issued for an mp4 could be used to
   * store `text/html` that then serves from our own domain. With it, the
   * browser MUST send the same Content-Type on the PUT or the upload is
   * rejected.
   *
   * `contentLength` binds the byte count the same way: the browser sends
   * Content-Length itself on the PUT, and a value other than the signed one
   * fails the signature — so a link issued for a 40 MB clip cannot be reused to
   * store a 10 GB object under the same key. Omit it only when the length is
   * genuinely unknown at signing time.
   */
  async signedUploadUrl(
    key: string,
    contentType: string,
    ttlSeconds = SIGNED_UPLOAD_TTL_SECONDS,
    contentLength?: number,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: contentType,
        ...(contentLength === undefined ? {} : { ContentLength: contentLength }),
      }),
      {
        expiresIn: ttlSeconds,
        // Binding the length is what stops a signed link for a 40 MB clip being
        // used to upload 10 GB: the browser sends Content-Length itself, and a
        // value other than the signed one fails the signature. Same reasoning as
        // the content-type binding above, which a test already pins.
        signableHeaders: new Set(
          contentLength === undefined ? ['content-type'] : ['content-type', 'content-length'],
        ),
      },
    );
  }
}
