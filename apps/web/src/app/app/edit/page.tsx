'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getJobDescriptor, creditsLabel } from '@adgen/core/pricing';
import type { CaptionAnim, CaptionFont } from '@adgen/core/types';
import { JobWizard, type WizardStep } from '@/components/job-wizard';
import { pollJob, type JobAsset } from '@/lib/poll-job';
import { uploadFile } from '@/lib/upload-file';

const descriptor = getJobDescriptor('edit');

type UploadPhase = 'idle' | 'uploading' | 'done' | 'error';
type GeneratePhase = 'idle' | 'running' | 'done' | 'error';

/**
 * F5 — "Edit": upload a video, trim it and add branded captions. Mock-first:
 * the real cut/caption-burn lands with real providers wired in; today the
 * generic worker pipeline (mock renderer) stands in.
 */
export default function EditPage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);

  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState('');

  const [trimStartSec, setTrimStartSec] = useState(0);
  const [trimEndSec, setTrimEndSec] = useState<number | ''>('');
  const [captionFont, setCaptionFont] = useState<CaptionFont>('Impact');
  const [captionAnim, setCaptionAnim] = useState<CaptionAnim>('pop');
  const [captionColor, setCaptionColor] = useState('#FFE000');
  const [brandingText, setBrandingText] = useState('');

  const [genPhase, setGenPhase] = useState<GeneratePhase>('idle');
  const [genError, setGenError] = useState<string | null>(null);
  const [resultAssets, setResultAssets] = useState<JobAsset[]>([]);

  const captionStyle = `cap:${captionFont}:${captionAnim}:${captionColor}`;

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
          type: 'edit',
          params: {
            sourceUrl,
            trimStartSec,
            trimEndSec: trimEndSec === '' ? null : trimEndSec,
            captionStyle,
            brandingText,
          },
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
          <p className="text-sm text-txt-mid">Otpremi video koji želiš da urediš.</p>
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
      id: 'trim',
      label: 'Isecanje',
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm text-txt-mid">Početak (sek)</span>
              <input
                type="number"
                min={0}
                value={trimStartSec}
                onChange={(e) => setTrimStartSec(Math.max(0, Number(e.target.value)))}
                className="input font-mono tabular"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-txt-mid">Kraj (sek, opciono)</span>
              <input
                type="number"
                min={0}
                value={trimEndSec}
                onChange={(e) => setTrimEndSec(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="do kraja"
                className="input font-mono tabular"
              />
            </label>
          </div>
        </div>
      ),
    },
    {
      id: 'style',
      label: 'Titlovi i brend',
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm text-txt-mid">Font titlova</span>
              <select
                value={captionFont}
                onChange={(e) => setCaptionFont(e.target.value as CaptionFont)}
                className="input"
              >
                <option value="Impact">Impact</option>
                <option value="Montserrat">Montserrat</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-txt-mid">Animacija</span>
              <select
                value={captionAnim}
                onChange={(e) => setCaptionAnim(e.target.value as CaptionAnim)}
                className="input"
              >
                <option value="pop">Pop</option>
                <option value="smooth">Smooth</option>
                <option value="none">Bez animacije</option>
              </select>
            </label>
          </div>
          <label className="flex items-center gap-3">
            <span className="text-sm text-txt-mid">Boja aktivne reči</span>
            <input
              type="color"
              value={captionColor}
              onChange={(e) => setCaptionColor(e.target.value)}
              className="h-9 w-14 rounded-control border border-line bg-ground"
            />
            <span className="text-xs text-txt-low font-mono tabular">{captionColor}</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-txt-mid">Brend tekst (opciono)</span>
            <input
              value={brandingText}
              onChange={(e) => setBrandingText(e.target.value)}
              placeholder="npr. @tvojbrend"
              className="input"
            />
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
    (stepIndex === 0 && uploadPhase === 'done') ||
    stepIndex === 1 ||
    stepIndex === 2 ||
    (stepIndex === 3 && genPhase !== 'running');

  const nextLabel =
    stepIndex < 3
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
          if (stepIndex < 3) {
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
    return <p className="text-sm text-txt-mid">Uređujem video… ⏳</p>;
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
  return <p className="text-sm text-txt-mid">Klikni „Pokreni&rdquo; da urediš video.</p>;
}
