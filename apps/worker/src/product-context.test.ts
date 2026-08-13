/**
 * Unit tests for describeProductImage — the seam that lets the script model
 * actually SEE the product photo instead of writing from a title and a price
 * (see cline-prompt-vision-wire.md).
 *
 * The helper is injected with a fake script provider, exactly the way
 * voice-prompt.test.ts injects a fake voice into resolveVoiceId — so no vision
 * model is ever called. The module under test is READ-ONLY here: a failing test
 * is a finding to report, never a reason to edit index.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { describeProductImage } from './index.ts';

describe('describeProductImage', () => {
  it('returns "" and does NOT call describeImage when there are no sourceImages', async () => {
    const describeImage = vi.fn();
    await expect(describeProductImage({}, 'sr', { describeImage })).resolves.toBe('');
    expect(describeImage).not.toHaveBeenCalled();
  });

  it('skips empty/blank image entries and returns "" without calling describeImage', async () => {
    const describeImage = vi.fn();
    await expect(
      describeProductImage({ sourceImages: ['', '   '] }, 'sr', { describeImage }),
    ).resolves.toBe('');
    expect(describeImage).not.toHaveBeenCalled();
  });

  it('uses the FIRST usable image, calling describeImage once with that url and the language', async () => {
    const describeImage = vi.fn().mockResolvedValue('opis slike');
    const result = await describeProductImage(
      { sourceImages: ['', 'https://img/a.png', 'https://img/b.png'] },
      'sr',
      { describeImage },
    );
    expect(result).toBe('opis slike');
    expect(describeImage).toHaveBeenCalledTimes(1);
    expect(describeImage).toHaveBeenCalledWith('https://img/a.png', 'sr');
  });

  it('trims surrounding whitespace from the description before returning it', async () => {
    const describeImage = vi.fn().mockResolvedValue('  masazer za vrat \n');
    await expect(
      describeProductImage({ sourceImages: ['https://img/a.png'] }, 'sr', { describeImage }),
    ).resolves.toBe('masazer za vrat');
  });

  it('degrades to "" when the provider has no describeImage (a future provider might not)', async () => {
    // A provider object that simply lacks describeImage; the helper must not throw.
    await expect(describeProductImage({ sourceImages: ['https://img/a.png'] }, 'sr', {})).resolves.toBe('');
  });

  it('degrades to "" and does NOT throw when describeImage itself throws — a vision hiccup must never fail a paid job', async () => {
    const describeImage = vi.fn().mockRejectedValue(new Error('vision down'));
    await expect(
      describeProductImage({ sourceImages: ['https://img/a.png'] }, 'sr', { describeImage }),
    ).resolves.toBe('');
  });

  it('ignores a non-array sourceImages and returns "" without calling describeImage', async () => {
    const describeImage = vi.fn();
    await expect(
      describeProductImage({ sourceImages: 'nope' }, 'sr', { describeImage }),
    ).resolves.toBe('');
    expect(describeImage).not.toHaveBeenCalled();
  });
});
