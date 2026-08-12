/**
 * Unit tests for the kie.ai + fal.ai image/video router (F5).
 *
 * Why this file exists: KieAIFalRouter has NEVER been executed against a real
 * account — kie.ai and fal.ai keys do not exist in this environment yet (see
 * ACCOUNTS.md), and the factory never instantiates it until they do. Every
 * branch is therefore code-complete and unverified. These tests pin down every
 * path without touching the network: globalThis.fetch is faked and the single
 * poll loop that actually sleeps is driven with fake timers, so the whole file
 * runs in well under a second of wall-clock time.
 *
 * The two non-obvious things under test:
 *  1. The fallback contract — kie.ai is primary (cheaper), fal.ai is the
 *     fallback. ANY kie failure (non-ok HTTP, code !== 200, state 'fail', or
 *     unparseable resultJson) must warn and hand off to fal; and when BOTH keys
 *     are absent the router must throw a "no FAL_API_KEY" error rather than
 *     silently returning nothing. The video path mirrors this on its own
 *     dedicated Veo endpoints (successFlag 0/1/2/3, not state).
 *  2. sizeToAspectRatio is private and not exported, so it is tested
 *     INDIRECTLY by reading the `aspect_ratio` field off the createTask
 *     request body the router POSTs.
 *
 * Isolation notes (same discipline as renderer.lambda.test.ts):
 *  - beforeEach installs fake timers, resets the faked fetch, and spies
 *    console.warn. afterEach restores ALL of them — a leaked fake timer, mocked
 *    fetch or warn spy would silently corrupt later files in the same vitest run.
 *  - Every case that polls is designed to succeed/fail on the FIRST poll, so no
 *    setTimeout is ever scheduled and no timer has to be advanced — except the
 *    one dedicated "pending then success" polling test, which advances the
 *    exact 2000ms image interval between polls.
 *  - No real network call is ever made.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { KieAIFalRouter } from './ai.kiefal.ts';

// ---------------------------------------------------------------------------
// Timing constant — this MIRRORS the private IMAGE_POLL_INTERVAL_MS in
// ai.kiefal.ts (2000). It is not exported, so it is duplicated here. If the
// module changes it, this test must be updated in lockstep; there is no way to
// assert against the real value without exporting it, which the task rules
// forbid.
// ---------------------------------------------------------------------------
const IMAGE_POLL_INTERVAL_MS = 2000;

const KIE_KEY = 'KIEKEY';
const FAL_KEY = 'FALKEY';
const FAL_IMG_URL = 'https://img.example/fal.png';
const FAL_VID_URL = 'https://vid.example/fal.mp4';

/** Minimal fake fetch Response — the router only reads ok/status/json/text. */
function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

// One persistent fetch mock; reset + given a per-call sequence in beforeEach.
// Assigned onto globalThis.fetch so the router (which calls the bare global
// `fetch`) hits the mock.
const fetchMock = vi.fn();

let originalFetch: typeof globalThis.fetch;
let warnSpy: MockInstance;

beforeEach(() => {
  vi.useFakeTimers();

  fetchMock.mockReset();
  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  // Silence AND capture console.warn for the kie→fal fallback path. Restored
  // in afterEach so a later file's real warnings are not swallowed.
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  // Every one of these must run or a later file breaks: real timers first (so a
  // pending fake timer can never fire), then fetch, then the warn spy.
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
  warnSpy.mockRestore();
});

// --- small accessors over the recorded fetch calls (url, headers, body) ---

function callUrl(i: number): string {
  return String(fetchMock.mock.calls[i][0]);
}
function callHeaders(i: number): Record<string, string> {
  return (fetchMock.mock.calls[i][1] as { headers: Record<string, string> }).headers;
}
function callBody<T = Record<string, unknown>>(i: number): T {
  const init = fetchMock.mock.calls[i][1] as { body?: string };
  return (init.body ? JSON.parse(init.body) : {}) as T;
}

/** Queue the three fal.ai image calls (submit + status COMPLETED + result). */
function queueFalImageSuccess(): void {
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ request_id: 'r1', status_url: 'https://queue.fal.run/status/r1' }))
    .mockResolvedValueOnce(jsonResponse({ status: 'COMPLETED' }))
    .mockResolvedValueOnce(jsonResponse({ images: [{ url: FAL_IMG_URL }] }));
}

/** Queue the three fal.ai video calls (submit + status COMPLETED + result). */
function queueFalVideoSuccess(): void {
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ request_id: 'rv', status_url: 'https://queue.fal.run/status/rv' }))
    .mockResolvedValueOnce(jsonResponse({ status: 'COMPLETED' }))
    .mockResolvedValueOnce(jsonResponse({ video: { url: FAL_VID_URL } }));
}

