/**
 * Provider interfaces (INFRASTRUCTURE.md §4).
 *
 * The whole app talks to these interfaces — never to a concrete provider.
 * Each has a Mock implementation (used in dev / when keys are absent) and a
 * real implementation (added in F5). The factory in providers/index.ts picks.
 *
 * Mock-first: nothing here throws if a key is missing; mocks return plausible
 * placeholder data so the full pipeline runs end-to-end with zero accounts.
 */

/** AI generation (images + video scenes). TTS and script are separate below. */
export interface AIProvider {
  readonly name: string;
  generateImage(input: {
    prompt: string;
    refImages?: string[];
    size?: string;
  }): Promise<{ url: string }>;
  generateVideo(input: {
    prompt: string;
    refImage?: string;
    model?: string;
    durationSec?: number;
  }): Promise<{ url: string }>;
}

/** Claude Opus. Mock returns canned Serbian ad scripts. */
export interface ScriptProvider {
  readonly name: string;
  generateVariants(input: {
    product: string;
    benefits: string;
    tone: string;
    language: string;
    style: string;
    durations: number[];
    count: number;
  }): Promise<{
    variants: { angle: string; script: string; estDurationSec: number }[];
  }>;
}

/** ElevenLabs. Mock returns a silent/placeholder mp3. */
export interface VoiceProvider {
  readonly name: string;
  tts(input: {
    script: string;
    voiceId: string;
    model: string;
    stability: number;
    speed: number;
    language: string;
  }): Promise<{ audioUrl: string }>;
  listVoices(): Promise<{ id: string; name: string; gender: string }[]>;
}

/** Remotion. Mock returns a placeholder mp4. Real = local render (dev) / Lambda (prod). */
export interface Renderer {
  readonly name: string;
  render(input: {
    composition: string;
    props: Record<string, unknown>;
  }): Promise<{ videoUrl: string }>;
}

/** Local disk (dev) → R2/S3 (prod). */
export interface Storage {
  readonly name: string;
  upload(
    key: string,
    data: Buffer | NodeJS.ReadableStream,
    contentType: string,
  ): Promise<{ url: string }>;
  getUrl(key: string): string;
}

/** Mock (instant credit in dev) → Lemon Squeezy (launch). */
export interface Billing {
  readonly name: string;
  listPacks(): Promise<{ id: string; credits: number; priceEUR: number }[]>;
  createCheckout(userId: string, packId: string): Promise<{ url: string }>;
  /** Adds credits on a paid event (Lemon Squeezy webhook). No-op in mock. */
  handleWebhook(req: Request): Promise<void>;
}

/**
 * Product page → {title, price, images}. Can be REAL from day one (no paid
 * account): fetch + cheerio. Mock as fallback.
 */
export interface Scraper {
  readonly name: string;
  scrape(url: string): Promise<{
    title: string;
    price?: string;
    images: string[];
    description?: string;
  }>;
}

/** Minimal logging surface so providers don't depend on a concrete logger. */
export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}