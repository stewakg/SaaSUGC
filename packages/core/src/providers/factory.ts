/**
 * Provider factory — THE mock-first switchboard.
 *
 * Reads the validated env and returns the REAL implementation when its key is
 * present (and FORCE_MOCK is off), otherwise the MOCK. Real impls land in F5;
 * until then everything resolves to mocks, which is exactly what F0–F4 need.
 *
 * Importing this module must never throw just because a key is missing.
 */
import { hasKey, loadEnv } from '../env.ts';
import type {
  AIProvider,
  Billing,
  Renderer,
  ScriptProvider,
  Scraper,
  Storage,
  VoiceProvider,
} from '../interfaces.ts';
import {
  MockAIProvider,
  MockBilling,
  MockRenderer,
  MockScriptProvider,
  MockScraper,
  MockStorage,
  MockVoiceProvider,
} from './mocks.ts';
import { OpenRouterScriptProvider } from './script.openrouter.ts';
import { KieAIFalRouter } from './ai.kiefal.ts';
import { ElevenLabsVoiceProvider } from './voice.elevenlabs.ts';
import { S3CompatibleStorage } from './storage.r2.ts';
import { RemotionLambdaRenderer } from './renderer.lambda.ts';
import type { AwsRegion } from '@remotion/lambda-client';
import { LemonSqueezyBilling } from './billing.lemonsqueezy.ts';
import { RealScraper } from './scraper.real.ts';

export interface Providers {
  ai: AIProvider;
  script: ScriptProvider;
  voice: VoiceProvider;
  renderer: Renderer;
  storage: Storage;
  billing: Billing;
  scraper: Scraper;
}

/**
 * Build the full provider set from env. Safe to call with no keys at all.
 * `overrides` lets tests / F5 swap individual providers without touching env.
 */
export function createProviders(overrides: Partial<Providers> = {}): Providers {
  const env = loadEnv();

  const ai: AIProvider = overrides.ai ?? createAIProvider(env);

  const script: ScriptProvider = overrides.script ?? createScriptProvider(env);

  // storage must be constructed BEFORE voice — ElevenLabsVoiceProvider takes
  // the Storage in its constructor (it persists the rendered MP3 there).
  const storage: Storage = overrides.storage ?? createStorageProvider(env);

  const voice: VoiceProvider = overrides.voice ?? createVoiceProvider(env, storage);

  const renderer: Renderer = overrides.renderer ?? createRendererProvider(env);

  const billing: Billing = overrides.billing ?? createBillingProvider(env);

  // Scraper is REAL-capable from day one (no paid account needed) — F3
  // enables it by default. FORCE_MOCK still gates it for deterministic tests;
  // RealScraper itself also falls back to mock data per-request on any
  // fetch/parse failure, so a bad URL never hard-fails the wizard.
  const scraper: Scraper = overrides.scraper ?? (env.FORCE_MOCK ? new MockScraper() : new RealScraper());

  return { ai, script, voice, renderer, storage, billing, scraper };
}

/**
 * AI (image/video) provider switch (F5). kie.ai and fal.ai are independent
 * keys — either one alone is enough to go real (the router falls back
 * between them internally); MockAIProvider only when NEITHER is set.
 */
function createAIProvider(env: ReturnType<typeof loadEnv>): AIProvider {
  const kieApiKey = hasKey(env, 'KIE_API_KEY') ? env.KIE_API_KEY : undefined;
  const falApiKey = hasKey(env, 'FAL_API_KEY') ? env.FAL_API_KEY : undefined;
  if (!kieApiKey && !falApiKey) return new MockAIProvider();
  return new KieAIFalRouter({ kieApiKey, falApiKey });
}

/**
 * Script provider switch (F5). Never throws on partial config — a missing
 * OPENROUTER_API_KEY just means mock. Same pattern as createBillingProvider.
 *
 * Gated on OPENROUTER_API_KEY since 2026-08-09. It previously gated on
 * ANTHROPIC_API_KEY, a key that never existed and never would, so this branch
 * had always returned the mock — every Matrix ad script ever produced was
 * canned text. See INFRASTRUCTURE.md F5.
 */
function createScriptProvider(env: ReturnType<typeof loadEnv>): ScriptProvider {
  if (!hasKey(env, 'OPENROUTER_API_KEY')) return new MockScriptProvider();
  return new OpenRouterScriptProvider({
    apiKey: env.OPENROUTER_API_KEY!,
    model: env.OPENROUTER_SCRIPT_MODEL || undefined,
  });
}

/**
 * Voice provider switch (F5). Needs the Storage instance (ElevenLabs persists
 * MP3s there). Never throws on partial config — missing ELEVENLABS_API_KEY
 * means mock. Same pattern as createBillingProvider.
 */