// ===========================================================================
// sizeToAspectRatio — private, so tested INDIRECTLY via the createTask body's
// `input.aspect_ratio`. Kie-only router, first poll succeeds.
// ===========================================================================
describe('sizeToAspectRatio (via createTask body aspect_ratio)', () => {
  // Runs a kie-only, first-poll-success generation and returns the parsed
  // createTask request body (the FIRST fetch call).
  async function createTaskBody(input: { prompt: string; size?: string }) {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 200, msg: 'ok', data: { taskId: 't1' } }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: { state: 'success', resultJson: JSON.stringify({ resultUrls: ['https://img.example/a.png'] }) },
        }),
      );
    const router = new KieAIFalRouter({ kieApiKey: KIE_KEY });
    await router.generateImage(input);
    return callBody<{ model: string; input: { aspect_ratio: string } }>(0);
  }

  it('size undefined => aspect_ratio "auto"', async () => {
    expect((await createTaskBody({ prompt: 'p' })).input.aspect_ratio).toBe('auto');
  });

  it('size "1080x1080" => aspect_ratio "1:1"', async () => {
    expect((await createTaskBody({ prompt: 'p', size: '1080x1080' })).input.aspect_ratio).toBe('1:1');
  });

  it('size "1920x1080" => aspect_ratio "16:9"', async () => {
    expect((await createTaskBody({ prompt: 'p', size: '1920x1080' })).input.aspect_ratio).toBe('16:9');
  });

  it('size "1080x1920" => aspect_ratio "9:16"', async () => {
    expect((await createTaskBody({ prompt: 'p', size: '1080x1920' })).input.aspect_ratio).toBe('9:16');
  });

  it('size with no WxH match ("garbage") => aspect_ratio "auto"', async () => {
    expect((await createTaskBody({ prompt: 'p', size: 'garbage' })).input.aspect_ratio).toBe('auto');
  });
});


// ===========================================================================
// generateImage — kie.ai primary
// ===========================================================================
describe('generateImage — kie.ai primary', () => {
  it('1. kie success on first poll returns the image url and posts Bearer auth + model nano-banana-2', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 200, msg: 'ok', data: { taskId: 't1' } }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: { state: 'success', resultJson: JSON.stringify({ resultUrls: ['https://img.example/a.png'] }) },
        }),
      );

    const router = new KieAIFalRouter({ kieApiKey: KIE_KEY });
    const result = await router.generateImage({ prompt: 'p' });

    expect(result).toEqual({ url: 'https://img.example/a.png' });
    // createTask is the FIRST fetch call.
    expect(callUrl(0)).toBe('https://api.kie.ai/api/v1/jobs/createTask');
    expect(callHeaders(0).Authorization).toBe(`Bearer ${KIE_KEY}`);
    expect(callBody(0).model).toBe('nano-banana-2');
  });

  it('2. kie createTask non-ok (500) => warns and falls back to fal, returning the fal url', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 500)); // kie createTask HTTP error
    queueFalImageSuccess();

    const router = new KieAIFalRouter({ kieApiKey: KIE_KEY, falApiKey: FAL_KEY });
    const result = await router.generateImage({ prompt: 'p' });

    expect(warnSpy).toHaveBeenCalled();
    expect(result).toEqual({ url: FAL_IMG_URL });
  });

  it('3. kie createTask code !== 200 (402 "no credit") => warns and falls back to fal', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 402, msg: 'no credit' })); // kie createTask body error
    queueFalImageSuccess();

    const router = new KieAIFalRouter({ kieApiKey: KIE_KEY, falApiKey: FAL_KEY });
    const result = await router.generateImage({ prompt: 'p' });

    expect(warnSpy).toHaveBeenCalled();
    expect(result).toEqual({ url: FAL_IMG_URL });
  });

  it('4. kie recordInfo state "fail" (failMsg nsfw) => warns and falls back to fal', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 200, msg: 'ok', data: { taskId: 't4' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { state: 'fail', failMsg: 'nsfw' } }));
    queueFalImageSuccess();

    const router = new KieAIFalRouter({ kieApiKey: KIE_KEY, falApiKey: FAL_KEY });
    const result = await router.generateImage({ prompt: 'p' });

    expect(warnSpy).toHaveBeenCalled();
    expect(result).toEqual({ url: FAL_IMG_URL });
  });

  it('5. kie resultJson not valid JSON => warns and falls back to fal', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 200, msg: 'ok', data: { taskId: 't5' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { state: 'success', resultJson: 'not json' } }));
    queueFalImageSuccess();

    const router = new KieAIFalRouter({ kieApiKey: KIE_KEY, falApiKey: FAL_KEY });
    const result = await router.generateImage({ prompt: 'p' });

    expect(warnSpy).toHaveBeenCalled();
    expect(result).toEqual({ url: FAL_IMG_URL });
  });
});


