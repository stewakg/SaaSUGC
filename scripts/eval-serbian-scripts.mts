/**
 * Blind eval for Serbian ad-script quality (INFRASTRUCTURE.md F5).
 *
 * Why this exists: no published benchmark answers "which model writes good
 * Serbian ad copy". The Serbian evals that exist (Serbian SuperGLUE,
 * gordicaleksa/serbian-llm-eval, BenchMAX) measure NLU — QA, inference,
 * coreference — not copywriting. So it gets measured here instead.
 *
 * Two design rules that make the result trustworthy:
 *
 * 1. It drives the SHIPPED provider (OpenRouterScriptProvider), not a copy of
 *    the prompt. If the prompt changes, this measures the new one. A copy would
 *    silently drift and produce a decision about text that is no longer used.
 * 2. Output is BLIND. Variants are shuffled and stripped of model identity, and
 *    MockScriptProvider's canned lines are mixed in as a control. If a model
 *    can't beat the canned text, that is worth knowing before paying for it.
 *
 * Run:
 *   node <tsx> scripts/eval-serbian-scripts.mts
 *   node <tsx> scripts/eval-serbian-scripts.mts --models a,b,c --variants 3
 *
 * Needs OPENROUTER_API_KEY in the repo-root .env. Costs well under $1.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenRouterScriptProvider } from '../packages/core/src/providers/script.openrouter.ts';
import { MockScriptProvider } from '../packages/core/src/providers/mocks.ts';
import type { ScriptProvider } from '../packages/core/src/interfaces.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(REPO_ROOT, 'tests', 'serbian-script-eval');

/**
 * Real COD products, not toy examples — register and vocabulary differ sharply
 * between "skincare serum" and "masažer za vrat", and the eval is worthless if
 * it measures a category we don't sell.
 */
const PRODUCTS = [
  {
    product: 'Masažer za vrat i ramena sa grejanjem',
    benefits: 'Popust 50%, plaćanje pouzećem, isporuka 2-3 dana, garancija 30 dana',
  },
  {
    product: 'Serum za lice sa hijaluronskom kiselinom',
    benefits: 'Vidljiv rezultat za 7 dana, bez parabena, 2+1 gratis',
  },
  {
    product: 'Bežični usisivač za auto',
    benefits: 'Radi 30 minuta bez punjenja, sa 3 nastavka, besplatna dostava',
  },
];

