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
import { FalMediaEditProvider } from './media-edit.fal.ts';
import { RealScraper } from './scraper.real.ts';
import { LemonSqueezyBilling } from './billing.lemonsqueezy.ts';

export interface Providers {
  ai: AIProvider;
  script: ScriptProvider;
  voice: VoiceProvider;
  renderer: Renderer;
  storage: Storage;
  scraper: Scraper;
  billing: Billing;
  /**
   * Upscaling and text removal (F5). `null` when `FAL_API_KEY` is absent —
   * unlike every other slot there is no mock counterpart, and inventing one
   * would recreate exactly the bug this replaced: a tool that charges and
   * hands back a placeholder. Callers must check for null and fail the job.
   */
  mediaEdit: FalMediaEditProvider | null;
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

  // Takes the storage: a Lambda render is copied into it rather than left in
  // an AWS bucket (see renderer.lambda.ts), so the renderer is built after it.
  const renderer: Renderer = overrides.renderer ?? createRendererProvider(env, storage);

  // Scraper is REAL-capable from day one (no paid account needed) — F3
  // enables it by default. FORCE_MOCK still gates it for deterministic tests;
  // RealScraper itself also falls back to mock data per-request on any
  // fetch/parse failure, so a bad URL never hard-fails the wizard.
  const scraper: Scraper = overrides.scraper ?? (env.FORCE_MOCK ? new MockScraper() : new RealScraper());

  const billing: Billing = overrides.billing ?? createBillingProvider(env);

  const mediaEdit =
    overrides.mediaEdit !== undefined
      ? overrides.mediaEdit
      : hasKey(env, 'FAL_API_KEY')
        ? new FalMediaEditProvider({ apiKey: env.FAL_API_KEY! })
        : null;

