/**
 * Shared job-status poller for the wizard pages (quick-test, ai-slike, matrix, …).
 * Each wizard picks its own interval/timeout — a real Remotion render (Matrix)
 * needs far more headroom than a mock job.
 */

export interface JobAsset {
  kind: string;
  url: string;
}

export interface JobResult {
  status: 'queued' | 'running' | 'done' | 'error';
  error?: string | null;
  result?: { assets?: JobAsset[] } | null;
}

export async function pollJob(
  jobId: string,
  { intervalMs = 1000, timeoutMs = 30_000 }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<JobResult> {
  const start = Date.now();
  while (true) {
    const res = await fetch(`/api/jobs/${jobId}`, { cache: 'no-store' });
    const data = (await res.json()) as { job?: JobResult; error?: string };
    if (!res.ok || !data.job) throw new Error(data.error ?? 'Greška pri proveri statusa.');
    if (data.job.status === 'done' || data.job.status === 'error') return data.job;
    if (Date.now() - start > timeoutMs) throw new Error('Isteklo vreme čekanja na rezultat.');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