function createVoiceProvider(env: ReturnType<typeof loadEnv>, storage: Storage): VoiceProvider {
  if (!hasKey(env, 'ELEVENLABS_API_KEY')) return new MockVoiceProvider();
  return new ElevenLabsVoiceProvider({ apiKey: env.ELEVENLABS_API_KEY! }, storage);
}

/**
 * Storage provider switch (F5): R2 if R2_BUCKET is set, S3 if AWS_S3_BUCKET is
 * set, otherwise mock local disk. Never throws on partial config — if a bucket
 * var is present but its companion creds/public-URL are missing, warn and fall
 * back to mock. Same pattern as createBillingProvider.
 */
function createStorageProvider(env: ReturnType<typeof loadEnv>): Storage {
  if (hasKey(env, 'R2_BUCKET')) {
    if (
      !hasKey(env, 'R2_ACCOUNT_ID') ||
      !hasKey(env, 'R2_ACCESS_KEY_ID') ||
      !hasKey(env, 'R2_SECRET_ACCESS_KEY') ||
      !hasKey(env, 'R2_PUBLIC_URL')
    ) {
      console.warn('[core] R2_BUCKET is set but R2 config is incomplete — falling back to mock storage.');
      return new MockStorage(env.LOCAL_STORAGE_DIR);
    }
    return new S3CompatibleStorage({
      bucket: env.R2_BUCKET!,
      publicBaseUrl: env.R2_PUBLIC_URL!,
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    });
  }
  if (hasKey(env, 'AWS_S3_BUCKET')) {
    if (
      !hasKey(env, 'AWS_ACCESS_KEY_ID') ||
      !hasKey(env, 'AWS_SECRET_ACCESS_KEY') ||
      !hasKey(env, 'AWS_S3_PUBLIC_URL')
    ) {
      console.warn('[core] AWS_S3_BUCKET is set but S3 config is incomplete — falling back to mock storage.');
      return new MockStorage(env.LOCAL_STORAGE_DIR);
    }
    return new S3CompatibleStorage({
      bucket: env.AWS_S3_BUCKET!,
      publicBaseUrl: env.AWS_S3_PUBLIC_URL!,
      region: env.AWS_REGION ?? 'us-east-1',
      accessKeyId: env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
    });
  }
  return new MockStorage(env.LOCAL_STORAGE_DIR);
}

/**
 * Renderer switch (F5). Never throws on partial config — a missing
 * REMOTION_SERVE_URL means mock, same as the other create*Provider helpers.
 * Does NOT validate REMOTION_AWS_ACCESS_KEY_ID/SECRET here (no cheap way to
 * check AWS creds without a network call) — a bad/missing credential
 * surfaces as a clear error from the actual render call instead.
 */
function createRendererProvider(env: ReturnType<typeof loadEnv>): Renderer {
  if (!hasKey(env, 'REMOTION_LAMBDA_FUNCTION_NAME')) return new MockRenderer();
  if (!hasKey(env, 'REMOTION_SERVE_URL')) {
    console.warn(
      '[core] REMOTION_LAMBDA_FUNCTION_NAME is set but REMOTION_SERVE_URL is missing — falling back to mock renderer.',
    );
    return new MockRenderer();
  }
  return new RemotionLambdaRenderer({
    functionName: env.REMOTION_LAMBDA_FUNCTION_NAME!,
    serveUrl: env.REMOTION_SERVE_URL!,
    region: (env.REMOTION_AWS_REGION ?? 'eu-central-1') as AwsRegion,
  });
}

/**
 * Billing provider switch (F6). Kept out of `loadReal` on purpose: Lemon
 * Squeezy is wired now (code-complete, never live-tested), whereas the other
 * providers still throw from loadReal until F5. Must not throw on a partial
 * config — a user who sets only LEMONSQUEEZY_API_KEY without the
 * store/webhook/variant-map vars yet must NOT crash the whole worker/web
 * process at module load; fall back to mock with a warning instead.
 */
function createBillingProvider(env: ReturnType<typeof loadEnv>): Billing {
  if (!hasKey(env, 'LEMONSQUEEZY_API_KEY')) return new MockBilling();
  try {
    return new LemonSqueezyBilling({
      apiKey: env.LEMONSQUEEZY_API_KEY!,
      storeId: env.LEMONSQUEEZY_STORE_ID ?? '',
      webhookSecret: env.LEMONSQUEEZY_WEBHOOK_SECRET ?? '',
      variantMapJson: env.LEMONSQUEEZY_VARIANT_MAP,
    });
  } catch (err) {
    console.warn(
      `[core] LEMONSQUEEZY_API_KEY is set but billing config is incomplete — falling back to mock billing: ${
        err instanceof Error ? err.message : err
      }`,
    );
    return new MockBilling();
  }
}

/** Quick helper for code that only needs one provider. */
export function getAI(): AIProvider {
  return createProviders().ai;
}