  return { ai, script, voice, renderer, storage, scraper, billing, mediaEdit };
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
 * OPENROUTER_API_KEY just means mock — the same partial-config posture every
 * switch in this file takes.
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
 * means mock.
 */
function createVoiceProvider(env: ReturnType<typeof loadEnv>, storage: Storage): VoiceProvider {
  if (!hasKey(env, 'ELEVENLABS_API_KEY')) return new MockVoiceProvider();
  return new ElevenLabsVoiceProvider({ apiKey: env.ELEVENLABS_API_KEY! }, storage);
}

/**
 * Storage provider switch (F5): R2 if R2_BUCKET is set, S3 if AWS_S3_BUCKET is
 * set, otherwise mock local disk. Never throws on partial config — if a bucket
 * var is present but its companion creds/public-URL are missing, warn and fall
 * back to mock.
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
      // R2_ENDPOINT wins when set. Cloudflare serves a different S3 endpoint per
      // bucket JURISDICTION: an EU bucket is `<account>.eu.r2.cloudflarestorage.com`,
      // and pointing the default form at it fails every request with "bucket not
      // found". This project's bucket is EU (the Privacy page promises customer
      // data stays in the EU), so the value is copied from the dashboard rather
      // than derived. The account-id form remains the fallback for a
      // default-jurisdiction bucket, which is what every earlier deploy assumed.
      endpoint: env.R2_ENDPOINT ?? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
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
/**
 * Env vars arrive as strings. A misconfigured one must fall back to the code's
 * own default rather than reaching the SDK as NaN — `concurrency: NaN` is the
 * kind of value that fails deep inside someone else's library with a message
 * that names nothing useful.
 */
function positiveIntOrUndefined(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function createRendererProvider(env: ReturnType<typeof loadEnv>, storage: Storage): Renderer {
  if (!hasKey(env, 'REMOTION_LAMBDA_FUNCTION_NAME')) return new MockRenderer();
  if (!hasKey(env, 'REMOTION_SERVE_URL')) {
    console.warn(
      '[core] REMOTION_LAMBDA_FUNCTION_NAME is set but REMOTION_SERVE_URL is missing — falling back to mock renderer.',
    );
    return new MockRenderer();
  }
  return new RemotionLambdaRenderer(
    {
      functionName: env.REMOTION_LAMBDA_FUNCTION_NAME!,
      serveUrl: env.REMOTION_SERVE_URL!,
      region: (env.REMOTION_AWS_REGION ?? 'eu-central-1') as AwsRegion,
      // Overrides DEFAULT_LAMBDA_CONCURRENCY (renderer.lambda.ts) with no
      // deploy. The quota that once capped this was raised 10 → 1000 on
      // 2026-08-16, so the default is now 25 and this is a tuning knob rather
      // than a workaround. Anything unparseable or <= 0 falls back to the
      // default rather than reaching the SDK as NaN.
      concurrency: positiveIntOrUndefined(env.REMOTION_LAMBDA_CONCURRENCY),
    },
    storage,
  );
}

/**
 * Billing provider switch (F6). Must not throw on a partial config — a user who
 * sets only LEMONSQUEEZY_API_KEY without the store/webhook/variant-map vars must
 * NOT crash the whole web process at module load; fall back to mock with a
 * warning instead, the same posture as createStorageProvider.
 */
function createBillingProvider(env: ReturnType<typeof loadEnv>): Billing {
  /**
   * DORMANT SINCE 2026-08-16 unless explicitly woken.
   *
   * Lemon Squeezy is no longer the launch provider: the operator became a
   * Wyoming LLC, which removed the merchant-of-record reason it was chosen for,
   * and Stripe lands once the company is confirmed. The code stays — this layer
   * was deleted on 2026-08-10 and restored on 2026-08-13 at the cost of a full
   * re-wire, and deleting it a second time would buy a third build.
   *
   * So it sleeps behind an explicit switch instead: having keys in the
   * environment is deliberately NOT enough. Set BILLING_PROVIDER=lemonsqueezy
   * to wake it. With no provider selected the slot is the mock, and production
   * refuses to serve checkout at all (503) rather than handing out free credits.
   */
  if (env.BILLING_PROVIDER !== 'lemonsqueezy') {
    if (hasKey(env, 'LEMONSQUEEZY_API_KEY')) {
      console.warn(
        '[core] LEMONSQUEEZY_API_KEY is set but BILLING_PROVIDER is not "lemonsqueezy" — billing stays mocked. This is deliberate: keys alone no longer wake a payment provider.',
      );
    }
    return new MockBilling();
  }
  if (!hasKey(env, 'LEMONSQUEEZY_API_KEY')) return new MockBilling();
  try {
    return new LemonSqueezyBilling({
      apiKey: env.LEMONSQUEEZY_API_KEY!,
      storeId: env.LEMONSQUEEZY_STORE_ID ?? '',
      webhookSecret: env.LEMONSQUEEZY_WEBHOOK_SECRET ?? '',
      variantMapJson: env.LEMONSQUEEZY_VARIANT_MAP,
      appUrl: env.WEB_PUBLIC_URL ?? 'http://localhost:3000',
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

/**
 * Which provider slots resolved to a MOCK. Returns slot names, e.g.
 * `['script', 'voice']`, or an empty array when everything is real.
 *
 * This exists because of a specific incident, not as hygiene. On 2026-08-10 the
 * production worker on the VPS was found running with `script: mock-script` and
 * `voice: mock-voice` — no keys in its env — while listening to the same Redis
 * queue as the real one. It would have picked up a paying customer's job and
 * answered it with canned text that looks exactly like success: a job marked
 * done, credits charged, and a video containing a script nobody wrote. The
 * factory is deliberately forgiving about missing keys (that is what makes
 * mock-first development work), so the safety has to live at the boundary where
 * a process decides to start serving traffic.
 *
 * `mediaEdit` is intentionally not reported: it has no mock counterpart at all
 * and is null when unconfigured, which the job handler already fails on.
 */
export function mockProviderSlots(providers: Providers): string[] {
  const mocks: [string, boolean][] = [
    ['ai', providers.ai instanceof MockAIProvider],
    ['script', providers.script instanceof MockScriptProvider],
    ['voice', providers.voice instanceof MockVoiceProvider],
    ['renderer', providers.renderer instanceof MockRenderer],
    ['storage', providers.storage instanceof MockStorage],
    ['scraper', providers.scraper instanceof MockScraper],
  ];
  return mocks.filter(([, isMock]) => isMock).map(([slot]) => slot);
}