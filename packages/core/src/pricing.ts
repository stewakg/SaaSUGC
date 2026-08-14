/**
 * Pricing — credit costs per job type + credit packs (Billing mock).
 *
 * Charge-on-success rule (INFRASTRUCTURE.md §3):
 *   - cost is computed up front and checked against balance on enqueue;
 *   - credits are deducted ONLY when the job succeeds;
 *   - on failure, no charge.
 *
 * These numbers are deliberately editable (tune later). Source of truth lives here,
 * not in the DB, so the web + worker + UI all read the same constant.
 */
import type { JobDescriptor, JobType } from './types.ts';

/** Free credits granted on signup. */
export const SIGNUP_BONUS_CREDITS = 3;

/** Per-job credit costs. Multiply by output count where noted. */
export const JOB_COST: Record<JobType, number> = {
  image_ads: 4, // per image
  matrix: 15, // per video
  edit: 18, // per video
  enhance: 9, // per output
  mix: 12, // per video
  quick_test: 2, // per render
  translate: 15, // per video
  remove_text: 6, // per output
  ai_video: 25, // per video (influencer UGC, F7)
  // Cheaper than matrix on purpose: one clip, no scene detection, no montage —
  // just TTS + captions + one render per variant. Placeholder like every number
  // in this file; pricing is settled after the build, not before.
  revoice: 8, // per video
};

/**
 * Compute the total credit cost for a job request.
 * Most jobs multiply the unit cost by the number of requested outputs.
 */
export function computeJobCost(type: JobType, count = 1): number {
  const unit = JOB_COST[type] ?? 0;
  return unit * Math.max(1, Math.floor(count));
}

/**
 * UI-facing descriptors for every tool (used on the landing/dashboard cards).
 * `tier: 'main'` tools get a big colored card with 3 benefit bullets;
 * `tier: 'utility'` tools get a compact list row (see apps/web's dashboard).
 */
export const JOB_DESCRIPTORS: JobDescriptor[] = [
  {
    type: 'revoice',
    label: 'Preozvuči',
    description: 'Jedan snimak, više reklama — nova skripta, glas i titlovi na svakoj.',
    cost: JOB_COST.revoice,
    icon: 'sparkles',
    theme: 'teal',
    tier: 'main',
    benefits: [
      'Zadržava tvoj snimak, menja poruku',
      'Svaka verzija drugi tekst i glas',
      'Najbrži način do više varijanti',
    ],
  },
  {
    type: 'matrix',
    // Renamed from "Matrix" 2026-08-13. "Matrix" is our internal word for the
    // job type (and stays as `type: 'matrix'` everywhere) but told a customer
    // nothing. The description also promised MUSIC, which the product does not
    // supply — there is no sound library, the user brings their own file
    // (RELEASE_PLAN: explicitly not in v1). It now names the actual mechanic:
    // it cuts YOUR clips and assembles several different videos from them.
    label: 'Video reklame',
    description: 'Od tvojih klipova pravi 5–15 različitih reklama.',
    cost: JOB_COST.matrix,
    icon: 'video',
    theme: 'orange',
    tier: 'main',
    benefits: [
      'Svaka verzija sa drugim hook-om',
      'Različite skripte, glasovi i titlovi',
      'Napravljeno za A/B testiranje',
    ],
  },
  {
    type: 'edit',
    label: 'Edit',
    description: 'Uredi i montiraj postojeći video.',
    cost: JOB_COST.edit,
    icon: 'scissors',
    theme: 'blue',
    tier: 'main',
    benefits: [
      'AI piše skriptu i čita je glasom',
      'AI scene se smenjuju sa tvojim snimkom',
      'Titlovi i tranzicije prate skriptu',
    ],
  },
  {
    type: 'image_ads',
    label: 'AI slike',
    description: 'Generiši reklamne slike iz URL-a proizvoda.',
    cost: JOB_COST.image_ads,
    icon: 'image',
    theme: 'purple',
    tier: 'main',
    benefits: [
      'Srpski tekst direktno na slici',
      'Pre/posle, problem, garancija — gotovi šabloni',
      'Odmah spremne za objavu',
    ],
  },
  {
    type: 'mix',
    label: 'Mix',
    description: 'Kombinuj više snimaka u jedan.',
    cost: JOB_COST.mix,
    icon: 'layers',
    theme: 'teal',
    tier: 'main',
    benefits: [
      'Ubaciš više klipova, dobiješ jednu montiranu reklamu',
      'Deo su video reklame sa AI titlovima',
      'Prelazi i tempo se montiraju automatski',
    ],
  },
  {
    type: 'quick_test',
    label: 'Brzi test',
    description: 'Brza probna verzija sa minimalnim troškom.',
    cost: JOB_COST.quick_test,
    icon: 'zap',
    theme: 'pink',
    tier: 'main',
    benefits: [
      'Jedan klik, gotova reklama, nula podešavanja',
      'Testiraj koncept pre punog paketa',
      'Najmanji trošak od svih alata',
    ],
  },
  {
    type: 'translate',
    label: 'Prevod',
    description: 'Prevedi strani oglas na srpski (klonirani glas).',
    cost: JOB_COST.translate,
    icon: 'languages',
    theme: 'red',
    tier: 'main',
    benefits: [
      'Prirodan glas, kloniran original',
      'Titlovi u istom stilu kao original',
      'Isti tempo i koncept reklame',
    ],
  },
  {
    type: 'enhance',
    // The only English label on a LIVE tool — every other one a customer can
    // actually click is Serbian. This is the name the docs already used.
    label: 'Poboljšaj kvalitet',
    description: 'Ubaciš mutan ili komprimovan klip → dobiješ oštar HD do 1080p.',
    cost: JOB_COST.enhance,
    icon: 'sparkles',
    tier: 'utility',
  },
  {
    type: 'remove_text',
    label: 'Ukloni tekst',
    description: 'AI obriše titlove, watermark i svaki tekst sa slike/videa, bez blura i mrlja.',
    cost: JOB_COST.remove_text,
    icon: 'eraser',
    tier: 'utility',
  },
  {
    type: 'ai_video',
    label: 'AI influencer',
    // No "(uskoro)" in the copy: the card already renders an USKORO badge from
    // LIVE_TOOL_LINKS, so the descriptor saying it too printed it twice.
    description: 'Upload influencer foto + proizvod → video oglas.',
    cost: JOB_COST.ai_video,
    icon: 'user',
    tier: 'utility',
  },
];

