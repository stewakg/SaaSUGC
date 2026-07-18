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
    type: 'matrix',
    label: 'Matrix',
    description: 'Kompletan video paket: skripta, glas, titl, muzika, CTA.',
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
      'Ubaciš klipove jednom, dobiješ više vrsta reklama',
      'Deo su Matrix videi sa AI titlovima',
      'Deo su Edit videi sa AI scenama',
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
      'Ista muzika i koncept reklame',
    ],
  },
  {
    type: 'enhance',
    label: 'Enhance',
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
    description: 'Upload influencer foto + proizvod → video oglas. (uskoro)',
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