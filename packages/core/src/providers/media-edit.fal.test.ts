/**
 * These endpoints have never been called with a real key, so the only thing
 * standing between the wiring job and a 422 is that the request we build
 * matches the schema fal published. That is what these tests pin: the queue
 * URL, the auth header SHAPE (never a key value — see the leak in MEMORY),
 * the exact snake_case field names fal expects, the fact that an omitted
 * option is absent rather than null, and that every failure names the endpoint
 * that produced it. No network: fetch is stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FAL_TEXT_REMOVAL_ENDPOINT,
  FAL_UPSCALE_IMAGE_ENDPOINT,
  FAL_UPSCALE_VIDEO_ENDPOINT,
  FalMediaEditProvider,
} from './media-edit.fal.ts';

const IMAGE_IN = 'https://cdn.example.com/proizvod.png';
const VIDEO_IN = 'https://cdn.example.com/reklama.mp4';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** Queues one response per fetch call, in order. */
function mockFetchSequence(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const res of responses) fetchMock.mockResolvedValueOnce(res);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** submit → status(COMPLETED) → result, the happy path all three methods take. */
function mockHappyPath(result: unknown) {
  return mockFetchSequence(
    jsonResponse({ request_id: 'req-123', status_url: 'https://queue.fal.run/status/req-123' }),
    jsonResponse({ status: 'COMPLETED' }),
    jsonResponse(result),
  );
}

