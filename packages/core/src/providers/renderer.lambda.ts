/**
 * Real Renderer (F5): Remotion Lambda. Thin client around
 * @remotion/lambda-client's renderMediaOnLambda + getRenderProgress — the
 * actual AWS Lambda function and Remotion "site" (serveUrl) must already be
 * deployed via the Remotion CLI (`remotion lambda functions deploy` /
 * `remotion lambda sites create`, from /remotion — see ACCOUNTS.md #7); this
 * class only INVOKES an existing deployment, it does not create one.
 *
 * Written now so it's ready to wire in once REMOTION_LAMBDA_FUNCTION_NAME +
 * REMOTION_SERVE_URL exist — never instantiated until then (factory.ts gates
 * on the key). NOT live-tested — no Lambda function is deployed yet.
 *
 * AWS credentials come from REMOTION_AWS_ACCESS_KEY_ID /
 * REMOTION_AWS_SECRET_ACCESS_KEY in process.env — Remotion's SDK reads these
 * itself (deliberately distinct names from AWS_ACCESS_KEY_ID /
 * AWS_SECRET_ACCESS_KEY, which are the R2/S3 Storage credentials in this
 * codebase, so the two don't collide when both are set).
 *
 * The finished file is COPIED INTO OUR STORAGE and the Lambda copy deleted —
 * see the comment on `render()`. That is deliberate and was not the original
 * design; returning the S3 url directly is the same mistake this codebase
 * already made twice with kie.ai and fal.ai (see persistRemoteAsset in
 * apps/worker).
 */
import {
  renderMediaOnLambda,
  getRenderProgress,
  deleteRender,
  presignUrl,
  type AwsRegion,
} from '@remotion/lambda-client';
import type { Renderer, Storage } from '../interfaces.ts';

const POLL_INTERVAL_MS = 2000;
// Progress-aware ceiling, NOT a flat wall-clock cap. A render is failed only if
// it makes no FORWARD progress for this long. A slow-but-advancing render is a
// paid job finishing late, not a stuck one — killing it on a fixed timer throws
// away work the customer paid for. "No progress for N ms" is the honest rule.
//
// Kept at the OLD flat cap's value on purpose: this code has never run against
// the live SDK, so `overallProgress` being populated is still an assumption. If
// it is ever absent, the stall clock never resets and this degrades to a flat
// cap — identical to the previous behaviour, never stricter. When the field IS
// present (the expected case) an advancing render is never failed. So the worst
// case is "no worse than before", and the common case is strictly better.
const NO_PROGRESS_TIMEOUT_MS = 5 * 60 * 1000;
// Ownership fetch: one transient network blip or 5xx must not fail a paid
// render, so the fetch is retried a few times with linear backoff. A 4xx is
// permanent and fails at once — retrying it only delays the inevitable.
const FETCH_MAX_ATTEMPTS = 3;
const FETCH_BACKOFF_MS = 500;
// How long the presigned output url stays valid. 15 minutes is deliberate:
// long enough to cover the whole retry ladder above (3 attempts + linear
// backoff) with room to spare, short enough that a leaked signature is
// worthless by the time anyone could use it.
const PRESIGN_EXPIRES_IN_SECONDS = 900;

/**
 * How many chunk Lambdas one render is split into. A render does not cost
 * only that many concurrent executions: Remotion also runs a launcher
 * invocation, so each render occupies `concurrency + 1` of the account's
 * concurrent-execution quota.
 *
 * History, kept so a future reader can see why 3 was ever right: this was 3,
 * a workaround for a fresh AWS account's 10-concurrent-executions quota. The
 * first full-chain live run (2026-08-14) found it: a one-second render
 * passed, and a ten-second ad — the SHORTEST length the wizard sells — died
 * with `AWS Concurrency limit reached (Original Error: Rate Exceeded.)`. At 3
 * a render costs about four executions in total, which fits under 10.
 *
 * That quota is 1000 as of 2026-08-16 (eu-central-1, approved by AWS the same
 * day), and with the reason for 3 gone, 3 stopped being right: it made every
 * render three-workers-slow on every deployment until someone remembered an
 * env var. At 25 a render costs 26 of the 1000, and roughly 38 simultaneous
 * renders would still fit.
 *
 * Raising concurrency does not raise the bill: the same frames are rendered,
 * just in parallel — this buys wall-clock time at the same GB-second cost.
 *
 * 25 is reasoned, not measured: nobody has yet timed a render at 3 against
 * one at 25, and past some point the per-chunk overhead eats the gain on a
 * short ad.
 *
 * REMOTION_LAMBDA_CONCURRENCY overrides this with no deploy — junk or <= 0
 * falls back to this default rather than reaching the SDK as NaN (see
 * positiveIntOrUndefined in factory.ts).
 */
export const DEFAULT_LAMBDA_CONCURRENCY = 25;

