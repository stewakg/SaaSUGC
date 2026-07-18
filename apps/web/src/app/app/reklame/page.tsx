import { getJobDescriptor } from '@adgen/core/pricing';
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
                    {new Date(job.created_at).toLocaleString('sr-RS')} · {job.cost} kredita
                    {job.status === 'error' && job.error ? ` · ${job.error}` : ''}
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
