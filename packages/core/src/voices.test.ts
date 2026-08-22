/**
 * Voice curation — written against the LIVE account's real shape, measured
 * 2026-08-22: 58 voices, of which 38 are labelled `en`, 10 `de`, 3 `hr`, 1 `sr`,
 * 1 `it`, 1 `sv` and 4 carry no language label at all.
 *
 * The rule these tests defend: a Serbian ad read by an English voice carries an
 * English accent, and the customer must be able to see that before choosing.
 * Nothing may be hidden — the account pays for every voice in it — so the whole
 * job is ranking and labelling.
 */
import { describe, expect, it } from 'vitest';
import { curateVoices, defaultVoiceId, describeVoice, voiceFit, VOICE_FIT_COPY, type RawVoice } from './voices.ts';

const ana: RawVoice = { id: 'ana', name: 'Ana', gender: 'female', language: 'hr', age: 'young', useCase: 'conversational' };
const milance: RawVoice = { id: 'mil', name: 'Milance', gender: 'male', language: 'sr', age: 'middle-aged' };
/** No primary label, Croatian-verified — this is Slobodan on the real account. */
const slobodan: RawVoice = { id: 'slo', name: 'Slobodan', gender: 'male', verifiedLanguages: ['hr', 'hr', 'hr'] };
/** English voice ElevenLabs has verified on Croatian — a real middle tier. */
const adam: RawVoice = { id: 'adam', name: 'Adam', gender: 'male', language: 'en', verifiedLanguages: ['en', 'hr', 'de'] };
const rachel: RawVoice = { id: 'rac', name: 'Rachel', gender: 'female', language: 'en', verifiedLanguages: ['en'] };

describe('voiceFit', () => {
  it('treats sr/hr/bs/me as native', () => {
    expect(voiceFit(ana)).toBe('native');
    expect(voiceFit(milance)).toBe('native');
    expect(voiceFit({ id: 'x', name: 'x', gender: 'male', language: 'bs' })).toBe('native');
  });

  it('an unlabelled voice verified on our language is native, not foreign', () => {
    // Slobodan has no `language` label on the real account. Defaulting a missing
    // label to "foreign" would demote one of the five voices we actually have.
    expect(voiceFit(slobodan)).toBe('native');
  });

  it('a foreign voice verified on our language is its own tier', () => {
    expect(voiceFit(adam)).toBe('verified');
  });

  it('everything else is foreign — including an unlabelled, unverified voice', () => {
    expect(voiceFit(rachel)).toBe('foreign');
    expect(voiceFit({ id: 'x', name: 'x', gender: 'male' })).toBe('foreign');
  });

  it('is case-insensitive about language codes', () => {
    expect(voiceFit({ id: 'x', name: 'x', gender: 'male', language: 'SR' })).toBe('native');
    expect(voiceFit({ id: 'y', name: 'y', gender: 'male', verifiedLanguages: ['HR'] })).toBe('native');
  });
});

describe('describeVoice', () => {
  it('translates what the provider reported, and only that', () => {
    expect(describeVoice(ana)).toBe('ženski · mlad · razgovorni');
    expect(describeVoice(milance)).toBe('muški · srednjih godina');
    // Nothing reported beyond gender ⇒ nothing invented.
    expect(describeVoice(rachel)).toBe('ženski');
  });

  it('drops labels it has no Serbian word for rather than printing English', () => {
    const odd: RawVoice = { id: 'x', name: 'x', gender: 'female', useCase: 'asmr_whatever' };
    expect(describeVoice(odd)).toBe('ženski');
  });
});

describe('curateVoices', () => {
  const mixed = [rachel, adam, milance, ana, slobodan];

  it('ranks native, then verified, then foreign', () => {
    expect(curateVoices(mixed).map((v) => v.fit)).toEqual([
      'native',
      'native',
      'native',
      'verified',
      'foreign',
    ]);
  });

  it('sorts alphabetically inside a group, so the list does not reshuffle between calls', () => {
    // The provider's order is neither stable nor meaningful; two calls that
    // disagree would move the option under the customer's cursor.
    const names = curateVoices(mixed)
      .filter((v) => v.fit === 'native')
      .map((v) => v.name);
    expect(names).toEqual(['Ana', 'Milance', 'Slobodan']);
  });

  it('hides nothing — every voice in the account comes back', () => {
    expect(curateVoices(mixed)).toHaveLength(mixed.length);
  });

  it('carries the description through so the picker never rebuilds it', () => {
    expect(curateVoices([ana])[0].description).toBe('ženski · mlad · razgovorni');
  });
});

describe('defaultVoiceId', () => {
  it('is the best-fitting voice, not whatever the provider listed first', () => {
    // The bug this prevents: the picker defaulted to list[0], which on the real
    // account is an English voice — so a Serbian ad came out with an American
    // accent unless the customer changed it.
    expect(defaultVoiceId([rachel, adam, ana])).toBe('ana');
  });

  it('is undefined for an empty catalogue rather than throwing', () => {
    expect(defaultVoiceId([])).toBeUndefined();
  });
});

describe('VOICE_FIT_COPY', () => {
  it('every tier has Serbian copy, and the foreign one names the accent', () => {
    for (const fit of ['native', 'verified', 'foreign'] as const) {
      expect(VOICE_FIT_COPY[fit].title.length).toBeGreaterThan(0);
      expect(VOICE_FIT_COPY[fit].hint.length).toBeGreaterThan(0);
    }
    expect(VOICE_FIT_COPY.foreign.hint).toContain('naglask');
  });
});
