/**
 * Real local Renderer (F4): bundles /remotion once per process, renders a
 * composition to a real mp4 via @remotion/renderer, and persists it through
 * the injected Storage provider. No account needed — this is what makes
 * Matrix "mock AI, REAL render" possible in dev.
 *
 * Server-only (worker). The render call is deliberately abstracted behind
 * the same `Renderer` interface as MockRenderer/Remotion Lambda (F5), so
 * swapping to Lambda later is a factory change, not a pipeline rewrite.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import type { Renderer, Storage } from '../interfaces.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const REMOTION_ENTRY = path.join(REPO_ROOT, 'remotion', 'src', 'index.ts');

let bundlePromise: Promise<string> | null = null;

/** Bundles the /remotion project once per process and reuses it for every render. */
function getBundleUrl(): Promise<string> {
  bundlePromise ??= bundle({ entryPoint: REMOTION_ENTRY, onProgress: () => {} });
  return bundlePromise;
}

export class LocalRemotionRenderer implements Renderer {
  readonly name = 'local-remotion-renderer';

  constructor(private readonly storage: Storage) {}

  async render(input: {
    composition: string;
    props: Record<string, unknown>;
  }): Promise<{ videoUrl: string; storageKey: string }> {
    const serveUrl = await getBundleUrl();

    const composition = await selectComposition({
      serveUrl,
      id: input.composition,
      inputProps: input.props,
    });

    const outDir = await mkdtemp(path.join(os.tmpdir(), 'adgen-render-'));
    const fileName = `${input.composition}-${Date.now()}.mp4`;
    const outputLocation = path.join(outDir, fileName);

    try {
      await renderMedia({
        composition,
        serveUrl,
        codec: 'h264',
        outputLocation,
        inputProps: input.props,
      });

      const data = await readFile(outputLocation);
      const storageKey = `renders/${fileName}`;
      const { url } = await this.storage.upload(storageKey, data, 'video/mp4');
      return { videoUrl: url, storageKey };
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }
}
