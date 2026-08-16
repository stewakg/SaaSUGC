/**
 * Shared file-upload helper for every wizard that starts from an existing file
 * (edit, mix, matrix, enhance, remove_text, translate).
 *
 * TWO PATHS, one signature — callers must not be able to tell which one ran:
 *
 * 1. DIRECT (R2/production): POST /api/upload/sign validates the upload (auth,
 *    the shared upload:<uid> rate-limit bucket, the MIME allowlist, the size
 *    ceiling) and answers a presigned PUT url; the browser then PUTs the file
 *    straight to storage. The bytes never cross the app server, which used to
 *    relay all of them while buffering the whole file in memory on a
 *    2 vCPU / 3 GB box. The signature binds the exact content type AND the byte
 *    length, so the PUT must send the ROUTE's contentType (not file.type) and
 *    the File untouched.
 *    That PUT needs a CORS rule on the bucket allowing PUT from the app
 *    origin — bucket configuration, not code. A missing rule shows up as a
 *    failed PUT with no useful body, which this module reports as a hard error
 *    rather than silently re-routing through the server.
 *
 * 2. FALLBACK (dev/MockStorage): storage that cannot sign answers
 *    { supported: false }, and the file takes the OLD multipart POST to
 *    /api/upload (uploadThroughServer below). The fallback exists so `pnpm dev`
 *    works with no R2 account — it is a live path, not dead code.
 *
 * A REFUSAL from the sign route (413/415/429/…) never falls back: those are
 * rejections of this upload, not absences of the direct path, and re-POSTing
 * through /api/upload would only re-refuse after the whole file had crossed the
 * server. A failed PUT never falls back either: that means CORS or a bad
 * signature, and silently doubling the upload through the server would hide it.
 */

export interface UploadedFile {
  url: string;
  name: string;
}

/** Serbian copy for the sign route's error codes; unknown codes get the generic text. */
const SIGN_ERROR_BY_CODE: Record<string, string> = {
  file_too_large: 'Fajl je prevelik.',
  unsupported_type: 'Tip fajla nije podržan.',
  rate_limited: 'Previše otpremanja u kratkom roku. Sačekaj malo.',
};

export async function uploadFile(file: File): Promise<UploadedFile> {
  const signRes = await fetch('/api/upload/sign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contentType: file.type, size: file.size }),
  });
  // A proxy error page is not JSON; the generic Serbian copy beats a parse error.
  const sign = (await signRes.json().catch(() => ({}))) as {
    supported?: boolean;
    uploadUrl?: string;
    url?: string;
    contentType?: string;
    error?: string;
  };

  if (!signRes.ok) {
    throw new Error(SIGN_ERROR_BY_CODE[sign.error ?? ''] ?? 'Otpremanje fajla nije uspelo.');
  }
  if (sign.supported === false) {
    return uploadThroughServer(file);
  }
  if (!sign.uploadUrl || !sign.contentType || !sign.url) {
    // A 200 without the signed fields is a server bug — there is nothing to PUT to.
    throw new Error('Otpremanje fajla nije uspelo.');
  }

  const put = await fetch(sign.uploadUrl, {
    method: 'PUT',
    // The signature binds this exact content type AND the byte length. Sending
    // anything else fails the signature, which is the point: one signed link
    // cannot be reused to store a different kind or size of file.
    headers: { 'Content-Type': sign.contentType },
    body: file,
  });
  if (!put.ok) {
    throw new Error('Otpremanje fajla nije uspelo.');
  }
  // The url comes from the sign answer (`/api/storage/<key>`) — never built in
  // the client, which does not know the key.
  return { url: sign.url, name: file.name };
}

/**
 * The OLD path, unchanged: multipart POST to /api/upload, which validates the
 * file again and stores it through the app server. Reached whenever the sign
 * route answers { supported: false } — i.e. dev/MockStorage, where storage
 * cannot sign — so this is live code, not dead code.
 */
async function uploadThroughServer(file: File): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? 'Otpremanje fajla nije uspelo.');
  return { url: data.url, name: file.name };
}

