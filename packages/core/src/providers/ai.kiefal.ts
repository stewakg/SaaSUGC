/**
 * Real AIProvider (F5): kie.ai (primary, cheaper) with fal.ai as the fallback.
 * Plain fetch, no SDK — matches this repo's style (scraper.real.ts,
 * script.openrouter.ts, billing.lemonsqueezy.ts).
 *
 * Written now so it's ready to wire in once KIE_API_KEY and/or FAL_API_KEY exist
 * (see ACCOUNTS.md) — never instantiated until then (factory.ts gates on the
 * key). NOT live-tested — contracts verified against kie.ai's and fal.ai's
 * published docs (2026-07), not against a real account yet.
 *
 * generateImage: kie.ai's generic Jobs API (`nano-banana-2`, createTask +
 * recordInfo, `resultJson` is a JSON-encoded STRING you must parse) falls back
 * to fal.ai's queue API (`fal-ai/nano-banana-2`, submit + status + result).
 *
 * generateVideo: kie.ai's DEDICATED Veo endpoints (`/api/v1/veo/generate` +
 * `/api/v1/veo/record-info`) — a genuinely different response shape from the
 * image Jobs API (`successFlag` 0/1/2/3, not `state`; `resultUrls` is itself a
 * JSON-encoded string, not nested under `resultJson`). Falls back to fal.ai's
 * `veo3.1/image-to-video`. Not exercised by any wired job today (ai_video is
 * F7, deferred) — implemented now only because AIProvider requires both
 * methods; per-tool routing beyond "one fixed model per provider" is left for
 * when F7 actually needs it.
 */
import type { AIProvider } from '../interfaces.ts';

const KIE_BASE = 'https://api.kie.ai';
const FAL_QUEUE_BASE = 'https://queue.fal.run';

const IMAGE_POLL_INTERVAL_MS = 2000;
const IMAGE_MAX_WAIT_MS = 3 * 60 * 1000; // nano-banana-class images finish in seconds-to-~1min
const VIDEO_POLL_INTERVAL_MS = 5000;
const VIDEO_MAX_WAIT_MS = 10 * 60 * 1000; // Veo-class generation commonly takes minutes

/**
 * The only fal queue statuses that mean "keep waiting". Anything else is
 * terminal, and treating it as terminal is the point: both poll loops below
 * used to break only on COMPLETED, so a job fal had already given up on kept
 * being polled until the full timeout — up to 10 minutes of the user waiting
 * for an answer that had already arrived. Found 2026-08-10 while writing
 * media-edit.fal.ts, which got this right from the start.
 */
const FAL_PENDING_STATUSES = new Set(['IN_QUEUE', 'IN_PROGRESS']);

/**
 * `size` is a "WxH" string (e.g. the "1080x1080" the worker sends for
 * image_ads) — neither provider accepts arbitrary dimensions, only an
 * aspect_ratio enum. Derive it rather than hardcoding one ratio, since a
 * square product photo and a vertical ad are both real callers.
 */
function sizeToAspectRatio(size?: string): string {
  const match = size ? /^(\d+)x(\d+)$/.exec(size) : null;
  if (!match) return 'auto';
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (w === h) return '1:1';
  return w > h ? '16:9' : '9:16';
}

export class KieAIFalRouter implements AIProvider {
  readonly name = 'kie-fal-router';

  constructor(private readonly config: { kieApiKey?: string; falApiKey?: string }) {}

