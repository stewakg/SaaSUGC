/**
 * Unit tests for the Remotion Lambda renderer (F5).
 *
 * Why this file exists: RemotionLambdaRenderer has NEVER been executed — no
 * Lambda function is deployed, so every line is code-complete and unverified.
 * The first real run will be against AWS, with the customer's money attached.
 * These tests pin down every branch without touching the network or AWS: the
 * whole @remotion/lambda-client SDK is mocked, globalThis.fetch is faked, and
 * the polling/timeout clock is driven with fake timers so the whole file runs
 * in well under a second of wall-clock time.
 *
 * The single most important property under test is the "take ownership"
 * invariant: the public videoUrl returned to the caller is ALWAYS our Storage
 * url, never the Lambda-managed S3 outputFile — which is rendered private and
 * fetched through a short-lived presigned url (pinned in section I); that
 * branch is asserted in every success path.
 *
 * Isolation notes (same discipline as factory.test.ts):
 *  - The SDK fns are created with vi.hoisted so vi.mock's hoisted factory can
 *    reference them without a temporal-dead-zone error.
 *  - beforeEach installs fake timers, resets the four SDK fns and the faked
 *    fetch, and spies console.warn. afterEach restores ALL of them — a leaked
 *    fake timer, mocked fetch or warn spy would silently corrupt later files
 *    in the same vitest run.
 *  - No AWS call and no real network call is ever made.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import type { AwsRegion } from '@remotion/lambda-client';
import { RemotionLambdaRenderer, objectKeyFromOutputUrl } from './renderer.lambda.ts';
import type { Storage } from '../interfaces.ts';

// vi.mock is hoisted above every import, so the four fns it hands back to the
// module under test must already exist at hoist time. vi.hoisted guarantees it.
const { renderMediaOnLambda, getRenderProgress, deleteRender, presignUrl } = vi.hoisted(() => ({
  renderMediaOnLambda: vi.fn(),
  getRenderProgress: vi.fn(),
  deleteRender: vi.fn(),
  presignUrl: vi.fn(),
}));

vi.mock('@remotion/lambda-client', () => ({
  renderMediaOnLambda,
  getRenderProgress,
  deleteRender,
  presignUrl,
}));

// ---------------------------------------------------------------------------
// Timing constants — these MIRROR the private constants in renderer.lambda.ts
// (POLL_INTERVAL_MS = 2000, MAX_WAIT_MS = 5 * 60 * 1000). They are not
// exported, so they are duplicated here. If the module changes them, these
// tests must be updated in lockstep; there is no way to assert against the real
// value without exporting it, which the task rules forbid.
// ---------------------------------------------------------------------------
const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 5 * 60 * 1000;

// The fixed config handed to every renderer. 'eu-central-1' is one of
// Remotion's allowed AwsRegion values (see @remotion/lambda-client regions.d.ts).
const CONFIG = {
  functionName: 'test-function',
  serveUrl: 'https://serve.example.invalid/site',
  region: 'eu-central-1' as AwsRegion,
};

// The url our fake Storage hands back from upload(). Deliberately on a domain
// that is NOT the Lambda S3 bucket, so the "never return the S3 url" assertion
// is unambiguous.
const STORAGE_URL = 'https://cdn.example.invalid/renders/x.mp4';

// The url Remotion leaves the rendered file at inside its Lambda bucket. Tests
// assert that this value NEVER reaches the caller — and, since the output is
// private, never even reaches fetch() (section I).
const S3_OUTPUT = 'https://s3.example.invalid/out.mp4';

// The url the mocked presignUrl hands back. The renderer must fetch THIS, not
// the raw S3_OUTPUT above.
const SIGNED_URL = 'https://s3.example.invalid/out.mp4?X-Amz-Signature=fake';

/** A faked ok fetch response: ok, with 8 bytes of body. The renderer only reads
 *  res.ok and res.arrayBuffer(), so this is all it needs. */
function okFetchResponse() {
  return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
}

/**
 * Build a fake Storage. `upload` resolves our STORAGE_URL; `getUrl` is required
 * by the Storage interface but never called by the renderer, so it returns the
 * same url. Both are vi.fn()s so call counts and args are assertable. Typed via
 * `satisfies Storage` so the shape is validated while the Mock methods on
 * upload/getUrl stay available to the tests.
 */
