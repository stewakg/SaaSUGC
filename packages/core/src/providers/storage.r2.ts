/**
 * Real Storage (F5): Cloudflare R2 (S3-compatible) or plain AWS S3 — same
 * class, S3Client's `endpoint` option is what makes R2 work (set it for
 * R2, omit it for real AWS S3). See INFRASTRUCTURE.md §1.
 *
 * Written now so it's ready to wire in once R2_BUCKET or AWS_S3_BUCKET
 * exists (see ACCOUNTS.md) — never instantiated until then. NOT live-tested.
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import type { Storage } from '../interfaces.ts';

export class S3CompatibleStorage implements Storage {
  readonly name = 's3-storage';
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
    this.client = new S3Client({
      region: config.region ?? 'auto',
      endpoint: config.endpoint,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async upload(key: string, data: Buffer | NodeJS.ReadableStream, contentType: string): Promise<{ url: string }> {
    // The Storage interface types streams as the broad `NodeJS.ReadableStream`
    // interface, but the AWS SDK's `Body` wants Node's `Readable` class (which
    // implements that interface). Every real producer in this repo passes
    // either a Buffer or a Node `Readable` (e.g. fs.createReadStream), so this
    // narrowing is sound at runtime — no `any` cast.
    const body: Buffer | Readable = Buffer.isBuffer(data) ? data : (data as Readable);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: body, ContentType: contentType }),
    );
    return { url: this.getUrl(key) };
  }

  getUrl(key: string): string {
    return `${this.config.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }
}