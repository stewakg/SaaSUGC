import { getJobDescriptor, creditsLabel } from '@adgen/core/pricing';
import { createServerClient } from '@/lib/supabase/server';
import type { JobStatus, JobType } from '@adgen/db';

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'U redu čekanja',
  running: 'U toku',
  done: 'Gotovo',
  error: 'Greška',
};

const STATUS_CLASS: Record<JobStatus, string> = {
  queued: 'border-white/10 bg-white/5 text-zinc-400',
  running: 'border-brand-400/30 bg-brand-400/10 text-brand-200',
  done: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  error: 'border-red-400/30 bg-red-400/10 text-red-300',
};

interface JobRow {
  id: string;
  type: JobType;
  status: JobStatus;
  cost: number;
  result: { assets?: { kind: string; url: string }[] } | null;
  error: string | null;
  created_at: string;
}

/**
 * `job.cost` is the price quoted when the job was *enqueued*, not money that
 * actually moved. The worker charges on success only, so anything that is not
 * `done` has not been billed: an `error` job never reaches `charge_credits`,
 * and `queued`/`running` are still only an estimate. Rendering the bare figure
 * for every status is what made a failed placeholder-tool job read as
 * "… · 2 kredita · tool_not_implemented: …" — i.e. as if the user had been
 * charged for a job that produced nothing. They had not. Hence per-status copy.
 */
function costLabel(status: JobStatus, cost: number): string {
  if (status === 'done') return creditsLabel(cost);
  if (status === 'error') return 'nije naplaćeno';
  return `procena: ${creditsLabel(cost)}`;
}

/** Machine prefix on worker errors, e.g. `tool_not_implemented: `. */
const ERROR_CODE_PREFIX = /^[a-z0-9_]+:\s*/;

/**
 * Worker errors arrive as `<code>: <poruka na srpskom>`. The part after the
 * code is already user-facing, so drop the code; if there is no such prefix
 * (or nothing left after it), show the string as-is rather than nothing.
 */
function humanError(error: string): string {
  return error.replace(ERROR_CODE_PREFIX, '').trim() || error;
}

/**
 * "Moje reklame" — job history. RLS scopes the query to the signed-in user,
 * so no explicit ownership filter is needed.
 */
export default async function ReklamePage() {
  const supabase = await createServerClient();
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, type, status, cost, result, error, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
    .returns<JobRow[]>();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Moje reklame</h1>
        <p className="mt-1 text-sm text-zinc-400">Istorija generisanih oglasa.</p>
      </div>

      {!jobs || jobs.length === 0 ? (
        <div className="card-gradient p-8 text-center">
          <p className="text-sm text-zinc-300">Još nemaš nijednu reklamu.</p>
          <p className="mt-1 text-sm text-zinc-500">
            Pokreni „Brzi test&rdquo; sa početne da vidiš kako pipeline radi.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => {
            const assets = job.status === 'done' ? (job.result?.assets ?? []) : [];
            return (
              <li key={job.id} className="card flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{getJobDescriptor(job.type).label}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_CLASS[job.status]}`}
                    >
                      {STATUS_LABEL[job.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {new Date(job.created_at).toLocaleString('sr-RS')} ·{' '}
                    {costLabel(job.status, job.cost)}
                    {job.status === 'error' && job.error ? ` · ${humanError(job.error)}` : ''}
                  </p>
                </div>
                {assets.length > 0 && (
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    {assets.map((asset, i) => (
                      <a
                        key={asset.url}
                        href={asset.url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-ghost text-sm"
                      >
                        {assets.length > 1 ? `Otvori #${i + 1}` : 'Otvori'}
                      </a>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