// ===========================================================================
// generateImage — fal.ai (fallback / primary when no kie key)
// ===========================================================================
describe('generateImage — fal.ai (fallback / primary when no kie key)', () => {
  it('6. fal-only success (first status COMPLETED) returns the fal url and posts Key auth on submit', async () => {
    queueFalImageSuccess();

    const router = new KieAIFalRouter({ falApiKey: FAL_KEY }); // no kie key
    const result = await router.generateImage({ prompt: 'p' });

    expect(result).toEqual({ url: FAL_IMG_URL });
    // submit is the FIRST fetch call (kie path skipped entirely).
    expect(callUrl(0)).toBe('https://queue.fal.run/fal-ai/nano-banana-2');
    expect(callHeaders(0).Authorization).toBe(`Key ${FAL_KEY}`);
  });

  it('7. fal terminal non-pending status (ERROR) => generateImage rejects naming the status', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ request_id: 'r7', status_url: 'https://queue.fal.run/status/r7' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'ERROR' }));

    const router = new KieAIFalRouter({ falApiKey: FAL_KEY });

    await expect(router.generateImage({ prompt: 'p' })).rejects.toThrow(/ERROR/);
  });

  it('8. fal COMPLETED but no image url => generateImage rejects with "no image URL"', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ request_id: 'r8', status_url: 'https://queue.fal.run/status/r8' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'COMPLETED' }))
      .mockResolvedValueOnce(jsonResponse({ images: [] }));

    const router = new KieAIFalRouter({ falApiKey: FAL_KEY });

    await expect(router.generateImage({ prompt: 'p' })).rejects.toThrow(/no image URL/);
  });
});


// ===========================================================================
// No-key guards
// ===========================================================================
describe('no-key guards', () => {
  it('9. neither key => generateImage throws mentioning no FAL_API_KEY (no fetch made)', async () => {
    const router = new KieAIFalRouter({});

    await expect(router.generateImage({ prompt: 'p' })).rejects.toThrow(/no FAL_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('10. kie fails and no fal key => warns first, then throws the same no-FAL_API_KEY message', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 500)); // kie createTask fails

    const router = new KieAIFalRouter({ kieApiKey: KIE_KEY }); // no fal key

    await expect(router.generateImage({ prompt: 'p' })).rejects.toThrow(/no FAL_API_KEY/);
    // The kie failure was warned about BEFORE the no-key throw.
    expect(warnSpy).toHaveBeenCalled();
  });
});

// ===========================================================================
// Polling loop — the ONE fake-timer-driven test
// ===========================================================================
describe('polling loop', () => {
  it('11. kie image: pending then success — sleeps the 2000ms interval between polls, does not spin', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 200, msg: 'ok', data: { taskId: 't11' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { state: 'processing' } })) // 1st poll
      .mockResolvedValueOnce(
        jsonResponse({
          data: { state: 'success', resultJson: JSON.stringify({ resultUrls: ['https://img.example/p.png'] }) },
        }),
      ); // 2nd poll

    const router = new KieAIFalRouter({ kieApiKey: KIE_KEY });
    const p = router.generateImage({ prompt: 'p' });

    // Flush microtasks: createTask + 1st recordInfo run, then the loop hits the
    // 2000ms sleep.
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2); // createTask + recordInfo(processing)

    // Advancing LESS than the image interval must NOT trigger another poll —
    // the loop is asleep, not spinning.
    await vi.advanceTimersByTimeAsync(IMAGE_POLL_INTERVAL_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Cross the 2000ms boundary → sleep resolves → 2nd recordInfo (success).
    await vi.advanceTimersByTimeAsync(1);
    const result = await p;

    expect(fetchMock).toHaveBeenCalledTimes(3); // createTask + 2x recordInfo
    expect(result).toEqual({ url: 'https://img.example/p.png' });
  });
});

// ===========================================================================
// generateVideo — kie veo + fal fallback (mirrors image, lighter)
// ===========================================================================
describe('generateVideo — kie veo + fal fallback', () => {
  it('12. kie video success (successFlag 1) returns the url parsed from the JSON-string resultUrls', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 200, msg: 'ok', data: { taskId: 'vt12' } })) // veo/generate
      .mockResolvedValueOnce(
        jsonResponse({ data: { successFlag: 1, resultUrls: JSON.stringify(['https://vid.example/a.mp4']) } }),
      ); // veo/record-info

    const router = new KieAIFalRouter({ kieApiKey: KIE_KEY });
    const result = await router.generateVideo({ prompt: 'p' });

    expect(result).toEqual({ url: 'https://vid.example/a.mp4' });
  });

  it('13. kie video successFlag 2 => warns and falls back to fal video, returning the fal url', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 200, msg: 'ok', data: { taskId: 'vt13' } })) // veo/generate
      .mockResolvedValueOnce(jsonResponse({ data: { successFlag: 2 } })); // veo/record-info: failed
    queueFalVideoSuccess();

    const router = new KieAIFalRouter({ kieApiKey: KIE_KEY, falApiKey: FAL_KEY });
    const result = await router.generateVideo({ prompt: 'p' });

    expect(warnSpy).toHaveBeenCalled();
    expect(result).toEqual({ url: FAL_VID_URL });
  });

  it('14. fal video COMPLETED but no video url => generateVideo rejects with "no video URL"', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ request_id: 'rv14', status_url: 'https://queue.fal.run/status/rv14' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'COMPLETED' }))
      .mockResolvedValueOnce(jsonResponse({ video: null }));

    const router = new KieAIFalRouter({ falApiKey: FAL_KEY }); // no kie key

    await expect(router.generateVideo({ prompt: 'p' })).rejects.toThrow(/no video URL/);
  });
});

