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
 * url, never the Lambda-managed S3 outputFile. The doc comment on render()
 * lists three independent reasons returning the S3 url is wrong (a permanently
 * world-readable link to a paying customer's video chief among them); that
 * branch is asserted in every success path.
 *
 * Isolation notes (same discipline as factory.test.ts):
 *  - The SDK fns are created with vi.hoisted so vi.mock's hoisted factory can
 *    reference them without a temporal-dead-zone error.
 *  - beforeEach installs fake timers, resets the three SDK fns and the faked
 *    fetch, and spies console.warn. afterEach restores ALL of them — a leaked
 *    fake timer, mocked fetch or warn spy would silently corrupt later files
 *    in the same vitest run.
 *  - No AWS call and no real network call is ever made.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import type { AwsRegion } from '@remotion/lambda-client';
import { RemotionLambdaRenderer } from './renderer.lambda.ts';
import type { Storage } from '../interfaces.ts';

// vi.mock is hoisted above every import, so the three fns it hands back to the
// module under test must already exist at hoist time. vi.hoisted guarantees it.
const { renderMediaOnLambda, getRenderProgress, deleteRender } = vi.hoisted(() => ({
  renderMediaOnLambda: vi.fn(),
  getRenderProgress: vi.fn(),
  deleteRender: vi.fn(),
}));

vi.mock('@remotion/lambda-client', () => ({
  renderMediaOnLambda,
  getRenderProgress,
  deleteRender,
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
// assert that this value NEVER reaches the caller.
const S3_OUTPUT = 'https://s3.example.invalid/out.mp4';

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
    // returned link must be the one we control, not Lambda's world-readable S3
    // url to a paying customer's video.
    const result = await happyRender();
    expect(result.videoUrl).toBe(STORAGE_URL);
    expect(result.videoUrl).not.toMatch(/s3\.example\.invalid/);
  });

  it('4. renderMediaOnLambda is called with the config + composition + props + codec h264', async () => {
    await happyRender('my-comp', { foo: 'bar' });
    expect(renderMediaOnLambda).toHaveBeenCalledWith({
      region: CONFIG.region,
      functionName: CONFIG.functionName,
      serveUrl: CONFIG.serveUrl,
      composition: 'my-comp',
      inputProps: { foo: 'bar' },
      codec: 'h264',
      privacy: 'public',
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




