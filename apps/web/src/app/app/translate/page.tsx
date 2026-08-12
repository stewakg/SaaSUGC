'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getJobDescriptor, creditsLabel } from '@adgen/core/pricing';
import type { UiLanguage } from '@adgen/core/types';
import { UI_LANGUAGES as LANGUAGES } from '@adgen/core/constants';
import { JobWizard, type WizardStep } from '@/components/job-wizard';
import { pollJob, type JobAsset } from '@/lib/poll-job';
import { uploadFile } from '@/lib/upload-file';

const descriptor = getJobDescriptor('translate');

type UploadPhase = 'idle' | 'uploading' | 'done' | 'error';
type GeneratePhase = 'idle' | 'running' | 'done' | 'error';

/**
 * F5 — "Prevod": upload a foreign-language ad, translate the voiceover to
 * the target language with a voice cloned from the original speaker.
 * Mock-first: real translation + voice cloning land with the real
 * Script/Voice providers wired in; today the generic worker pipeline (mock
 * script + mock renderer) stands in.
 */
export default function TranslatePage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);

  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState('');

  const [targetLanguage, setTargetLanguage] = useState<UiLanguage>('sr');
  const [cloneVoice, setCloneVoice] = useState(true);

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
        body: JSON.stringify({
          type: 'translate',
          params: { sourceUrl, targetLanguage, cloneVoice },
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? 'Greška pri pokretanju.');

      const job = await pollJob(data.id, { intervalMs: 1500, timeoutMs: 60_000 });
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
      label: 'Uvezi video',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-txt-mid">Otpremi strani reklamni video koji treba prevesti.</p>
          <label className="block">
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              onChange={(e) => void handleFileChange(e)}
              aria-label="Uvezi video"
              className="block w-full text-sm text-txt-mid file:mr-3 file:rounded-control file:border-0 file:bg-accent-soft file:px-3 file:py-2 file:text-sm file:font-medium file:text-accent-text hover:file:bg-accent/20"
            />
          </label>
          {uploadPhase === 'uploading' && <p className="text-sm text-txt-mid">Otpremam…</p>}
          {uploadError && <p className="rounded-control border border-err/30 bg-err/10 p-3 text-sm text-err-text">{uploadError}</p>}
          {uploadPhase === 'done' && sourceUrl && (
            <p className="truncate text-sm text-accent-text">Otpremljeno: {sourceName}</p>
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
            <span className="mb-1 block text-sm text-txt-mid">Ciljni jezik</span>
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value as UiLanguage)}
              className="input"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={cloneVoice}
              onChange={(e) => setCloneVoice(e.target.checked)}
              className="h-4 w-4 rounded border-line bg-ground text-accent"
            />
            <span className="text-sm text-txt-mid">Kloniraj originalni glas govornika</span>
          </label>
          <p className="text-xs text-txt-low">
            Kloniranje glasa (ElevenLabs) je F5+ funkcija koja zahteva pravi nalog — u mock režimu se preskače.
          </p>
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
    return <p className="text-sm text-txt-mid">Prevodim oglas… ⏳</p>;
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
  return <p className="text-sm text-txt-mid">Klikni „Pokreni&rdquo; da prevedeš oglas.</p>;
}