function makeStorage() {
  return {
    name: 'fake-storage',
    upload: vi.fn().mockResolvedValue({ url: STORAGE_URL }),
    getUrl: vi.fn().mockReturnValue(STORAGE_URL),
  } satisfies Storage;
}

// One persistent fetch mock; reset + given a default implementation per test in
// beforeEach. Assigned onto globalThis.fetch so the code under test (which
// calls the bare global `fetch`) hits the mock.
const fetchMock = vi.fn();

let originalFetch: typeof globalThis.fetch;
let warnSpy: MockInstance;
let storage: ReturnType<typeof makeStorage>;
let renderer: RemotionLambdaRenderer;

beforeEach(() => {
  vi.useFakeTimers();

  // Reset the SDK fns so call counts and queued return values cannot leak
  // between tests.
  renderMediaOnLambda.mockReset();
  getRenderProgress.mockReset();
  deleteRender.mockReset();
  presignUrl.mockReset();
  presignUrl.mockResolvedValue(SIGNED_URL);

  // Default fetch: success. Individual tests override per call for failures.
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(okFetchResponse());
  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  // Silence AND capture console.warn for the best-effort delete path. Restored
  // in afterEach so a later file's real warnings are not swallowed.
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  storage = makeStorage();
  renderer = new RemotionLambdaRenderer(CONFIG, storage);
});

afterEach(() => {
  // Every one of these must run or a later file breaks: real timers first (so a
  // pending fake timer can never fire), then fetch, then the warn spy.
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
  warnSpy.mockRestore();
});

/**
 * The canonical happy-path setup: renderId 'r1' lands in bucket 'b1', the very
 * first progress poll reports done with the S3 output, and the fake fetch +
 * Storage succeed. Returns the render promise so a test can both await the
 * result and assert on the SDK calls that produced it. Used by tests 1–4.
 */
async function happyRender(composition = 'comp', props: Record<string, unknown> = {}) {
  renderMediaOnLambda.mockResolvedValue({ renderId: 'r1', bucketName: 'b1' });
  getRenderProgress.mockResolvedValueOnce({ done: true, outputFile: S3_OUTPUT });
  return renderer.render({ composition, props });
}

// ---------------------------------------------------------------------------
// A. The happy path
// ---------------------------------------------------------------------------

describe('A. Happy path', () => {
  it('1. resolves { videoUrl: storage url, storageKey: renders/lambda-r1.mp4 }', async () => {
    const result = await happyRender();
    expect(result).toEqual({
      videoUrl: STORAGE_URL,
      storageKey: 'renders/lambda-r1.mp4',
    });
  });

  it('2. uploads under the renderId-derived key, as a Buffer, with content type video/mp4', async () => {
    // A wrong key here means the 30-day retention sweep can never find the file
    // to delete it — the key is the only handle the rest of the system has.
    await happyRender();
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(storage.upload).toHaveBeenCalledWith(
      'renders/lambda-r1.mp4',
      expect.any(Buffer),
      'video/mp4',
    );
  });

  it('3. videoUrl is our Storage url, never the S3 outputFile', async () => {
    // THE central assertion of this file (see the render() doc comment): the
    // returned link must be the one we control, not Lambda's S3 url to a
    // paying customer's video.
    const result = await happyRender();
    expect(result.videoUrl).toBe(STORAGE_URL);
    expect(result.videoUrl).not.toMatch(/s3\.example\.invalid/);
  });

  it('4. renderMediaOnLambda is called with the config + composition + props + codec h264 + privacy private', async () => {
    await happyRender('my-comp', { foo: 'bar' });
    expect(renderMediaOnLambda).toHaveBeenCalledWith({
      region: CONFIG.region,
      functionName: CONFIG.functionName,
      serveUrl: CONFIG.serveUrl,
      composition: 'my-comp',
      inputProps: { foo: 'bar' },
      codec: 'h264',
      // THE point of the private-render change: the exact value is asserted,
      // because 'public' would make the customer's video world-readable at
      // its plain S3 url for as long as the object exists.
      privacy: 'private',
    });
  });
});

