'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { computeJobCost } from '@adgen/core/pricing';
import type { CaptionAnim, CaptionFont, MatrixTransition, UiLanguage } from '@adgen/core/types';
import {
  UI_LANGUAGES as LANGUAGES,
  MATRIX_TRANSITIONS as TRANSITIONS,
  DEFAULT_MATRIX_OUTRO_TEXT,
} from '@adgen/core/constants';
import { JobWizard, type WizardStep } from '@/components/job-wizard';
import { pollJob, type JobAsset } from '@/lib/poll-job';

// Mirrors packages/core/src/providers/mocks.ts MOCK_VOICES — hardcoded here
// since it's a static list and doesn't warrant a round-trip.
const VOICES = [
  { id: 'voice_srp_m1', label: 'Marko (muški)' },
  { id: 'voice_srp_f1', label: 'Milica (ženski)' },
  { id: 'voice_srp_m2', label: 'Nikola (energičan)' },
  { id: 'voice_srp_f2', label: 'Ana (topao ton)' },
];

const TONES = [
  { value: 'energetic', label: 'Energično' },
  { value: 'professional', label: 'Profesionalno' },
  { value: 'urgent', label: 'Hitno / FOMO' },
  { value: 'friendly', label: 'Prijateljski' },
];

type Phase = 'idle' | 'running' | 'done' | 'error';

/**
 * F4 — "Matrix": settings wizard for the real-render pipeline (mock script +
 * mock voice, real Remotion assembly). Music/SFX are shown as forward-looking
 * fields ("uskoro") since mock mode has no real audio asset source yet.
 */
