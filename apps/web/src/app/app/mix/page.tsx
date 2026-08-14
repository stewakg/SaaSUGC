'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getJobDescriptor, creditsLabel } from '@adgen/core/pricing';
import type { MatrixTransition } from '@adgen/core/types';
import { MATRIX_TRANSITIONS as TRANSITIONS } from '@adgen/core/constants';
import { FileDropzone } from '@/components/file-dropzone';
import { JobWizard, type WizardStep } from '@/components/job-wizard';
import { pollJob, type JobAsset } from '@/lib/poll-job';
import { uploadFile, type UploadedFile } from '@/lib/upload-file';

const descriptor = getJobDescriptor('mix');
const MIN_CLIPS = 2;

type GeneratePhase = 'idle' | 'running' | 'done' | 'error';

/**
 * F5 — "Mix": upload several clips, combine them into one video with
 * transitions between cuts. Mock-first: the real multi-clip assembly lands
 * with real providers wired in; today the generic worker pipeline (mock
 * renderer) stands in.
 */
export default function MixPage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);

  const [clips, setClips] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [transition, setTransition] = useState<MatrixTransition>('fade');
  const [backgroundMusic, setBackgroundMusic] = useState(true);

  const [genPhase, setGenPhase] = useState<GeneratePhase>('idle');
  const [genError, setGenError] = useState<string | null>(null);
  const [resultAssets, setResultAssets] = useState<JobAsset[]>([]);

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      const uploaded = await Promise.all(files.map((f) => uploadFile(f)));
      setClips((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Nepoznata greška.');
    } finally {
      setUploading(false);
    }
  }

  function removeClip(index: number) {
    setClips((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleGenerate() {
    setGenPhase('running');
    setGenError(null);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'mix',
          params: { sourceUrls: clips.map((c) => c.url), transition, backgroundMusic },
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? 'Greška pri pokretanju.');

      const job = await pollJob(data.id, { intervalMs: 1500, timeoutMs: 60_000 });
      if (job.status === 'error') throw new Error(job.error ?? 'Posao nije uspeo.');

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
      label: 'Uvezi klipove',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-txt-mid">Otpremi najmanje {MIN_CLIPS} klipa koje želiš da spojiš u jedan video.</p>
          <FileDropzone
            accept="video/mp4,video/quicktime,video/webm"
            multiple
            disabled={uploading}
            title={clips.length === 0 ? 'Klikni ili prevuci video ovde' : 'Klikni ili prevuci još klipova'}
            hint="MP4, MOV ili WEBM · do 200MB"
            onFiles={handleFiles}
          />
          {uploading && <p className="text-sm text-txt-mid">Otpremam…</p>}
          {uploadError && <p className="rounded-control border border-err/30 bg-err/10 p-3 text-sm text-err-text">{uploadError}</p>}
          {clips.length > 0 && (
            <ul className="space-y-2">
              {clips.map((c, i) => (
                <li
                  key={c.url}
                  className="flex items-center justify-between gap-2 rounded-control border border-line bg-ground px-3 py-2"
                >
                  <span className="truncate text-sm text-txt-mid">
                    {i + 1}. {c.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeClip(i)}
                    className="focus-ring shrink-0 rounded p-1 -m-1 text-xs text-err-text hover:underline"
                  >
                    Ukloni
                  </button>
                </li>
              ))}
            </ul>
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
            <span className="mb-1 block text-sm text-txt-mid">Tranzicija između klipova</span>
            <select
              value={transition}
              onChange={(e) => setTransition(e.target.value as MatrixTransition)}
              className="input"
            >
              {TRANSITIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={backgroundMusic}
              onChange={(e) => setBackgroundMusic(e.target.checked)}
              className="h-4 w-4 rounded border-line bg-ground text-accent"
            />
            <span className="text-sm text-txt-mid">Dodaj pozadinsku muziku</span>
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
    (stepIndex === 0 && clips.length >= MIN_CLIPS) || stepIndex === 1 || (stepIndex === 2 && genPhase !== 'running');

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
        onStepSelect={(i) => setStepIndex(i)}
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
    return <p className="text-sm text-txt-mid">Spajam klipove… ⏳</p>;
  }
  if (phase === 'error') {
    return <p className="text-sm text-err-text">{errorMsg}</p>;
  }
  if (phase === 'done') {
    return (
      <div className="space-y-4">
        {assets.map((a) => (
          <div key={a.url} className="space-y-1">
            <video src={a.url} controls className="w-full max-w-[240px] rounded-card border border-line" />
            <a href={a.url} download target="_blank" rel="noreferrer" className="block text-xs text-accent-text underline">
              Preuzmi
            </a>
          </div>
        ))}
      </div>
    );
  }
  return <p className="text-sm text-txt-mid">Klikni „Pokreni&rdquo; da spojiš klipove.</p>;
}
