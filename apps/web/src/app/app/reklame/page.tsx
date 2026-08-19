import { cookies } from 'next/headers';
import { getJobDescriptor } from '@adgen/core/pricing';
import { createServerClient } from '@/lib/supabase/server';
import { costLabel, humanError } from '@/lib/job-display';
import { DeleteJobFiles } from '@/components/delete-job-files';
import { ToolIcon } from '@/components/tool-icon';
import { TIMEZONE_COOKIE, formatDateTime, resolveTimezone } from '@/lib/timezone';
import type { JobStatus, JobType } from '@adgen/db';

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'U redu čekanja',
  running: 'U toku',
  done: 'Gotovo',
  error: 'Greška',
};

const STATUS_CLASS: Record<JobStatus, string> = {
  queued: 'border-line bg-panel-2 text-txt-mid',
  running: 'border-live/30 bg-live/10 text-live',
  done: 'border-ok/30 bg-ok/10 text-ok-text',
  error: 'border-err/30 bg-err/10 text-err-text',
};

interface JobRow {
  id: string;
  type: JobType;
  status: JobStatus;
  cost: number;
  result: { assets?: { kind: string; url: string }[]; files_deleted?: boolean } | null;
  error: string | null;
  created_at: string;
}

/**
 * "Moje reklame" — job history. RLS scopes the query to the signed-in user,
 * so no explicit ownership filter is needed.
 */
export default async function ReklamePage() {
  // This page is a server component, so the zone cannot come from
  // document.cookie — it is read from the request the same way layout.tsx reads
  // the theme. Resolved once here and threaded through formatDateTime below,
  // so every row on the page renders in the same, user-picked zone.
  const pickedTz = (await cookies()).get(TIMEZONE_COOKIE)?.value;
  const tz = resolveTimezone(pickedTz);

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
        <p className="mt-1 text-sm text-txt-mid">Istorija generisanih oglasa.</p>
      </div>

      {!jobs || jobs.length === 0 ? (
        <div className="card-gradient p-8 text-center">
          <p className="text-sm text-txt-mid">Još nemaš nijednu reklamu.</p>
          <p className="mt-1 text-sm text-txt-low">
            Napravi prvu — otvori „Nova reklama&rdquo; na početnoj strani.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => {
            const assets = job.status === 'done' ? (job.result?.assets ?? []) : [];
            return (
              <li key={job.id} className="card flex items-center justify-between gap-4">
                <ToolIcon icon={getJobDescriptor(job.type).icon} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-txt-hi">{getJobDescriptor(job.type).label}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-mono tabular ${STATUS_CLASS[job.status]}`}
                    >
                      {STATUS_LABEL[job.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-txt-low">
                    <span className="font-mono tabular">{formatDateTime(job.created_at, tz)}</span> ·{' '}
                    <span className="font-mono tabular">{costLabel(job.status, job.cost)}</span>
                    {job.status === 'error' && job.error ? ` · ${humanError(job.error)}` : ''}
                  </p>
                </div>
                {assets.length > 0 && (
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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
                    <DeleteJobFiles jobId={job.id} />
                  </div>
                )}
                {assets.length === 0 && job.result?.files_deleted && (
                  <span className="shrink-0 text-xs text-txt-low">Fajlovi obrisani</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