export default function MatrixPage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);

  const [productTitle, setProductTitle] = useState('');
  const [offerNotes, setOfferNotes] = useState('');
  const [language, setLanguage] = useState<UiLanguage>('sr');
  const [tone, setTone] = useState('energetic');
  const [count, setCount] = useState(1);

  const [voiceId, setVoiceId] = useState(VOICES[1].id);
  const [captionFont, setCaptionFont] = useState<CaptionFont>('Impact');
  const [captionAnim, setCaptionAnim] = useState<CaptionAnim>('pop');
  const [captionColor, setCaptionColor] = useState('#FFE000');

  const [transitionIn, setTransitionIn] = useState<MatrixTransition>('zoom-punch');
  const [outroText, setOutroText] = useState(DEFAULT_MATRIX_OUTRO_TEXT);

  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultAssets, setResultAssets] = useState<JobAsset[]>([]);

  const cost = computeJobCost('matrix', count);
  const captionStyle = `cap:${captionFont}:${captionAnim}:${captionColor}`;

  async function handleGenerate() {
    setPhase('running');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'matrix',
          count,
          params: { productTitle, offerNotes, language, tone, voiceId, captionStyle, transitionIn, outroText },
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? 'Greška pri pokretanju.');

      // Real Remotion renders take longer than mock jobs — allow up to 3 minutes.
      const job = await pollJob(data.id, { intervalMs: 2000, timeoutMs: 180_000 });
      if (job.status === 'error') throw new Error(job.error ?? 'Render nije uspeo.');

      setResultAssets(job.result?.assets ?? []);
      setPhase('done');
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Nepoznata greška.');
      setPhase('error');
    }
  }

  const steps: WizardStep[] = [
    {
      id: 'basics',
      label: 'Osnovno',
      content: (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Proizvod</span>
            <input
              value={productTitle}
              onChange={(e) => setProductTitle(e.target.value)}
              placeholder="npr. Bežične slušalice Pro"
              className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none transition focus:border-brand-400/50 focus:ring-1 focus:ring-brand-400/30"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Prednosti / ponuda</span>
            <textarea
              value={offerNotes}
              onChange={(e) => setOfferNotes(e.target.value)}
              rows={3}
              placeholder="npr. besplatna dostava, 20% popust, plaćanje pouzećem"
              className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none transition focus:border-brand-400/50 focus:ring-1 focus:ring-brand-400/30"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Jezik</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as UiLanguage)}
                className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-brand-400/50"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Ton skripte</span>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-brand-400/50"
              >
                {TONES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Broj varijanti videa</span>
            <div className="flex gap-2">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className={`h-9 w-9 rounded-lg border text-sm transition ${
                    count === n
                      ? 'border-brand-400/50 bg-brand-400/10 text-brand-200'
                      : 'border-white/10 text-zinc-400 hover:bg-white/5'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </label>
        </div>
      ),
    },
    {
      id: 'style',
      label: 'Glas i titlovi',
      content: (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Glas (mock TTS)</span>
            <select
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-brand-400/50"
            >
              {VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Font titlova</span>
              <select
                value={captionFont}
                onChange={(e) => setCaptionFont(e.target.value as CaptionFont)}
                className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-brand-400/50"
              >
                <option value="Impact">Impact</option>
                <option value="Montserrat">Montserrat</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Animacija</span>
              <select
                value={captionAnim}
                onChange={(e) => setCaptionAnim(e.target.value as CaptionAnim)}
                className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-brand-400/50"
              >
                <option value="pop">Pop</option>
                <option value="smooth">Smooth</option>
                <option value="none">Bez animacije</option>
              </select>
            </label>
          </div>
          <label className="flex items-center gap-3">
            <span className="text-sm text-zinc-300">Boja aktivne reči</span>
            <input
              type="color"
              value={captionColor}
              onChange={(e) => setCaptionColor(e.target.value)}
              className="h-9 w-14 rounded-lg border border-white/10 bg-ink-900"
            />
            <span className="text-xs text-zinc-500">{captionColor}</span>
          </label>
          <p className="text-xs text-zinc-500">Muzika i SFX na CTA: uskoro (F5, pravi audio zapisi).</p>
        </div>
      ),
    },
    {
      id: 'transitions',
      label: 'Tranzicije i CTA',
      content: (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Intro tranzicija</span>
            <select
              value={transitionIn}
              onChange={(e) => setTransitionIn(e.target.value as MatrixTransition)}
              className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-brand-400/50"
            >
              {TRANSITIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Tekst na CTA kartici</span>
            <input
              value={outroText}
              onChange={(e) => setOutroText(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-brand-400/50"
            />
          </label>
        </div>
      ),
    },
    {
      id: 'generate',
      label: 'Generiši',
      content: <GenerateStep phase={phase} errorMsg={errorMsg} assets={resultAssets} />,
    },
  ];

  const canNext = (stepIndex < 3 && (stepIndex !== 0 || productTitle.trim().length > 0)) || (stepIndex === 3 && phase !== 'running');

  const nextLabel =
    stepIndex < 3
      ? 'Dalje'
      : phase === 'done'
        ? 'Vidi u Moje reklame'
        : phase === 'running'
          ? 'Renderujem…'
          : 'Pokreni';

  return (
    <div className="py-6">
      <JobWizard
        steps={steps}
        activeIndex={stepIndex}
        onBack={() => setStepIndex((i) => Math.max(0, i - 1))}
        onNext={() => {
          if (stepIndex < 3) {
            setStepIndex((i) => i + 1);
            return;
          }
          if (phase === 'done') {
            router.push('/app/reklame');
            return;
          }
          if (phase !== 'running') {
            void handleGenerate();
          }
        }}
        canNext={canNext}
        nextLabel={nextLabel}
        costLabel={
          <p className="rounded-lg border border-brand-400/20 bg-brand-400/5 px-3 py-2 text-sm text-brand-200">
            Cena: <span className="font-semibold">{cost} kredita</span> ({count} × 15)
            {phase === 'done' ? ' · naplaćeno' : ''}
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
  phase: Phase;
  errorMsg: string | null;
  assets: JobAsset[];
}) {
  if (phase === 'running') {
    return <p className="text-sm text-zinc-300">Renderujem pravi MP4 lokalno (Remotion)… ovo može potrajati minut-dva. ⏳</p>;
  }
  if (phase === 'error') {
    return <p className="text-sm text-red-300">{errorMsg}</p>;
  }
  if (phase === 'done') {
    return (
      <div className="space-y-4">
        {assets.map((a) => (
          <div key={a.url} className="space-y-1">
            <video src={a.url} controls className="w-full max-w-[240px] rounded-lg border border-white/10" />
            <a href={a.url} download target="_blank" rel="noreferrer" className="block text-xs text-brand-300 underline">
              Preuzmi
            </a>
          </div>
        ))}
      </div>
    );
  }
  return <p className="text-sm text-zinc-400">Klikni „Pokreni&rdquo; da renderuješ pravi video lokalno.</p>;
}
