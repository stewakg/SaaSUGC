'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getJobDescriptor, creditsLabel } from '@adgen/core/pricing';
import { FileDropzone } from '@/components/file-dropzone';
import { JobWizard, type WizardStep } from '@/components/job-wizard';
import { pollJob, type JobAsset } from '@/lib/poll-job';
import { uploadFile } from '@/lib/upload-file';

const descriptor = getJobDescriptor('remove_text');

type UploadPhase = 'idle' | 'uploading' | 'done' | 'error';
type GeneratePhase = 'idle' | 'running' | 'done' | 'error';

/**
 * F5 — "Ukloni tekst": upload an image/video, remove any burned-in text or
 * captions from it. Mock-first: the real transform lands with the AIProvider
 * router; today the generic worker pipeline (mock renderer) stands in.
 */
export default function RemoveTextPage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);

  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState('');

  const [genPhase, setGenPhase] = useState<GeneratePhase>('idle');
  const [genError, setGenError] = useState<string | null>(null);
  const [resultAssets, setResultAssets] = useState<JobAsset[]>([]);

  async function handleFiles(files: File[]) {
    const file = files[0];
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
        body: JSON.stringify({ type: 'remove_text', params: { sourceUrl } }),
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
          <p className="text-sm text-txt-mid">Otpremi sliku ili video sa kog treba ukloniti tekst/titlove.</p>
          <FileDropzone
            accept="video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp"
            disabled={uploadPhase === 'uploading'}
            title="Klikni ili prevuci fajl ovde"
            hint="MP4, MOV, WEBM, PNG, JPG ili WEBP · do 200MB"
            onFiles={handleFiles}
          />
          {uploadPhase === 'uploading' && <p className="text-sm text-txt-mid">Otpremam…</p>}
          {uploadError && <p className="rounded-control border border-err/30 bg-err/10 p-3 text-sm text-err-text">{uploadError}</p>}
          {uploadPhase === 'done' && sourceUrl && (
            <p className="truncate text-sm text-accent-text">Otpremljeno: {sourceName}</p>
          )}
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
    (stepIndex === 0 && uploadPhase === 'done') || (stepIndex === 1 && genPhase !== 'running');

  const nextLabel =
    stepIndex === 0
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
        onStepSelect={(i) => setStepIndex(i)}
        onBack={() => setStepIndex((i) => Math.max(0, i - 1))}
        onNext={() => {
          if (stepIndex === 0) {
            setStepIndex(1);
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
          <p className="rounded-control border border-accent-ring bg-accent-soft px-3 py-2 text-sm text-accent-text">
            Cena: <span className="font-mono tabular font-semibold">{creditsLabel(descriptor.cost)}</span>
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
    return <p className="text-sm text-txt-mid">Uklanjam tekst… ⏳</p>;
  }
  if (phase === 'error') {
    return <p className="text-sm text-err-text">{errorMsg}</p>;
  }
  if (phase === 'done') {
    return (
      <div className="space-y-4">
        {assets.map((a) => (
          <div key={a.url} className="space-y-1">
            {a.kind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.url} alt="" className="w-full max-w-[240px] rounded-card border border-line" />
            ) : (
              <video src={a.url} controls className="w-full max-w-[240px] rounded-card border border-line" />
            )}
            <a href={a.url} download target="_blank" rel="noreferrer" className="block text-xs text-accent-text underline">
              Preuzmi
            </a>
          </div>
        ))}
      </div>
    );
  }
  return <p className="text-sm text-txt-mid">Klikni „Pokreni&rdquo; da ukloniš tekst.</p>;
}
