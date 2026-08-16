/**
 * Tests for the provider factory — the mock-first switchboard.
 *
 * What this file pins down:
 *
 * - Every provider slot resolves to its MOCK when no key is present, and never
 *   throws. That forgiving posture is what makes F0–F4 work, but it is also the
 *   exact thing that let the 2026-08-10 incident happen (a worker with no keys
 *   served a real queue). `mockProviderSlots()` is the guard that was added
 *   afterwards; it must report every mock slot accurately.
 * - Each real-vs-mock branch is exercised individually so a refactor that
 *   flips one switch the wrong way is caught at the slot, not in production.
 * - FORCE_MOCK is the kill switch: with it on, no key can produce a real
 *   provider.
 *
 * Two environment-isolation problems and how they are handled:
 *
 * 1. `loadEnv()` caches its result in a module-level variable the first time it
 *    is called with `process.env` (which is exactly how `createProviders()`
 *    calls it). Mutating `process.env` between tests has no effect on the
 *    cached value. Fix: `vi.resetModules()` + a fresh dynamic
 *    `import('./factory.ts')` per case via the `withEnv` helper below. That
 *    gives `env.ts` a brand-new (empty) cache that observes the mutated env.
 *
 * 2. `mockProviderSlots()` uses `instanceof MockXxx` internally. Because the
 *    whole module registry is reset per case, the Mock classes that
 *    `factory.ts` imports are re-evaluated each time. Asserting `instanceof`
 *    against a top-level import of mocks would compare against a *different*
 *    class object than the one factory used, so `instanceof` would silently
 *    return false. Rather than re-import mocks alongside every factory import
 *    and risk the two imports resolving to different registry entries, we
 *    assert on each provider's `readonly name` string instead — every mock
 *    class in mocks.ts exposes a stable `name` (`'mock-ai'`, `'mock-script'`,
 *    …) and string comparison is immune to module identity. `mockProviderSlots`
 *    is exercised directly for the guard behaviour because its internal
 *    `instanceof` checks run inside the freshly imported factory graph and are
 *    therefore self-consistent.
 *
 * `process.env` is snapshotted in `beforeEach` and fully restored in
 * `afterEach`; no key this file ever sets can leak into another test file.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  AIProvider,
  Renderer,
  ScriptProvider,
  Scraper,
  Storage,
  VoiceProvider,
} from '../interfaces.ts';
import type { FalMediaEditProvider } from './media-edit.fal.ts';

/**
 * Every env key that influences provider selection. Deleted at the start of
 * each case so a real credential sitting in the developer's shell can never
 * make a test pass or fail by accident.
 */
const PROVIDER_KEYS = [
  'FORCE_MOCK',
  'KIE_API_KEY',
  'FAL_API_KEY',
  'OPENROUTER_API_KEY',
  'OPENROUTER_SCRIPT_MODEL',
  'ELEVENLABS_API_KEY',
  'R2_BUCKET',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_PUBLIC_URL',
  'R2_ENDPOINT',
  'AWS_S3_BUCKET',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_S3_PUBLIC_URL',
  'AWS_REGION',
  'REMOTION_LAMBDA_FUNCTION_NAME',
  'REMOTION_SERVE_URL',
  'REMOTION_AWS_REGION',
  'REMOTION_LAMBDA_CONCURRENCY',
  'LOCAL_STORAGE_DIR',
  'BILLING_PROVIDER',
  'LEMONSQUEEZY_API_KEY',
  'LEMONSQUEEZY_STORE_ID',
  'LEMONSQUEEZY_WEBHOOK_SECRET',
  'LEMONSQUEEZY_VARIANT_MAP',
] as const;

/** Stable `name` strings exposed by every mock class in mocks.ts. */
const MOCK_NAME = {
  ai: 'mock-ai',
  script: 'mock-script',
  voice: 'mock-voice',
  renderer: 'mock-renderer',
  storage: 'mock-storage',
  scraper: 'mock-scraper',
} as const;

let savedEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  // Full snapshot so afterEach can restore exactly — leaking a key into
  // another test file is the most likely way this task goes wrong.
  savedEnv = { ...process.env };
});

afterEach(() => {
  process.env = { ...savedEnv };
});

