'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { computeJobCost } from '@adgen/core/pricing';
import type { UiLanguage } from '@adgen/core/types';
import { UI_LANGUAGES as LANGUAGES } from '@adgen/core/constants';
import { JobWizard, type WizardStep } from '@/components/job-wizard';
import { pollJob, type JobAsset } from '@/lib/poll-job';

interface ScrapeResult {
  title: string;
  price?: string;
  images: string[];
  description?: string;
}

type ScrapePhase = 'idle' | 'loading' | 'done' | 'error';
type GeneratePhase = 'idle' | 'running' | 'done' | 'error';

/**
 * F3 — "AI slike": 3-step wizard (uvezi proizvod → podešavanja → generiši),
 * real scrape (POST /api/scrape) auto-fills step 1, mock AIProvider produces
 * the placeholder ad images via the existing /api/jobs pipeline (F2).
 */
export default function AiSlikePage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);

  const [url, setUrl] = useState('');
  const [scrapePhase, setScrapePhase] = useState<ScrapePhase>('idle');
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [images, setImages] = useState<string[]>([]);

  const [count, setCount] = useState(2);
  const [language, setLanguage] = useState<UiLanguage>('sr');
  const [offerNotes, setOfferNotes] = useState('');

  const [genPhase, setGenPhase] = useState<GeneratePhase>('idle');
  const [genError, setGenError] = useState<string | null>(null);
  const [resultAssets, setResultAssets] = useState<JobAsset[]>([]);

  const cost = computeJobCost('image_ads', count);

  async function handleImport() {
    setScrapePhase('loading');
    setScrapeError(null);
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as ScrapeResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Uvoz nije uspeo.');
      setTitle(data.title);
      setPrice(data.price ?? '');
      setImages(data.images ?? []);
      setScrapePhase('done');
    } catch (err) {
      setScrapeError(err instanceof Error ? err.message : 'Nepoznata greška.');
      setScrapePhase('error');
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
          type: 'image_ads',
          count,
          params: { productTitle: title, price, offerNotes, language, sourceImages: images },
        }),
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
      label: 'Uvezi proizvod',
      content: (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Link ka proizvodu</span>
            <div className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://prodavnica.rs/proizvod/..."
                className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none transition focus:border-brand-400/50 focus:ring-1 focus:ring-brand-400/30"
              />
              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={!url || scrapePhase === 'loading'}
                className="btn-ghost shrink-0 disabled:opacity-50"
              >
                {scrapePhase === 'loading' ? 'Uvozim…' : 'Uvezi'}
              </button>
            </div>
          </label>

          {scrapeError && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{scrapeError}</p>}

          {scrapePhase === 'done' && (
            <div className="space-y-3">
              {images.length > 0 && (
                <div className="flex gap-2 overflow-x-auto">
                  {images.slice(0, 5).map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={src}
                      src={src}
                      alt=""
                      className="h-20 w-20 shrink-0 rounded-lg border border-white/10 object-cover"
                    />
                  ))}
                </div>
              )}
              <label className="block">
                <span className="mb-1 block text-sm text-zinc-300">Naziv proizvoda</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none transition focus:border-brand-400/50 focus:ring-1 focus:ring-brand-400/30"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-zinc-300">Cena</span>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="npr. 2.990 RSD"
                  className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none transition focus:border-brand-400/50 focus:ring-1 focus:ring-brand-400/30"
                />
              </label>
            </div>
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
            <span className="mb-1 block text-sm text-zinc-300">Broj slika</span>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((n) => (
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
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Jezik</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as UiLanguage)}
              className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none transition focus:border-brand-400/50 focus:ring-1 focus:ring-brand-400/30"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Napomene o ponudi</span>
            <textarea
              value={offerNotes}
              onChange={(e) => setOfferNotes(e.target.value)}
              rows={3}
              placeholder="npr. besplatna dostava, popust 20%..."
              className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none transition focus:border-brand-400/50 focus:ring-1 focus:ring-brand-400/30"
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
    (stepIndex === 0 && title.trim().length > 0) || (stepIndex === 1) || (stepIndex === 2 && genPhase !== 'running');

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
            Cena: <span className="font-semibold">{cost} kredita</span> ({count} × 4)
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
    return <p className="text-sm text-zinc-300">Generišem AI slike… ⏳</p>;
  }
  if (phase === 'error') {
    return <p className="text-sm text-red-300">{errorMsg}</p>;
  }
  if (phase === 'done') {
    return (
      <div className="grid grid-cols-2 gap-3">
        {assets.map((a) => (
          <div key={a.url} className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.url} alt="" className="aspect-square w-full rounded-lg border border-white/10 object-cover" />
            <a href={a.url} download target="_blank" rel="noreferrer" className="text-xs text-brand-300 underline">
              Preuzmi
            </a>
          </div>
        ))}
      </div>
    );
  }
  return <p className="text-sm text-zinc-400">Klikni „Pokreni&rdquo; da generišeš AI slike.</p>;
}