  async generateImage(input: { prompt: string; refImages?: string[]; size?: string }): Promise<{ url: string }> {
    if (this.config.kieApiKey) {
      try {
        return await this.generateImageKie(input, this.config.kieApiKey);
      } catch (err) {
        console.warn(
          `[ai-router] kie.ai image generation failed, falling back to fal.ai: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    if (this.config.falApiKey) {
      return this.generateImageFal(input, this.config.falApiKey);
    }
    throw new Error('AI image generation failed: kie.ai unavailable/failed and no FAL_API_KEY is set.');
  }

  async generateVideo(input: {
    prompt: string;
    refImage?: string;
    model?: string;
    durationSec?: number;
  }): Promise<{ url: string }> {
    if (this.config.kieApiKey) {
      try {
        return await this.generateVideoKie(input, this.config.kieApiKey);
      } catch (err) {
        console.warn(
          `[ai-router] kie.ai video generation failed, falling back to fal.ai: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    if (this.config.falApiKey) {
      return this.generateVideoFal(input, this.config.falApiKey);
    }
    throw new Error('AI video generation failed: kie.ai unavailable/failed and no FAL_API_KEY is set.');
  }

  // ---------------------------------------------------------------------------
  // kie.ai — image (generic Jobs API: createTask + recordInfo)
  // ---------------------------------------------------------------------------
  private async generateImageKie(
    input: { prompt: string; refImages?: string[]; size?: string },
    apiKey: string,
  ): Promise<{ url: string }> {
    const createRes = await fetch(`${KIE_BASE}/api/v1/jobs/createTask`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nano-banana-2',
        input: {
          prompt: input.prompt,
          image_input: input.refImages,
          aspect_ratio: sizeToAspectRatio(input.size),
          output_format: 'png',
        },
      }),
    });
    if (!createRes.ok) {
      throw new Error(`kie.ai createTask failed (${createRes.status}): ${await createRes.text().catch(() => '')}`);
    }
    const createJson = (await createRes.json()) as { code: number; msg: string; data?: { taskId: string } };
    if (createJson.code !== 200 || !createJson.data?.taskId) {
      throw new Error(`kie.ai createTask error: ${createJson.msg}`);
    }
    const taskId = createJson.data.taskId;

    const start = Date.now();
    while (true) {
      const pollRes = await fetch(`${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!pollRes.ok) throw new Error(`kie.ai recordInfo failed (${pollRes.status})`);
      const pollJson = (await pollRes.json()) as {
        data?: { state: string; resultJson?: string; failMsg?: string };
      };
      const data = pollJson.data;
      if (!data) throw new Error(`kie.ai recordInfo returned no data for task ${taskId}`);

      if (data.state === 'success') {
        let resultUrls: string[] = [];
        try {
          resultUrls = (JSON.parse(data.resultJson ?? '{}') as { resultUrls?: string[] }).resultUrls ?? [];
        } catch {
          throw new Error(`kie.ai task ${taskId} succeeded but resultJson wasn't valid JSON: ${data.resultJson}`);
        }
        const url = resultUrls[0];
        if (!url) throw new Error(`kie.ai task ${taskId} succeeded but returned no image URL`);
        return { url };
      }
      if (data.state === 'fail') {
        throw new Error(`kie.ai image generation failed: ${data.failMsg ?? 'unknown error'}`);
      }
      if (Date.now() - start > IMAGE_MAX_WAIT_MS) {
        throw new Error(`kie.ai task ${taskId} timed out after ${IMAGE_MAX_WAIT_MS / 1000}s`);
      }
      await new Promise((r) => setTimeout(r, IMAGE_POLL_INTERVAL_MS));
    }
  }

  // ---------------------------------------------------------------------------
  // fal.ai — image (queue API: submit + status + result)
  // ---------------------------------------------------------------------------
  private async generateImageFal(
    input: { prompt: string; refImages?: string[]; size?: string },
    apiKey: string,
  ): Promise<{ url: string }> {
    const model = 'fal-ai/nano-banana-2';
    const submitRes = await fetch(`${FAL_QUEUE_BASE}/${model}`, {
      method: 'POST',
      headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: input.prompt,
        aspect_ratio: sizeToAspectRatio(input.size),
        output_format: 'png',
      }),
    });
    if (!submitRes.ok) {
      throw new Error(`fal.ai submit failed (${submitRes.status}): ${await submitRes.text().catch(() => '')}`);
    }
    const submitJson = (await submitRes.json()) as { request_id: string; status_url: string };

    const start = Date.now();
    while (true) {
      const statusRes = await fetch(submitJson.status_url, { headers: { Authorization: `Key ${apiKey}` } });
      if (!statusRes.ok) throw new Error(`fal.ai status check failed (${statusRes.status})`);
      const statusJson = (await statusRes.json()) as { status: string };
      if (statusJson.status === 'COMPLETED') break;
      if (!FAL_PENDING_STATUSES.has(statusJson.status)) {
        throw new Error(
          `fal.ai request ${submitJson.request_id} failed with status "${statusJson.status}"`,
        );
      }
      if (Date.now() - start > IMAGE_MAX_WAIT_MS) {
        throw new Error(`fal.ai request ${submitJson.request_id} timed out after ${IMAGE_MAX_WAIT_MS / 1000}s`);
      }
      await new Promise((r) => setTimeout(r, IMAGE_POLL_INTERVAL_MS));
    }

    const resultRes = await fetch(`${FAL_QUEUE_BASE}/${model}/requests/${submitJson.request_id}`, {
      headers: { Authorization: `Key ${apiKey}` },
    });
    if (!resultRes.ok) throw new Error(`fal.ai result fetch failed (${resultRes.status})`);
    const resultJson = (await resultRes.json()) as { images?: { url: string }[] };
    const url = resultJson.images?.[0]?.url;
    if (!url) throw new Error(`fal.ai request ${submitJson.request_id} completed but returned no image URL`);
    return { url };
  }

  // ---------------------------------------------------------------------------
  // kie.ai — video (DEDICATED Veo endpoints — different shape from the image
  // Jobs API: `successFlag` not `state`, `resultUrls` is a JSON-string not
  // nested under `resultJson`)
  // ---------------------------------------------------------------------------
  private async generateVideoKie(
    input: { prompt: string; refImage?: string; model?: string; durationSec?: number },
    apiKey: string,
  ): Promise<{ url: string }> {
    const createRes = await fetch(`${KIE_BASE}/api/v1/veo/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: input.prompt,
        imageUrls: input.refImage ? [input.refImage] : undefined,
        model: input.model ?? 'veo3_fast',
        aspect_ratio: '9:16', // this product's ad output is vertical-first (TikTok/Reels/Shorts)
      }),
    });
    if (!createRes.ok) {
      throw new Error(`kie.ai veo/generate failed (${createRes.status}): ${await createRes.text().catch(() => '')}`);
    }
    const createJson = (await createRes.json()) as { code: number; msg: string; data?: { taskId: string } };
    if (createJson.code !== 200 || !createJson.data?.taskId) {
      throw new Error(`kie.ai veo/generate error: ${createJson.msg}`);
    }
    const taskId = createJson.data.taskId;

    const start = Date.now();
    while (true) {
      const pollRes = await fetch(`${KIE_BASE}/api/v1/veo/record-info?taskId=${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!pollRes.ok) throw new Error(`kie.ai veo/record-info failed (${pollRes.status})`);
      const pollJson = (await pollRes.json()) as {
        data?: { successFlag: number; resultUrls?: string };
      };
      const data = pollJson.data;
      if (!data) throw new Error(`kie.ai veo/record-info returned no data for task ${taskId}`);

      // successFlag: 0 = generating, 1 = success, 2 = failed, 3 = generation failed
      if (data.successFlag === 1) {
        let urls: string[] = [];
        try {
          urls = JSON.parse(data.resultUrls ?? '[]') as string[];
        } catch {
          throw new Error(
            `kie.ai video task ${taskId} succeeded but resultUrls wasn't valid JSON: ${data.resultUrls}`,
          );
        }
        const url = urls[0];
        if (!url) throw new Error(`kie.ai video task ${taskId} succeeded but returned no video URL`);
        return { url };
      }
      if (data.successFlag === 2 || data.successFlag === 3) {
        throw new Error(`kie.ai video generation failed for task ${taskId} (successFlag=${data.successFlag})`);
      }
      if (Date.now() - start > VIDEO_MAX_WAIT_MS) {
        throw new Error(`kie.ai video task ${taskId} timed out after ${VIDEO_MAX_WAIT_MS / 1000}s`);
      }
      await new Promise((r) => setTimeout(r, VIDEO_POLL_INTERVAL_MS));
    }
  }

  // ---------------------------------------------------------------------------
  // fal.ai — video (queue API, veo3.1/image-to-video)
  // ---------------------------------------------------------------------------
  private async generateVideoFal(
    input: { prompt: string; refImage?: string; model?: string; durationSec?: number },
    apiKey: string,
  ): Promise<{ url: string }> {
    const model = 'fal-ai/veo3.1/image-to-video';
    const submitRes = await fetch(`${FAL_QUEUE_BASE}/${model}`, {
      method: 'POST',
      headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: input.prompt,
        image_url: input.refImage,
        aspect_ratio: 'auto',
        duration: `${input.durationSec ?? 8}s`,
        resolution: '720p',
      }),
    });
    if (!submitRes.ok) {
      throw new Error(`fal.ai submit failed (${submitRes.status}): ${await submitRes.text().catch(() => '')}`);
    }
    const submitJson = (await submitRes.json()) as { request_id: string; status_url: string };

    const start = Date.now();
    while (true) {
      const statusRes = await fetch(submitJson.status_url, { headers: { Authorization: `Key ${apiKey}` } });
      if (!statusRes.ok) throw new Error(`fal.ai status check failed (${statusRes.status})`);
      const statusJson = (await statusRes.json()) as { status: string };
      if (statusJson.status === 'COMPLETED') break;
      if (!FAL_PENDING_STATUSES.has(statusJson.status)) {
        throw new Error(
          `fal.ai request ${submitJson.request_id} failed with status "${statusJson.status}"`,
        );
      }
      if (Date.now() - start > VIDEO_MAX_WAIT_MS) {
        throw new Error(`fal.ai request ${submitJson.request_id} timed out after ${VIDEO_MAX_WAIT_MS / 1000}s`);
      }
      await new Promise((r) => setTimeout(r, VIDEO_POLL_INTERVAL_MS));
    }

    const resultRes = await fetch(`${FAL_QUEUE_BASE}/${model}/requests/${submitJson.request_id}`, {
      headers: { Authorization: `Key ${apiKey}` },
    });
    if (!resultRes.ok) throw new Error(`fal.ai result fetch failed (${resultRes.status})`);
    const resultJson = (await resultRes.json()) as { video?: { url: string } };
    const url = resultJson.video?.url;
    if (!url) throw new Error(`fal.ai request ${submitJson.request_id} completed but returned no video URL`);
    return { url };
  }
}