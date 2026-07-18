/**
 * Resolves the local mock-storage directory to an ABSOLUTE path anchored at
 * the monorepo root (not the caller's cwd). apps/worker (writer, via
 * MockStorage) and apps/web (reader, via `/api/storage/[...path]`) are
 * separate processes with different cwds — if each resolved a relative
 * default independently they'd land on two different folders. Both import
 * this helper from the same module, so the default is identical by
 * construction.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export function resolveLocalStorageDir(configured: string): string {
  return path.isAbsolute(configured) ? configured : path.resolve(REPO_ROOT, configured);
}
