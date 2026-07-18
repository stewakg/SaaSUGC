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
 * No storageKey on the return: the rendered file lands in a Lambda-managed
 * S3 bucket, not through our own Storage abstraction — same reasoning as why
 * AIProvider/Renderer results omit it when they're not actually uploaded via
 * Storage.upload() (see interfaces.ts).
 */
import { renderMediaOnLambda, getRenderProgress, type AwsRegion } from '@remotion/lambda-client';
import type { Renderer } from '../interfaces.ts';

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
  ) {}

  async render(input: { composition: string; props: Record<string, unknown> }): Promise<{ videoUrl: string }> {
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
        throw new Error(
          `Remotion Lambda render failed: ${progress.errors.map((e: { message: string }) => e.message).join('; ')}`,
        );
      }
      if (progress.done && progress.outputFile) {
        return { videoUrl: progress.outputFile };
      }
      if (Date.now() - start > MAX_WAIT_MS) {
        throw new Error(`Remotion Lambda render timed out after ${MAX_WAIT_MS / 1000}s (renderId=${renderId})`);
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}