/**
 * Derive the S3 object key from the `outputFile` url that getRenderProgress
 * reports. The url arrives in one of two shapes depending on bucket
 * addressing — virtual-host
 * (`https://<bucket>.s3.<region>.amazonaws.com/renders/<id>/out.mp4`) or
 * path-style (`https://s3.<region>.amazonaws.com/<bucket>/renders/<id>/out.mp4`)
 * — and in both the key is the pathname minus the leading slash and, in the
 * path-style case, the bucket segment.
 *
 * Throws (naming the renderId and the url) when the url does not parse or no
 * key remains. The key must never be guessed or reconstructed from the
 * renderId: a key that silently differs from the real one is a 404 at the
 * worst moment, on a render the customer has already paid for.
 */
export function objectKeyFromOutputUrl(
  outputFile: string,
  bucketName: string,
  renderId?: string,
): string {
  const cannotDerive = () =>
    new Error(
      `could not derive the S3 object key${
        renderId === undefined ? '' : ` for renderId=${renderId}`
      } from output url: ${outputFile}`,
    );
  let pathname: string;
  try {
    pathname = new URL(outputFile).pathname;
  } catch {
    throw cannotDerive();
  }
  let key = pathname.replace(/^\//, '');
  if (key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }
  try {
    // A renderId never needs it today, but a silently-mis-decoded key is a
    // 404 at the worst moment — decode rather than trust percent-escapes.
    key = decodeURIComponent(key);
  } catch {
    throw cannotDerive();
  }
  if (!key) {
    throw cannotDerive();
  }
  return key;
}

export class RemotionLambdaRenderer implements Renderer {
  readonly name = 'remotion-lambda-renderer';

  constructor(
    private readonly config: {
      functionName: string;
      serveUrl: string;
      region: AwsRegion;
      /** Lambdas per render. Omitted → DEFAULT_LAMBDA_CONCURRENCY; see that constant. */
      concurrency?: number;
    },
    /** Where the finished video is copied to. Same role as in LocalRemotionRenderer. */
    private readonly storage: Storage,
  ) {}

  /**
   * Render, then take ownership of the file.
   *
   * Remotion leaves the output in a Lambda-managed S3 bucket, written with
   * `privacy: 'private'` so nothing but our own AWS credentials can read it.
   * Returning that url directly would still be wrong in two separate ways:
   *
   *  1. The file would sit outside our Storage, so the 30-day retention the
   *     Terms now promise could not apply to it, and `assets.storageKey` would
   *     be null — nothing could ever find it to delete.
   *  2. We would pay AWS to store it forever, on top of R2.
   *
   * So: presign the output object (15-minute validity — long enough for the
   * whole fetch-retry ladder, short enough that a leaked signature is
   * worthless by the time anyone could use it), fetch it through that signed
   * url, put it in our Storage, delete the Lambda copy. The output object is
   * never readable at its plain url at any point in its lifetime.
   */
  async render(input: {
    composition: string;
    props: Record<string, unknown>;
  }): Promise<{ videoUrl: string; storageKey?: string }> {
    const { renderId, bucketName } = await renderMediaOnLambda({
      region: this.config.region,
      functionName: this.config.functionName,
      serveUrl: this.config.serveUrl,
      composition: input.composition,
      inputProps: input.props,
      codec: 'h264',
      privacy: 'private',
      // Bounded on purpose — see DEFAULT_LAMBDA_CONCURRENCY for the number and
      // its history. The quota this used to fear is 1000 as of 2026-08-16;
      // the bound stays because an unbounded fan-out is still a fan-out nobody
      // sized.
      concurrency: this.config.concurrency ?? DEFAULT_LAMBDA_CONCURRENCY,
    });

    // The stall clock: reset every time the render advances. `lastProgress`
    // starts below any real overallProgress (0..1) so the very first forward
    // step counts as progress.
    let lastProgress = -1;
    let lastAdvanceAt = Date.now();
    while (true) {
      const progress = await getRenderProgress({
        renderId,
        bucketName,
        functionName: this.config.functionName,
        region: this.config.region,
      });

      if (progress.fatalErrorEncountered) {
        // Best-effort: drop the Lambda-side artifacts before we bail, so a
        // fatally-failed render does not leave partial output in the bucket
        // forever. cleanupLambdaRender swallows its own errors, so this can
        // never become the failure the caller sees — the real message is the
        // one thing an operator debugging a paid job actually needs.
        await this.cleanupLambdaRender(renderId, bucketName, `render ${renderId} failed fatally`);
        // This code has never run against the live SDK, so progress.errors'
        // shape is an assumption. Guard it: a fatal with no errors array must
        // surface a clear message, not a TypeError that hides the failure.
        const detail = (progress.errors ?? [])
          .map((e: { message: string }) => e.message)
          .join('; ');
        if (detail) {
          throw new Error(`Remotion Lambda render failed: ${detail}`);
        }
        throw new Error(`Remotion Lambda render failed with no error details (renderId=${renderId})`);
      }
      if (progress.done && progress.outputFile) {
        return this.takeOwnership(progress.outputFile, renderId, bucketName);
      }
      // Progress-aware timeout: advance the stall clock whenever overallProgress
      // moves forward, and fail only a render that has been stuck for the whole
      // window. overallProgress is 0..1; done/fatal are handled above.
      const observed =
        typeof progress.overallProgress === 'number' ? progress.overallProgress : lastProgress;
      if (observed > lastProgress) {
        lastProgress = observed;
        lastAdvanceAt = Date.now();
      }
      if (Date.now() - lastAdvanceAt > NO_PROGRESS_TIMEOUT_MS) {
        // Best-effort: cancel/clean up the still-running render so it does not
        // keep running on AWS and later deposit an output nobody fetches or
        // deletes. Swallowed internally — the timeout error is what surfaces.
        await this.cleanupLambdaRender(renderId, bucketName, `render ${renderId} timed out`);
        throw new Error(
          `Remotion Lambda render timed out: no progress for ${NO_PROGRESS_TIMEOUT_MS / 1000}s (renderId=${renderId})`,
        );
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  /** Copy the Lambda output into our Storage and drop the AWS copy. */
  private async takeOwnership(
    outputFile: string,
    renderId: string,
    bucketName: string,
  ): Promise<{ videoUrl: string; storageKey: string }> {
    // The output object is private, so its plain url cannot be fetched —
    // derive the object key and fetch through a short-lived presigned url
    // instead (expiry rationale on PRESIGN_EXPIRES_IN_SECONDS).
    const objectKey = objectKeyFromOutputUrl(outputFile, bucketName, renderId);
    const signedUrl = await presignUrl({
      region: this.config.region,
      bucketName,
      objectKey,
      expiresInSeconds: PRESIGN_EXPIRES_IN_SECONDS,
    });
    const res = await this.fetchOutputWithRetry(signedUrl, renderId);
    const buffer = Buffer.from(await res.arrayBuffer());

    const storageKey = `renders/lambda-${renderId}.mp4`;
    const { url } = await this.storage.upload(storageKey, buffer, 'video/mp4');

    // Best-effort: the video is already safe in our storage, so a failure to
    // clean up AWS must not fail a job the customer already paid for. It costs
    // storage, not correctness — and it is visible as a growing Lambda bucket.
    // The context keeps the success-path meaning (the video IS already stored)
    // so an operator knows the customer already has their file.
    await this.cleanupLambdaRender(renderId, bucketName, `render ${renderId} is stored`);

    return { videoUrl: url, storageKey };
  }

  /**
   * Fetch the Lambda output, retrying transient failures. A network error or a
   * 5xx is retried up to FETCH_MAX_ATTEMPTS with linear backoff; a 4xx is
   * permanent and thrown at once (retrying it only delays the inevitable).
   * Exhausting the retries throws: falling back to the S3 url would hand the
   * customer a link we neither control nor can include in the 30-day promise,
   * so a fetch we cannot complete fails the job on purpose (see render()'s doc).
   */
  private async fetchOutputWithRetry(outputFile: string, renderId: string): Promise<Response> {
    let lastDetail = 'unknown error';
    for (let attempt = 1; attempt <= FETCH_MAX_ATTEMPTS; attempt++) {
      let res: Response | undefined;
      try {
        res = await fetch(outputFile);
      } catch (err) {
        lastDetail = err instanceof Error ? err.message : String(err);
      }
      if (res) {
        if (res.ok) return res;
        // 4xx is permanent — fail immediately with the status, no retry.
        if (res.status < 500) {
          throw new Error(
            `could not fetch the Lambda render output (${res.status}) for renderId=${renderId}`,
          );
        }
        lastDetail = `status ${res.status}`;
      }
      if (attempt < FETCH_MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, FETCH_BACKOFF_MS * attempt));
      }
    }
    throw new Error(
      `could not fetch the Lambda render output after ${FETCH_MAX_ATTEMPTS} attempts (${lastDetail}) for renderId=${renderId}`,
    );
  }

  /** Drop the Lambda-side render. Best-effort everywhere: cleanup must never
   *  turn into the error the caller sees — it is wrapped so a failing delete
   *  only warns and never replaces the real render failure. `context` says WHY
   *  we are cleaning up, so the warning is actionable per call site. */
  private async cleanupLambdaRender(renderId: string, bucketName: string, context: string): Promise<void> {
    try {
      await deleteRender({ region: this.config.region, bucketName, renderId });
    } catch (err) {
      console.warn(
        `[renderer.lambda] ${context} (renderId=${renderId}), deleting the Lambda copy failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
