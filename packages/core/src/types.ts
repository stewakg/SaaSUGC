/**
 * Shared domain types — mirror the Supabase schema in INFRASTRUCTURE.md §3.
 * Keep these in sync with the SQL migrations in packages/db/migrations.
 */

export type JobType =
  | 'matrix'
  | 'edit'
  | 'image_ads'
  | 'mix'
  | 'quick_test'
  | 'translate'
  | 'enhance'
  | 'remove_text'
  | 'ai_video';

export type JobStatus = 'queued' | 'running' | 'done' | 'error';

export type AssetKind = 'video' | 'image' | 'audio';

/** A row in `profiles`. balance is a cached running total of credits_ledger. */
export interface Profile {
  id: string; // uuid, = auth.users.id
  email: string;
  balance: number;
  createdAt: string;
}

/** A row in `credits_ledger`. delta is +topup / -spend. */
export interface CreditLedgerEntry {
  id: string;
  userId: string;
  delta: number;
  reason: string;
  jobId: string | null;
  createdAt: string;
}

/** A row in `jobs`. params/result are freeform jsonb (typed per JobType). */
export interface Job {
  id: string;
  userId: string;
  type: JobType;
  status: JobStatus;
  params: Record<string, unknown>;
  result: Record<string, unknown> | null;
  cost: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A row in `assets`. */
export interface Asset {
  id: string;
  jobId: string;
  userId: string;
  kind: AssetKind;
  storageKey: string;
  url: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

/** UI-facing job descriptor (costs, labels) — from pricing.ts. */
export interface JobDescriptor {
  type: JobType;
  label: string;
  description: string;
  cost: number;
  icon?: string;
}

/** Supported UI languages (competitor has these too). */
export type UiLanguage = 'sr' | 'bs' | 'hr' | 'ro' | 'en';