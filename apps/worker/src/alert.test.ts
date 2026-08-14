/**
 * Unit tests for the fire-and-forget job-failure webhook alert (alert.ts).
 *
 * The invariant that outranks every other: alerting must NEVER take the worker
 * down. `alertJobFailed` is fired with `void` from a BullMQ 'failed' event
 * handler, where an unhandled rejection would crash the process — so a rejecting
 * fetch, a non-ok response, and a missing config must all resolve quietly.
 *
 * No network is ever opened: `globalThis.fetch` is stubbed and the one-line
 * message it would POST is read straight off the recorded call.
 *
 * NOTE on the warn spy: the spec said "spy console.warn", but `consoleLogger.warn`
 * writes one JSON line to `process.stdout` (packages/core/src/logger.ts) — it
 * never touches `console.warn` (which is stderr anyway). The failure warning is
 * therefore asserted via `process.stdout.write`, which is what `consoleLogger.warn`
 * actually calls. Spying `console.warn` would record zero calls and case 5 would
 * pass for the wrong reason.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { alertJobFailed } from './alert.ts';

/** Captured once so afterEach can restore ALERT_WEBHOOK_URL exactly, whether a
 *  test stubbed it (vi.stubEnv) or deleted it (the "unset" case). */
const ORIGINAL_WEBHOOK = process.env.ALERT_WEBHOOK_URL;

describe('alertJobFailed — opt-in, never-fatal failure webhook', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (ORIGINAL_WEBHOOK === undefined) delete process.env.ALERT_WEBHOOK_URL;
    else process.env.ALERT_WEBHOOK_URL = ORIGINAL_WEBHOOK;
  });

  it('1. no ALERT_WEBHOOK_URL ⇒ no fetch at all', async () => {
    delete process.env.ALERT_WEBHOOK_URL;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await alertJobFailed({ jobId: 'j1', type: 'matrix', error: 'boom' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('2. blank ALERT_WEBHOOK_URL ⇒ no fetch', async () => {
    vi.stubEnv('ALERT_WEBHOOK_URL', '');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await alertJobFailed({ jobId: 'j1', type: 'matrix', error: 'boom' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('3. configured ⇒ POSTs to that url with a JSON { content } body naming jobId/type/error', async () => {
    vi.stubEnv('ALERT_WEBHOOK_URL', 'https://hooks.example.test/xyz');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    await alertJobFailed({ jobId: 'j1', type: 'matrix', error: 'kaboom' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hooks.example.test/xyz');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body);
    expect(body.content).toEqual(expect.any(String));
    expect(body.content).toContain('j1');
    expect(body.content).toContain('matrix');
    expect(body.content).toContain('kaboom');
  });

  it('4. a long error is truncated to 500 chars — the jobId survives the cut', async () => {
    vi.stubEnv('ALERT_WEBHOOK_URL', 'https://hooks.example.test/xyz');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);
    // 250 'a' + 250 'b' + 1500 'c' = 2000 chars. The 'c' run begins at index
    // 500, so its absence in the posted message proves the error was cut there.
    const longError = 'a'.repeat(250) + 'b'.repeat(250) + 'c'.repeat(1500);

    await alertJobFailed({ jobId: 'job-1', type: 'matrix', error: longError });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.content).toContain('job-1'); // jobId was not what got cut
    expect(body.content).not.toContain('c'); // error truncated at ≤ 500 chars
    expect(body.content.length).toBeLessThan(600); // bounded, well under 2000 + prefix
  });

  it('5. a rejecting fetch does NOT throw — alertJobFailed resolves and warns (the case that matters)', async () => {
    vi.stubEnv('ALERT_WEBHOOK_URL', 'https://hooks.example.test/xyz');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const stdoutSpy = vi.spyOn(process.stdout, 'write');

    // Must resolve, not reject — an unhandled rejection here would crash the worker.
    await expect(
      alertJobFailed({ jobId: 'j1', type: 'matrix', error: 'boom' }),
    ).resolves.toBeUndefined();

    // The failure was surfaced through the structured logger, which writes a
    // JSON line to process.stdout (NOT console.warn — see the file header).
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('alert webhook failed'));
  });

  it('6. a non-ok response does not throw either (fetch resolves { ok: false, status: 500 })', async () => {
    vi.stubEnv('ALERT_WEBHOOK_URL', 'https://hooks.example.test/xyz');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(
      alertJobFailed({ jobId: 'j1', type: 'matrix', error: 'boom' }),
    ).resolves.toBeUndefined();
  });
});
