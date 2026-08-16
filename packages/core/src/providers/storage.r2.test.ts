/**
 * Tests for the R2/S3 storage provider's URL surface.
 *
 * These run entirely offline and still test the real thing: AWS SigV4 signing
 * is local cryptography over the request, not a call to anyone, so
 * `getSignedUrl` produces a genuine signature from throwaway credentials. That
 * makes this one of the few parts of the never-live-tested R2 client that can
 * be verified for real before a bucket exists.
 *
 * What is NOT covered, and cannot be here: whether Cloudflare actually accepts
 * these signatures. That needs a real bucket (RELEASE_PLAN L1.3).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import {
  S3CompatibleStorage,
  SIGNED_UPLOAD_TTL_SECONDS,
  SIGNED_URL_TTL_SECONDS,
} from './storage.r2.ts';

/** Throwaway credentials — SigV4 does not care whether an account exists. */
function storage() {
  return new S3CompatibleStorage({
    bucket: 'adgen-test',
    publicBaseUrl: 'https://cdn.example.test/',
    endpoint: 'https://accountid.r2.cloudflarestorage.com',
    accessKeyId: 'AKIAEXAMPLEEXAMPLE',
    secretAccessKey: 'sekritsekritsekritsekritsekritsekritsekr',
  });
}

describe('getUrl — the public, permanent form', () => {
  it('joins the base and key with exactly one slash', () => {
    // The trailing slash on publicBaseUrl is deliberate in the fixture: a
    // double slash silently produces a different object path on some hosts.
    expect(storage().getUrl('renders/a.mp4')).toBe('https://cdn.example.test/renders/a.mp4');
  });

  it('carries no signature or expiry — that is the whole difference', () => {
    const url = storage().getUrl('uploads/user-1/1.mp4');
    expect(url).not.toContain('X-Amz-Signature');
    expect(url).not.toContain('X-Amz-Expires');
  });
});

