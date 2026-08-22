/**
 * r2-lifecycle — apply (or preview) the bucket's 30-day retention rules.
 *
 * /privatnost and /uslovi promise customers that files are kept 30 days and
 * then deleted automatically. `lifecycleRules()` in @adgen/core is the single
 * source of truth for that rule set; this script is the only thing that writes
 * it to the bucket. It lives in the worker because that is where TypeScript
 * already runs through tsx and @adgen/core is already a dependency — the
 * script imports no SDK of its own.
 *
 * DRY RUN BY DEFAULT: without --apply nothing is changed. With --apply, R2
 * will delete every object older than RETENTION_DAYS under the expiring
 * prefixes, irreversibly — running that is the owner's decision, never part of
 * a build or a test.
 *
 * Usage: pnpm r2:lifecycle [--apply]
 */
import { createProviders, lifecycleRules, RETENTION_DAYS } from '@adgen/core';

async function main(): Promise<void> {
  const { storage } = createProviders();

  // Feature-detect, the same seam /api/storage/[...path]/route.ts uses to
  // probe signedDownloadUrl: the Storage interface has no lifecycle members,
  // and MockStorage (no R2/S3 env vars) cannot manage a bucket it does not
  // have. Print only the provider NAME — never a credential, not even
  // partially, not even masked.
  const candidate = storage as {
    putLifecycleRules?: (rules: ReturnType<typeof lifecycleRules>) => Promise<void>;
    getLifecycleRules?: () => Promise<unknown[] | null>;
  };
  if (
    typeof candidate.putLifecycleRules !== 'function' ||
    typeof candidate.getLifecycleRules !== 'function'
  ) {
    console.error(
      `active storage is "${storage.name}", not R2/S3 — the R2_* (or AWS_S3_*) env vars are missing, so there is no bucket to configure.`,
    );
    process.exit(1);
  }
  const bucket = candidate as {
    putLifecycleRules: (rules: ReturnType<typeof lifecycleRules>) => Promise<void>;
    getLifecycleRules: () => Promise<unknown[] | null>;
  };

  console.log('current configuration on the bucket:');
  const current = await bucket.getLifecycleRules();
  console.log(
    current === null ? 'no lifecycle configuration on this bucket yet' : JSON.stringify(current, null, 2),
  );

  console.log('\nwhat this script would apply:');
  console.log(JSON.stringify(lifecycleRules(), null, 2));

  if (!process.argv.includes('--apply')) {
    console.log('\nDRY RUN — nothing was changed. Re-run with --apply to write this to the bucket.');
    return;
  }

  console.warn(
    `\nWARNING: --apply replaces the bucket's lifecycle configuration. R2 will then delete every ` +
      `object older than ${RETENTION_DAYS} days under the prefixes above — previews/ is NOT among them — ` +
      `and the deletion is IRREVERSIBLE: expired objects cannot be recovered.`,
  );
  await bucket.putLifecycleRules(lifecycleRules());

  // The read-back is the proof: a 200 on the PUT only says the API accepted
  // the request, not that the bucket now holds these rules.
  console.log('\nthe bucket now reports:');
  const applied = await bucket.getLifecycleRules();
  console.log(
    applied === null ? 'no lifecycle configuration on this bucket yet' : JSON.stringify(applied, null, 2),
  );
}

main().catch((err: unknown) => {
  // Only the error's own name and message — a credential that leaked into an
  // error must not be echoed back out by this script.
  const named = err as { name?: unknown; message?: unknown };
  console.error(`r2-lifecycle failed: ${String(named?.name)}: ${String(named?.message)}`);
  process.exit(1);
});
