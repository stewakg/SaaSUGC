'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getJobDescriptor, creditsLabel } from '@adgen/core/pricing';
import { JobWizard, type WizardStep } from '@/components/job-wizard';
import { pollJob, type JobAsset } from '@/lib/poll-job';
import { uploadFile } from '@/lib/upload-file';

const descriptor = getJobDescriptor('enhance');

const UPSCALE_FACTORS = [
  { value: 2, label: '2×' },
  { value: 4, label: '4×' },
];

type UploadPhase = 'idle' | 'uploading' | 'done' | 'error';
type GeneratePhase = 'idle' | 'running' | 'done' | 'error';

/**
 * F5 — "Enhance": upload an image/video, upscale/sharpen it. Mock-first:
 * the real transform lands with the AIProvider router; today the generic
 * worker pipeline (mock renderer) stands in.
 */
export default function EnhancePage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);

  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState('');

  const [upscaleFactor, setUpscaleFactor] = useState(2);
  const [sharpen, setSharpen] = useState(true);

  const [genPhase, setGenPhase] = useState<GeneratePhase>('idle');
  const [genError, setGenError] = useState<string | null>(null);
  const [resultAssets, setResultAssets] = useState<JobAsset[]>([]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadPhase('uploading');
    setUploadError(null);
    try {
      const uploaded = await uploadFile(file);
      setSourceUrl(uploaded.url);
      setSourceName(uploaded.name);
      setUploadPhase('done');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Nepoznata greška.');
      setUploadPhase('error');
    }
  }

  async function handleGenerate() {
    setGenPhase('running');
    setGenError(null);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'enhance', params: { sourceUrl, upscaleFactor, sharpen } }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? 'Greška pri pokretanju.');

      const job = await pollJob(data.id, { intervalMs: 1200, timeoutMs: 45_000 });
      if (job.status === 'error') throw new Error(job.error ?? 'Job nije uspeo.');

      setResultAssets(job.result?.assets ?? []);
      setGenPhase('done');
      router.refresh();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Nepoznata greška.');
      setGenPhase('error');
    }
  }

  const steps: WizardStep[] = [
    {
      id: 'import',
      label: 'Uvezi fajl',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">Otpremi sliku ili video kome treba popraviti kvalitet.</p>
          <label className="block">
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp"
              onChange={(e) => void handleFileChange(e)}
              className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-400/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-200 hover:file:bg-brand-400/20"
            />
          </label>
          {uploadPhase === 'uploading' && <p className="text-sm text-zinc-300">Otpremam…</p>}
          {uploadError && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{uploadError}</p>}
          {uploadPhase === 'done' && sourceUrl && (
            <p className="truncate text-sm text-brand-200">Otpremljeno: {sourceName}</p>
          )}
        </div>
      ),
    },
    {
      id: 'settings',
      label: 'Podešavanja',
      content: (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Uvećanje rezolucije</span>
            <div className="flex gap-2">
              {UPSCALE_FACTORS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setUpscaleFactor(f.value)}
                  className={`h-9 rounded-lg border px-4 text-sm transition ${
                    upscaleFactor === f.value
                      ? 'border-brand-400/50 bg-brand-400/10 text-brand-200'
                      : 'border-white/10 text-zinc-400 hover:bg-white/5'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={sharpen}
              onChange={(e) => setSharpen(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-ink-900 text-brand-400"
            />
            <span className="text-sm text-zinc-300">Dodatno izoštri detalje</span>
          </label>
        </div>
      ),
    },
    {
      id: 'generate',
      label: 'Generiši',
      content: <GenerateStep phase={genPhase} errorMsg={genError} assets={resultAssets} />,
    },
  ];

  const canNext =
    (stepIndex === 0 && uploadPhase === 'done') || stepIndex === 1 || (stepIndex === 2 && genPhase !== 'running');

  const nextLabel =
    stepIndex < 2
      ? 'Dalje'
      : genPhase === 'done'
        ? 'Vidi u Moje reklame'
        : genPhase === 'running'
          ? 'Radi…'
          : 'Pokreni';

  return (
    <div className="py-6">
      <JobWizard
        steps={steps}
        activeIndex={stepIndex}
        onBack={() => setStepIndex((i) => Math.max(0, i - 1))}
        onNext={() => {
          if (stepIndex < 2) {
            setStepIndex((i) => i + 1);
            return;
          }
          if (genPhase === 'done') {
            router.push('/app/reklame');
            return;
          }
          if (genPhase !== 'running') {
            void handleGenerate();
          }
        }}
        canNext={canNext}
        nextLabel={nextLabel}
        costLabel={
          <p className="rounded-lg border border-brand-400/20 bg-brand-400/5 px-3 py-2 text-sm text-brand-200">
            Cena: <span className="font-semibold">{creditsLabel(descriptor.cost)}</span>
            {genPhase === 'done' ? ' · naplaćeno' : ''}
          </p>
        }
      />
    </div>
  );
}

function GenerateStep({
  phase,
  errorMsg,
  assets,
}: {
  phase: GeneratePhase;
  errorMsg: string | null;
  assets: JobAsset[];
}) {
  if (phase === 'running') {
    return <p className="text-sm text-zinc-300">Popravljam kvalitet… ⏳</p>;
  }
  if (phase === 'error') {
    return <p className="text-sm text-red-300">{errorMsg}</p>;
  }
  if (phase === 'done') {
    return (
      <div className="space-y-4">
        {assets.map((a) => (
          <div key={a.url} className="space-y-1">
            {a.kind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.url} alt="" className="w-full max-w-[240px] rounded-lg border border-white/10" />
            ) : (
              <video src={a.url} controls className="w-full max-w-[240px] rounded-lg border border-white/10" />
            )}
            <a href={a.url} download target="_blank" rel="noreferrer" className="block text-xs text-brand-300 underline">
              Preuzmi
            </a>
          </div>
        ))}
      </div>
    );
  }
  return <p className="text-sm text-zinc-400">Klikni „Pokreni&rdquo; da popraviš kvalitet.</p>;
}