describe('assetPath / upload — the ownership-checked route form', () => {
  it('upload returns the route path, not the bucket url', async () => {
    // Same prototype seam as the ContentLength suite below: upload() sends
    // through its own S3Client, the spy swallows the send, no socket opens.
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    try {
      const { url } = await storage().upload('uploads/u1/123.mp4', Buffer.from('abc'), 'video/mp4');
      expect(url).toBe('/api/storage/uploads/u1/123.mp4');
      // The public base must not leak into what the app hands a customer.
      expect(url).not.toContain('cdn.example.test');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('getUrl still returns the public base form — pinned so a future edit cannot quietly change both at once', () => {
    expect(storage().getUrl('uploads/u1/123.mp4')).toBe('https://cdn.example.test/uploads/u1/123.mp4');
  });

  it('assetPath does not double a slash when the key already has none, and keeps nested keys intact', () => {
    expect(storage().assetPath('renders/a.mp4')).toBe('/api/storage/renders/a.mp4');
    expect(storage().assetPath('renders/a/b.mp4')).toBe('/api/storage/renders/a/b.mp4');
  });
});

describe('signedDownloadUrl', () => {
  it('points at the bucket endpoint and carries a real signature', async () => {
    const url = await storage().signedDownloadUrl('renders/a.mp4');
    const parsed = new URL(url);

    // Virtual-hosted style: the SDK puts the bucket in the HOST, not the path.
    // Worth pinning — a CORS or custom-domain rule written against the
    // path-style form would silently not match.
    expect(parsed.origin).toBe('https://adgen-test.accountid.r2.cloudflarestorage.com');
    expect(parsed.pathname).toBe('/renders/a.mp4');
    expect(parsed.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
  });

  it('expires in an hour by default', async () => {
    const url = await storage().signedDownloadUrl('renders/a.mp4');
    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe(String(SIGNED_URL_TTL_SECONDS));
    expect(SIGNED_URL_TTL_SECONDS).toBe(3600);
  });

  it('honours an explicit ttl', async () => {
    const url = await storage().signedDownloadUrl('renders/a.mp4', 90);
    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('90');
  });

  it('signs each key differently', async () => {
    const s = storage();
    const [a, b] = await Promise.all([
      s.signedDownloadUrl('renders/a.mp4'),
      s.signedDownloadUrl('renders/b.mp4'),
    ]);
    // A signature that did not cover the key would let one link fetch any
    // object in the bucket.
    expect(new URL(a).searchParams.get('X-Amz-Signature')).not.toBe(
      new URL(b).searchParams.get('X-Amz-Signature'),
    );
  });

  it('escapes a key containing characters that would otherwise break the path', async () => {
    const url = await storage().signedDownloadUrl('uploads/user 1/klip (1).mp4');
    const parsed = new URL(url);
    expect(parsed.pathname).not.toContain(' ');
    expect(decodeURIComponent(parsed.pathname)).toContain('uploads/user 1/klip (1).mp4');
  });
});

describe('signedUploadUrl', () => {
  it('is a PUT link with a short default ttl', async () => {
    const url = await storage().signedUploadUrl('uploads/user-1/clip.mp4', 'video/mp4');
    const params = new URL(url).searchParams;

    expect(params.get('X-Amz-Expires')).toBe(String(SIGNED_UPLOAD_TTL_SECONDS));
    expect(SIGNED_UPLOAD_TTL_SECONDS).toBe(900);
    expect(params.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('binds the content type into the signature', async () => {
    const s = storage();
    const [asVideo, asHtml] = await Promise.all([
      s.signedUploadUrl('uploads/user-1/clip.mp4', 'video/mp4'),
      s.signedUploadUrl('uploads/user-1/clip.mp4', 'text/html'),
    ]);

    // Same key, different declared type, different signature — which is what
    // stops a link issued for a video being reused to store a web page in the
    // bucket and served from our own domain.
    expect(new URL(asVideo).searchParams.get('X-Amz-Signature')).not.toBe(
      new URL(asHtml).searchParams.get('X-Amz-Signature'),
    );
    expect(new URL(asVideo).searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
  });

  /**
   * Presigning never goes through S3Client.send — the presigner resolves the
   * command's own middleware chain — so the send-spy seam used for `upload`
   * further down cannot observe it. Instead: mock the presigner for the
   * duration of one call, re-import the module fresh so it binds to the mock,
   * and capture the exact command and options it was handed. The url-level
   * assertions around this helper still go through the REAL signer.
   */
  async function captureSigning(key: string, contentType: string, contentLength?: number) {
    const getSignedUrl = vi.fn();
    vi.resetModules();
    vi.doMock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl }));
    try {
      const { S3CompatibleStorage: FreshStorage } = await import('./storage.r2.ts');
      await new FreshStorage({
        bucket: 'adgen-test',
        publicBaseUrl: 'https://cdn.example.test/',
        endpoint: 'https://accountid.r2.cloudflarestorage.com',
        accessKeyId: 'AKIAEXAMPLEEXAMPLE',
        secretAccessKey: 'sekritsekritsekritsekritsekritsekritsekr',
      }).signedUploadUrl(key, contentType, undefined, contentLength);
      return { calls: getSignedUrl.mock.calls };
    } finally {
      vi.doUnmock('@aws-sdk/s3-request-presigner');
    }
  }

  it('signs exactly [content-type] (plus the unavoidable host) when no length is given', async () => {
    const url = await storage().signedUploadUrl('uploads/user-1/clip.mp4', 'video/mp4');
    const signed = (new URL(url).searchParams.get('X-Amz-SignedHeaders') ?? '').split(';');
    // `host` is always part of a SigV4 presign; what this pins is that
    // content-length is NOT signed and nothing else crept in — today's
    // behaviour, unchanged.
    expect(new Set(signed)).toEqual(new Set(['host', 'content-type']));
  });

  it('binds content-length too when a length is given, and the command carries it', async () => {
    const url = await storage().signedUploadUrl('uploads/user-1/clip.mp4', 'video/mp4', undefined, 40 * 1024 * 1024);
    const signed = (new URL(url).searchParams.get('X-Amz-SignedHeaders') ?? '').split(';');
    expect(signed).toContain('content-type');
    expect(signed).toContain('content-length');

    const { calls } = await captureSigning('uploads/user-1/clip.mp4', 'video/mp4', 40 * 1024 * 1024);
    const command = calls[0][1] as PutObjectCommand;
    expect(command.input.ContentLength).toBe(40 * 1024 * 1024);
    expect(command.input.ContentType).toBe('video/mp4');
  });

  it('still returns a real url, with the key and bucket passed through', async () => {
    const url = await storage().signedUploadUrl('uploads/user-1/clip.mp4', 'video/mp4', undefined, 3);
    expect(typeof url).toBe('string');
    const parsed = new URL(url);
    // Virtual-hosted style: the bucket lands in the host, the key in the path
    // (same pins as the signedDownloadUrl suite above).
    expect(parsed.origin).toBe('https://adgen-test.accountid.r2.cloudflarestorage.com');
    expect(parsed.pathname).toBe('/uploads/user-1/clip.mp4');

    const { calls } = await captureSigning('uploads/user-1/clip.mp4', 'video/mp4', 3);
    const command = calls[0][1] as PutObjectCommand;
    expect(command.input.Bucket).toBe('adgen-test');
    expect(command.input.Key).toBe('uploads/user-1/clip.mp4');
  });
});

describe('upload — ContentLength on the PUT (the streamed-body signing fix)', () => {
  /**
   * upload() sends through its own S3Client, so the command is captured at the
   * prototype seam — no socket is opened, and the REAL PutObjectCommand (the
   * exact input the SDK would sign) is what gets inspected.
   */
  /** Typed via the factory so `send` carries the real MockInstance type. */
  function createSendSpy() {
    return vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
  }
  let send: ReturnType<typeof createSendSpy>;
  beforeEach(() => {
    send = createSendSpy();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes ContentLength when one is given with a STREAM body — and the command is otherwise unchanged', async () => {
    const stream = Readable.from([Buffer.from('abc')]);
    const { url } = await storage().upload('enhance/1.png', stream, 'image/png', 3);

    const cmd = send.mock.calls[0][0] as PutObjectCommand;
    expect(cmd.input.ContentLength).toBe(3);
    expect(cmd.input.Bucket).toBe('adgen-test');
    expect(cmd.input.Key).toBe('enhance/1.png');
    expect(cmd.input.ContentType).toBe('image/png');
    expect(cmd.input.Body).toBe(stream);
    expect(url).toBe('/api/storage/enhance/1.png');
  });

  it('does NOT set ContentLength when the body is a Buffer — a Buffer carries its own length', async () => {
    await storage().upload('uploads/u/1.mp4', Buffer.from('abc'), 'video/mp4', 3);
    const cmd = send.mock.calls[0][0] as PutObjectCommand;
    expect(cmd.input.ContentLength).toBeUndefined();
    expect(cmd.input.Bucket).toBe('adgen-test');
    expect(cmd.input.Key).toBe('uploads/u/1.mp4');
  });

  it('does not invent a ContentLength when none was given — stream or Buffer', async () => {
    await storage().upload('a/b.png', Readable.from([Buffer.from('x')]), 'image/png');
    expect((send.mock.calls[0][0] as PutObjectCommand).input.ContentLength).toBeUndefined();

    await storage().upload('a/c.png', Buffer.from('x'), 'image/png');
    expect((send.mock.calls[1][0] as PutObjectCommand).input.ContentLength).toBeUndefined();
  });
});
