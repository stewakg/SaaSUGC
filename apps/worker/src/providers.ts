import { createProviders } from '@adgen/core';
import { LocalRemotionRenderer } from '@adgen/core/providers/renderer.local';

export const providers = createProviders();

/**
 * Which renderer draws a matrix/revoice video.
 *
 * This used to be a hardcoded `new LocalRemotionRenderer(...)`, which quietly
 * made Remotion Lambda unreachable: the factory would build a Lambda renderer
 * from REMOTION_* env and matrix would ignore it and render locally anyway. So
 * the documented "scale out to Lambda" path did not actually exist — it was a
 * code change pretending to be a config change.
 *
 * The rule is: use whatever the factory resolved, UNLESS it resolved to the
 * mock. A mock renderer would hand back a placeholder URL and mark the job
 * done, which for the one tool that renders real video is worse than useless —
 * so with no Lambda configured we still render locally, for real, exactly as
 * before. Nothing changes for anyone until REMOTION_* is set.
 */
export const matrixRenderer =
  providers.renderer.name === 'mock-renderer'
    ? new LocalRemotionRenderer(providers.storage)
    : providers.renderer;