// ---------------------------------------------------------------------------
// B. Cleanup — best-effort delete of the Lambda copy
// ---------------------------------------------------------------------------

describe('B. Cleanup', () => {
  it('5. deleteRender is called with the same renderId, bucketName and region after a successful upload', async () => {
    renderMediaOnLambda.mockResolvedValue({ renderId: 'r5', bucketName: 'b5' });
    getRenderProgress.mockResolvedValueOnce({ done: true, outputFile: S3_OUTPUT });
    await renderer.render({ composition: 'comp', props: {} });

    expect(deleteRender).toHaveBeenCalledTimes(1);
    expect(deleteRender).toHaveBeenCalledWith({
      region: CONFIG.region,
      bucketName: 'b5',
      renderId: 'r5',
    });
  });

  it('6. a failing deleteRender must NOT fail the render — the video is already safe in our Storage', async () => {
    // Failing here would fail a job the customer already paid for, over a
    // cleanup problem. The cost is a growing Lambda bucket, not correctness.
    renderMediaOnLambda.mockResolvedValue({ renderId: 'r6', bucketName: 'b6' });
    getRenderProgress.mockResolvedValueOnce({ done: true, outputFile: S3_OUTPUT });
    deleteRender.mockRejectedValue(new Error('boom: delete failed'));

    const result = await renderer.render({ composition: 'comp', props: {} });

    expect(result).toEqual({
      videoUrl: STORAGE_URL,
      storageKey: 'renders/lambda-r6.mp4',
    });
    expect(warnSpy).toHaveBeenCalled();
    // The warning names the render so an operator can reconcile the orphaned
    // Lambda copy later.
    expect(warnSpy.mock.calls[0][0]).toMatch(/render r6/);
  });

  it('7. deleteRender is NOT called when the upload never happened (the fetch-failure case)', async () => {
    // The most dangerous thing this class could do is delete the ONLY copy of a
    // video we failed to take ownership of. takeOwnership throws before upload
    // on a bad fetch, so deleteRender must never run in that branch. (The
    // rejection contract for this same scenario is pinned in test 9.)
    renderMediaOnLambda.mockResolvedValue({ renderId: 'r7', bucketName: 'b7' });
    getRenderProgress.mockResolvedValueOnce({ done: true, outputFile: S3_OUTPUT });
    fetchMock.mockResolvedValue({ ok: false, status: 403 });

    await expect(renderer.render({ composition: 'comp', props: {} })).rejects.toThrow();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(deleteRender).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// C. Failure paths
// ---------------------------------------------------------------------------

describe('C. Failure paths', () => {
  it('8. progress.fatalErrorEncountered rejects with the joined error messages', async () => {
    renderMediaOnLambda.mockResolvedValue({ renderId: 'r8', bucketName: 'b8' });
    getRenderProgress.mockResolvedValueOnce({
      fatalErrorEncountered: true,
      errors: [{ message: 'boom one' }, { message: 'boom two' }],
    });

    await expect(renderer.render({ composition: 'comp', props: {} })).rejects.toThrow(
      /boom one; boom two/,
    );
    // The render failed before ownership: nothing stored. The Lambda-side
    // artifacts ARE cleaned up on the way out (asserted in full in section E).
    expect(storage.upload).not.toHaveBeenCalled();
    expect(deleteRender).toHaveBeenCalledTimes(1);
  });

  it('9. fetch(outputFile) returns ok:false → rejects mentioning the status and renderId; never uploads (no S3 fallback)', async () => {
    // Falling back to the S3 url here would "succeed", charge the customer, and
    // hand them a link we neither control nor can include in the 30-day
    // promise. It must fail the job instead.
    renderMediaOnLambda.mockResolvedValue({ renderId: 'r9', bucketName: 'b9' });
    getRenderProgress.mockResolvedValueOnce({ done: true, outputFile: S3_OUTPUT });
    fetchMock.mockResolvedValue({ ok: false, status: 403 });

    await expect(renderer.render({ composition: 'comp', props: {} })).rejects.toThrow(
      /403.*renderId=r9/,
    );
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('10. render times out when progress never reports done', async () => {
    renderMediaOnLambda.mockResolvedValue({ renderId: 'r10', bucketName: 'b10' });
    // Never done, never fatal — the loop polls until the wall-clock ceiling.
    getRenderProgress.mockResolvedValue({ done: false });

    const p = renderer.render({ composition: 'comp', props: {} });
    // Attach a handler up front so the (expected) rejection cannot be flagged
    // as unhandled while we drive the clock below.
    p.catch(() => {});

    // The timeout is measured with Date.now(), which fake timers also advance,
    // so driving the clock past MAX_WAIT_MS triggers the bail-out. Add one poll
    // interval so the check (Date.now() - start > MAX_WAIT_MS) is strictly true.
    await vi.advanceTimersByTimeAsync(MAX_WAIT_MS + POLL_INTERVAL_MS);

    await expect(p).rejects.toThrow(/timed out.*renderId=r10/);
    // Timed out before ownership: nothing stored. The still-running render IS
    // cancelled/cleaned up on the way out (asserted in full in section E).
    expect(storage.upload).not.toHaveBeenCalled();
    expect(deleteRender).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// D. Polling
// ---------------------------------------------------------------------------

describe('D. Polling', () => {
  it('11. polls every POLL_INTERVAL_MS (waits, does not spin) and resolves on a later done; exact call count', async () => {
    renderMediaOnLambda.mockResolvedValue({ renderId: 'r11', bucketName: 'b11' });
    getRenderProgress
      .mockResolvedValueOnce({ done: false }) // 1st poll
      .mockResolvedValueOnce({ done: false }) // 2nd poll
      .mockResolvedValueOnce({ done: true, outputFile: S3_OUTPUT }); // 3rd poll

    const p = renderer.render({ composition: 'comp', props: {} });

    // renderMediaOnLambda resolves on a microtask; flush it so the first poll
    // runs and then schedules the first 2000ms sleep.
    await vi.advanceTimersByTimeAsync(0);
    expect(getRenderProgress).toHaveBeenCalledTimes(1);

    // Advancing less than POLL_INTERVAL_MS must NOT trigger another poll —
    // this is the assertion that the loop sleeps between checks instead of
    // spinning and hammering the Lambda.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 1);
    expect(getRenderProgress).toHaveBeenCalledTimes(1);

    // Cross the 2000ms boundary → the sleep resolves → 2nd poll (still not done).
    await vi.advanceTimersByTimeAsync(1);
    expect(getRenderProgress).toHaveBeenCalledTimes(2);

    // One full interval → 3rd poll reports done → fetch + upload → resolves.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(getRenderProgress).toHaveBeenCalledTimes(3);

    const result = await p;
    expect(result).toEqual({
      videoUrl: STORAGE_URL,
      storageKey: 'renders/lambda-r11.mp4',
    });
  });
});

// ---------------------------------------------------------------------------
// E. Failure-path cleanup — best-effort deleteRender on the way OUT, too
// ---------------------------------------------------------------------------
// A render that fails fatally or times out used to leave its Lambda-side
// artifacts behind forever (billed to us). It now gets a best-effort
// deleteRender — exactly the posture takeOwnership has: wrapped, warned, and
// NEVER allowed to replace the real failure the caller sees. The invariant
// under test in every case below is that the ORIGINAL rejection survives the
// cleanup; an un-awaited or catch-less cleanup would surface the wrong error.
// ---------------------------------------------------------------------------

describe('E. Failure-path cleanup', () => {
  it('12. on fatalErrorEncountered, deleteRender is called with the right renderId/bucketName and render() still rejects with the original error', async () => {
    renderMediaOnLambda.mockResolvedValue({ renderId: 'r12', bucketName: 'b12' });
    getRenderProgress.mockResolvedValueOnce({
      fatalErrorEncountered: true,
      errors: [{ message: 'boom one' }, { message: 'boom two' }],
    });

    await expect(renderer.render({ composition: 'comp', props: {} })).rejects.toThrow(
      /boom one; boom two/,
    );
    // Failed before ownership: nothing stored, but the Lambda copy IS dropped.
    expect(storage.upload).not.toHaveBeenCalled();
    expect(deleteRender).toHaveBeenCalledTimes(1);
    expect(deleteRender).toHaveBeenCalledWith({
      region: CONFIG.region,
      bucketName: 'b12',
      renderId: 'r12',
    });
  });

  it('13. on timeout, deleteRender is called and render() still rejects with the timeout message naming the renderId', async () => {
    renderMediaOnLambda.mockResolvedValue({ renderId: 'r13', bucketName: 'b13' });
    // Never done, never fatal — the loop polls until the wall-clock ceiling.
    getRenderProgress.mockResolvedValue({ done: false });

    const p = renderer.render({ composition: 'comp', props: {} });
    // Attach up front so the (expected) rejection is not flagged unhandled.
    p.catch(() => {});

    await vi.advanceTimersByTimeAsync(MAX_WAIT_MS + POLL_INTERVAL_MS);

    await expect(p).rejects.toThrow(/timed out.*renderId=r13/);
    expect(storage.upload).not.toHaveBeenCalled();
    // The still-running render IS cancelled/cleaned up on the way out.
    expect(deleteRender).toHaveBeenCalledTimes(1);
    expect(deleteRender).toHaveBeenCalledWith({
      region: CONFIG.region,
      bucketName: 'b13',
      renderId: 'r13',
    });
  });

  it('14. a deleteRender that ITSELF rejects on the fatal path must not change the error the caller sees', async () => {
    // The trap: awaiting a rejecting cleanup with no try/catch would make the
    // caller see "delete failed" instead of "render failed". cleanupLambdaRender
    // swallows cleanup errors, so the ORIGINAL render failure is what surfaces.
    renderMediaOnLambda.mockResolvedValue({ renderId: 'r14', bucketName: 'b14' });
    getRenderProgress.mockResolvedValueOnce({
      fatalErrorEncountered: true,
      errors: [{ message: 'the real failure' }],
    });
    deleteRender.mockRejectedValue(new Error('cleanup itself blew up'));

    await expect(renderer.render({ composition: 'comp', props: {} })).rejects.toThrow(
      /the real failure/,
    );
    // Cleanup was attempted (and failed); that failure only warned — the caller
    // never sees "cleanup itself blew up".
    expect(deleteRender).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('15. fatalErrorEncountered:true with errors:undefined rejects with "no error details" and does NOT throw a TypeError', async () => {
    // This code has never run against the live SDK, so its shape is an
    // assumption. If the SDK ever reports a fatal with no errors array, the
    // unguarded progress.errors.map(...) was a TypeError that HID the failure.
    // A TypeError's message ("Cannot read properties of undefined...") does NOT
    // match the regex below — so matching it proves the guard worked.
    renderMediaOnLambda.mockResolvedValue({ renderId: 'r15', bucketName: 'b15' });
    getRenderProgress.mockResolvedValueOnce({
      fatalErrorEncountered: true,
      errors: undefined,
    });

    await expect(renderer.render({ composition: 'comp', props: {} })).rejects.toThrow(
      /failed with no error details.*renderId=r15/,
    );
  });
});

// ---------------------------------------------------------------------------
// F. Progress-aware timeout — the flat wall-clock ceiling is gone
// ---------------------------------------------------------------------------
// The ceiling used to be a fixed 5-minute wall clock: a slow-but-advancing
// render was failed even though it was finishing a job the customer paid for.
// It is now "no FORWARD progress for NO_PROGRESS_TIMEOUT_MS". These two tests
// pin both halves: an advancing render is never failed no matter how long it
// runs, and a frozen render is still caught.
// ---------------------------------------------------------------------------

// Mirrors the private constant in renderer.lambda.ts (NO_PROGRESS_TIMEOUT_MS =
// 5 * 60 * 1000). Not exported; duplicated here and must move in lockstep.
const NO_PROGRESS_TIMEOUT_MS = 5 * 60 * 1000;

describe('F. Progress-aware timeout', () => {
  it('16. a render that keeps advancing does NOT time out, even past the old flat ceiling', async () => {
    renderMediaOnLambda.mockResolvedValue({ renderId: 'r16', bucketName: 'b16' });
    // 170 polls of forward progress before done. 170 * POLL_INTERVAL_MS = 340s of
    // wall clock — PAST the whole NO_PROGRESS_TIMEOUT_MS window (300s). Because
    // progress advances every poll, the stall clock keeps resetting and the
    // render is allowed to finish anyway. Had the ceiling stayed a flat wall
    // clock, this render would have been failed at the 300s mark despite
    // advancing the entire time — which is exactly the bug this fix removes.
    let calls = 0;
    getRenderProgress.mockImplementation(async () => {
      calls += 1;
      if (calls >= 170) return { done: true, outputFile: S3_OUTPUT };
      return { done: false, overallProgress: calls / 200 };
    });

    const p = renderer.render({ composition: 'comp', props: {} });
    // Drive the clock across all 170 polls (with headroom), i.e. well past 300s.
    await vi.advanceTimersByTimeAsync(170 * POLL_INTERVAL_MS + POLL_INTERVAL_MS);

    const result = await p;
    expect(result).toEqual({ videoUrl: STORAGE_URL, storageKey: 'renders/lambda-r16.mp4' });
    expect(storage.upload).toHaveBeenCalledTimes(1);
  });

  it('17. a render whose progress is FROZEN still times out (stall detected)', async () => {
    renderMediaOnLambda.mockResolvedValue({ renderId: 'r17', bucketName: 'b17' });
    // overallProgress is present but never advances — the stall clock is set
    // once on the first poll and never reset, so the window elapses.
    getRenderProgress.mockResolvedValue({ done: false, overallProgress: 0.5 });

    const p = renderer.render({ composition: 'comp', props: {} });
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(NO_PROGRESS_TIMEOUT_MS + POLL_INTERVAL_MS);

    await expect(p).rejects.toThrow(/timed out.*no progress.*renderId=r17/);
    expect(storage.upload).not.toHaveBeenCalled();
    // Still cleans up the stuck render on the way out.
    expect(deleteRender).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// G. Ownership fetch retry — a transient blip must not fail a paid render
// ---------------------------------------------------------------------------
// The fetch that takes ownership of the finished video is retried a few times
// with linear backoff on a network error or a 5xx; a 4xx is permanent and
// fails at once. Exhausting the retries fails the job — falling back to the S3
// url is never acceptable (see render()'s doc comment).
// ---------------------------------------------------------------------------

const FETCH_BACKOFF_MS = 500; // mirrors the private constant

describe('G. Ownership fetch retry', () => {
  it('18. a single 5xx is retried and the render still succeeds', async () => {
    renderMediaOnLambda.mockResolvedValue({ renderId: 'r18', bucketName: 'b18' });
    getRenderProgress.mockResolvedValueOnce({ done: true, outputFile: S3_OUTPUT });
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce(okFetchResponse());

    const p = renderer.render({ composition: 'comp', props: {} });
    // Let the first fetch fail, the backoff elapse, and the retry run.
    await vi.advanceTimersByTimeAsync(FETCH_BACKOFF_MS + 1);

    const result = await p;
    expect(result).toEqual({ videoUrl: STORAGE_URL, storageKey: 'renders/lambda-r18.mp4' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('19. a network error is retried and the render still succeeds', async () => {
    renderMediaOnLambda.mockResolvedValue({ renderId: 'r19', bucketName: 'b19' });
    getRenderProgress.mockResolvedValueOnce({ done: true, outputFile: S3_OUTPUT });
    fetchMock.mockReset();
    fetchMock
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(okFetchResponse());

    const p = renderer.render({ composition: 'comp', props: {} });
    await vi.advanceTimersByTimeAsync(FETCH_BACKOFF_MS + 1);

    const result = await p;
    expect(result).toEqual({ videoUrl: STORAGE_URL, storageKey: 'renders/lambda-r19.mp4' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('20. a persistent 5xx exhausts the retries and fails the job (never falls back to S3)', async () => {
    renderMediaOnLambda.mockResolvedValue({ renderId: 'r20', bucketName: 'b20' });
    getRenderProgress.mockResolvedValueOnce({ done: true, outputFile: S3_OUTPUT });
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const p = renderer.render({ composition: 'comp', props: {} });
    p.catch(() => {});
    // Two backoffs between three attempts: 500ms + 1000ms.
    await vi.advanceTimersByTimeAsync(FETCH_BACKOFF_MS + FETCH_BACKOFF_MS * 2 + 1);

    await expect(p).rejects.toThrow(/after 3 attempts.*renderId=r20/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('21. a 4xx is permanent — failed at once, never retried', async () => {
    renderMediaOnLambda.mockResolvedValue({ renderId: 'r21', bucketName: 'b21' });
    getRenderProgress.mockResolvedValueOnce({ done: true, outputFile: S3_OUTPUT });
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await expect(renderer.render({ composition: 'comp', props: {} })).rejects.toThrow(
      /404.*renderId=r21/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storage.upload).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// H. objectKeyFromOutputUrl — the S3 key is DERIVED from the output url,
//    never guessed or reconstructed from the renderId
// ---------------------------------------------------------------------------
// The output object is private, so it is only reachable through a presigned
// url for the EXACT object key. getRenderProgress reports a full S3 url in one
// of two shapes (virtual-host or path-style) and the key must be parsed out of
// whichever arrives. A key that silently differs from the real one is a 404 at
// the worst moment, on a render the customer already paid for — so every parse
// failure throws rather than guessing.
// ---------------------------------------------------------------------------

describe('H. objectKeyFromOutputUrl', () => {
  it('22. a virtual-host url gives the key without the bucket', () => {
    expect(
      objectKeyFromOutputUrl(
        'https://my-bucket.s3.eu-central-1.amazonaws.com/renders/abc/out.mp4',
        'my-bucket',
      ),
    ).toBe('renders/abc/out.mp4');
  });

  it('23. a path-style url gives the key with the bucket segment stripped', () => {
    expect(
      objectKeyFromOutputUrl(
        'https://s3.eu-central-1.amazonaws.com/my-bucket/renders/abc/out.mp4',
        'my-bucket',
      ),
    ).toBe('renders/abc/out.mp4');
  });

  it('24. a percent-escaped key is decoded', () => {
    expect(
      objectKeyFromOutputUrl(
        'https://my-bucket.s3.eu-central-1.amazonaws.com/renders/ab%20c/out.mp4',
        'my-bucket',
      ),
    ).toBe('renders/ab c/out.mp4');
  });

  it('25. a malformed url throws, and the message names the renderId and the url', () => {
    // No fallback, no derived-from-renderId guess — a wrong key is a 404 on a
    // paid render, so an underivable key must fail loudly.
    expect(() => objectKeyFromOutputUrl('not a url at all', 'my-bucket', 'r25')).toThrow(
      /renderId=r25.*not a url at all/,
    );
  });

  it('26. a url whose path is only / throws rather than returning an empty key', () => {
    expect(() =>
      objectKeyFromOutputUrl(
        'https://my-bucket.s3.eu-central-1.amazonaws.com/',
        'my-bucket',
        'r26',
      ),
    ).toThrow(/renderId=r26/);
  });
});

// ---------------------------------------------------------------------------
// I. Presigned ownership fetch — a private output is fetched through a
//    short-lived signed url, never its plain url
// ---------------------------------------------------------------------------

describe('I. Presigned ownership fetch', () => {
  it('27. presignUrl is called with the region, bucket, derived key and expiresInSeconds 900', async () => {
    renderMediaOnLambda.mockResolvedValue({ renderId: 'r27', bucketName: 'remotion-bucket' });
    // Path-style url on purpose: proves the bucket segment is stripped before
    // the key is handed to presignUrl (the pairing of section H with the call).
    getRenderProgress.mockResolvedValueOnce({
      done: true,
      outputFile: 'https://s3.eu-central-1.amazonaws.com/remotion-bucket/renders/r27/out.mp4',
    });

    await renderer.render({ composition: 'comp', props: {} });

    expect(presignUrl).toHaveBeenCalledWith({
      region: CONFIG.region,
      bucketName: 'remotion-bucket',
      objectKey: 'renders/r27/out.mp4',
      expiresInSeconds: 900,
    });
  });

  it('28. the output is fetched through the PRESIGNED url — never the raw outputFile', async () => {
    // The whole point of privacy: 'private' — the object's plain url must never
    // even reach fetch(), because it would 403; and under the old
    // privacy: 'public' it would have been world-readable for the object's
    // whole lifetime.
    await happyRender();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(SIGNED_URL);
    expect(fetchMock).not.toHaveBeenCalledWith(S3_OUTPUT);
  });
});




