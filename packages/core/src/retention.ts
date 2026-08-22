/* ============================================================================
   30-day retention — the rules behind a promise two legal pages already make.

   /privatnost and /uslovi tell customers "Fajlove čuvamo 30 dana … posle 30
   dana brišu se automatski i ne mogu se povratiti". The bucket-side half of
   that promise is a set of S3/R2 lifecycle rules; this module is their single
   source of truth, and apps/worker/scripts/r2-lifecycle.ts is what applies
   them.

   The one thing that must never go wrong here: `previews/` is CATALOGUE
   content (the same mp3 plays for every user, written once by
   scripts/gen-voice-previews.mjs), not customer data, and must never age out.
   S3/R2 lifecycle filters cannot express "everything EXCEPT this prefix", so
   the configuration is a list of EXPIRING prefixes and previews/ is simply on
   no list — the guard test in retention.test.ts pins that against the real
   source files.
   ========================================================================== */

/** How long a customer file lives. The legal pages state this number; it is not a tuning knob. */
export const RETENTION_DAYS = 30;
export const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Storage prefixes that hold CUSTOMER data and must age out after RETENTION_DAYS.
 * Each entry corresponds to a real key-writing call site; the guard test at the bottom of
 * retention.test.ts pins that correspondence.
 */
export const EXPIRING_PREFIXES = [
  'uploads/',      // apps/web/src/app/api/upload/route.ts, upload/sign/route.ts, import-clip/route.ts
  'renders/',      // packages/core/src/providers/renderer.lambda.ts, renderer.local.ts
  'voice/',        // packages/core/src/providers/voice.elevenlabs.ts
  'enhance/',      // apps/worker/src/pipelines.ts — deps.persist(…, 'enhance')
  'remove-text/',  // apps/worker/src/pipelines.ts
  'image-ads/',    // apps/worker/src/pipelines.ts
] as const;

/**
 * Prefixes that are CATALOGUE content, not customer data, and must never be deleted by a
 * lifecycle rule. Listed explicitly so the exclusion reads as deliberate.
 */
export const PERMANENT_PREFIXES = ['previews/'] as const;

export type LifecycleRule = {
  ID: string;
  Filter: { Prefix: string };
  Status: 'Enabled';
  Expiration: { Days: number };
};

/** Whether a key belongs to the never-deleted catalogue (voice previews today). */
export function isPermanentKey(key: string): boolean {
  return PERMANENT_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** Whether a key belongs to customer data that ages out after RETENTION_DAYS. */
export function isExpiringKey(key: string): boolean {
  return EXPIRING_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * The instant a file is treated as gone (`created + RETENTION_MS`).
 *
 * Returns `NaN` when the input cannot be parsed into a valid time — a caller
 * that needs a DECISION rather than a timestamp should use isExpired, which
 * fails closed on exactly that NaN.
 */
export function expiresAtMs(createdAt: string | number | Date): number {
  const created = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  return created + RETENTION_MS;
}

/**
 * Whether a file created at `createdAt` is past retention as of `nowMs`.
 *
 * FAILS CLOSED, the same way enhance-limits refuses an unmeasurable file: if
 * we cannot tell how old a file is, showing a download link that 404s is worse
 * than saying it is gone, so an unparseable or invalid date counts as expired.
 *
 * The boundary is `>=`: an age of exactly RETENTION_MS is already expired.
 * R2 deletes at a UTC midnight boundary, so the object can survive slightly
 * past 30 days — being a few hours early with the "gone" label is safe, being
 * late is a dead link.
 */
export function isExpired(createdAt: string | number | Date, nowMs: number = Date.now()): boolean {
  const created = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return true;
  return nowMs - created >= RETENTION_MS;
}

/**
 * One rule per EXPIRING_PREFIXES entry, same order — exactly the shape the AWS
 * SDK takes as `LifecycleConfiguration.Rules`, so the apply script hands the
 * array over untouched. The permanent prefixes appear nowhere in here (see the
 * header): a rule list is the whole truth about what ages out.
 */
export function lifecycleRules(): LifecycleRule[] {
  return EXPIRING_PREFIXES.map((prefix) => ({
    ID: `adgen-retention-${prefix.replace(/\/$/, '')}`,
    Filter: { Prefix: prefix },
    Status: 'Enabled' as const,
    Expiration: { Days: RETENTION_DAYS },
  }));
}