const DEFAULT_MODELS = [
  'google/gemini-3.1-flash-lite',
  'google/gemini-3-flash-preview',
  'google/gemini-3.6-flash',
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function loadApiKey(): string {
  const envPath = join(REPO_ROOT, '.env');
  let raw: string;
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch {
    console.error(`Nema ${envPath}. Napravi ga iz .env.example.`);
    process.exit(1);
  }
  const m = raw.replace(/^﻿/, '').match(/^\s*OPENROUTER_API_KEY\s*=(.*)$/m);
  const key = m?.[1]?.split(/\s+#/)[0].trim() ?? '';
  if (!key) {
    console.error('OPENROUTER_API_KEY je prazan u .env — upiši ga pa pokreni ponovo.');
    process.exit(1);
  }
  return key;
}

interface Row {
  model: string;
  productIndex: number;
  angle: string;
  script: string;
  estDurationSec: number;
}

const models = (arg('models') ?? DEFAULT_MODELS.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const variantsPerProduct = Number(arg('variants') ?? 3);
const apiKey = loadApiKey();

const rows: Row[] = [];
const failures: string[] = [];

for (const model of models) {
  const provider = new OpenRouterScriptProvider({ apiKey, model });
  for (const [productIndex, p] of PRODUCTS.entries()) {
    process.stdout.write(`${model} · ${p.product.slice(0, 30)}… `);
    const started = Date.now();
    try {
      const { variants } = await provider.generateVariants({
        product: p.product,
        benefits: p.benefits,
        tone: 'energičan',
        language: 'srpski',
        style: 'UGC',
        durations: [15],
        count: variantsPerProduct,
      });
      for (const v of variants) rows.push({ model, productIndex, ...v });
      console.log(`${variants.length} varijanti, ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${model} · ${p.product}: ${msg}`);
      console.log(`PAO — ${msg.slice(0, 90)}`);
    }
  }
}

/**
 * The control. If a paid model can't clearly beat canned text, that is the
 * finding — and worth knowing before paying for the model.
 *
 * Added ONCE, not once per product. The mock ignores its input entirely and
 * returns the same fixed lines every time, so repeating it would print
 * identical text three times and give the control away on sight. Typed as
 * ScriptProvider because the concrete class narrows the signature to
 * `{ count }` and would reject the full input object.
 */
const mock: ScriptProvider = new MockScriptProvider();
const { variants: controlVariants } = await mock.generateVariants({
  product: PRODUCTS[0].product,
  benefits: PRODUCTS[0].benefits,
  tone: 'energičan',
  language: 'srpski',
  style: 'UGC',
  durations: [15],
  count: variantsPerProduct,
});
for (const v of controlVariants) {
  rows.push({ model: 'KONTROLA (mock, konzervirano)', productIndex: 0, ...v });
}

if (rows.length === 0) {
  console.error('\nNijedna varijanta nije generisana. Greške:\n' + failures.join('\n'));
  process.exit(1);
}

// Fisher-Yates. Grouping by model would leak identity through position alone.
for (let i = rows.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [rows[i], rows[j]] = [rows[j], rows[i]];
}

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
mkdirSync(OUT_DIR, { recursive: true });

const sheet = [
  `# Slepi test srpskih skripti — ${stamp}`,
  '',
  `${rows.length} varijanti, ${models.length} modela + kontrola. **Imena modela nisu ovde** — u \`${stamp}-key.json\`.`,
  '',
  'Oceni svaku 1–5 po ovim osama. Prve dve su diskvalifikujuće, ne kozmetičke:',
  '',
  '| Osa | Šta gledaš |',
  '|---|---|',
  '| **Padeži** | najčešći kvar: „za vaše kože", „sa našim proizvod" |',
  '| **Ekavica/ijekavica** | aplikacija prodaje srpski, bosanski i hrvatski kao ODVOJENE jezike — „mlijeko" u srpskom tekstu je diskvalifikacija bez obzira na sve ostalo |',
  '| Dijakritike | č ć š ž đ tačne i neizostavljene |',
  '| Prevodilaština | engleski red reči, „Da li ste umorni od..." |',
  '| Registar | COD reklama je razgovorna i prodajna, ne književna |',
  '',
  '---',
  '',
];

rows.forEach((r, i) => {
  sheet.push(`### ${i + 1}. ${PRODUCTS[r.productIndex].product}`);
  sheet.push(`*ugao: ${r.angle} · ~${r.estDurationSec}s*`);
  sheet.push('');
  sheet.push(r.script);
  sheet.push('');
  sheet.push('`padeži: _ · ekavica: _ · dijakritike: _ · prevodilaština: _ · registar: _`');
  sheet.push('');
});

if (failures.length) {
  sheet.push('---', '', '## Neuspesi', '', ...failures.map((f) => `- ${f}`));
}

const sheetPath = join(OUT_DIR, `${stamp}-blind.md`);
const keyPath = join(OUT_DIR, `${stamp}-key.json`);
writeFileSync(sheetPath, sheet.join('\n'), 'utf8');
writeFileSync(
  keyPath,
  JSON.stringify(
    rows.map((r, i) => ({ n: i + 1, model: r.model, product: PRODUCTS[r.productIndex].product })),
    null,
    2,
  ),
  'utf8',
);

console.log(`\nza ocenjivanje: ${sheetPath}`);
console.log(`ključ (NE otvaraj pre ocenjivanja): ${keyPath}`);
if (failures.length) console.log(`\n${failures.length} poziva palo — vidi kraj .md fajla`);
