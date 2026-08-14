/**
 * Pure routing tests — BullMQ itself is not under test here. The contract that
 * matters is that the producer (apps/web) and the consumer (apps/worker) both
 * resolve a job type to the same queue via `queueNameForJobType`.
 */
import { describe, expect, it } from 'vitest';
import {
  HEAVY_JOB_TYPES,
  HEAVY_QUEUE_NAME,
  JOB_QUEUE_NAME,
  LIGHT_QUEUE_NAME,
  queueNameForJobType,
} from './queue';

describe('queueNameForJobType', () => {
  it("routes 'matrix' and 'revoice' — the video renderers — to the heavy queue", () => {
    expect(queueNameForJobType('matrix')).toBe(HEAVY_QUEUE_NAME);
    expect(queueNameForJobType('revoice')).toBe(HEAVY_QUEUE_NAME);
  });

  it("routes 'image_ads', 'enhance' and 'remove_text' — one provider call and a copy — to the light queue", () => {
    expect(queueNameForJobType('image_ads')).toBe(LIGHT_QUEUE_NAME);
    expect(queueNameForJobType('enhance')).toBe(LIGHT_QUEUE_NAME);
    expect(queueNameForJobType('remove_text')).toBe(LIGHT_QUEUE_NAME);
  });

  it('routes an unknown type to the light queue — the deliberate default', () => {
    // Deliberate default: a light job landing on the heavy queue merely waits,
    // while a heavy job on the light queue could put four Remotion renders on
    // one box and OOM it. Unknown = light.
    expect(queueNameForJobType('some_future_type')).toBe(LIGHT_QUEUE_NAME);
  });

  it('keeps every declared HEAVY_JOB_TYPES entry actually on the heavy queue', () => {
    for (const type of HEAVY_JOB_TYPES) {
      expect(queueNameForJobType(type)).toBe(HEAVY_QUEUE_NAME);
    }
  });

  it("pins HEAVY_QUEUE_NAME to 'adgen-jobs': renaming it would strand already-enqueued jobs in Redis with no error anywhere", () => {
    expect(HEAVY_QUEUE_NAME).toBe('adgen-jobs');
  });

  it('keeps JOB_QUEUE_NAME an alias of HEAVY_QUEUE_NAME so old importers still target the same queue', () => {
    expect(JOB_QUEUE_NAME).toBe(HEAVY_QUEUE_NAME);
  });
});