/**
 * Reset the module registry (clearing env.ts's cached Env), wipe every
 * provider-related key, apply the given vars, then return a FRESH factory
 * module whose env.ts cache starts empty and will therefore observe the
 * mutated process.env on the first `createProviders()` call.
 */
async function withEnv(vars: Record<string, string | undefined>) {
  vi.resetModules();
  for (const k of PROVIDER_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return (await import('./factory.ts')) as typeof import('./factory.ts');
}

/** Build a plain fake provider object that is NOT an instance of any Mock
 *  class, so `mockProviderSlots` counts it as "real". Identity-stable so the
 *  override-wins tests can assert `===`. */
function fake<T extends { readonly name: string }>(name: string): T {
  return { name } as unknown as T;
}

// ---------------------------------------------------------------------------
// A. Empty env
// ---------------------------------------------------------------------------

describe('A. Empty env — everything is a mock, nothing throws', () => {
  it('1. with no keys at all, five slots are mocks, scraper is REAL, and mediaEdit is null', async () => {
    const { createProviders } = await withEnv({});
    const p = createProviders();

    expect(p.ai.name).toBe(MOCK_NAME.ai);
    expect(p.script.name).toBe(MOCK_NAME.script);
    expect(p.voice.name).toBe(MOCK_NAME.voice);
    expect(p.renderer.name).toBe(MOCK_NAME.renderer);
    expect(p.storage.name).toBe(MOCK_NAME.storage);
    // RealScraper needs no API key and no paid account — it just fetches a
    // public product page — so the absence of keys says nothing about this
    // slot the way it does for the other five. FORCE_MOCK is what forces it
    // to the mock, and that case is covered in section G. Do NOT "fix" this
    // back to MOCK_NAME.scraper: a real scraper is not canned output.
    expect(p.scraper.name).toBe('real-scraper');
    // mediaEdit has no mock counterpart — it is null when unconfigured.
    expect(p.mediaEdit).toBeNull();
  });

  it('2. mockProviderSlots() with no keys returns exactly the five mocked slots and NOT scraper', async () => {
    const { createProviders, mockProviderSlots } = await withEnv({});
    const p = createProviders();

    // scraper is genuinely real here (see test 1), not a placeholder, so it
    // must NOT be reported: flagging a real provider would train the operator
    // to ignore the guard's output. The guard exists to stop a worker from
    // serving traffic with *canned output*, and a real scraper is not that.
    expect(mockProviderSlots(p).sort()).toEqual(
      ['ai', 'script', 'voice', 'renderer', 'storage'].sort(),
    );
  });

  it('3. no key → real scraper; FORCE_MOCK=1 → mock scraper and scraper IS reported', async () => {
    // The line between "no key" and "kill switch". With no key, scraper stays
    // real (unlike the five key-gated slots). Only FORCE_MOCK flips it to the
    // mock, and only then does mockProviderSlots() list it.
    const real = await withEnv({});
    const pReal = real.createProviders();
    expect(pReal.scraper.name).toBe('real-scraper');
    expect(real.mockProviderSlots(pReal)).not.toContain('scraper');

    const forced = await withEnv({ FORCE_MOCK: '1' });
    const pForced = forced.createProviders();
    expect(pForced.scraper.name).toBe(MOCK_NAME.scraper);
    expect(forced.mockProviderSlots(pForced)).toContain('scraper');
  });
});

// ---------------------------------------------------------------------------
// B. mockProviderSlots is the production guard
// ---------------------------------------------------------------------------

describe('B. mockProviderSlots — the production guard', () => {
  it('3. with a fully real-ish set (overrides for every slot), returns []', async () => {
    const { createProviders, mockProviderSlots } = await withEnv({});
    const p = createProviders({
      ai: fake<AIProvider>('fake-ai'),
      script: fake<ScriptProvider>('fake-script'),
      voice: fake<VoiceProvider>('fake-voice'),
      renderer: fake<Renderer>('fake-renderer'),
      storage: fake<Storage>('fake-storage'),
      scraper: fake<Scraper>('fake-scraper'),
      mediaEdit: fake<FalMediaEditProvider>('fake-mediaEdit'),
    });

    expect(mockProviderSlots(p)).toEqual([]);
  });

  it('4. with only script left as a mock, returns exactly ["script"] (the 2026-08-10 case)', async () => {
    const { createProviders, mockProviderSlots } = await withEnv({});
    const p = createProviders({
      ai: fake<AIProvider>('fake-ai'),
      voice: fake<VoiceProvider>('fake-voice'),
      renderer: fake<Renderer>('fake-renderer'),
      storage: fake<Storage>('fake-storage'),
      scraper: fake<Scraper>('fake-scraper'),
    });

    expect(mockProviderSlots(p)).toEqual(['script']);
  });

  it('5. mediaEdit never appears in the result, even when it is null', async () => {
    const { createProviders, mockProviderSlots } = await withEnv({});
    const p = createProviders();

    expect(p.mediaEdit).toBeNull();
    expect(mockProviderSlots(p)).not.toContain('mediaEdit');
  });
});

// ---------------------------------------------------------------------------
// C. AI router — either key is enough
// ---------------------------------------------------------------------------

describe('C. AI router — kie or fal alone is enough to go real', () => {
  it('6. KIE_API_KEY only → NOT a MockAIProvider', async () => {
    const { createProviders } = await withEnv({ KIE_API_KEY: 'test-key' });
    const p = createProviders();
    expect(p.ai.name).not.toBe(MOCK_NAME.ai);
  });

  it('7. FAL_API_KEY only → NOT a MockAIProvider', async () => {
    const { createProviders } = await withEnv({ FAL_API_KEY: 'test-key' });
    const p = createProviders();
    expect(p.ai.name).not.toBe(MOCK_NAME.ai);
  });

  it('8. neither key → MockAIProvider', async () => {
    const { createProviders } = await withEnv({});
    const p = createProviders();
    expect(p.ai.name).toBe(MOCK_NAME.ai);
  });
});

// ---------------------------------------------------------------------------
// D. Script
// ---------------------------------------------------------------------------

describe('D. Script — gated on OPENROUTER_API_KEY', () => {
  it('9a. OPENROUTER_API_KEY set → real provider', async () => {
    const { createProviders } = await withEnv({ OPENROUTER_API_KEY: 'test-key' });
    const p = createProviders();
    expect(p.script.name).not.toBe(MOCK_NAME.script);
  });

  it('9b. OPENROUTER_API_KEY absent → mock', async () => {
    const { createProviders } = await withEnv({});
    const p = createProviders();
    expect(p.script.name).toBe(MOCK_NAME.script);
  });
});

// ---------------------------------------------------------------------------
// E. Storage — the partial-config fallbacks
// ---------------------------------------------------------------------------

describe('E. Storage — partial-config falls back to mock + warns', () => {
  it('10. R2_BUCKET set but R2_PUBLIC_URL missing → mock storage + warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { createProviders } = await withEnv({
        R2_BUCKET: 'test-bucket',
        R2_ACCOUNT_ID: 'acct',
        R2_ACCESS_KEY_ID: 'ak',
        R2_SECRET_ACCESS_KEY: 'sk',
        // R2_PUBLIC_URL intentionally omitted
      });
      const p = createProviders();
      expect(p.storage.name).toBe(MOCK_NAME.storage);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('11. all five R2 vars set → real S3CompatibleStorage (not mock)', async () => {
    const { createProviders } = await withEnv({
      R2_BUCKET: 'test-bucket',
      R2_ACCOUNT_ID: 'acct',
      R2_ACCESS_KEY_ID: 'ak',
      R2_SECRET_ACCESS_KEY: 'sk',
      R2_PUBLIC_URL: 'https://example.invalid',
    });
    const p = createProviders();
    expect(p.storage.name).not.toBe(MOCK_NAME.storage);
  });

  it('11b. with no R2_ENDPOINT the account-id endpoint form is built', async () => {
    const { createProviders } = await withEnv({
      R2_BUCKET: 'test-bucket',
      R2_ACCOUNT_ID: 'acct',
      R2_ACCESS_KEY_ID: 'ak',
      R2_SECRET_ACCESS_KEY: 'sk',
      R2_PUBLIC_URL: 'https://example.invalid',
    });
    const p = createProviders();
    expect((p.storage as { endpoint?: string }).endpoint).toBe('https://acct.r2.cloudflarestorage.com');
  });

  it('11c. R2_ENDPOINT overrides it — an EU-jurisdiction bucket needs its own endpoint', async () => {
    // Cloudflare serves a DIFFERENT S3 endpoint per bucket jurisdiction. This
    // project's bucket is EU, and the derived default form fails against it with
    // "bucket not found" — a failure that only surfaces on the first real call,
    // which is exactly the kind this suite exists to catch beforehand.
    const { createProviders } = await withEnv({
      R2_BUCKET: 'test-bucket',
      R2_ACCOUNT_ID: 'acct',
      R2_ACCESS_KEY_ID: 'ak',
      R2_SECRET_ACCESS_KEY: 'sk',
      R2_PUBLIC_URL: 'https://example.invalid',
      R2_ENDPOINT: 'https://acct.eu.r2.cloudflarestorage.com',
    });
    const p = createProviders();
    expect((p.storage as { endpoint?: string }).endpoint).toBe('https://acct.eu.r2.cloudflarestorage.com');
    expect((p.storage as { endpoint?: string }).endpoint).not.toBe('https://acct.r2.cloudflarestorage.com');
  });

  it('12. no R2 but AWS_S3_BUCKET + creds + public URL → real storage', async () => {
    const { createProviders } = await withEnv({
      AWS_S3_BUCKET: 'test-bucket',
      AWS_ACCESS_KEY_ID: 'ak',
      AWS_SECRET_ACCESS_KEY: 'sk',
      AWS_S3_PUBLIC_URL: 'https://example.invalid',
    });
    const p = createProviders();
    expect(p.storage.name).not.toBe(MOCK_NAME.storage);
  });

  it('13. AWS_S3_BUCKET set with creds missing → mock + warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { createProviders } = await withEnv({
        AWS_S3_BUCKET: 'test-bucket',
        // AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_S3_PUBLIC_URL omitted
      });
      const p = createProviders();
      expect(p.storage.name).toBe(MOCK_NAME.storage);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// F. Renderer
// ---------------------------------------------------------------------------

describe('F. Renderer — half-configured Lambda must not silently run mocks', () => {
  it('14. REMOTION_LAMBDA_FUNCTION_NAME missing → MockRenderer, no warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { createProviders } = await withEnv({});
      const p = createProviders();
      expect(p.renderer.name).toBe(MOCK_NAME.renderer);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('15. function name set but REMOTION_SERVE_URL missing → MockRenderer AND warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { createProviders } = await withEnv({
        REMOTION_LAMBDA_FUNCTION_NAME: 'test-fn',
        // REMOTION_SERVE_URL intentionally omitted
      });
      const p = createProviders();
      expect(p.renderer.name).toBe(MOCK_NAME.renderer);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('16. both set → real renderer', async () => {
    const { createProviders } = await withEnv({
      REMOTION_LAMBDA_FUNCTION_NAME: 'test-fn',
      REMOTION_SERVE_URL: 'https://example.invalid',
    });
    const p = createProviders();
    expect(p.renderer.name).not.toBe(MOCK_NAME.renderer);
  });

  // REMOTION_LAMBDA_CONCURRENCY — how many Lambdas one render splits into
  // (see DEFAULT_LAMBDA_CONCURRENCY in renderer.lambda.ts). The renderer keeps
  // it in a PRIVATE config field with no accessor, so the numeric value itself
  // is not observable from outside these tests; what IS observable is the
  // guard's effect: whatever the env holds, the factory still constructs the
  // real Lambda renderer rather than throwing or falling back to the mock.
  // positiveIntOrUndefined in factory.ts is module-private, so it cannot be
  // imported and tested directly either — construction is its only surface.
  const LAMBDA_KEYS: Record<string, string> = {
    REMOTION_LAMBDA_FUNCTION_NAME: 'test-fn',
    REMOTION_SERVE_URL: 'https://example.invalid',
    REMOTION_AWS_REGION: 'eu-central-1',
  };

  it("16a. the full REMOTION_* set with no REMOTION_LAMBDA_CONCURRENCY → the real Lambda renderer (today's behaviour, unchanged)", async () => {
    const { createProviders } = await withEnv({ ...LAMBDA_KEYS });
    const p = createProviders();
    expect(p.renderer.name).not.toBe(MOCK_NAME.renderer);
  });

  it('16b. REMOTION_LAMBDA_CONCURRENCY=25 → still the real Lambda renderer — the override must not break construction', async () => {
    const { createProviders } = await withEnv({
      ...LAMBDA_KEYS,
      REMOTION_LAMBDA_CONCURRENCY: '25',
    });
    const p = createProviders();
    expect(p.renderer.name).not.toBe(MOCK_NAME.renderer);
  });

  // THE POINT of 16c–16f: an env var arrives as a string, and a junk value
  // must fall back to the code's default rather than reach the AWS SDK as
  // `concurrency: NaN` — an invalid argument that fails deep inside someone
  // else's library with a message that names nothing useful. That guard
  // (positiveIntOrUndefined in factory.ts) had never been exercised by a test
  // before these.
  it("16c. REMOTION_LAMBDA_CONCURRENCY='abc' → still a working Lambda renderer", async () => {
    const { createProviders } = await withEnv({
      ...LAMBDA_KEYS,
      REMOTION_LAMBDA_CONCURRENCY: 'abc',
    });
    const p = createProviders();
    expect(p.renderer.name).not.toBe(MOCK_NAME.renderer);
  });

  it("16d. REMOTION_LAMBDA_CONCURRENCY='0' → still a working Lambda renderer", async () => {
    const { createProviders } = await withEnv({
      ...LAMBDA_KEYS,
      REMOTION_LAMBDA_CONCURRENCY: '0',
    });
    const p = createProviders();
    expect(p.renderer.name).not.toBe(MOCK_NAME.renderer);
  });

  it("16e. REMOTION_LAMBDA_CONCURRENCY='-5' → still a working Lambda renderer", async () => {
    const { createProviders } = await withEnv({
      ...LAMBDA_KEYS,
      REMOTION_LAMBDA_CONCURRENCY: '-5',
    });
    const p = createProviders();
    expect(p.renderer.name).not.toBe(MOCK_NAME.renderer);
  });

  it("16f. REMOTION_LAMBDA_CONCURRENCY='' → still a working Lambda renderer", async () => {
    // Unlike the url-typed keys, env.ts does NOT preprocess '' to undefined
    // here (z.string().optional() keeps it), so the empty string genuinely
    // reaches the guard — Number('') is 0, which is not > 0, which drops it.
    const { createProviders } = await withEnv({
      ...LAMBDA_KEYS,
      REMOTION_LAMBDA_CONCURRENCY: '',
    });
    const p = createProviders();
    expect(p.renderer.name).not.toBe(MOCK_NAME.renderer);
  });
});

// ---------------------------------------------------------------------------
// G. FORCE_MOCK beats every key
// ---------------------------------------------------------------------------

describe('G. FORCE_MOCK — the kill switch', () => {
  // Every real key, so that if FORCE_MOCK failed to gate any one of them this
  // test fails loudly instead of passing on an empty env.
  const ALL_REAL_KEYS: Record<string, string> = {
    KIE_API_KEY: 'test-key',
    FAL_API_KEY: 'test-key',
    OPENROUTER_API_KEY: 'test-key',
    ELEVENLABS_API_KEY: 'test-key',
    R2_BUCKET: 'test-bucket',
    R2_ACCOUNT_ID: 'acct',
    R2_ACCESS_KEY_ID: 'ak',
    R2_SECRET_ACCESS_KEY: 'sk',
    R2_PUBLIC_URL: 'https://example.invalid',
    REMOTION_LAMBDA_FUNCTION_NAME: 'test-fn',
    REMOTION_SERVE_URL: 'https://example.invalid',
  };

  it('17. FORCE_MOCK=1 with every real key set → all six slots are mocks', async () => {
    const { createProviders, mockProviderSlots } = await withEnv({
      ...ALL_REAL_KEYS,
      FORCE_MOCK: '1',
    });
    const p = createProviders();

    expect(p.ai.name).toBe(MOCK_NAME.ai);
    expect(p.script.name).toBe(MOCK_NAME.script);
    expect(p.voice.name).toBe(MOCK_NAME.voice);
    expect(p.renderer.name).toBe(MOCK_NAME.renderer);
    expect(p.storage.name).toBe(MOCK_NAME.storage);
    expect(p.scraper.name).toBe(MOCK_NAME.scraper);
    expect(mockProviderSlots(p).sort()).toEqual(
      ['ai', 'script', 'voice', 'renderer', 'storage', 'scraper'].sort(),
    );
  });

  it('18. FORCE_MOCK=1 → mediaEdit is null even though FAL_API_KEY is set', async () => {
    const { createProviders } = await withEnv({
      FAL_API_KEY: 'test-key',
      FORCE_MOCK: '1',
    });
    const p = createProviders();
    expect(p.mediaEdit).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// H. Overrides
// ---------------------------------------------------------------------------

describe('H. Overrides win over env', () => {
  it('19. OPENROUTER_API_KEY set but overrides.script wins', async () => {
    const { createProviders } = await withEnv({ OPENROUTER_API_KEY: 'test-key' });
    const override = fake<ScriptProvider>('override-script');
    const p = createProviders({ script: override });
    expect(p.script).toBe(override);
  });

  it('20. overrides.mediaEdit = null is respected even with FAL_API_KEY set', async () => {
    const { createProviders } = await withEnv({ FAL_API_KEY: 'test-key' });
    const p = createProviders({ mediaEdit: null });
    // The code uses `!== undefined` on purpose: an explicit null must NOT
    // fall through to building a real FalMediaEditProvider.
    expect(p.mediaEdit).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// I. Billing is dormant
// ---------------------------------------------------------------------------

/**
 * Lemon Squeezy sleeps behind BILLING_PROVIDER as of 2026-08-16 — the operator
 * became a Wyoming LLC, which removed the merchant-of-record reason it was
 * chosen for, and Stripe lands once the company is confirmed. The code was kept
 * rather than deleted (it had already been deleted once and restored three days
 * later), so what these tests pin is that KEEPING it cannot accidentally
 * ACTIVATE it: a full set of valid keys with no BILLING_PROVIDER must still
 * resolve to the mock.
 */
describe('I. Billing stays asleep unless BILLING_PROVIDER says otherwise', () => {
  const FULL_KEYS = {
    LEMONSQUEEZY_API_KEY: 'test-key',
    LEMONSQUEEZY_STORE_ID: '12345',
    LEMONSQUEEZY_WEBHOOK_SECRET: 'test-secret',
    LEMONSQUEEZY_VARIANT_MAP: '{"starter":"1"}',
  };

  it('21. no keys and no BILLING_PROVIDER ⇒ mock billing', async () => {
    const { createProviders } = await withEnv({});
    expect(createProviders().billing.name).toBe('mock-billing');
  });

  it('22. a COMPLETE key set with no BILLING_PROVIDER still resolves to the mock', async () => {
    // The whole point of the dormancy: keys alone must not wake a payment path.
    const { createProviders } = await withEnv(FULL_KEYS);
    expect(createProviders().billing.name).toBe('mock-billing');
  });

  it('23. BILLING_PROVIDER=lemonsqueezy with the keys wakes the real provider', async () => {
    const { createProviders } = await withEnv({ ...FULL_KEYS, BILLING_PROVIDER: 'lemonsqueezy' });
    expect(createProviders().billing.name).not.toBe('mock-billing');
  });

  it('24. BILLING_PROVIDER=lemonsqueezy WITHOUT keys falls back to the mock instead of throwing', async () => {
    // Same forgiving posture as every other slot: a half-configured provider
    // must not crash the process at module load.
    const { createProviders } = await withEnv({ BILLING_PROVIDER: 'lemonsqueezy' });
    expect(createProviders().billing.name).toBe('mock-billing');
  });

  it('25. keys without the switch warn, so a dormant provider is visible in the log', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { createProviders } = await withEnv(FULL_KEYS);
    createProviders();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('BILLING_PROVIDER'));
    warn.mockRestore();
  });
});
