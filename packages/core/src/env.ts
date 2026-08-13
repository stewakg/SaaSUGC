/**
 * Environment loader — validated with zod.
 *
 * Mock-first rule: EVERY provider key here is OPTIONAL. When a key is missing,
 * the factory in `providers/index.ts` returns the MOCK implementation instead
 * of throwing. This lets the whole app run with zero external accounts (F0–F4).
 *
 * Real keys are only required from Phase F5 (see ACCOUNTS.md).
 */
import { z } from 'zod';

/**
 * z.string().url().optional() alone only tolerates a genuinely MISSING key
 * (`undefined`) — an empty string still fails `.url()`. `.env` files (and
 * Docker's `--env-file`) routinely write unset optional keys as `KEY=`,
 * which loads as `''`, not `undefined`. Found live: this crashed the worker
 * on its first real deploy (R2_PUBLIC_URL=, REMOTION_SERVE_URL= in the
 * container's .env) even though both are genuinely optional. Treat '' the
 * same as absent.
 */
const optionalUrl = () => z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional());

const EnvSchema = z.object({
  /** Node env. */
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** When true, force mocks even if real keys are present (local dev / tests). */
  // WHY an explicit allow-list instead of Boolean(v): an env var set to the
  // literal string 'false' is truthy in JS, so Boolean('false') === true would
  // invert this flag's meaning. Only these exact spellings (after lowercasing
  // and trimming) are treated as true; everything else — including '', '0',
  // 'false', 'no', 'off' and any non-string — is false.
  FORCE_MOCK: z
    .preprocess((v) => {
      if (typeof v !== 'string') return false;
      const s = v.trim().toLowerCase();
      return s === '1' || s === 'true' || s === 'yes' || s === 'on';
    }, z.boolean())
    .default(false),

  // --- Supabase (DB + Auth) ---
  SUPABASE_URL: optionalUrl(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),

  // --- Redis (worker / BullMQ) ---
  REDIS_URL: z.string().optional(),

  // --- AI providers ---
  // Ad scripts (and, later, vision) go through OpenRouter — the owner has no
  // Anthropic account, which is why the Claude-keyed provider never ran once.
  OPENROUTER_API_KEY: z.string().optional(),
  // Model is swappable so the pending Serbian blind eval (INFRASTRUCTURE F5)
  // can sweep candidates without a code change.
  OPENROUTER_SCRIPT_MODEL: z.string().optional(),
  KIE_API_KEY: z.string().optional(),
  FAL_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),

  // --- Storage (Cloudflare R2 or S3) ---
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: optionalUrl(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_S3_PUBLIC_URL: optionalUrl(),

  // --- Remotion Lambda (prod render) ---
  REMOTION_AWS_ACCESS_KEY_ID: z.string().optional(),
  REMOTION_AWS_SECRET_ACCESS_KEY: z.string().optional(),
  REMOTION_LAMBDA_FUNCTION_NAME: z.string().optional(),
  REMOTION_SERVE_URL: optionalUrl(),
  // Distinct from AWS_REGION (the R2/S3 Storage region) — the Lambda function
  // can be deployed in a different AWS region than the storage bucket.
  REMOTION_AWS_REGION: z.string().optional(),

  // --- Billing ---
  LEMONSQUEEZY_API_KEY: z.string().optional(),
  LEMONSQUEEZY_STORE_ID: z.string().optional(),
  LEMONSQUEEZY_WEBHOOK_SECRET: z.string().optional(),
  LEMONSQUEEZY_VARIANT_MAP: z.string().optional(),

  // Public app URL — Lemon Squeezy's hosted checkout redirects buyers back
  // here after payment. Defaults to the local web origin (see factory.ts).
  WEB_PUBLIC_URL: z.string().optional(),

  // --- Local storage root (dev mock Storage) ---
  LOCAL_STORAGE_DIR: z.string().default('./storage'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/**
 * Load + validate process.env. Cached after first call.
 * Throws with a clear message if the shape is invalid (but never if a key is
 * simply missing — that's the whole point of mock-first).
 */
export function loadEnv(input: Record<string, string | undefined> = process.env): Env {
  if (cached && input === process.env) return cached;
  const parsed = EnvSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Keys `hasKey` can meaningfully answer for: the optional string ones. */
export type EnvKeyName = {
  [K in keyof Env]-?: string | undefined extends Env[K] ? K : never;
}[keyof Env];

/** True when a key is present AND mocks aren't forced. */
export function hasKey(env: Env, key: EnvKeyName): boolean {
  if (env.FORCE_MOCK) return false;
  const v = env[key];
  return typeof v === 'string' && v.length > 0;
}