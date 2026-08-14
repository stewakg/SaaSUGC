'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getJobDescriptor, creditsLabel } from '@adgen/core/pricing';
import { JobWizard, type WizardStep } from '@/components/job-wizard';
import { pollJob, type JobAsset } from '@/lib/poll-job';

const descriptor = getJobDescriptor('quick_test');

type Phase = 'idle' | 'running' | 'done' | 'error';

/**
 * Minimal 2-step wizard proving the F2 pipeline end-to-end: enqueue a
 * `quick_test` job, poll until done, show the mock result. Per-tool wizards
 * (AI slike, Matrix, …) land in F3+ and reuse the same `JobWizard` shell.
 */
export default function QuickTestPage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [assets, setAssets] = useState<JobAsset[]>([]);

  async function handleStart() {
    setPhase('running');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'quick_test' }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? 'Greška pri pokretanju.');

      const job = await pollJob(data.id, { intervalMs: 1000, timeoutMs: 30_000 });
      if (job.status === 'error') throw new Error(job.error ?? 'Posao nije uspeo.');

      setAssets(job.result?.assets ?? []);
      setPhase('done');
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Nepoznata greška.');
      setPhase('error');
    }
  }

  const steps: WizardStep[] = [
    {
      id: 'overview',
      label: descriptor.label,
      content: <p className="text-sm text-txt-mid">{descriptor.description}</p>,
    },
    {
      id: 'run',
      label: 'Pokreni',
      content: <RunStep phase={phase} errorMsg={errorMsg} assets={assets} />,
    },
  ];

  const nextLabel =
    stepIndex === 0
      ? 'Dalje'
      : phase === 'done'
        ? 'Vidi u Moje reklame'
        : phase === 'running'
          ? 'Radi…'
          : 'Pokreni';

  return (
    <div className="py-6">
      <JobWizard
        steps={steps}
        activeIndex={stepIndex}
        onStepSelect={(i) => setStepIndex(i)}
        onBack={() => setStepIndex((i) => Math.max(0, i - 1))}
        onNext={() => {
          if (stepIndex === 0) {
            setStepIndex(1);
            return;
          }
          if (phase === 'done') {
            router.push('/app/reklame');
            return;
          }
          if (phase !== 'running') {
            void handleStart();
          }
        }}
        canNext={phase !== 'running'}
        nextLabel={nextLabel}
        costLabel={
          <p className="rounded-control border border-accent-ring bg-accent-soft px-3 py-2 text-sm text-accent-text">
            Cena: <span className="font-mono tabular font-semibold">{creditsLabel(descriptor.cost)}</span>
            {phase === 'done' ? ' · naplaćeno' : ''}
          </p>
        }
      />
    </div>
  );
}

function RunStep({
  phase,
  errorMsg,
  assets,
}: {
  phase: Phase;
  errorMsg: string | null;
  assets: JobAsset[];
}) {
  if (phase === 'running') {
    return <p className="text-sm text-txt-mid">Generišem probni video… ⏳</p>;
  }
  if (phase === 'error') {
    return <p role="alert" className="text-sm text-err-text">{errorMsg}</p>;
  }
  if (phase === 'done') {
    return (
      <div className="space-y-2">
        <p className="text-sm text-accent-text">Gotovo!</p>
        {assets.map((a) => (
          <a
            key={a.url}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-xs text-txt-mid underline"
          >
            {a.url}
          </a>
        ))}
      </div>
    );
  }
  return <p className="text-sm text-txt-mid">Klikni „Pokreni&rdquo; da generišeš probni video.</p>;
}
