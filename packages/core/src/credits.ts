/**
 * Credit logic — shared between web (balance check) and worker (charge-on-success).
 *
 * Rule (INFRASTRUCTURE.md §3):
 *   - On enqueue: verify balance >= cost (reject otherwise). Do NOT deduct yet.
 *   - On success: deduct atomically (ledger insert + balance update).
 *   - On failure: no charge.
 *
 * The actual DB transaction lives in packages/db; here we keep pure helpers so
 * both sides import the same rule and there's no drift.
 */
import { computeJobCost } from './pricing.ts';
import type { JobType } from './types.ts';

/** Whether a user with this balance can enqueue a job of `count` outputs. */
export function canAfford(balance: number, type: JobType, count = 1): boolean {
  return balance >= computeJobCost(type, count);
}

/** Reject message shown to the UI when balance is insufficient. */
export function insufficientBalanceMessage(type: JobType, count = 1): string {
  const cost = computeJobCost(type, count);
  return `Nemaš dovoljno kredita. Potrebno ${cost}, dopuni kredit da nastaviš.`;
}

/** Reasons recorded in credits_ledger. Keep stable strings (used in queries/UI). */
export const LEDGER_REASONS = {
  signupBonus: 'signup_bonus',
  topup: 'topup',
  jobSpend: 'job_spend',
  refund: 'refund',
  devTopup: 'dev_topup', // dev-only "add credits" button
} as const;
export type LedgerReason = (typeof LEDGER_REASONS)[keyof typeof LEDGER_REASONS];