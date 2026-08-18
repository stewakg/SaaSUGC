import { defineConfig } from 'vitest/config';

/**
 * This package had no vitest config until the 2.1.9 → 3.2.7 upgrade, and it
 * exists for exactly one reason: `testTimeout`.
 *
 * Vitest 3's cold transform is measurably slower here (9.92 s cold vs 2.87 s
 * warm on the same machine), and `factory.test.ts`'s empty-env case — which
 * lazily imports every provider module — crossed the 5 s default on a cold
 * cache while passing in 2438 ms warm. A test that fails only when the cache is
 * empty is worse than a slow one: CI compiles cold on every single run, so it
 * would fail there and pass on every developer's retry, which is the exact
 * shape of a flake nobody trusts.
 *
 * 20 s is not a licence for slow tests. It is a ceiling well above the measured
 * cold worst case (7188 ms) and still low enough that a genuinely hung test
 * fails the run instead of occupying it.
 */
export default defineConfig({
  test: {
    testTimeout: 20_000,
  },
});