/** Look up a descriptor by job type. */
export function getJobDescriptor(type: JobType): JobDescriptor {
  const d = JOB_DESCRIPTORS.find((j) => j.type === type);
  if (!d) throw new Error(`Unknown job type: ${type}`);
  return d;
}

/** Mock credit packs for the Billing mock (F1 dev "add credits"). */
export interface CreditPack {
  id: string;
  credits: number;
  priceEUR: number;
  bonus?: number;
  popular?: boolean;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'pack_starter', credits: 30, priceEUR: 9 },
  { id: 'pack_creator', credits: 100, priceEUR: 25, bonus: 10, popular: true },
  { id: 'pack_pro', credits: 250, priceEUR: 55, bonus: 40 },
  { id: 'pack_agency', credits: 600, priceEUR: 120, bonus: 120 },
];
/**
 * "1 kredit" vs "2 kredita" — Serbian does not pluralise the way English does,
 * and the app said "1 kredita" everywhere, which reads as broken to a native
 * speaker on exactly the screen where trust matters most: the price.
 *
 * For this noun the rule collapses to one case. Serbian normally splits into
 * one / two-to-four / five-plus, but *kredit* takes the same form for the
 * second and third groups, so only numbers ending in 1 differ — and 11 is the
 * exception to that, as it is in most Slavic counting.
 *
 *   1 kredit · 21 kredit · 101 kredit
 *   2 kredita · 5 kredita · 11 kredita · 100 kredita
 *
 * Takes the number so callers cannot get the pairing wrong:
 * `creditsLabel(cost)` → "15 kredita".
 */
export function creditsLabel(n: number): string {
  return `${n} ${creditsWord(n)}`;
}

/** Just the noun, for callers that render the number separately (styled spans). */
export function creditsWord(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const endsInOne = abs % 10 === 1 && abs % 100 !== 11;
  return endsInOne ? 'kredit' : 'kredita';
}

/**
 * "3 besplatna videa" — the signup offer, on the landing page and the signup
 * form. It was hard-coded to the plural that happens to be right for the
 * current value of SIGNUP_BONUS_CREDITS, so changing that constant to 1 or 21
 * would have printed "1 besplatna videa".
 *
 * This one needs THREE forms, unlike `creditsWord`. Serbian splits counted
 * nouns into one / two-to-four / five-plus; *kredit* happens to collapse the
 * last two, which is why that helper gets away with a single branch. The
 * adjective does not collapse, so all three appear here:
 *
 *   1 besplatan video    · 21 besplatan video
 *   2 besplatna videa    · 34 besplatna videa
 *   5 besplatnih videa   · 11 besplatnih videa · 100 besplatnih videa
 *
 * 11–14 take the five-plus form even though they end in 1–4, which is the same
 * exception `creditsWord` documents.
 */
export function freeVideosLabel(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const lastTwo = abs % 100;
  const last = abs % 10;
  const teens = lastTwo >= 11 && lastTwo <= 14;
  if (!teens && last === 1) return `${n} besplatan video`;
  if (!teens && last >= 2 && last <= 4) return `${n} besplatna videa`;
  return `${n} besplatnih videa`;
}
