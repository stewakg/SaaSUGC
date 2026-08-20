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
// Timing constants — these MIRROR private constants in ai.kiefal.ts. They are
// not exported, so they are duplicated here. If the module changes them, these
// tests must be updated in lockstep; there is no way to assert against the
// real values without exporting them, which the task rules forbid.
// ---------------------------------------------------------------------------
const IMAGE_POLL_INTERVAL_MS = 2000;

// The two image maxima, mirrored for the timeout-split tests below. They MUST
// be two different constants in the module: kie.ai is the PRIMARY (giving up
// early is cheap — the fallback is right there), fal.ai is the FALLBACK (a
// timeout there is a failed job). Collapsing them back into one number is the
// 2026-08-14 regression these tests guard (196.3s for one image because the
// primary was given the fallback's patience).
const KIE_IMAGE_MAX_WAIT_MS = 60_000;
const FAL_IMAGE_MAX_WAIT_MS = 3 * 60 * 1000;

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
// Image timeout split — the kie (primary) and fal (fallback) image poll loops
// have DIFFERENT maxima on purpose. Kie gives up early (60s) because the
// fallback is cheap; fal is patient (180s) because its timeout fails the job.
// Fake-timer-driven like test 11.
// ===========================================================================
describe('image timeout split — kie gives up early, fal stays patient', () => {
  it('15. kie image poll gives up at the KIE constant, not the fal one — the timeout error names 60s', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 200, msg: 'ok', data: { taskId: 't15' } }))
      .mockImplementation(() => Promise.resolve(jsonResponse({ data: { state: 'processing' } }))); // forever-pending polls

    // No fal key, so the kie timeout (caught by generateImage) surfaces as the
    // fallback warn — the same `[ai-router] … timed out after 60s` line the
    // 2026-08-14 incident was diagnosed from — followed by the no-key throw.
    const router = new KieAIFalRouter({ kieApiKey: KIE_KEY });
    const assertion = expect(router.generateImage({ prompt: 'p' })).rejects.toThrow(/no FAL_API_KEY/);

    // The check is `elapsed > 60_000`, so the throw lands on the poll one
    // interval past the boundary, at t=62s.
    await vi.advanceTimersByTimeAsync(KIE_IMAGE_MAX_WAIT_MS + IMAGE_POLL_INTERVAL_MS);
    await assertion;

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('kie.ai task t15 timed out after 60s'));
  });

  it('16. after kie times out at 60s, fal still gets its FULL window — it polls pending well past 60s and succeeds', async () => {
    let falStart = 0;
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input);
      if (url.includes('jobs/createTask')) return jsonResponse({ code: 200, msg: 'ok', data: { taskId: 't16' } });
      if (url.includes('jobs/recordInfo')) return jsonResponse({ data: { state: 'processing' } }); // kie never finishes
      if (url.endsWith('fal-ai/nano-banana-2')) {
        falStart = Date.now(); // fal's window opens only when the fallback actually starts
        return jsonResponse({ request_id: 'r16', status_url: 'https://queue.fal.run/status/r16' });
      }
      if (url.includes('/status/r16')) {
        // Pending until 170s of fal elapsed — far past kie's 60s, still inside fal's 180s.
        return jsonResponse({ status: Date.now() - falStart >= 170_000 ? 'COMPLETED' : 'IN_PROGRESS' });
      }
      return jsonResponse({ images: [{ url: FAL_IMG_URL }] }); // fal result fetch
    });

    const router = new KieAIFalRouter({ kieApiKey: KIE_KEY, falApiKey: FAL_KEY });
    const p = router.generateImage({ prompt: 'p' });

    // Kie exhausts its 60s and hands off…
    await vi.advanceTimersByTimeAsync(KIE_IMAGE_MAX_WAIT_MS + IMAGE_POLL_INTERVAL_MS);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('timed out after 60s'));

    // …then fal polls pending for 170s — if it had inherited kie's 60s window,
    // it would have timed out long before COMPLETED.
    await vi.advanceTimersByTimeAsync(170_000 + IMAGE_POLL_INTERVAL_MS);
    const result = await p;

    expect(result).toEqual({ url: FAL_IMG_URL });
  });

  it('17. fal image poll times out at the FAL constant — the timeout error names 180s, not 60s', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ request_id: 'r17', status_url: 'https://queue.fal.run/status/r17' }))
      .mockImplementation(() => Promise.resolve(jsonResponse({ status: 'IN_PROGRESS' }))); // forever-pending polls

    const router = new KieAIFalRouter({ falApiKey: FAL_KEY }); // no kie key — fal is the only path
    const assertion = expect(router.generateImage({ prompt: 'p' })).rejects.toThrow(
      'fal.ai request r17 timed out after 180s',
    );

    await vi.advanceTimersByTimeAsync(FAL_IMAGE_MAX_WAIT_MS + IMAGE_POLL_INTERVAL_MS);
    await assertion;
  });

  it('18. KIE and FAL image max-wait constants are different values — collapsing them back into one is the regression', () => {
    // Mirrored from ai.kiefal.ts (see the constants block at the top of this
    // file). The behavioural guards are tests 15–17; this one pins the intent
    // itself: the primary must be eager, the fallback patient, never one number
    // for both. A single shared constant is exactly the 2026-08-14 bug.
    expect(KIE_IMAGE_MAX_WAIT_MS).not.toBe(FAL_IMAGE_MAX_WAIT_MS);
    expect(KIE_IMAGE_MAX_WAIT_MS).toBe(60_000);
    expect(FAL_IMAGE_MAX_WAIT_MS).toBe(180_000);
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

  /**
   * 2026-08-20: this case used to assert the fallback fired automatically, which
   * is the behaviour that made `ai_video` lose money — fal is $2–3+ a video
   * against 25 credits (€2.50 at the cheapest pack rate). The fallback is now
   * opt-in, and these two cases pin BOTH directions of that switch.
   */
  it('13. kie video fails with the fallback OFF (default) => throws, and fal is never called', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 200, msg: 'ok', data: { taskId: 'vt13' } })) // veo/generate
      .mockResolvedValueOnce(jsonResponse({ data: { successFlag: 2 } })); // veo/record-info: failed

    const router = new KieAIFalRouter({ kieApiKey: KIE_KEY, falApiKey: FAL_KEY });

    await expect(router.generateVideo({ prompt: 'p' })).rejects.toThrow(/fallback is disabled/);
    // Two calls and no more: the submit and the status poll. A third would mean
    // fal was contacted, i.e. money spent on the expensive vendor.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The refusal has to say the job was not charged — it is read by a human in
    // the worker log when a customer asks why their video failed.
    await expect(router.generateVideo({ prompt: 'p' })).rejects.toThrow(/not charged/);
  });

  it('13b. kie video fails with allowVideoFallback: true => warns and returns the fal url', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 200, msg: 'ok', data: { taskId: 'vt13b' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { successFlag: 2 } }));
    queueFalVideoSuccess();

    const router = new KieAIFalRouter({ kieApiKey: KIE_KEY, falApiKey: FAL_KEY, allowVideoFallback: true });
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

