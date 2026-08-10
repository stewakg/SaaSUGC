/**
 * Runs the yt-dlp binary directly, WITHOUT a shell.
 *
 * Why not call `youtube-dl-exec` itself: its `create()` turns on `shell: true`
 * whenever the binary's own path contains whitespace, then quotes only the
 * binary and passes every other argument through the shell unquoted
 * (`src/index.js:20-31`). Both of this project's checkouts sit under a path
 * with a space — `C:\Sa starog\…` and `D:\Projekti\2. SaaSUGC` — so the shell
 * path is the one that actually runs on Windows.
 *
 * Two consequences, both found live 2026-08-10 while click-testing search:
 *   1. Any multi-word search split into separate arguments. `masazer za vrat`
 *      searched for "masazer" and then reported `'za' is not a valid URL`,
 *      exiting 1 — so the route threw 502 even though stdout held good results.
 *   2. More seriously, user input reached `cmd.exe` unquoted. `&` is a command
 *      separator there, and `&` is ordinary inside a YouTube URL
 *      (`?v=…&t=…`) — never mind a query typed to exploit it.
 *
 * Passing argv as an array with no shell removes both at once: no word
 * splitting, and no metacharacter is ever interpreted.
 *
 * Server-only. Never import from a "use client" file.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { YOUTUBE_DL_PATH } from 'youtube-dl-exec/src/constants';

const execFileAsync = promisify(execFile);

/**
 * `--dump-json` over a full page of search results runs to a few MB; the Node
 * default (1 MB) would truncate and surface as a confusing parse failure.
 */
const MAX_STDOUT_BYTES = 64 * 1024 * 1024;

/**
 * @param target positional argument — a URL, or a `ytsearchN:` search prefix.
 * @param flags  already-formed CLI flags, e.g. `['--dump-json', '--retries', '1']`.
 *               Written out rather than derived from an options object so the
 *               exact command is greppable from the call site.
 * @returns raw stdout. `--dump-json` emits one JSON object per line, so this is
 *          NDJSON, not JSON — see `parseSearchOutput` in `clip-search.ts`.
 */
export async function runYtDlp(target: string, flags: string[]): Promise<string> {
  const { stdout } = await execFileAsync(YOUTUBE_DL_PATH, [target, ...flags], {
    maxBuffer: MAX_STDOUT_BYTES,
    windowsHide: true,
  });
  return stdout;
}
