/**
 * Tests for `runYtDlp` — the shell-free wrapper around the yt-dlp binary.
 *
 * The whole reason this module exists (see the long comment in `yt-dlp.ts`)
 * is that `youtube-dl-exec` falls back to `shell: true` whenever the binary's
 * path contains whitespace, which is always on this project's Windows
 * checkouts. Under `shell: true` two things break: multi-word targets get
 * word-split into separate arguments, and metacharacters (`&` in a YouTube
 * URL is the killer example) reach `cmd.exe` unquoted.
 *
 * `execFileAsync` is `promisify(execFile)`, so it honours the standard
 * Node callback contract: a mock `execFile` that invokes
 * `cb(null, { stdout, stderr })` resolves the promise to `{ stdout, stderr }`,
 * and `cb(err)` rejects it. The mock is declared through `vi.hoisted` because
 * `vi.mock` is hoisted above every import — the factory closure can only see
 * bindings that were themselves hoisted.
 *
 * `YOUTUBE_DL_PATH` is a build-time constant re-exported from
 * `youtube-dl-exec/src/constants`; we pin it to a fake path so the test
 * neither depends on the real install location nor needs a binary present.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runYtDlp } from './yt-dlp.ts';

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));

vi.mock('node:child_process', () => ({ execFile: execFileMock }));
vi.mock('youtube-dl-exec/src/constants', () => ({
  YOUTUBE_DL_PATH: '/fake/path/yt-dlp',
}));

beforeEach(() => {
  execFileMock.mockReset();
  // default: succeed with a recognisable stdout so a forgotten per-test
  // override can't silently pass against the wrong shape.
  execFileMock.mockImplementation(
    (_file, _args, _opts, cb) => cb(null, { stdout: 'OUT', stderr: '' }),
  );
});

describe('runYtDlp', () => {
  it('invokes the YOUTUBE_DL_PATH executable, not youtube-dl-exec', async () => {
    // We bypass `youtube-dl-exec` entirely and call the binary path it would
    // have called — the first argv element is the resolved constant, never a
    // JS shim and never `cmd.exe`.
    await runYtDlp('ytsearch8:test', ['--dump-json']);
    expect(execFileMock.mock.calls[0][0]).toBe('/fake/path/yt-dlp');
  });

  it('passes argv as [target, ...flags] in order', async () => {
    // argv order is part of the contract: the positional target first, then
    // the already-formed flags exactly as the caller supplied them. A reorder
    // here would silently invert the meaning of e.g. `--retries 1`.
    await runYtDlp('ytsearch8:test', ['--dump-json']);
    expect(execFileMock.mock.calls[0][1]).toEqual([
      'ytsearch8:test',
      '--dump-json',
    ]);

    // A multi-flag call pins the full array AND its order — not just that
    // every flag is present, but that `--retries` precedes its value `1`.
    await runYtDlp('ytsearch8:test', ['--dump-json', '--retries', '1']);
    expect(execFileMock.mock.calls[1][1]).toEqual([
      'ytsearch8:test',
      '--dump-json',
      '--retries',
      '1',
    ]);
  });

  it('keeps a multi-word target as a SINGLE argv element (no word splitting)', async () => {
    // This is regression coverage for the live bug: `masazer za vrat` reached
    // the shell as three tokens, so yt-dlp searched for "masazer" and then
    // errored on `za` / `vrat` as URLs. Array argv must keep it intact.
    await runYtDlp('masazer za vrat', []);
    expect(execFileMock.mock.calls[0][1][0]).toBe('masazer za vrat');
    // And it is genuinely one element, not three.
    expect(execFileMock.mock.calls[0][1]).toEqual(['masazer za vrat']);
  });

  it('spawns with NO shell, a 64 MiB maxBuffer, and windowsHide', async () => {
    // The security guarantee. `shell: true` must never appear on the options
    // object — if it did, every other assertion in this file would be
    // theatre, because the argv would be re-stringified and re-split by the
    // shell. We assert the property is absent (not merely falsy) so a future
    // `shell: false` would still pass but an accidental `shell: true` would
    // fail loudly.
    await runYtDlp('ytsearch8:test', ['--dump-json']);
    const opts = execFileMock.mock.calls[0][2];
    expect('shell' in opts).toBe(false);
    expect(opts.maxBuffer).toBe(64 * 1024 * 1024);
    expect(opts.windowsHide).toBe(true);
  });

  it('returns stdout only', async () => {
    // The caller treats stdout as NDJSON and never wants stderr glued onto it.
    execFileMock.mockImplementation(
      (_file, _args, _opts, cb) =>
        cb(null, { stdout: 'line1\nline2', stderr: 'noise' }),
    );
    const result = await runYtDlp('x', []);
    expect(result).toBe('line1\nline2');
  });

  it('rejects when execFile reports an error', async () => {
    // A non-zero exit surfaces here as a callback error; the module must
    // propagate it rather than swallow it into an empty stdout.
    execFileMock.mockImplementation(
      (_f, _a, _o, cb) => cb(new Error('yt-dlp exited 1')),
    );
    await expect(runYtDlp('x', [])).rejects.toThrow('yt-dlp exited 1');
  });
});
