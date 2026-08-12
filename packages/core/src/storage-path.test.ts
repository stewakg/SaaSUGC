import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { resolveLocalStorageDir } from './storage-path.ts';

// Replicate the module's own notion of the monorepo root so the tests can
// assert behavior without depending on the process cwd. storage-path.ts and
// this test file live in the same directory, so the same `../../..` walk lands
// on the same repo root.
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

describe('resolveLocalStorageDir', () => {
  it('passes an absolute path through unchanged', () => {
    // Built with path.resolve so it is absolute on every platform — never
    // hardcode `/tmp/x` or `C:\x`.
    const abs = path.resolve('/tmp/whatever');
    expect(resolveLocalStorageDir(abs)).toBe(abs);
  });

  it('makes a relative path absolute', () => {
    const result = resolveLocalStorageDir('storage');
    expect(path.isAbsolute(result)).toBe(true);
  });

  it('ends with the relative segment it was given', () => {
    const result = resolveLocalStorageDir('storage');
    // Use endsWith so the assertion is platform-agnostic; no hardcoded sep.
    expect(result.endsWith('storage')).toBe(true);
  });

  it('anchors at the monorepo root, not at the process cwd', () => {
    const result = resolveLocalStorageDir('storage');
    const cwdResolved = path.resolve(process.cwd(), 'storage');
    const repoRootResolved = path.resolve(REPO_ROOT, 'storage');

    // The writer (apps/worker) and reader (apps/web) run with different cwds.
    // resolveLocalStorageDir must therefore ignore cwd and always anchor at the
    // repo root. When the tests happen to run FROM the repo root, cwd and
    // REPO_ROOT coincide, so we assert equality with the repo-root path in that
    // case and inequality otherwise — meaningful either way.
    if (process.cwd() === REPO_ROOT) {
      expect(result).toBe(repoRootResolved);
      // sanity: in this case cwd-resolved would coincidentally match too
      expect(result).toBe(cwdResolved);
    } else {
      expect(result).not.toBe(cwdResolved);
      expect(result).toBe(repoRootResolved);
    }
  });

  it('is deterministic: the same input yields the same output', () => {
    const a = resolveLocalStorageDir('storage');
    const b = resolveLocalStorageDir('storage');
    expect(a).toBe(b);
  });

  it('handles "." and "./storage" without throwing and stays absolute', () => {
    const dot = resolveLocalStorageDir('.');
    expect(path.isAbsolute(dot)).toBe(true);

    const rel = resolveLocalStorageDir('./storage');
    expect(path.isAbsolute(rel)).toBe(true);
    expect(rel.endsWith('storage')).toBe(true);
  });
});
