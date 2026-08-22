import type { CaptionWord } from './types.ts';

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

/**
 * AI generation (images + video scenes). TTS and script are separate below.
 *
 * `storageKey` is set only when the result was actually uploaded to our
 * `Storage` under that key; providers that hand back an externally-hosted
 * URL (mock placeholders today, provider CDN URLs in F5) omit it. Callers
 * must not invent a storage key when this is absent — see INFRASTRUCTURE.md
 * §3 `assets.storage_key` (nullable for exactly this reason).
 */
export interface AIProvider {
  readonly name: string;
  generateImage(input: {
    prompt: string;
    refImages?: string[];
    size?: string;
  }): Promise<{ url: string; storageKey?: string }>;
  generateVideo(input: {
    prompt: string;
    refImage?: string;
    model?: string;
    durationSec?: number;
  }): Promise<{ url: string; storageKey?: string }>;
}

/**
 * Grammatical gender the script must be written in — the gender of the VOICE
 * that will read it, not the buyer's.
 *
 * This is not a nicety in Serbian: past tense and adjectives are gender-marked,
 * so "našla sam" / "sigurna" / "hidrirana" read as a woman speaking. A male
 * voice reading that is an obviously broken ad. English marks none of this, so
 * models default to whatever the training data leaned toward — in practice,
 * feminine for UGC ad copy — and will not fix it unless told.
 *
 * Consequence for the wizard: the voice has to be chosen BEFORE scripts are
 * generated. That ordering is a hard dependency, not a preference.
 */
export type SpeakerGender = 'male' | 'female';

/** Mock returns canned Serbian ad scripts; real impl goes through OpenRouter. */
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
    /** Omitted only where no voice is chosen yet; the prompt then stays neutral. */
    speakerGender?: SpeakerGender;
  }): Promise<{
    variants: { angle: string; script: string; estDurationSec: number }[];
  }>;

  /**
   * Describe a product image in a few words usable as a SEARCH QUERY for stock
   * footage — not a caption and not marketing copy. Optional because it needs a
   * vision-capable model; callers must handle `undefined` and fall back to
   * text-only behaviour.
   */
  describeImage?(imageUrl: string, language: string): Promise<string>;
}

/** ElevenLabs. Mock returns a silent/placeholder mp3. */
export interface VoiceProvider {
  readonly name: string;
  /**
   * `words` and `durationSec` come back only from a provider that can report real
   * alignment — ElevenLabs does (via its `/with-timestamps` endpoint), the mock
   * cannot. Callers MUST fall back to `mockWordTimestamps` when `words` is absent;
   * never assume it is set.
   */
  tts(input: {
    script: string;
    voiceId: string;
    model: string;
    stability: number;
    speed: number;
    language: string;
  }): Promise<{ audioUrl: string; durationSec?: number; words?: CaptionWord[] }>;
  /**
   * The account's voices. `language`/`accent`/`verifiedLanguages` are what let
   * the app tell a Serbian customer that an English voice will read their ad
   * with an American accent — see `curateVoices` in voices.ts. A provider that
   * cannot report them omits them; the curation degrades to "foreign", which is
   * the safe assumption for an unlabelled voice.
   */
  listVoices(): Promise<
    {
      id: string;
      name: string;
      gender: string;
      language?: string;
      accent?: string;
      age?: string;
      useCase?: string;
      verifiedLanguages?: string[];
    }[]
  >;
}

/**
 * Remotion. Mock returns a placeholder mp4. Real = local render (dev) / Lambda (prod).
 *
 * `storageKey` mirrors the note on `AIProvider` above: present only when the
 * render was actually uploaded to our `Storage` under that key.
 */
export interface Renderer {
  readonly name: string;
  render(input: {
    composition: string;
    props: Record<string, unknown>;
  }): Promise<{ videoUrl: string; storageKey?: string }>;
}

/** Local disk (dev) → R2/S3 (prod). */
export interface Storage {
  readonly name: string;
  upload(
    key: string,
    data: Buffer | NodeJS.ReadableStream,
    contentType: string,
    /**
     * Byte length of `data` when it is a STREAM and the caller knows it. The
     * AWS SDK cannot sign a streamed PutObject body it cannot measure —
     * without this it emits `x-amz-decoded-content-length: undefined` and
     * R2/S3 rejects the PUT. A Buffer carries its own length; implementations
     * must NOT override it for buffers.
     */
    contentLength?: number,
  ): Promise<{ url: string }>;
  getUrl(key: string): string;
  /**
   * Removes one object.
   *
   * IDEMPOTENT by contract: deleting a key that is not there is a SUCCESS, not
   * an error. Every caller that would ever exist here (retention cleanup, a
   * GDPR erasure, a retry after a partial failure) runs at least twice on the
   * same key sooner or later, and making the second run throw would turn a
   * completed erasure into a failed one.
   *
   * A transport failure (no credentials, network, permission denied) still
   * REJECTS — "the object is not there" and "we could not reach the bucket"
   * are not the same answer and must not be flattened into one.
   */
  delete(key: string): Promise<void>;
}

/** Mock (instant credit in dev) → Lemon Squeezy (launch). */
export interface Billing {
  readonly name: string;
  listPacks(): Promise<{ id: string; credits: number; priceEUR: number }[]>;
  createCheckout(userId: string, packId: string): Promise<{ url: string }>;
  /**
   * Verifies + parses an incoming payment-provider webhook request. Returns
   * the credit grant to apply (userId + amount + reason) for a successful
   * paid event, or null for an event that doesn't grant credits (refund,
   * unhandled event type, etc). The DB write is the caller's job —
   * providers in @adgen/core have no DB dependency, matching how the
   * worker and apps/web routes already own all DB writes directly.
   * Implementations should THROW on signature verification failure so the
   * caller can reject the request (400), as distinct from returning null
   * for a validly-signed but irrelevant event (caller should still ack 200).
   */
  parseWebhook(req: Request): Promise<{ userId: string; amount: number; reason: string; orderId: string } | null>;
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