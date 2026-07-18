#!/usr/bin/env node
/**
 * Copies the root .env into apps/web/.env and apps/worker/.env.
 *
 * Why: Next.js only reads .env from its own app directory (apps/web), and
 * the worker reads .env from wherever `tsx --env-file=.env` runs (apps/worker)
 * — neither looks at a monorepo-root .env on its own. Rather than maintain
 * two separate real .env files by hand, this makes the root .env the single
 * file to edit; both per-app copies are generated from it.
 *
 * Runs automatically before `pnpm dev` (see root package.json's "predev").
 * Run manually any time with `pnpm env:sync`.
 */
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(REPO_ROOT, '.env');
const TARGETS = [path.join(REPO_ROOT, 'apps/web/.env'), path.join(REPO_ROOT, 'apps/worker/.env')];

if (!existsSync(SOURCE)) {
  console.log('[env:sync] No root .env found — nothing to sync (this is fine if you only use mocks).');
  process.exit(0);
}

for (const target of TARGETS) {
  copyFileSync(SOURCE, target);
  console.log(`[env:sync] .env -> ${path.relative(REPO_ROOT, target)}`);
}
