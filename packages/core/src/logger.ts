/**
 * Structured logger (F6 production hardening). Not a "mock" — unlike the
 * providers in providers/mocks.ts, there's no separate "real" implementation
 * to swap to later: stdout/stderr IS the real output, captured by whatever
 * runs the container (Docker logs, journald, a log shipper on Hetzner…).
 *
 * Emits one JSON object per line so a log aggregator can parse it, rather
 * than a human-oriented `[INFO] msg meta` string.
 */
import type { Logger } from './interfaces.ts';

function writeLog(
  stream: NodeJS.WriteStream,
  level: 'info' | 'warn' | 'error',
  msg: string,
  meta?: Record<string, unknown>,
): void {
  const entry = { level, msg, time: new Date().toISOString(), ...(meta ? { meta } : {}) };
  try {
    stream.write(`${JSON.stringify(entry)}\n`);
  } catch {
    // meta wasn't JSON-serialisable (e.g. contained a raw Error, a circular
    // ref) — still emit the message rather than losing the log line.
    stream.write(`${JSON.stringify({ level, msg, time: entry.time })}\n`);
  }
}

export const consoleLogger: Logger = {
  info: (msg, meta) => writeLog(process.stdout, 'info', msg, meta),
  warn: (msg, meta) => writeLog(process.stdout, 'warn', msg, meta),
  error: (msg, meta) => writeLog(process.stderr, 'error', msg, meta),
};
