/**
 * Real ScriptProvider (F5): Claude Opus writes ad-script variants. Plain
 * fetch against the Messages API — no SDK dependency, matching this repo's
 * existing style (scraper.real.ts, billing.lemonsqueezy.ts).
 *
 * Written now so it's ready to wire in once ANTHROPIC_API_KEY exists (see
 * ACCOUNTS.md) — never instantiated until then (factory.ts gates on the
 * key). NOT live-tested — no Anthropic account exists yet.
 */
import type { ScriptProvider } from '../interfaces.ts';

const API_URL = 'https://api.anthropic.com/v1/messages';
// Update when a newer Opus model ships.
const DEFAULT_MODEL = 'claude-opus-4-8';

interface Variant {
  angle: string;
  script: string;
  estDurationSec: number;
}

export class ClaudeScriptProvider implements ScriptProvider {
  readonly name = 'claude-script';

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
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model ?? DEFAULT_MODEL,
        max_tokens: 2048,
        system:
          'Ti si stručnjak za copywriting UGC reklamnih video oglasa za balkansko tržište (COD/plaćanje pouzećem). ' +
          'Odgovori ISKLJUČIVO validnim JSON nizom, bez markdown ograda (```), bez ikakvog teksta pre ili posle, u obliku: ' +
          '[{"angle": "kratak opis ugla", "script": "tekst skripte", "estDurationSec": broj}]',
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Claude script generation failed (${res.status}): ${body}`);
    }

    const json = (await res.json()) as { content: { type: string; text?: string }[] };
    const text = json.content.find((b) => b.type === 'text')?.text ?? '';

    const variants = parseVariantsJson(text);
    if (variants.length === 0) {
      throw new Error('Claude returned no parseable script variants.');
    }
    return { variants: variants.slice(0, input.count) };
  }
}

/** Strips accidental markdown code fences and parses the JSON array Claude was asked for. */
function parseVariantsJson(text: string): Variant[] {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude response was not valid JSON: ${cleaned.slice(0, 200)}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Claude response JSON was not an array.');
  }
  return parsed
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