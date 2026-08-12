/**
 * Tests for the shared job-status poller.
 *
 * Every wizard (quick-test, ai-slike, matrix, …) leans on this loop to decide
 * when a job is finished and when to give up. The three failure modes that
 * matter in production are all encoded below as tests:
 *   - resolving too early shows the user "done" with nothing in it;
 *   - never giving up hangs the wizard on a spinner forever;
 *   - throwing on a terminal-but-unhappy shape turns a job the server already
 *     flagged as failed into a crash the wizard renders as an exception.
 *
 * `pollJob` reaches for the global `fetch` and sleeps with `setTimeout`, so
 * both are taken over by vitest: `fetch` is swapped for a `vi.fn` and the
 * clock is frozen with `vi.useFakeTimers()` so the interval sleeps cost no
 * real time. Each poll that does not terminate schedules a `setTimeout`, so
 * the suite drives the loop forward with `vi.advanceTimersByTimeAsync`, which
 * both advances the clock and flushes the pending microtasks in one step.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pollJob, type JobResult } from './poll-job.ts';

/** Build a fake `Response`-ish object that resolves to `{ job }`. */
const okResponse = (job: JobResult) => ({ ok: true, json: async () => ({ job }) });

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // Freeze the clock so the interval sleeps in pollJob are instantaneous.
  vi.useFakeTimers();
});

afterEach(() => {
  // Restore the real clock and the real fetch — later test files in the same
  // vitest run share this global, so leaving it mocked would corrupt them.
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

/** Install `fetch` as a `vi.fn` with the given per-call implementations. */
const installFetch = (...responses: Array<object>) => {
  const fn = vi.fn();
  if (responses.length === 1) {
    fn.mockResolvedValue(responses[0]);
  } else {
    for (const r of responses) fn.mockResolvedValueOnce(r);
  }
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
};


describe('pollJob — terminal states resolve rather than throw', () => {
  it('returns immediately when the first poll says `done`', async () => {
    // The common happy path: one round-trip and we are done. If this made a
    // second fetch the wizard would just be wasting a request.
    const fetchMock = installFetch(okResponse({ status: 'done' }));
    const result = await pollJob('job-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('done');
  });

  it('returns when the first poll says `error` instead of rejecting', async () => {
    // `error` is terminal: the job is over, it just went badly. Resolving
    // (not throwing) lets the wizard show the server's message instead of a
    // crash. Flipping this to a rejection would surface a failed render as an
    // unhandled exception.
    installFetch(okResponse({ status: 'error', error: 'render blew up' }));
    const result = await pollJob('job-2');
    expect(result.status).toBe('error');
    expect(result.error).toBe('render blew up');
  });
});

describe('pollJob — polling loop', () => {
  it('keeps polling while queued/running and resolves once a later poll is done', async () => {
    // Two non-terminal shapes, then a terminal one. The exact fetch count is
    // the assertion: it proves the loop neither bails early nor double-polls.
    const fetchMock = installFetch(
      okResponse({ status: 'queued' }),
      okResponse({ status: 'running' }),
      okResponse({ status: 'done' }),
    );

    const promise = pollJob('job-3', { intervalMs: 1000, timeoutMs: 30_000 });
    // Each interval elapse unblocks one more poll.
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.status).toBe('done');
  });
});


describe('pollJob — intervalMs is honoured', () => {
  it('does not poll again until the interval has fully elapsed', async () => {
    // Guards against a busy-loop: if the sleep were skipped the poller would
    // hammer the endpoint. We assert the count holds at each half-interval.
    const fetchMock = installFetch(
      okResponse({ status: 'running' }),
      okResponse({ status: 'running' }),
      okResponse({ status: 'done' }),
    );

    const promise = pollJob('job-9', { intervalMs: 1000, timeoutMs: 30_000 });
    const guard = promise.catch(() => {});

    // First poll happens synchronously on entry.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    // Half an interval in — still waiting on the sleep, no new poll.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    // Interval elapsed → second poll fires.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const result = await promise;
    expect(result.status).toBe('done');
    void guard;
  });
});

describe('pollJob — request shape', () => {
  it('hits /api/jobs/<id> with cache: "no-store"', async () => {
    // Without `no-store`, a cached `running` could make the poller loop
    // forever on a response the server has long since moved past.
    const fetchMock = installFetch(okResponse({ status: 'done' }));
    await pollJob('abc-123');
    expect(fetchMock).toHaveBeenCalledWith('/api/jobs/abc-123', { cache: 'no-store' });
  });
});

describe('pollJob — error handling', () => {
  it('throws when the response is not ok, using the server error as the message', async () => {
    installFetch({ ok: false, json: async () => ({ error: 'server says no' }) });
    await expect(pollJob('job-5')).rejects.toThrow('server says no');
  });

  it('throws when the body has no `job`, even with ok: true', async () => {
    // A 200 with a misshapen body is a server bug; treating it as success
    // would hand the wizard an undefined job to render.
    installFetch({ ok: true, json: async () => ({}) });
    await expect(pollJob('job-6')).rejects.toThrow('Greška pri proveri statusa.');
  });

  it('falls back to the Serbian default message when the server gives no error field', async () => {
    // Both strings are copied verbatim from poll-job.ts; do not "fix" their
    // wording here — the source is the single source of truth.
    installFetch({ ok: false, json: async () => ({}) });
    await expect(pollJob('job-7')).rejects.toThrow('Greška pri proveri statusa.');
  });
});

describe('pollJob — timeout', () => {
  it('rejects with the Serbian timeout message when the job never leaves running', async () => {
    // A render that silently wedges must not pin the wizard on a spinner
    // forever. Small timeoutMs keeps the fake clock iterations cheap.
    installFetch(okResponse({ status: 'running' }));
    const promise = pollJob('job-8', { intervalMs: 1000, timeoutMs: 5000 });
    // Absorb the eventual rejection so advancing the clock does not surface an
    // unhandled-rejection warning before `expect…rejects` attaches.
    const guard = promise.catch((e) => e);

    // The poller re-checks `Date.now() - start > timeoutMs` every iteration,
    // so one big time jump settles it without a manual loop.
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(promise).rejects.toThrow('Isteklo vreme čekanja na rezultat.');
    void guard;
  });
});
