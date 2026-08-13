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
 * MODEL CHOICE — graded 2026-08-10, and read the caveat before trusting it.
 * The blind eval (`tests/serbian-script-eval/2026-08-09-11-30-blind.md`) put 30
 * unlabelled variants from three models past the owner, with three canned
 * `MockScriptProvider` lines mixed in as a control. Verdict: all 30 acceptable.
 *
 * That falsifies this file's previous assumption — the cheapest tier does NOT
 * visibly break Serbian — so the default moved to it. But the control passing
 * too means the eval did not actually separate the models, so this is "no model
 * produced broken Serbian", not "the cheapest is as good as the best". If a bad
 * script ever reaches production, re-run the eval scoring each axis
 * individually; that is the measurement this one skipped.
 * Override with OPENROUTER_SCRIPT_MODEL.
 */
import type { ScriptProvider, SpeakerGender } from '../interfaces.ts';

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-3.1-flash-lite';

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
 * System prompt for describeImage. Written in English (unlike SYSTEM_PROMPT,
 * which is Serbian): the OUTPUT language is supplied per call via the
 * `language` argument, so the model must be told which language to write in
 * rather than defaulting to English.
 */
const VISION_SYSTEM_PROMPT =
  'You turn a product photo into a SHORT search query for stock footage. ' +
  'Reply with ONLY 3 to 6 words naming the physical product itself — ' +
  'no brand names, no marketing adjectives, no punctuation, no extra text. ' +
  'Write the search phrase in the language the user specifies, and nothing else.';

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

/**
 * The single most important line in this prompt for Serbian output.
 *
 * Left to itself the model writes in the feminine — "našla sam", "sigurna",
 * "hidrirana" — because UGC ad copy in its training data leans that way. Read
 * by a male voice that is an instantly broken ad, and English gives the model
 * no signal that a choice was even being made.
 *
 * Both examples are spelled out rather than named abstractly ("piši u muškom
 * rodu"): naming the rule alone leaves the model to work out which words carry
 * gender, and it misses adjectives more often than verbs.
 *
 * With no voice chosen there is nothing to match, so the instruction is
 * omitted entirely rather than guessed — a wrong guess is worse than the
 * model's own default, which at least stays internally consistent.
 */
function genderInstruction(gender: SpeakerGender | undefined): string {
  if (!gender) return '';
  const forms =
    gender === 'male'
      ? 'muškom rodu (npr. "našao sam", "siguran sam", "probao sam")'
      : 'ženskom rodu (npr. "našla sam", "sigurna sam", "probala sam")';
  return (
    `VAŽNO — skriptu čita glas ${gender === 'male' ? 'muškog' : 'ženskog'} pola, pa je piši u ${forms}. ` +
    'Ovo se odnosi na SVE oblike koji nose rod: glagole u prošlom vremenu, prideve i trpne oblike. ' +
    'Ako se rod ne može izbeći a nisi siguran, preformuliši rečenicu u sadašnje vreme.'
  );
}

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
    speakerGender?: SpeakerGender;
  }): Promise<{ variants: Variant[] }> {
    const targetDuration = input.durations[0] ?? 15;
    const userPrompt = [
      `Napiši ${input.count} različitih verzija (varijanti) reklamnog govornog teksta (voiceover skripte) za kratki UGC video oglas.`,
      `Proizvod: ${input.product}`,
      input.benefits ? `Prednosti/ponuda: ${input.benefits}` : '',
      `Ton: ${input.tone}. Stil: ${input.style}. Jezik: ${input.language} (piši isključivo na ovom jeziku).`,
      genderInstruction(input.speakerGender),
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

  async describeImage(imageUrl: string, language: string): Promise<string> {
    const userText = `Describe this product image as a stock-footage search query, written in this language: ${language}.`;

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
        messages: [
          { role: 'system', content: VISION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: userText },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenRouter image description failed (${res.status}): ${body}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      error?: { message?: string };
    };
    // OpenRouter can return HTTP 200 with an error body when an upstream
    // provider fails — check it before reading choices (same as generateVariants).
    if (json.error) {
      throw new Error(`OpenRouter returned an error: ${json.error.message ?? 'unknown'}`);
    }
    const content = json.choices?.[0]?.message?.content ?? '';
    if (!content.trim()) {
      throw new Error('OpenRouter returned no image description content.');
    }

    // Trim surrounding quotes/newlines and clamp: a model that ignores the
    // "short search phrase" instruction must not produce a 2000-character "query".
    const cleaned = content.trim().replace(/^["'`]+|["'`]+$/g, '').trim();
    return cleaned.length > 120 ? cleaned.slice(0, 120) : cleaned;
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
