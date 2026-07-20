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
import { uploadFile, type UploadedFile } from '@/lib/upload-file';

interface ScrapeResult {
  title: string;
  price?: string;
  images: string[];
  description?: string;
}

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

type ScrapePhase = 'idle' | 'loading' | 'done' | 'error';
type Phase = 'idle' | 'running' | 'done' | 'error';

/**
 * F4/M1 — "Matrix": settings wizard for the real-render pipeline. Step 1 now
 * imports the product from a store URL (real scrape, POST /api/scrape) so the
 * script generator has real context (title/price/description) — same pattern as
 * AI slike. Montage of multiple source clips is a later phase; today the render
 * still uses a single background clip. Music/SFX are forward-looking fields.
 */
export default function MatrixPage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);

  // Step 0 — upload source clips (the raw montage material)
  const [clips, setClips] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [importingLink, setImportingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Step 1 — product import (scrape)
  const [url, setUrl] = useState('');
  const [scrapePhase, setScrapePhase] = useState<ScrapePhase>('idle');
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [productTitle, setProductTitle] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [offerNotes, setOfferNotes] = useState('');
  const [language, setLanguage] = useState<UiLanguage>('sr');

  // Step 2 — voice / captions / variants
  const [tone, setTone] = useState('energetic');
  const [count, setCount] = useState(5);
  const [voiceId, setVoiceId] = useState(VOICES[1].id);
  const [captionFont, setCaptionFont] = useState<CaptionFont>('Impact');
  const [captionAnim, setCaptionAnim] = useState<CaptionAnim>('pop');
  const [captionColor, setCaptionColor] = useState('#FFE000');

  // Step 3 — transitions / CTA
  const [transitionIn, setTransitionIn] = useState<MatrixTransition>('zoom-punch');
  const [outroText, setOutroText] = useState(DEFAULT_MATRIX_OUTRO_TEXT);

  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultAssets, setResultAssets] = useState<JobAsset[]>([]);

  const cost = computeJobCost('matrix', count);
  const captionStyle = `cap:${captionFont}:${captionAnim}:${captionColor}`;

  async function handleFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
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
      e.target.value = '';
    }
  }

  async function handleImportLink() {
    const trimmed = linkUrl.trim();
    if (!trimmed) return;
    setImportingLink(true);
    setLinkError(null);
    try {
      const res = await fetch('/api/import-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Uvoz klipa nije uspeo.');
      let name = 'Uvezeni klip';
      try {
        name = new URL(trimmed).hostname.replace(/^www\./, '');
      } catch {
        /* keep default */
      }
      setClips((prev) => [...prev, { url: data.url!, name }]);
      setLinkUrl('');
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Nepoznata greška.');
    } finally {
      setImportingLink(false);
    }
  }

  function removeClip(index: number) {
    setClips((prev) => prev.filter((_, i) => i !== index));
  }

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
      setProductTitle(data.title);
      setPrice(data.price ?? '');
      setDescription(data.description ?? '');
      setImages(data.images ?? []);
      setScrapePhase('done');
    } catch (err) {
      setScrapeError(err instanceof Error ? err.message : 'Nepoznata greška.');
      setScrapePhase('error');
    }
  }

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
          params: {
            productTitle,
            price,
            description,
            offerNotes,
            language,
            tone,
            voiceId,
            captionStyle,
            transitionIn,
            outroText,
            sourceImages: images,
            sourceVideoUrls: clips.map((c) => c.url),
          },
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? 'Greška pri pokretanju.');

      // Real Remotion renders take longer than mock jobs — allow up to 3 minutes.
      // Scale by count so a 15-variant job (sequential renders) isn't cut off.
      const job = await pollJob(data.id, {
        intervalMs: 2000,
        timeoutMs: Math.max(180_000, count * 45_000), // ~45s/variant, floor 3min
      });
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
      id: 'clips',
      label: 'Upload klipova',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            Otpremi jedan ili više video snimaka — od njih se pravi reklama. Svaki snimak može biti kompilacija više kadrova.
          </p>
          <label className="block">
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              multiple
              onChange={(e) => void handleFilesChange(e)}
              className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-400/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-200 hover:file:bg-brand-400/20"
            />
          </label>
          {uploading && <p className="text-sm text-zinc-300">Otpremam…</p>}
          {uploadError && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{uploadError}</p>}
          <div className="border-t border-white/10 pt-4">
            <span className="mb-1 block text-sm text-zinc-300">…ili nalepi link (TikTok / YouTube / Instagram)</span>
            <div className="flex gap-2">
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://www.tiktok.com/@…/video/…"
                className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none transition focus:border-brand-400/50 focus:ring-1 focus:ring-brand-400/30"
              />
              <button
                type="button"
                onClick={() => void handleImportLink()}
                disabled={!linkUrl.trim() || importingLink}
                className="btn-ghost shrink-0 disabled:opacity-50"
              >
                {importingLink ? 'Uvozim…' : 'Uvezi'}
              </button>
            </div>
            {linkError && <p className="mt-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{linkError}</p>}
          </div>
          {clips.length > 0 && (
            <ul className="space-y-2">
              {clips.map((c, i) => (
                <li
                  key={c.url}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-ink-900 px-3 py-2"
                >
                  <span className="truncate text-sm text-zinc-300">
                    {i + 1}. {c.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeClip(i)}
                    className="shrink-0 text-xs text-red-300 hover:text-red-200"
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
            <span className="mt-1 block text-xs text-zinc-500">
              Povuci naziv, cenu i opis sa stranice proizvoda — AI iz toga piše skriptu. Možeš i ručno da uneseš.
            </span>
          </label>

          {scrapeError && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{scrapeError}</p>}

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
              value={productTitle}
              onChange={(e) => setProductTitle(e.target.value)}
              placeholder="npr. Bežične slušalice Pro"
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
            <span className="mb-1 block text-sm text-zinc-300">Prednosti / ponuda (op.)</span>
            <textarea
              value={offerNotes}
              onChange={(e) => setOfferNotes(e.target.value)}
              rows={2}
              placeholder="npr. besplatna dostava, 20% popust, plaćanje pouzećem"
              className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none transition focus:border-brand-400/50 focus:ring-1 focus:ring-brand-400/30"
            />
          </label>
        </div>
      ),
    },
    {
      id: 'style',
      label: 'Glas, titlovi i varijante',
      content: (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Broj varijanti videa</span>
            <div className="flex gap-2">
              {[5, 10, 15].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className={`h-9 min-w-9 px-2 rounded-lg border text-sm transition ${
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
          <p className="text-xs text-zinc-500">Muzika i SFX na CTA: uskoro (kasnija faza, pravi audio zapisi).</p>
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

  const canNext =
    (stepIndex === 0 && clips.length >= 1) ||
    (stepIndex === 1 && productTitle.trim().length > 0) ||
    stepIndex === 2 ||
    stepIndex === 3 ||
    (stepIndex === 4 && phase !== 'running');

  const nextLabel =
    stepIndex < 4
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
          if (stepIndex < 4) {
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
