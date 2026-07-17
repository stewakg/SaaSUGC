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

  const ai: AIProvider =
    overrides.ai ??
    (hasKey(env, 'KIE_API_KEY') || hasKey(env, 'FAL_API_KEY')
      ? loadReal('ai', env) // F5: returns KieAIFalRouter
      : new MockAIProvider());

  const script: ScriptProvider =
    overrides.script ??
    (hasKey(env, 'ANTHROPIC_API_KEY')
      ? loadReal('script', env) // F5: returns ClaudeScriptProvider
      : new MockScriptProvider());

  const voice: VoiceProvider =
    overrides.voice ??
    (hasKey(env, 'ELEVENLABS_API_KEY')
      ? loadReal('voice', env) // F5: returns ElevenLabsVoiceProvider
      : new MockVoiceProvider());

  const renderer: Renderer =
    overrides.renderer ??
    (hasKey(env, 'REMOTION_LAMBDA_FUNCTION_NAME')
      ? loadReal('renderer', env) // F5: returns RemotionLambdaRenderer
      : new MockRenderer());

  const storage: Storage =
    overrides.storage ??
    (hasKey(env, 'R2_BUCKET') || hasKey(env, 'AWS_S3_BUCKET')
      ? loadReal('storage', env) // F5: returns R2Storage / S3Storage
      : new MockStorage(env.LOCAL_STORAGE_DIR));

  const billing: Billing =
    overrides.billing ??
    (hasKey(env, 'LEMONSQUEEZY_API_KEY')
      ? loadReal('billing', env) // F6: returns LemonSqueezyBilling
      : new MockBilling());

  // Scraper is REAL-capable from day one (no paid account), but we still gate
  // it behind an explicit flag so tests stay deterministic. F3 enables it.
  const scraper: Scraper = overrides.scraper ?? new MockScraper();

  return { ai, script, voice, renderer, storage, billing, scraper };
}

/**
 * Lazy real-provider loader. Each branch dynamically imports the F5 module so
 * that F0–F4 never depends on provider SDKs being installed. If the module is
 * absent we log and fall back to mock.
 *
 * (Implemented in F5 — placeholders return mocks for now.)
 */
function loadReal(kind: keyof Providers, _env: ReturnType<typeof loadEnv>): never {
  // Until F5, no real SDK modules exist. Throw a descriptive error so an early
  // key accidentally triggers a clear message instead of an opaque import fail.
  throw new Error(
    `Real "${kind}" provider is not implemented yet (Phase F5). ` +
      `Remove the corresponding env key or set FORCE_MOCK=1 to use the mock.`,
  );
}

/** Quick helper for code that only needs one provider. */
export function getAI(): AIProvider {
  return createProviders().ai;
}