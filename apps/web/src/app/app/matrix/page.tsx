'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { computeJobCost, creditsLabel } from '@adgen/core/pricing';
import type { CaptionAnim, CaptionFont, MatrixAspect, MatrixTransition, UiLanguage } from '@adgen/core/types';
import { DEFAULT_MATRIX_ASPECT, MATRIX_ASPECTS } from '@adgen/core/types';
// From the leaf module, not the package root: this is a 'use client' file and
// the root barrel pulls in node:async_hooks via the queue, which the browser
// bundler cannot resolve. Same reason MATRIX_ASPECTS is imported above.
import { AD_DURATIONS, DEFAULT_AD_SECONDS, type AdSeconds } from '@adgen/core/constants';
import {
  UI_LANGUAGES as LANGUAGES,
  MATRIX_TRANSITIONS as TRANSITIONS,
  DEFAULT_MATRIX_OUTRO_TEXT,
} from '@adgen/core/constants';
import { FileDropzone } from '@/components/file-dropzone';
import { JobWizard, type WizardStep } from '@/components/job-wizard';
import { VoicePreviewButton } from '@/components/voice-preview-button';
import { pollJob, type JobAsset } from '@/lib/poll-job';
import { uploadFile, type UploadedFile } from '@/lib/upload-file';
import type { ClipSuggestion } from '@/lib/clip-search';
import type { JobType } from '@adgen/db';

/** 96 → "1:36". Suggestions are short, so hours are not worth handling. */
function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface ScrapeResult {
  title: string;
  price?: string;
  images: string[];
  description?: string;
}

/**
 * Placeholder shown only until GET /api/voices answers. It must NOT be treated
 * as a usable catalogue: these ids belong to the MOCK provider, and the worker
 * now calls the real one, which rejects them with 404 voice_not_found. The real
 * list always comes from the active provider — see the fetch in the component.
 */
const MODE_STORAGE_KEY = 'adgen-matrix-mode';

const VOICES_LOADING: VoiceOption[] = [{ id: '', label: 'Učitavanje glasova…' }];

interface ScriptCandidate {
  angle: string;
  script: string;
  estDurationSec: number;
}

/**
 * Script candidates included at no charge. Past this the user pays, which is
 * what stops "just one more" from being unbounded — a cap the UI enforces, not
 * a rule buried in the API.
 */
const FREE_SCRIPTS = 5;
/** Hard ceiling. Reading ten candidates is already more than anyone will do. */
const MAX_SCRIPTS = 10;
/** Placeholder price for candidates 6-10; real pricing lands with migration 0005. */
const EXTRA_SCRIPTS_COST = 1;

/**
 * Read a clip's real pixel size in the browser.
 *
 * Deliberately client-side. The obvious alternative is probing with ffprobe in
 * the import route, but that binary lives in the worker, not the web app, and
 * would not survive a serverless deploy. The browser already knows: point a
 * detached <video> at the url and read `videoWidth`/`videoHeight` once metadata
 * lands. No new dependency, no server work, works wherever the app runs.
 *
 * Resolves to null rather than throwing — a clip whose size we cannot read is
 * a missing warning, never a broken wizard.
 */
function probeVideoSize(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    const done = (result: { width: number; height: number } | null) => {
      video.removeAttribute('src');
      video.load();
      resolve(result);
    };
    video.onloadedmetadata = () =>
      done(video.videoWidth > 0 ? { width: video.videoWidth, height: video.videoHeight } : null);
    video.onerror = () => done(null);
    // A clip that never reports metadata must not leave the promise pending.
    setTimeout(() => done(null), 10_000);
    video.src = url;
  });
}

/** 'portrait' | 'square' | 'landscape' — coarse on purpose, that is the decision. */
function orientationOf(width: number, height: number): 'portrait' | 'square' | 'landscape' {
  const ratio = width / height;
  if (ratio > 1.05) return 'landscape';
  if (ratio < 0.95) return 'portrait';
  return 'square';
}

/** ~2.5 spoken words per second, the same estimate the script prompt uses. */
function spokenSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 2.5));
}

interface VoiceOption {
  id: string;
  label: string;
}

/**
 * Vertical caption presets, as fractions of frame height. All sit inside the
 * platform safe zone — the bottom ~15% of a 9:16 frame is covered by
 * TikTok/Reels chrome, so nothing here goes below 0.6.
 */
