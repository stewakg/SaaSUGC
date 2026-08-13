/**
 * Unit tests for resolveVoiceId + buildImageAdsPrompt (see cline-prompt-voiceprompt.md).
 *
 * resolveVoiceId is injected with a fake voice so no real ElevenLabs call is
 * made. buildImageAdsPrompt is pure. The module under test is READ-ONLY here —
 * a failing test is a finding to report, never a reason to edit index.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveVoiceId, buildImageAdsPrompt } from './index.ts';

describe('resolveVoiceId', () => {
  const voices = [
    { id: 'a', name: 'A', gender: 'f' },
    { id: 'b', name: 'B', gender: 'm' },
  ];

  it('returns the requested id unchanged when it is offered by the provider', async () => {
    const fake = { name: 'fake-voice', listVoices: vi.fn().mockResolvedValue(voices) };
    // Use 'b' (present but NOT first) so this distinguishes "honoured the request"
    // from "fell back to voices[0]" — with 'a' both branches return the same value.
    await expect(resolveVoiceId('b', fake)).resolves.toBe('b');
  });

  it('falls back to the first voice when the requested id is not in the catalogue', async () => {
    const fake = { name: 'fake-voice', listVoices: vi.fn().mockResolvedValue(voices) };
    await expect(resolveVoiceId('stale', fake)).resolves.toBe('a');
  });

  it('falls back to the first voice when the requested id is undefined', async () => {
    const fake = { name: 'fake-voice', listVoices: vi.fn().mockResolvedValue(voices) };
    await expect(resolveVoiceId(undefined, fake)).resolves.toBe('a');
  });

  it('returns the requested id (or empty string) when the catalogue is empty', async () => {
    const fake = { name: 'fake-voice', listVoices: vi.fn().mockResolvedValue([]) };
    await expect(resolveVoiceId('whatever', fake)).resolves.toBe('whatever');
    await expect(resolveVoiceId(undefined, fake)).resolves.toBe('');
  });

  it('passes the requested id through (or empty string) when listVoices throws', async () => {
    const fake = {
      name: 'fake-voice',
      listVoices: vi.fn().mockRejectedValue(new Error('down')),
    };
    await expect(resolveVoiceId('keepme', fake)).resolves.toBe('keepme');
    await expect(resolveVoiceId(undefined, fake)).resolves.toBe('');
  });
});

describe('buildImageAdsPrompt', () => {
  it('composes full params in order with " · " separators', () => {
    expect(
      buildImageAdsPrompt(
        { productTitle: 'Masažer', price: '2999 RSD', offerNotes: 'Akcija', language: 'sr' },
        0,
      ),
    ).toBe('AI SLIKA #1 · Masažer · 2999 RSD · Akcija · [sr]');
  });

  it('uses a 1-based index in the label', () => {
    expect(
      buildImageAdsPrompt(
        { productTitle: 'Masažer', price: '2999 RSD', offerNotes: 'Akcija', language: 'sr' },
        4,
      ),
    ).toBe('AI SLIKA #5 · Masažer · 2999 RSD · Akcija · [sr]');
  });

  it('drops blank/missing optional fields and defaults title to Proizvod and language to sr', () => {
    expect(buildImageAdsPrompt({}, 0)).toBe('AI SLIKA #1 · Proizvod · [sr]');
  });

  it('treats whitespace-only fields as blank', () => {
    expect(buildImageAdsPrompt({ productTitle: '   ', price: '  ' }, 0)).toBe(
      'AI SLIKA #1 · Proizvod · [sr]',
    );
  });

  it('uses a provided non-default language', () => {
    expect(buildImageAdsPrompt({ productTitle: 'X', language: 'en' }, 0)).toBe(
      'AI SLIKA #1 · X · [en]',
    );
  });
});
