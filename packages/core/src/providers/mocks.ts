/**
 * Mock implementations for every provider interface.
 *
 * These let the full app run end-to-end with zero external accounts (F0–F4).
 * Mocks return plausible placeholder data / canned assets and simulate latency
 * so the UI/worker pipeline behaves like the real thing.
 */
import type {
  AIProvider,
  Billing,
  Renderer,
  ScriptProvider,
  Scraper,
  Storage,
  VoiceProvider,
} from '../interfaces.ts';
import { CREDIT_PACKS } from '../pricing.ts';
import { resolveLocalStorageDir } from '../storage-path.ts';

/** Deterministic small delay so progress/loading states are testable. */
const fakeLatency = (ms = 600) => new Promise<void>((r) => setTimeout(r, ms));

/** Stable mock asset URL — points to a public placeholder (no key needed). */
const placeholderImage = (label: string, seed = 1) =>
  `https://placehold.co/1080x1080/0a0a0a/FFE000/png?text=${encodeURIComponent(label)}&${seed}`;
// The old googleapis gtv-videos-bucket sample now 403s (bucket locked down) —
// this w3schools tutorial asset has been a stable public sample for years.
const placeholderVideo = (label: string) =>
  `https://www.w3schools.com/html/mov_bbb.mp4#mock=${encodeURIComponent(label)}`;

// ----------------------------------------------------------------------------
export class MockAIProvider implements AIProvider {
  readonly name = 'mock-ai';
  async generateImage(input: { prompt: string; size?: string }) {
    await fakeLatency();
    return { url: placeholderImage(`AI SLIKA\n${input.prompt.slice(0, 40)}`, seedCounter++) };
  }
  async generateVideo(input: { prompt: string; durationSec?: number }) {
    await fakeLatency(900);
    return { url: placeholderVideo(`matrix:${input.prompt.slice(0, 24)}`) };
  }
}

// ----------------------------------------------------------------------------
const CANNED_SCRIPTS = [
  {
    angle: 'Problem → rešenje',
    script:
      'Stalno ti se kasne porudžbine? Naša brza dostava stiže za 24h — naruči odmah, plati pouzećem!',
    estDurationSec: 15,
  },
  {
    angle: 'Društveni dokaz',
    script:
      'Preko 10.000 zadovoljnih kupaca. Probaj i ti — prava ponuda samo danas. Klikni i naruči.',
    estDurationSec: 20,
  },
  {
    angle: 'Hitnost / FOMO',
    script:
      'Ograničene zalihe! Ne propusti. Naruči sada, plati kada stigne. Tvoja reklama počinje ovde.',
    estDurationSec: 12,
  },
];

export class MockScriptProvider implements ScriptProvider {
  readonly name = 'mock-script';
  async generateVariants(input: { count: number }) {
    await fakeLatency();
    const n = Math.max(1, Math.min(input.count, CANNED_SCRIPTS.length));
    return { variants: CANNED_SCRIPTS.slice(0, n) };
  }
  // Never calls a model — returns a fixed, obviously-fake search phrase.
  async describeImage(_imageUrl: string, _language: string) {
    await fakeLatency();
    return 'mock proizvod za pretragu';
  }
}

// ----------------------------------------------------------------------------
const MOCK_VOICES = [
  { id: 'voice_srp_m1', name: 'Marko (srpski, muški)', gender: 'male' },
  { id: 'voice_srp_f1', name: 'Milica (srpski, ženski)', gender: 'female' },
  { id: 'voice_srp_m2', name: 'Nikola (energičan)', gender: 'male' },
  { id: 'voice_srp_f2', name: 'Ana (topao ton)', gender: 'female' },
];

export class MockVoiceProvider implements VoiceProvider {
  readonly name = 'mock-voice';
  async tts(input: { script: string }) {
    await fakeLatency();
    // tiny silent wav-ish placeholder URL; worker writes a real placeholder file in Storage
    return {
      audioUrl: `data:audio/mp3;base64,MOCK_AUDIO_${Buffer.from(input.script.slice(0, 8)).toString(
        'hex',
      )}`,
    };
  }
  async listVoices() {
    return MOCK_VOICES;
  }
}

// ----------------------------------------------------------------------------
export class MockRenderer implements Renderer {
  readonly name = 'mock-renderer';
  async render(input: { composition: string; props: Record<string, unknown> }) {
    await fakeLatency(1200);
    return {
      videoUrl: placeholderVideo(`${input.composition}:${JSON.stringify(input.props).slice(0, 16)}`),
    };
  }
}

// ----------------------------------------------------------------------------
/**
 * Mock storage: writes to local disk under LOCAL_STORAGE_DIR and serves it
 * back via apps/web's `/api/storage/[...path]` route. Used in dev; real R2/S3
 * is wired in F5.
 */
export class MockStorage implements Storage {
  readonly name = 'mock-storage';
  private readonly rootDir: string;
  constructor(
    rootDir = './storage',
    private readonly publicPrefix = '/api/storage',
  ) {
    this.rootDir = resolveLocalStorageDir(rootDir);
  }

  async upload(
    key: string,
    data: Buffer | NodeJS.ReadableStream,
    _contentType: string,
    // Length of a streamed body when the caller knows it (see the Storage
    // interface). Local disk does not need it — the stream is piped straight
    // to a file — so it is accepted to match the interface and ignored.
    _contentLength?: number,
  ): Promise<{ url: string }> {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const abs = path.resolve(this.rootDir, key);
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    if (Buffer.isBuffer(data)) {
      await fs.promises.writeFile(abs, data);
    } else {
      const out = fs.createWriteStream(abs);
      await new Promise<void>((resolve, reject) => {
        data.pipe(out);
        out.on('finish', () => resolve());
        out.on('error', reject);
      });
    }
    return { url: this.getUrl(key) };
  }

  getUrl(key: string): string {
    return `${this.publicPrefix}/${key}`;
  }
}

// ----------------------------------------------------------------------------
export class MockScraper implements Scraper {
  readonly name = 'mock-scraper';
  async scrape(url: string) {
    await fakeLatency();
    return {
      title: 'Demo proizvod (mock scrape)',
      price: '1.990 RSD',
      images: [placeholderImage('PROIZVOD', seedCounter++)],
      description: `Ovo je mock scrapovan sadržaj za ${url}. Pravi Scraper (fetch + cheerio) se dodaje u F3.`,
    };
  }
}

// ----------------------------------------------------------------------------
export class MockBilling implements Billing {
  readonly name = 'mock-billing';
  async listPacks() {
    return CREDIT_PACKS.map((p) => ({ id: p.id, credits: p.credits, priceEUR: p.priceEUR }));
  }
  async createCheckout(_userId: string, packId: string) {
    // In dev: pretend the checkout succeeded immediately by returning a magic
    // internal URL the dev "add credits" button recognises.
    return { url: `/api/dev/credits/add?pack=${packId}&mock=1` };
  }
  async parseWebhook(_req: Request) {
    /* no-op in mock; credits are added synchronously by the dev endpoint */
    return null;
  }
}

let seedCounter = 1;