const CAPTION_PRESETS = [
  { label: 'Gornja trećina', y: 0.32 },
  { label: 'Iznad sredine', y: 0.46 },
  { label: 'Centar', y: 0.5 },
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

  /**
   * Simple hides the settings most people never touch; Advanced is the old
   * wizard, unchanged. Only VISIBILITY differs — every value stays in state, so
   * switching back and forth never loses an uploaded clip or a scraped product.
   *
   * Starts at the default and is read from storage in an effect, so the first
   * client render matches the server's (same reason as the theme switcher).
   */
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple');
  const [targetSeconds, setTargetSeconds] = useState<AdSeconds>(DEFAULT_AD_SECONDS);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(MODE_STORAGE_KEY);
      if (saved === 'simple' || saved === 'advanced') setMode(saved);
    } catch {
      /* private mode — the default is fine */
    }
  }, []);

  function chooseMode(next: 'simple' | 'advanced') {
    setMode(next);
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  // Step 0 — upload source clips (the raw montage material)
  const [clips, setClips] = useState<UploadedFile[]>([]);
  /**
   * The file input is hidden behind an explicit "+ Dodaj još jedan klip" button
   * once at least one clip exists. A bare `<input multiple>` technically accepts
   * more files on a second pick, but nothing on screen SAYS so — the link field
   * next to it has its own visible add affordance, and users read the absence of
   * one here as "only one batch allowed".
   */
  const fileInputRef = useRef<HTMLInputElement>(null);
  /**
   * Real pixel size per clip url, filled in the background as clips arrive.
   * Feeds the shape warning on the format step — a 16:9 clip forced into a 9:16
   * frame loses about two thirds of its width, and the user should be told
   * before spending credits, not after watching the result.
   */
  const [clipSizes, setClipSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [importingLink, setImportingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Clip suggestions (YouTube only for now — yt-dlp has no TikTok/IG search).
  // `takingId` is per-result so one pending import doesn't grey out the grid.
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<ClipSuggestion[]>([]);
  const [takingId, setTakingId] = useState<string | null>(null);

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
  /**
   * On = cut the clips into a fresh montage per variant (`matrix`). Off = keep
   * each clip whole and change only the narration (`revoice`, cheaper because
   * it skips scene detection). Defaults to on: montage is what the tool is for,
   * and revoice is the deliberate exception.
   */
  const [montage, setMontage] = useState(true);
  const [aspect, setAspect] = useState<MatrixAspect>(DEFAULT_MATRIX_ASPECT);
  const [voices, setVoices] = useState<VoiceOption[]>(VOICES_LOADING);
  const [voiceId, setVoiceId] = useState('');

  // Script review. `scripts` holds what the user KEPT — the job sends these
  // instead of letting the worker generate, so editing here is what ships.
  const [scripts, setScripts] = useState<ScriptCandidate[]>([]);
  const [generatingScripts, setGeneratingScripts] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [speakerGender, setSpeakerGender] = useState<'male' | 'female' | undefined>(undefined);
  /** Index of the expanded candidate; the rest stay collapsed but available. */
  const [openScript, setOpenScript] = useState<number | null>(null);

  // The voice catalogue must come from whichever provider is actually configured
  // (mock in dev with no key, ElevenLabs with one) — a hardcoded list silently
  // goes stale and the job then dies at TTS time with 404 voice_not_found.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/voices');
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { voices?: { id: string; name: string; gender?: string }[] };
        const list = (data.voices ?? []).map((v) => ({ id: v.id, label: v.name }));
        if (cancelled || list.length === 0) return;
        setVoices(list);
        setVoiceId((current) => (current && list.some((v) => v.id === current) ? current : list[0].id));
      } catch {
        // Leave the placeholder in place; the worker resolves an empty/unknown id
        // to the provider's first voice, so the job still runs.
        if (!cancelled) setVoices([{ id: '', label: 'Podrazumevani glas' }]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  // Probe every clip we do not have a size for yet. Runs on the client only,
  // costs nothing server-side, and a failure just leaves the warning unshown.
  useEffect(() => {
    let cancelled = false;
    const missing = clips.map((c) => c.url).filter((url) => !(url in clipSizes));
    if (missing.length === 0) return;
    void (async () => {
      for (const url of missing) {
        const size = await probeVideoSize(url);
        if (cancelled || !size) continue;
        setClipSizes((prev) => ({ ...prev, [url]: size }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clips, clipSizes]);

  // Clips whose shape does not match the chosen output — these get cropped.
  const wantedShape = orientationOf(MATRIX_ASPECTS[aspect].width, MATRIX_ASPECTS[aspect].height);
  const SHAPE_LABEL = { portrait: 'uspravan', square: 'kvadratan', landscape: 'vodoravan' } as const;
  const mismatchedClips = clips
    .map((c) => ({ clip: c, size: clipSizes[c.url] }))
    .filter((e) => e.size && orientationOf(e.size.width, e.size.height) !== wantedShape)
    .map((e) => ({ name: e.clip.name, shape: SHAPE_LABEL[orientationOf(e.size!.width, e.size!.height)] }));

  // Below the output height the render is an upscale, which reads as soft. The
  // 2026-08-10 import came in at 640×360 against a 1920-tall frame.
  const lowResClips = clips
    .map((c) => ({ clip: c, size: clipSizes[c.url] }))
    .filter((e) => e.size && e.size.height < MATRIX_ASPECTS[aspect].height * 0.5)
    .map((e) => ({ name: e.clip.name, width: e.size!.width, height: e.size!.height }));

  const [captionFont, setCaptionFont] = useState<CaptionFont>('Impact');
  const [captionAnim, setCaptionAnim] = useState<CaptionAnim>('pop');
  const [captionColor, setCaptionColor] = useState('#FFE000');
  // Fractions of the frame. Defaults mirror MatrixAd's safe-zone placement.
  const [captionX, setCaptionX] = useState(0.5);
  const [captionY, setCaptionY] = useState(0.46);
  const [captionScale, setCaptionScale] = useState(1);
  // Audio the user supplies: background music under the whole ad, SFX on the CTA card.
  const [music, setMusic] = useState<UploadedFile | null>(null);
  const [sfx, setSfx] = useState<UploadedFile | null>(null);
  const [musicVolume, setMusicVolume] = useState(0.25);
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Step 3 — transitions / CTA
  const [transitionIn, setTransitionIn] = useState<MatrixTransition>('zoom-punch');
  const [outroText, setOutroText] = useState(DEFAULT_MATRIX_OUTRO_TEXT);

  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultAssets, setResultAssets] = useState<JobAsset[]>([]);

  /**
   * How many videos this job will actually make — and therefore what it costs.
   * Keeping N scripts in the script step produces N videos regardless of the
   * 5/10/15 picker, and that is already what /api/jobs is sent below. The
   * footer has to quote the same number: quoting `count` put "75 kredita
   * (5 × 15)" directly under a line reading "Napraviće se 1 video".
   */
  // ...but ONLY when the scripts are actually sent, which Simple does not do.
  // Without the mode check, approving 3 scripts in Advanced and then switching
  // to Simple and asking for 10 videos quoted 3, sent 3, and delivered 3 — the
  // picker the user had just used did nothing.
  const usingApprovedScripts = mode === 'advanced' && scripts.length > 0;
  const effectiveCount = usingApprovedScripts ? scripts.length : count;

  /**
   * Montage on = `matrix` (scene-detect the clips and cut a fresh video per
   * variant). Montage off = `revoice` — the SAME pipeline with detection
   * skipped, so the clip is kept whole and only the narration changes.
   *
   * `revoice` has had a full pipeline, its own descriptor and a price since F4
   * and was reachable from nowhere: no page, no card, no link. Rather than
   * duplicate a 1400-line wizard to expose one boolean, the wizard sends the
   * other job type — the two differ by exactly this switch, which is also why
   * revoice is cheaper (8 vs 15): no detection, no montage.
   */
  const jobType: JobType = montage ? 'matrix' : 'revoice';
  const cost = computeJobCost(jobType, effectiveCount);
  // The per-video unit for the SAME job type the total is computed from — the
  // breakdown hint must never quote a figure the total is not built on.
  const unitCost = computeJobCost(jobType);
  const captionStyle = `cap:${captionFont}:${captionAnim}:${captionColor}`;

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

  /** Shared by the music and SFX pickers — both go through the same /api/upload path. */
  async function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>, kind: 'music' | 'sfx') {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioUploading(true);
    setAudioError(null);
    try {
      const uploaded = await uploadFile(file);
      if (kind === 'music') setMusic(uploaded);
      else setSfx(uploaded);
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : 'Nepoznata greška.');
    } finally {
      setAudioUploading(false);
      e.target.value = '';
    }
  }

  /**
   * Shared by the paste-a-link box and the suggestion grid: a picked
   * suggestion is just a link the user didn't have to type, so it goes down
   * the exact same import path rather than getting one of its own.
   */
  async function importClipByUrl(sourceUrl: string, name: string) {
    const res = await fetch('/api/import-clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: sourceUrl }),
    });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !data.url) throw new Error(data.error ?? 'Uvoz klipa nije uspeo.');
    setClips((prev) => [...prev, { url: data.url!, name }]);
  }

  async function handleImportLink() {
    const trimmed = linkUrl.trim();
    if (!trimmed) return;
    setImportingLink(true);
    setLinkError(null);
    try {
      let name = 'Uvezeni klip';
      try {
        name = new URL(trimmed).hostname.replace(/^www\./, '');
      } catch {
        /* keep default */
      }
      await importClipByUrl(trimmed, name);
      setLinkUrl('');
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Nepoznata greška.');
    } finally {
      setImportingLink(false);
    }
  }

  /**
   * Generates ONE more candidate and appends it. Earlier ones collapse but stay
   * — a rejected script is often still the best starting point for an edit, and
   * throwing it away to make room for the next one loses that.
   *
   * The count cap is what keeps this from running up a bill, so it does the job
   * an earlier "replace instead of append" rule was doing badly: `FREE_SCRIPTS`
   * on the house, up to `MAX_SCRIPTS` in total.
   */
  async function handleGenerateScripts() {
    if (scripts.length >= MAX_SCRIPTS) return;
    setGeneratingScripts(true);
    setScriptError(null);
    try {
      const res = await fetch('/api/generate-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: price ? `${productTitle} (${price})` : productTitle,
          targetSeconds,
          benefits: [description, offerNotes].filter(Boolean).join(' · '),
          tone,
          language,
          style: 'UGC',
          voiceId,
          count: 1,
        }),
      });
      const data = (await res.json()) as {
        variants?: ScriptCandidate[];
        speakerGender?: 'male' | 'female' | null;
        error?: string;
      };
      const next = data.variants?.[0];
      if (!res.ok || !next) throw new Error(data.error ?? 'Pisanje skripti nije uspelo.');
      setScripts((prev) => {
        setOpenScript(prev.length); // the new one takes focus
        return [...prev, next];
      });
      setSpeakerGender(data.speakerGender ?? undefined);
    } catch (err) {
      setScriptError(err instanceof Error ? err.message : 'Nepoznata greška.');
    } finally {
      setGeneratingScripts(false);
    }
  }

  function updateScript(index: number, text: string) {
    setScripts((prev) => prev.map((s, i) => (i === index ? { ...s, script: text } : s)));
  }

  function removeScript(index: number) {
    setScripts((prev) => prev.filter((_, i) => i !== index));
    // Keep focus on something that still exists after the removal.
    setOpenScript((open) => (open === null ? null : Math.max(0, Math.min(open, scripts.length - 2))));
  }

  async function handleSearchClips() {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch('/api/search-clips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const data = (await res.json()) as { results?: ClipSuggestion[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Pretraga nije uspela.');
      setSearchResults(data.results ?? []);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Nepoznata greška.');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  /** Downloading a suggestion is the same work as a pasted link — same route. */
  async function takeSuggestion(s: ClipSuggestion) {
    setTakingId(s.id);
    setSearchError(null);
    try {
      await importClipByUrl(s.url, s.title);
      setSearchResults((prev) => prev.filter((r) => r.id !== s.id));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Nepoznata greška.');
    } finally {
      setTakingId(null);
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
          type: jobType,
          // One video per approved script — the worker loops over the scripts
          // it is given, not over `count`. Sending the picker's `count` here
          // would bill for 5 videos and deliver 3 when the user kept only 3.
          count: effectiveCount,
          params: {
            productTitle,
            price,
            description,
            offerNotes,
            language,
            tone,
            voiceId,
            aspect,
            targetSeconds,
            captionStyle,
            captionX,
            captionY,
            captionScale,
            musicUrl: music?.url,
            musicVolume,
            sfxUrl: sfx?.url,
            transitionIn,
            outroText,
            sourceImages: images,
            sourceVideoUrls: clips.map((c) => c.url),
            // Sent only when the user actually reviewed something. An empty
            // array would read as "approved nothing" to the worker; omitting
            // the key lets it generate normally, which is the old behaviour.
            // Simple never reviews scripts, so it must not send them — omitting
            // the key is what tells the worker to generate normally.
            scripts: usingApprovedScripts ? scripts : undefined,
            speakerGender,
          },
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? 'Greška pri pokretanju.');

      // Real Remotion renders take longer than mock jobs — allow up to 3 minutes.
      // Scale by the number of videos actually being rendered, which is the
      // kept-script count when the user reviewed scripts, not the picker's.
      const job = await pollJob(data.id, {
        intervalMs: 2000,
        timeoutMs: Math.max(180_000, effectiveCount * 45_000),
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

  const allSteps: WizardStep[] = [
    {
      id: 'clips',
      label: 'Upload klipova',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-txt-mid">
            Otpremi jedan ili više video snimaka — od njih se pravi reklama. Svaki snimak može biti kompilacija više kadrova.
          </p>
          <FileDropzone
            accept="video/mp4,video/quicktime,video/webm"
            multiple
            disabled={uploading}
            title="Klikni ili prevuci video ovde"
            hint="MP4, MOV ili WEBM · do 200MB po fajlu"
            onFiles={handleFiles}
          />
          {uploading && <p className="text-sm text-txt-mid">Otpremam…</p>}
          {uploadError && <p role="alert" className="rounded-control border border-err/30 bg-err/10 p-3 text-sm text-err-text">{uploadError}</p>}
          <div className="border-t border-line pt-4">
            <span className="mb-1 block text-sm text-txt-mid">…ili nalepi link (TikTok / YouTube / Instagram)</span>
            <div className="flex gap-2">
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://www.tiktok.com/@…/video/…"
                className="input"
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
            {linkError && <p role="alert" className="mt-2 rounded-control border border-err/30 bg-err/10 p-3 text-sm text-err-text">{linkError}</p>}
          </div>

          <div className="border-t border-line pt-4">
            <span className="mb-1 block text-sm text-txt-mid">…ili pretraži snimke po proizvodu</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleSearchClips();
                  }
                }}
                placeholder="npr. masažer za vrat"
                maxLength={120}
                className="input"
              />
              <button
                type="button"
                onClick={() => void handleSearchClips()}
                disabled={!searchQuery.trim() || searching}
                className="btn-ghost shrink-0 disabled:opacity-50"
              >
                {searching ? 'Tražim…' : 'Pretraži'}
              </button>
            </div>
            {searchError && (
              <p role="alert" className="mt-2 rounded-control border border-err/30 bg-err/10 p-3 text-sm text-err-text">{searchError}</p>
            )}
            {!searching && !searchError && searchResults.length === 0 && searchQuery.trim() !== '' && (
              <p className="mt-2 text-sm text-txt-low">Nema rezultata za taj upit.</p>
            )}
            {searchResults.length > 0 && (
              <>
                <p className="mt-3 text-xs text-txt-low">
                  Pogledaj snimak pre nego što ga uzmeš — proveri da nema tuđih komentara ili vodenog žiga.
                </p>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {searchResults.map((s) => (
                    <li
                      key={s.id}
                      className="flex gap-3 rounded-card border border-line bg-ground p-2"
                    >
                      {s.thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail, not a local asset
                        <img
                          src={s.thumbnail}
                          alt=""
                          className="h-14 w-24 shrink-0 rounded object-cover"
                          loading="lazy"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-xs text-txt-hi">{s.title}</p>
                        <p className="mt-0.5 text-[11px] text-txt-low">
                          {s.channel ?? 'nepoznat kanal'}
                          {s.durationSec !== null && ` · ${formatDuration(s.durationSec)}`}
                        </p>
                        <div className="mt-1 flex gap-3">
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="focus-ring rounded text-[11px] text-txt-mid underline-offset-2 hover:text-txt-hi hover:underline"
                          >
                            Pogledaj
                          </a>
                          <button
                            type="button"
                            onClick={() => void takeSuggestion(s)}
                            disabled={takingId !== null}
                            className="focus-ring rounded p-1 -m-1 text-[11px] font-medium text-accent-text hover:text-accent disabled:opacity-50"
                          >
                            {takingId === s.id ? 'Uzimam…' : 'Uzmi'}
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
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
              <li>
                {/*
                  The dropzone owns its own input; this hidden one backs the
                  compact "+ Dodaj još jedan klip" button so it can open the
                  picker without being coupled to the dropzone's internals. The
                  button resets the value before clicking (see below), so a
                  re-pick of the same file still fires a change.
                */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  multiple
                  onChange={(e) => void handleFiles(Array.from(e.target.files ?? []))}
                  aria-hidden
                  tabIndex={-1}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => {
                    // Reset the value first: picking the SAME file twice fires no
                    // change event otherwise, so a user re-adding a clip they just
                    // removed would click and see nothing happen.
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                      fileInputRef.current.click();
                    }
                  }}
                  disabled={uploading}
                  className="btn-ghost w-full text-sm disabled:opacity-50"
                >
                  + Dodaj još jedan klip
                </button>
              </li>
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
            <span className="mb-1 block text-sm text-txt-mid">Link ka proizvodu</span>
            <div className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://prodavnica.rs/proizvod/..."
                className="input"
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
            <span className="mt-1 block text-xs text-txt-low">
              Povuci naziv, cenu i opis sa stranice proizvoda — AI iz toga piše skriptu. Možeš i ručno da uneseš.
            </span>
          </label>

          {scrapeError && <p role="alert" className="rounded-control border border-err/30 bg-err/10 p-3 text-sm text-err-text">{scrapeError}</p>}

          {images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {images.slice(0, 5).map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src}
                  src={src}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-card border border-line object-cover"
                />
              ))}
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-sm text-txt-mid">Naziv proizvoda</span>
            <input
              value={productTitle}
              onChange={(e) => setProductTitle(e.target.value)}
              placeholder="npr. Bežične slušalice Pro"
              className="input"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-txt-mid">Cena</span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="npr. 2.990 RSD"
              className="input"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm text-txt-mid">Jezik</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as UiLanguage)}
                className="input"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-txt-mid">Ton skripte</span>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="input"
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
            <span className="mb-1 block text-sm text-txt-mid">Prednosti / ponuda (op.)</span>
            <textarea
              value={offerNotes}
              onChange={(e) => setOfferNotes(e.target.value)}
              rows={2}
              placeholder="npr. besplatna dostava, 20% popust, plaćanje pouzećem"
              className="input resize-y"
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
            <span className="mb-1 block text-sm text-txt-mid">Dužina</span>
            <div className="flex flex-wrap gap-2">
              {AD_DURATIONS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setTargetSeconds(sec)}
                  aria-pressed={targetSeconds === sec}
                  className={`focus-ring h-9 rounded-control border px-3 font-mono tabular text-sm transition ${
                    targetSeconds === sec
                      ? 'border-accent-ring bg-accent-soft text-accent-text'
                      : 'border-line text-txt-mid hover:bg-panel-2'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-txt-mid">Broj varijanti videa</span>
            <div className="flex gap-2">
              {[5, 10, 15].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  aria-pressed={count === n}
                  className={`focus-ring h-9 min-w-9 px-2 rounded-control border text-sm font-mono tabular transition ${
                    count === n
                      ? 'border-accent-ring bg-accent-soft text-accent-text'
                      : 'border-line text-txt-mid hover:bg-panel-2'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </label>
          {/*
            The switch that turns this wizard into the `revoice` tool. That job
            type has had a pipeline, a price and a descriptor since F4 and was
            reachable from nowhere in the app — no page, no card, no link. It is
            the same pipeline with scene detection skipped, so exposing it as a
            toggle is honest and costs one boolean, where a second 1400-line
            wizard would have been a copy waiting to drift.
          */}
          <div className="rounded-card border border-line p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="block text-sm text-txt-hi">Iseci klipove u montažu</span>
                <span className="mt-0.5 block text-xs text-txt-mid">
                  {montage
                    ? 'Klipovi se seku na kadrove i svaka verzija dobija svoju montažu.'
                    : 'Klip ostaje ceo — menja se samo naracija. Jeftinije po videu.'}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={montage}
                aria-label="Iseci klipove u montažu"
                onClick={() => setMontage((on) => !on)}
                className={`focus-ring relative h-6 w-11 shrink-0 rounded-full border transition ${
                  montage ? 'border-accent-ring bg-accent' : 'border-line bg-panel-2'
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-panel transition-all ${
                    montage ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm text-txt-mid">Format videa</span>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(MATRIX_ASPECTS) as MatrixAspect[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAspect(a)}
                  aria-pressed={aspect === a}
                  className={`focus-ring h-9 rounded-control border px-3 text-sm transition ${
                    aspect === a
                      ? 'border-accent-ring bg-accent-soft text-accent-text'
                      : 'border-line text-txt-mid hover:bg-panel-2'
                  }`}
                >
                  {a} · {MATRIX_ASPECTS[a].label}
                </button>
              ))}
            </div>
            <span className="mt-1 block text-xs text-txt-low">
              <span className="font-mono tabular">
                {MATRIX_ASPECTS[aspect].width}×{MATRIX_ASPECTS[aspect].height}
              </span>
              . Snimak drugog oblika se seče da popuni kadar — vodoravni klip u uspravnom formatu gubi oko dve
              trećine širine.
            </span>
            {mismatchedClips.length > 0 && (
              <p className="mt-2 rounded-control border border-warn/40 bg-warn/10 p-2 text-xs text-warn-text">
                {mismatchedClips.length === 1
                  ? `Klip „${mismatchedClips[0].name}” je ${mismatchedClips[0].shape}, a biraš ${aspect}.`
                  : `${mismatchedClips.length} klipa nisu ${aspect}: ${mismatchedClips.map((c) => c.name).join(', ')}.`}{' '}
                Krajevi kadra će biti odsečeni. Ili promeni format, ili uzmi snimak istog oblika.
              </p>
            )}
            {lowResClips.length > 0 && (
              <p className="mt-2 rounded-control border border-warn/40 bg-warn/10 p-2 text-xs text-warn-text">
                Slaba rezolucija:{' '}
                {lowResClips.map((c) => `${c.name} (${c.width}×${c.height})`).join(', ')}. Razvlačenje na{' '}
                {MATRIX_ASPECTS[aspect].width}×{MATRIX_ASPECTS[aspect].height} će izgledati mutno.
              </p>
            )}
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-txt-mid">Glas</span>
            <div className="flex items-center gap-2">
              <select
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                className="input flex-1"
              >
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
              <VoicePreviewButton voiceId={voiceId} />
            </div>
          </label>
          {/* Caption look and placement are the definition of a setting most
              people never touch — Simple keeps the defaults. */}
          {mode === 'advanced' && (
            <>
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

          <div className="rounded-card border border-line bg-ground/50 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm text-txt-mid">Pozicija titla</span>
              {CAPTION_PRESETS.map((p) => {
                const active = Math.abs(captionY - p.y) < 0.01 && Math.abs(captionX - 0.5) < 0.01;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setCaptionX(0.5);
                      setCaptionY(p.y);
                    }}
                    aria-pressed={active}
                    className={`focus-ring rounded-control border px-2 py-1 text-xs transition ${
                      active
                        ? 'border-accent-ring bg-accent-soft text-accent-text'
                        : 'border-line text-txt-mid hover:border-line-strong hover:text-txt-hi'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            <label className="mb-2 block">
              <span className="mb-1 flex justify-between text-xs text-txt-mid">
                <span>Gore / dole</span>
                <span className="font-mono tabular">{Math.round(captionY * 100)}%</span>
              </span>
              <input
                type="range"
                min={8}
                max={92}
                value={Math.round(captionY * 100)}
                onChange={(e) => setCaptionY(Number(e.target.value) / 100)}
                className="w-full accent-accent"
              />
            </label>

            <label className="mb-2 block">
              <span className="mb-1 flex justify-between text-xs text-txt-mid">
                <span>Levo / desno</span>
                <span className="font-mono tabular">{Math.round(captionX * 100)}%</span>
              </span>
              <input
                type="range"
                min={15}
                max={85}
                value={Math.round(captionX * 100)}
                onChange={(e) => setCaptionX(Number(e.target.value) / 100)}
                className="w-full accent-accent"
              />
            </label>

            <label className="block">
              <span className="mb-1 flex justify-between text-xs text-txt-mid">
                <span>Veličina</span>
                <span className="font-mono tabular">{Math.round(captionScale * 100)}%</span>
              </span>
              <input
                type="range"
                min={60}
                max={150}
                value={Math.round(captionScale * 100)}
                onChange={(e) => setCaptionScale(Number(e.target.value) / 100)}
                className="w-full accent-accent"
              />
            </label>

            {captionY > 0.72 ? (
              <p className="mt-2 text-xs text-warn-text">
                ⚠ Titl je nisko — TikTok i Reels tu crtaju svoj interfejs (ime naloga, opis, muzika),
                pa se može preklopiti. Preporuka: ostani iznad 70%.
              </p>
            ) : null}
          </div>
            </>
          )}

          <div className="rounded-card border border-line bg-ground/50 p-3">
            <span className="mb-2 block text-sm text-txt-mid">Zvuk (opciono)</span>

            <label className="mb-3 block">
              <span className="mb-1 block text-xs text-txt-mid">
                Muzika u pozadini {music ? `— ${music.name}` : ''}
              </span>
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => handleAudioUpload(e, 'music')}
                className="block w-full text-sm text-txt-mid file:mr-3 file:rounded-control file:border-0 file:bg-accent-soft file:px-3 file:py-2 file:text-sm file:font-medium file:text-accent-text hover:file:bg-accent/20"
              />
            </label>

            {music ? (
              <label className="mb-3 block">
                <span className="mb-1 flex justify-between text-xs text-txt-mid">
                  <span>Jačina muzike</span>
                  <span className="font-mono tabular">{Math.round(musicVolume * 100)}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(musicVolume * 100)}
                  onChange={(e) => setMusicVolume(Number(e.target.value) / 100)}
                  className="w-full accent-accent"
                />
                {musicVolume > 0.45 ? (
                  <span className="mt-1 block text-xs text-warn-text">
                    ⚠ Na ovoj jačini muzika lako nadjača glas. Preporuka: ispod 40%.
                  </span>
                ) : null}
              </label>
            ) : null}

            <label className="block">
              <span className="mb-1 block text-xs text-txt-mid">
                Zvučni efekat na CTA kartici {sfx ? `— ${sfx.name}` : ''}
              </span>
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => handleAudioUpload(e, 'sfx')}
                className="block w-full text-sm text-txt-mid file:mr-3 file:rounded-control file:border-0 file:bg-accent-soft file:px-3 file:py-2 file:text-sm file:font-medium file:text-accent-text hover:file:bg-accent/20"
              />
            </label>

            {audioUploading && <p className="mt-2 text-xs text-txt-mid">Otpremam…</p>}
            {audioError && <p role="alert" className="mt-2 rounded-control border border-err/30 bg-err/10 p-2 text-xs text-err-text">{audioError}</p>}
            <p className="mt-2 text-xs text-txt-low">
              Koristi samo muziku na koju imaš prava — otpremljeni zapis ide direktno u gotov oglas.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'scripts',
      label: 'Skripte',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-txt-mid">
            Napravi skripte, pročitaj ih i zadrži one koje valjaju. Možeš ih i doraditi — ono što ostane
            ovde je ono što će glas pročitati. Ako preskočiš ovaj korak, skripte se pišu automatski.
          </p>

          {/* Says out loud that the kept scripts, not the variants picker,
              decide how many videos get made — and therefore what it costs. */}
          {scripts.length > 0 && (
            <p className="rounded-control bg-accent-soft p-3 text-sm text-accent-text">
              Napraviće se <span className="font-mono tabular">{scripts.length}</span>{' '}
              {scripts.length === 1 ? 'video' : 'videa'} — po jedan za svaku skriptu koju zadržiš.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleGenerateScripts()}
              disabled={generatingScripts || !productTitle.trim() || scripts.length >= MAX_SCRIPTS}
              className="btn-ghost disabled:opacity-50"
            >
              {generatingScripts
                ? 'Pišem…'
                : scripts.length === 0
                  ? 'Napravi skriptu'
                  : scripts.length >= FREE_SCRIPTS
                    ? `Napravi još (${creditsLabel(EXTRA_SCRIPTS_COST)})`
                    : 'Napravi sledeću'}
            </button>
            {scripts.length > 0 && (
              <span className="text-xs text-txt-low">
                <span className="font-mono tabular">
                  {scripts.length}/{MAX_SCRIPTS}
                </span>
                {speakerGender && ` · ${speakerGender === 'male' ? 'muški' : 'ženski'} rod`}
              </span>
            )}
            {scripts.length >= MAX_SCRIPTS && (
              <span className="text-xs text-txt-low">Dostigao si maksimum — obriši neku da napraviš novu.</span>
            )}
          </div>

          {scriptError && <p role="alert" className="rounded-control border border-err/30 bg-err/10 p-3 text-sm text-err-text">{scriptError}</p>}

          {/* Silence here means the copy may not match the voice — worth saying,
              because in Serbian that is a broken ad, not a stylistic quibble. */}
          {scripts.length > 0 && !speakerGender && (
            <p className="rounded-control border border-warn/40 bg-warn/10 p-3 text-xs text-warn-text">
              Pol glasa nije prepoznat, pa skripte nisu pisane ni u muškom ni u ženskom rodu. Proveri da
              se slažu sa glasom koji si izabrao.
            </p>
          )}

          {scripts.map((s, i) => {
            const open = openScript === i;
            return (
              <div
                key={i}
                className={`card p-3 ${open ? 'card--active' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  {/* The whole header toggles: a collapsed candidate is one
                      click from being read again, which is the point of
                      keeping it. */}
                  <button
                    type="button"
                    onClick={() => setOpenScript(open ? null : i)}
                    aria-expanded={open}
                    className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded text-left"
                  >
                    <span className="shrink-0 text-xs text-txt-low font-mono tabular">{i + 1}.</span>
                    <span className="truncate text-xs text-txt-mid">{s.angle}</span>
                    {!open && (
                      <span className="truncate text-xs text-txt-low">— {s.script.slice(0, 60)}…</span>
                    )}
                  </button>
                  <span className="shrink-0 text-[11px] text-txt-low font-mono tabular">~{spokenSeconds(s.script)}s</span>
                  <button
                    type="button"
                    onClick={() => removeScript(i)}
                    className="focus-ring shrink-0 rounded p-1 -m-1 text-xs text-err-text hover:underline"
                  >
                    Ukloni
                  </button>
                </div>

                {open && (
                  <>
                    <textarea
                      value={s.script}
                      onChange={(e) => updateScript(i, e.target.value)}
                      rows={4}
                      maxLength={2000}
                      className="input mt-2 resize-y"
                    />
                    <p className="mt-1 text-[11px] text-txt-low">
                      <span className="font-mono tabular">{s.script.trim().split(/\s+/).filter(Boolean).length}</span>{' '}
                      reči · <span className="font-mono tabular">~{spokenSeconds(s.script)}s</span> izgovoreno
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ),
    },
    {
      id: 'transitions',
      label: 'Tranzicije i CTA',
      content: (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-txt-mid">Intro tranzicija</span>
            <select
              value={transitionIn}
              onChange={(e) => setTransitionIn(e.target.value as MatrixTransition)}
              className="input"
            >
              {TRANSITIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-txt-mid">Tekst na CTA kartici</span>
            <input
              value={outroText}
              onChange={(e) => setOutroText(e.target.value)}
              className="input"
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

  // Gating is keyed on the step's id, not its index. The index form
  // (`stepIndex === 4 && …`) silently attaches the wrong rule to the wrong
  // step the moment a step is inserted, and it compiles and builds either way
  // — the failure only shows up in a browser. Ids survive reordering.
  /**
   * Simple drops the two steps that exist purely to fine-tune: reviewing and
   * editing the generated scripts, and choosing transitions/outro text. Not
   * sending `scripts` is what tells the worker to write them itself, which is
   * the behaviour it has always had when nothing is approved.
   */
  const steps = allSteps.filter((step) =>
    mode === 'advanced' ? true : step.id !== 'scripts' && step.id !== 'transitions',
  );

  const lastIndex = steps.length - 1;
  // Switching Advanced -> Simple removes steps, so a stepIndex pointing past the
  // end would render an empty wizard with a dead "Dalje" button.
  const safeIndex = Math.min(stepIndex, lastIndex);
  const currentStepId = steps[safeIndex]?.id;

  /**
   * Outside production the clip requirement is lifted, so the wizard can be
   * walked end to end without uploading anything — which is the only way to
   * look at the later steps while building them.
   *
   * It is not a shortcut that changes the render: the worker already falls back
   * to DEFAULT_BACKGROUND_VIDEO_URL when no source clip is supplied, so a job
   * started this way produces a real video over the placeholder background.
   * The gate stays in production, because an ad over a stock clip is not what
   * anyone is paying for.
   */
  const clipsRequired = process.env.NODE_ENV === 'production';

  /**
   * What the JOB actually needs, as opposed to what the wizard lets you look at.
   * Navigation is free; this is checked on the Generate action, where a missing
   * piece can be named instead of silently disabling a button two steps away.
   */
  const missingForGenerate: string[] = [];
  if (clipsRequired && clips.length === 0) missingForGenerate.push('bar jedan video klip');
  if (clipsRequired && productTitle.trim().length === 0) missingForGenerate.push('naziv proizvoda');
  const canGenerate = missingForGenerate.length === 0;

  const canNext = currentStepId === 'generate' ? phase !== 'running' && canGenerate : true;

  const nextLabel =
    safeIndex < lastIndex
      ? 'Dalje'
      : phase === 'done'
        ? 'Vidi u Moje reklame'
        : phase === 'running'
          ? 'Renderujem…'
          : 'Pokreni';

  // The missing-requirement notice belongs on the Generate step, but it needs
  // `canGenerate`, which is only known once the step list is built (it rides on
  // `clipsRequired`, next to `canNext`). Splice the notice into the rendered
  // steps then; navigation itself (`steps`, `safeIndex`, `currentStepId`) is
  // untouched — only what the Generate step displays changes.
  const stepsWithNotice =
    currentStepId === 'generate' && !canGenerate
      ? steps.map((s) =>
          s.id === 'generate'
            ? {
                ...s,
                content: (
                  <>
                    <div className="rounded-control border border-warn/40 bg-warn/10 p-3 text-sm text-warn-text">
                      <p className="font-medium">Pre pokretanja fali još:</p>
                      <ul className="mt-1 list-disc pl-5">
                        {missingForGenerate.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    </div>
                    {s.content}
                  </>
                ),
              }
            : s,
        )
      : steps;

  return (
    <div className="py-6">
      {/* Mode picker. Sits above the wizard rather than inside a step, because
          it changes which steps exist — putting it in one of them would let the
          user stand on a step that is about to disappear. */}
      {/* Deliberately NOT the .step-chip look: it sat directly above the step
          rail wearing the same chip styling, so the two read as one row and it
          was impossible to tell which was interactive. A bordered segmented
          control with a filled selection is unambiguous. */}
      {/* Full-width layout since 2026-08-19 — the toggle keeps to the right
          edge instead of floating on a centred max-w-lg island. */}
      <div className="mb-4 flex items-center justify-end gap-3">
        <span className="text-[11px] uppercase tracking-wide text-txt-low">Režim</span>
        <div
          role="radiogroup"
          aria-label="Režim"
          className="inline-flex rounded-control border border-line bg-panel p-0.5"
        >
          {([
            ['simple', 'Jednostavno'],
            ['advanced', 'Napredno'],
          ] as const).map(([value, label], index) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              tabIndex={mode === value ? 0 : -1}
              onClick={() => chooseMode(value)}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
                event.preventDefault();
                chooseMode(index === 0 ? 'advanced' : 'simple');
              }}
              className={`focus-ring rounded-[7px] px-3 py-1.5 text-sm font-medium transition ${
                mode === value
                  ? 'bg-accent text-accent-contrast'
                  : 'text-txt-mid hover:text-txt-hi'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <JobWizard
        toolType="matrix"
        steps={stepsWithNotice}
        activeIndex={safeIndex}
        onBack={() => setStepIndex(Math.max(0, safeIndex - 1))}
        onNext={() => {
          if (safeIndex < lastIndex) {
            setStepIndex(safeIndex + 1);
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
        allowJumpAhead
        nextLabel={nextLabel}
        onStepSelect={(i) => setStepIndex(i)}
        costLabel={
          <p className="rounded-control border border-accent-ring bg-accent-soft px-3 py-2 text-sm text-accent-text">
            Cena: <span className="font-mono tabular font-semibold">{creditsLabel(cost)}</span>{' '}
            <span className="font-mono tabular">({effectiveCount} × {unitCost})</span>
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
    return (
      <div className="space-y-3">
        <p className="text-sm text-txt-mid">
          Pravim video… ovo može potrajati minut-dva. ⏳
        </p>
        {/* No elapsed/percentage data exists in this component's state, so the
            fill travels rather than claiming a width it cannot back up. */}
        <div className="progress progress--indeterminate">
          <i />
        </div>
      </div>
    );
  }
  if (phase === 'error') {
    return <p role="alert" className="rounded-control border border-err/30 bg-err/10 p-3 text-sm text-err-text">{errorMsg}</p>;
  }
  if (phase === 'done') {
    return (
      <div className="flash-done space-y-4 rounded-card border border-line p-3">
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
  return <p className="text-sm text-txt-mid">Klikni „Pokreni&rdquo; da napraviš video.</p>;
}
