/**
 * Real ScriptProvider (F5): ad-script variants via OpenRouter. Plain fetch
 * against the OpenAI-compatible chat-completions endpoint — no SDK, matching
 * this repo's existing style (scraper.real.ts, billing.lemonsqueezy.ts).
 *
 * Replaces script.claude.ts, which gated on ANTHROPIC_API_KEY and therefore
 * never ran once: the owner has no Anthropic account and never did, so every
 * Matrix job to date fell through to MockScriptProvider's canned lines. The
 * owner's actual LLM access is OpenRouter. The Serbian prompt below is lifted
 * verbatim from that file — it was the one part worth keeping, and the pending
 * blind eval (INFRASTRUCTURE.md F5) must measure this exact text.
 *
 * MODEL CHOICE IS UNVALIDATED FOR SERBIAN. The default is deliberately not the
 * cheapest tier: Serbian ad copy is the gating requirement, no published
 * benchmark answers it (the Serbian evals that exist measure NLU, not copy),
 * and the price gap between tiers is cents per job. Cheaper models may well
 * win — but that is for the blind eval to decide, not for a default to assume.
 * Override per-eval with OPENROUTER_SCRIPT_MODEL.
 */
import type { ScriptProvider } from '../interfaces.ts';

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-3-flash-preview';

interface Variant {
  angle: string;
  script: string;
  estDurationSec: number;
}

const SYSTEM_PROMPT =
  'Ti si stručnjak za copywriting UGC reklamnih video oglasa za balkansko tržište (COD/plaćanje pouzećem). ' +
  'Odgovori ISKLJUČIVO validnim JSON nizom, bez markdown ograda (```), bez ikakvog teksta pre ili posle, u obliku: ' +
  '[{"angle": "kratak opis ugla", "script": "tekst skripte", "estDurationSec": broj}]';

/**
 * Strict-schema request shape. Honoured only by models that advertise
 * structured outputs; the rest ignore it and answer in prose, which is why
 * parseVariantsJson below still strips markdown fences. Both paths are needed
 * because the model is swappable by env var.
 */
const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'ad_script_variants',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        variants: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              angle: { type: 'string' },
              script: { type: 'string' },
              estDurationSec: { type: 'number' },
            },
            required: ['angle', 'script', 'estDurationSec'],
            additionalProperties: false,
          },
        },
      },
      required: ['variants'],
      additionalProperties: false,
    },
  },
} as const;

export class OpenRouterScriptProvider implements ScriptProvider {
  readonly name = 'openrouter-script';

  constructor(private readonly config: { apiKey: string; model?: string }) {}

  async generateVariants(input: {
    product: string;
    benefits: string;
    tone: string;
    language: string;
    style: string;
    durations: number[];
    count: number;
  }): Promise<{ variants: Variant[] }> {
    const targetDuration = input.durations[0] ?? 15;
    const userPrompt = [
      `Napiši ${input.count} različitih verzija (varijanti) reklamnog govornog teksta (voiceover skripte) za kratki UGC video oglas.`,
      `Proizvod: ${input.product}`,
      input.benefits ? `Prednosti/ponuda: ${input.benefits}` : '',
      `Ton: ${input.tone}. Stil: ${input.style}. Jezik: ${input.language} (piši isključivo na ovom jeziku).`,
      `Svaka skripta treba da traje otprilike ${targetDuration} sekundi kad se izgovori naglas (procenjuj ~2.5 reči po sekundi).`,
      `Svaka varijanta treba da ima drugačiji "ugao" (npr. problem→rešenje, društveni dokaz, hitnost/FOMO, poređenje sa alternativama...).`,
    ]
      .filter(Boolean)
      .join('\n');

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        // Optional OpenRouter attribution — shows the app in its rankings.
        'X-Title': 'AdGen',
      },
      body: JSON.stringify({
        model: this.config.model ?? DEFAULT_MODEL,
        max_tokens: 2048,
        response_format: RESPONSE_FORMAT,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenRouter script generation failed (${res.status}): ${body}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      error?: { message?: string };
    };
    // OpenRouter can return HTTP 200 with an error body when an upstream
    // provider fails — check it before reading choices.
    if (json.error) {
      throw new Error(`OpenRouter returned an error: ${json.error.message ?? 'unknown'}`);
    }
    const text = json.choices?.[0]?.message?.content ?? '';

    const variants = parseVariantsJson(text);
    if (variants.length === 0) {
      throw new Error('OpenRouter returned no parseable script variants.');
    }
    return { variants: variants.slice(0, input.count) };
  }
}

/**
 * Accepts either shape the models actually produce: the bare array the system
 * prompt asks for, or the `{ variants: [...] }` object the strict schema
 * produces. Strips markdown fences first — models that ignore response_format
 * wrap their JSON in them.
 */
export function parseVariantsJson(text: string): Variant[] {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Model response was not valid JSON: ${cleaned.slice(0, 200)}`);
  }

  const arr = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { variants?: unknown }).variants)
      ? ((parsed as { variants: unknown[] }).variants)
      : null;
  if (!arr) {
    throw new Error('Model response JSON was neither an array nor { variants: [...] }.');
  }

  return arr
    .filter(
      (v): v is Variant =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as Variant).angle === 'string' &&
        typeof (v as Variant).script === 'string',
    )
    .map((v) => ({
      angle: v.angle,
      script: v.script,
      estDurationSec: typeof v.estDurationSec === 'number' && v.estDurationSec > 0 ? v.estDurationSec : 15,
    }));
}
