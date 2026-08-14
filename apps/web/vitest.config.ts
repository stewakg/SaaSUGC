import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * The web suite is API-route tests plus a handful of pure library modules, and
 * those want a NODE environment — a real `Request`/`Response`, no `window`. So
 * node stays the default here, and the few tests that genuinely need a DOM opt
 * in per file with:
 *
 *   // @vitest-environment jsdom
 *
 * Doing it the other way round — jsdom everywhere — would put a fake `window`
 * under three hundred route tests that have no use for one, and jsdom's
 * `fetch`/`Request` shims differ from Node's in ways that would quietly change
 * what those tests are asserting.
 *
 * `jsdom` is a devDependency and exists for exactly one reason: `FileDropzone`
 * is the component that decides whether a dragged file is accepted, it ships on
 * six wizards, and there was no way to execute it at all. A component that has
 * never run is not a tested component.
 */
export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
