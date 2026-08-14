import { consoleLogger } from '@adgen/core';

/** The error field is capped so a pasted stack trace can't blow a webhook body limit. */
const MAX_ERROR_CHARS = 500;

/**
 * Fire-and-forget failure alerts.
 *
 * Opt-in: with ALERT_WEBHOOK_URL unset this is a no-op, which is the state every
 * developer machine is in. Never throws and never rejects — an alerting problem
 * must not become a worker problem, and this is called from an event handler
 * where a rejection would be unhandled.
 *
 * The payload is a single `content` field, which is what Discord and most
 * Telegram/Slack relays accept; anything more specific would tie this to one
 * vendor for no gain.
 */
export async function alertJobFailed(input: {
  jobId: string;
  type?: string;
  error: string;
}): Promise<void> {
  // Read at call time, not module load, so a test (or a rotated URL) can set it.
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;

  // One line: collapse any newlines a stack trace smuggles in, then cap the
  // length. The jobId sits OUTSIDE the truncated span, so it always survives.
  const error = input.error.replace(/[\r\n]+/g, ' ').slice(0, MAX_ERROR_CHARS);
  const parts = ['ADGEN job failed'];
  if (input.type) parts.push(input.type);
  parts.push(input.jobId);
  parts.push(error);
  const content = parts.join(' · ');

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      // A hanging webhook must not pin the worker process.
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    // Swallow everything — see the header. Surfaced as a warn, never a throw.
    consoleLogger.warn('alert webhook failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
