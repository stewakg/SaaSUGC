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
import { describe, expect, it } from 'vitest';
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
});
