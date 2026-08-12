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
  type AwsRegion,
} from '@remotion/lambda-client';
import type { Renderer, Storage } from '../interfaces.ts';

const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 5 * 60 * 1000; // 5 minutes — matrix renders are short (~15-30s of video)

export class RemotionLambdaRenderer implements Renderer {
  readonly name = 'remotion-lambda-renderer';

  constructor(
    private readonly config: {
      functionName: string;
      serveUrl: string;
      region: AwsRegion;
    },
    /** Where the finished video is copied to. Same role as in LocalRemotionRenderer. */
    private readonly storage: Storage,
  ) {}

  /**
   * Render, then take ownership of the file.
   *
   * Remotion leaves the output in a Lambda-managed S3 bucket. Returning that
   * url directly looks like it works and is wrong in three separate ways:
   *
   *  1. `privacy: 'public'` means a permanent, world-readable link to a paying
   *     customer's video — the exact exposure flagged as a launch blocker for
   *     R2 (RELEASE_PLAN L1.4), reintroduced through the back door.
   *  2. The file would sit outside our Storage, so the 30-day retention the
   *     Terms now promise could not apply to it, and `assets.storageKey` would
   *     be null — nothing could ever find it to delete.
   *  3. We would pay AWS to store it forever, on top of R2.
   *
   * So: fetch it, put it in our Storage, delete the Lambda copy. The public
   * window is the few seconds between "done" and the delete, on an unguessable
   * renderId path. Tightening that further (private output + presignUrl) is
   * possible and worth doing once someone can actually run this against AWS —
   * it is not worth guessing at an API shape that has never been executed.
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
      privacy: 'public',
    });

    const start = Date.now();
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
      if (Date.now() - start > MAX_WAIT_MS) {
        // Best-effort: cancel/clean up the still-running render so it does not
        // keep running on AWS and later deposit an output nobody fetches or
        // deletes. Swallowed internally — the timeout error is what surfaces.
        await this.cleanupLambdaRender(renderId, bucketName, `render ${renderId} timed out`);
        throw new Error(`Remotion Lambda render timed out after ${MAX_WAIT_MS / 1000}s (renderId=${renderId})`);
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
    const res = await fetch(outputFile);
    if (!res.ok) {
      // Failing here fails the job on purpose. Falling back to the S3 url would
      // "succeed", charge the customer, and hand them a link we do not control
      // and cannot include in the 30-day promise.
      throw new Error(`could not fetch the Lambda render output (${res.status}) for renderId=${renderId}`);
    }
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