function bodyOf(fetchMock: ReturnType<typeof vi.fn>, call = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[call][1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

function authOf(fetchMock: ReturnType<typeof vi.fn>, call = 0): string {
  const init = fetchMock.mock.calls[call][1] as RequestInit;
  return (init.headers as Record<string, string>).Authorization;
}

let provider: FalMediaEditProvider;

beforeEach(() => {
  provider = new FalMediaEditProvider({ apiKey: 'test-key-not-real' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('FalMediaEditProvider — queue protocol', () => {
  it('submits to queue.fal.run/<endpoint>, polls the status_url fal returns, then GETs the result', async () => {
    const fetchMock = mockHappyPath({ image: { url: 'https://cdn.fal.ai/out.png' } });

    await provider.upscaleImage(IMAGE_IN);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe(`https://queue.fal.run/${FAL_UPSCALE_IMAGE_ENDPOINT}`);
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST');
    expect(fetchMock.mock.calls[1][0]).toBe('https://queue.fal.run/status/req-123');
    expect(fetchMock.mock.calls[2][0]).toBe(
      `https://queue.fal.run/${FAL_UPSCALE_IMAGE_ENDPOINT}/requests/req-123`,
    );
  });

  it('sends the fal auth scheme — "Key " prefixed, not Bearer — on every call', async () => {
    const fetchMock = mockHappyPath({ image: { url: 'https://cdn.fal.ai/out.png' } });

    await provider.upscaleImage(IMAGE_IN);

    for (let call = 0; call < 3; call += 1) {
      expect(authOf(fetchMock, call).startsWith('Key ')).toBe(true);
      expect(authOf(fetchMock, call).startsWith('Bearer ')).toBe(false);
    }
  });

  it('falls back to the conventional status URL when fal omits status_url', async () => {
    const fetchMock = mockFetchSequence(
      jsonResponse({ request_id: 'req-456' }),
      jsonResponse({ status: 'COMPLETED' }),
      jsonResponse({ image: { url: 'https://cdn.fal.ai/out.png' } }),
    );

    await provider.upscaleImage(IMAGE_IN);

    expect(fetchMock.mock.calls[1][0]).toBe(
      `https://queue.fal.run/${FAL_UPSCALE_IMAGE_ENDPOINT}/requests/req-456/status`,
    );
  });

  it('fails fast on a status outside IN_QUEUE/IN_PROGRESS/COMPLETED instead of polling to the timeout', async () => {
    mockFetchSequence(
      jsonResponse({ request_id: 'req-789', status_url: 'https://queue.fal.run/status/req-789' }),
      jsonResponse({ status: 'ERROR' }),
    );

    await expect(provider.upscaleVideo(VIDEO_IN)).rejects.toThrow(
      new RegExp(`${FAL_UPSCALE_VIDEO_ENDPOINT}.*req-789.*ERROR`),
    );
  });

  it('throws when submit returns no request_id', async () => {
    mockFetchSequence(jsonResponse({}));
    await expect(provider.upscaleImage(IMAGE_IN)).rejects.toThrow(/no request_id/);
  });
});

describe('FalMediaEditProvider.upscaleImage', () => {
  it('sends image_url and omits every option the caller did not set', async () => {
    const fetchMock = mockHappyPath({ image: { url: 'https://cdn.fal.ai/out.png' } });

    await provider.upscaleImage(IMAGE_IN);

    const body = bodyOf(fetchMock);
    expect(body).toEqual({ image_url: IMAGE_IN });
  });

  it('maps camelCase options onto fal snake_case fields', async () => {
    const fetchMock = mockHappyPath({ image: { url: 'https://cdn.fal.ai/out.png' } });

    await provider.upscaleImage(IMAGE_IN, {
      model: 'High Fidelity V2',
      upscaleFactor: 4,
      outputFormat: 'png',
      faceEnhancement: false,
      cropToFill: true,
    });

    expect(bodyOf(fetchMock)).toEqual({
      image_url: IMAGE_IN,
      model: 'High Fidelity V2',
      upscale_factor: 4,
      output_format: 'png',
      face_enhancement: false,
      crop_to_fill: true,
    });
  });

  it('reads the URL out of the singular `image` object', async () => {
    mockHappyPath({ image: { url: 'https://cdn.fal.ai/uvecano.png' } });
    await expect(provider.upscaleImage(IMAGE_IN)).resolves.toEqual({ url: 'https://cdn.fal.ai/uvecano.png' });
  });

  it('throws naming the endpoint when the submit is rejected', async () => {
    mockFetchSequence(jsonResponse({ detail: 'unauthorized' }, 401));
    await expect(provider.upscaleImage(IMAGE_IN)).rejects.toThrow(
      new RegExp(`${FAL_UPSCALE_IMAGE_ENDPOINT} submit failed \\(401\\)`),
    );
  });

  it('throws naming the endpoint when the completed result carries no image', async () => {
    mockHappyPath({ image: {} });
    await expect(provider.upscaleImage(IMAGE_IN)).rejects.toThrow(
      new RegExp(`${FAL_UPSCALE_IMAGE_ENDPOINT} completed but returned no image URL`),
    );
  });
});

describe('FalMediaEditProvider.upscaleVideo', () => {
  it('sends video_url and the H264_output field under fal’s exact odd casing', async () => {
    const fetchMock = mockHappyPath({ video: { url: 'https://cdn.fal.ai/out.mp4' } });

    await provider.upscaleVideo(VIDEO_IN, { upscaleFactor: 2, targetFps: 30, h264Output: true, model: 'Proteus' });

    expect(bodyOf(fetchMock)).toEqual({
      video_url: VIDEO_IN,
      model: 'Proteus',
      upscale_factor: 2,
      target_fps: 30,
      H264_output: true,
    });
  });

  it('omits every option the caller did not set', async () => {
    const fetchMock = mockHappyPath({ video: { url: 'https://cdn.fal.ai/out.mp4' } });
    await provider.upscaleVideo(VIDEO_IN);
    expect(bodyOf(fetchMock)).toEqual({ video_url: VIDEO_IN });
  });

  it('reads the URL out of the `video` object', async () => {
    mockHappyPath({ video: { url: 'https://cdn.fal.ai/uvecano.mp4' } });
    await expect(provider.upscaleVideo(VIDEO_IN)).resolves.toEqual({ url: 'https://cdn.fal.ai/uvecano.mp4' });
  });

  it('throws naming the endpoint when the status check itself errors', async () => {
    mockFetchSequence(
      jsonResponse({ request_id: 'req-abc', status_url: 'https://queue.fal.run/status/req-abc' }),
      jsonResponse({ detail: 'gone' }, 500),
    );
    await expect(provider.upscaleVideo(VIDEO_IN)).rejects.toThrow(
      new RegExp(`${FAL_UPSCALE_VIDEO_ENDPOINT} status check failed \\(500\\)`),
    );
  });

  it('throws naming the endpoint when the completed result carries no video', async () => {
    mockHappyPath({});
    await expect(provider.upscaleVideo(VIDEO_IN)).rejects.toThrow(
      new RegExp(`${FAL_UPSCALE_VIDEO_ENDPOINT} completed but returned no video URL`),
    );
  });
});

describe('FalMediaEditProvider.removeTextFromImage', () => {
  it('sends image_url and NO prompt field — the reason this endpoint was chosen for Serbian users', async () => {
    const fetchMock = mockHappyPath({ images: [{ url: 'https://cdn.fal.ai/clean.jpg' }], seed: 1 });

    await provider.removeTextFromImage(IMAGE_IN);

    const body = bodyOf(fetchMock);
    expect(body).toEqual({ image_url: IMAGE_IN });
    expect(body).not.toHaveProperty('prompt');
  });

  it('maps camelCase options onto fal snake_case fields', async () => {
    const fetchMock = mockHappyPath({ images: [{ url: 'https://cdn.fal.ai/clean.png' }], seed: 42 });

    await provider.removeTextFromImage(IMAGE_IN, {
      guidanceScale: 7.5,
      numInferenceSteps: 40,
      outputFormat: 'png',
      seed: 42,
    });

    expect(bodyOf(fetchMock)).toEqual({
      image_url: IMAGE_IN,
      guidance_scale: 7.5,
      num_inference_steps: 40,
      output_format: 'png',
      seed: 42,
    });
  });

  it('reads the first entry of the plural `images` array, unlike the upscalers', async () => {
    mockHappyPath({ images: [{ url: 'https://cdn.fal.ai/bez-teksta.jpg' }], seed: 7 });
    await expect(provider.removeTextFromImage(IMAGE_IN)).resolves.toEqual({
      url: 'https://cdn.fal.ai/bez-teksta.jpg',
    });
  });

  it('throws naming the endpoint when the submit is rejected', async () => {
    mockFetchSequence(jsonResponse({ detail: 'bad image_url' }, 422));
    await expect(provider.removeTextFromImage(IMAGE_IN)).rejects.toThrow(
      new RegExp(`${FAL_TEXT_REMOVAL_ENDPOINT} submit failed \\(422\\)`),
    );
  });

  it('throws naming the endpoint when the result fetch fails', async () => {
    mockFetchSequence(
      jsonResponse({ request_id: 'req-def', status_url: 'https://queue.fal.run/status/req-def' }),
      jsonResponse({ status: 'COMPLETED' }),
      jsonResponse({ detail: 'expired' }, 404),
    );
    await expect(provider.removeTextFromImage(IMAGE_IN)).rejects.toThrow(
      new RegExp(`${FAL_TEXT_REMOVAL_ENDPOINT} result fetch failed \\(404\\)`),
    );
  });

  it('throws naming the endpoint when images comes back empty', async () => {
    mockHappyPath({ images: [], seed: 1 });
    await expect(provider.removeTextFromImage(IMAGE_IN)).rejects.toThrow(
      new RegExp(`${FAL_TEXT_REMOVAL_ENDPOINT} completed but returned no image URL`),
    );
  });
});
