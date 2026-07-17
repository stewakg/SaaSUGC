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

/** UI-facing descriptors for every tool (used on the landing/dashboard cards). */
export const JOB_DESCRIPTORS: JobDescriptor[] = [
  {
    type: 'image_ads',
    label: 'AI slike',
    description: 'Generiši reklamne slike iz URL-a proizvoda.',
    cost: JOB_COST.image_ads,
    icon: 'image',
  },
  {
    type: 'matrix',
    label: 'Matrix',
    description: 'Kompletan video paket: skripta, glas, titl, muzika, CTA.',
    cost: JOB_COST.matrix,
    icon: 'video',
  },
  {
    type: 'edit',
    label: 'Edit',
    description: 'Uredi i montiraj postojeći video.',
    cost: JOB_COST.edit,
    icon: 'scissors',
  },
  {
    type: 'enhance',
    label: 'Enhance',
    description: 'Popravlj kvalitet slike i videa.',
    cost: JOB_COST.enhance,
    icon: 'sparkles',
  },
  {
    type: 'mix',
    label: 'Mix',
    description: 'Kombinuj više snimaka u jedan.',
    cost: JOB_COST.mix,
    icon: 'layers',
  },
  {
    type: 'quick_test',
    label: 'Brzi test',
    description: 'Brza probna verzija sa minimalnim troškom.',
    cost: JOB_COST.quick_test,
    icon: 'zap',
  },
  {
    type: 'translate',
    label: 'Prevod',
    description: 'Prevedi strani oglas na srpski (klonirani glas).',
    cost: JOB_COST.translate,
    icon: 'languages',
  },
  {
    type: 'remove_text',
    label: 'Ukloni tekst',
    description: 'Skloni tekst i titlove sa slike/videa.',
    cost: JOB_COST.remove_text,
    icon: 'eraser',
  },
  {
    type: 'ai_video',
    label: 'AI influencer',
    description: 'Upload influencer foto + proizvod → video oglas. (uskoro)',
    cost: JOB_COST.ai_video,
    icon: 'user',
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