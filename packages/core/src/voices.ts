/* ============================================================================
   Which voices a Serbian customer should actually be offered, and in what order
   ============================================================================
   Written 2026-08-22, after asking the live ElevenLabs account what is in it
   rather than assuming. The account holds 58 voices. Their `language` labels:

       en 38 · de 10 · hr 3 · sr 1 · it 1 · sv 1 · (none) 4

   So FIVE of the fifty-eight are ours — Ana, Zlata S (hr), Milance (sr),
   Milovan (hr), Slobodan (no primary label but Croatian-verified). Every other
   voice is an English or German actor whose model can pronounce Serbian, and
   it does so WITH THAT ACTOR'S ACCENT.

   That is a product problem, not a sorting problem. A customer picking "Adam -
   American, Dark and Tough" for a Balkan COD ad gets an American accent reading
   Serbian, and until now nothing on the screen said so — the picker listed all
   58 in whatever order the API returned, under names like
   "Mathew - Audiobook-Story-Children's".

   THE RULE HERE: never hide a voice, always rank and label it. A hard allowlist
   would be wrong twice over — it would silently drop voices the owner paid for
   and added to the account, and it would need editing every time he adds one.
   Instead every voice is scored by how close it is to speaking Serbian
   natively, and the UI groups by that score.

   `verified_languages` is the second signal and the reason this is not just a
   label check: several foreign voices carry a verified `hr` entry, meaning
   ElevenLabs has confirmed the model handles Croatian on that voice. Those are
   a genuine middle tier — better than an unverified English voice, worse than
   a native one.
   ========================================================================== */

/** Languages whose speakers a Serbian ad can use without an audible foreign accent. */
const NATIVE_LANGUAGES = new Set(['sr', 'hr', 'bs', 'me']);

/**
 * How well a voice fits a Serbian ad. Higher is better; the UI groups on it and
 * the default pick is simply the best-scoring voice.
 */
export type VoiceFit = 'native' | 'verified' | 'foreign';

export interface RawVoice {
  id: string;
  name: string;
  gender: string;
  /** ElevenLabs `labels.language`. */
  language?: string;
  /** ElevenLabs `labels.accent`. */
  accent?: string;
  /** ElevenLabs `labels.age`. */
  age?: string;
  /** ElevenLabs `labels.use_case`. */
  useCase?: string;
  /** Distinct languages from `verified_languages`. */
  verifiedLanguages?: string[];
}

export interface CuratedVoice extends RawVoice {
  fit: VoiceFit;
  /** Serbian one-liner for the picker: who this voice sounds like. */
  description: string;
}

/** Serbian labels for the metadata ElevenLabs reports in English. */
const GENDER_SR: Record<string, string> = {
  female: 'ženski',
  male: 'muški',
  neutral: 'neutralan',
};

const AGE_SR: Record<string, string> = {
  young: 'mlad',
  middle_aged: 'srednjih godina',
  'middle-aged': 'srednjih godina',
  old: 'stariji',
};

const USE_CASE_SR: Record<string, string> = {
  conversational: 'razgovorni',
  social_media: 'za društvene mreže',
  advertisement: 'reklamni',
  narrative_story: 'pripovedački',
  informative_educational: 'informativni',
  characters_animation: 'karakterni',
  entertainment_tv: 'televizijski',
};

/**
 * Score one voice.
 *
 * A missing `language` label is NOT treated as foreign-by-default: several
 * voices in this account carry no primary label at all (Slobodan is one) and are
 * still Croatian. The verified list decides those.
 */
export function voiceFit(v: RawVoice): VoiceFit {
  const language = (v.language ?? '').toLowerCase();
  if (NATIVE_LANGUAGES.has(language)) return 'native';
  const verified = (v.verifiedLanguages ?? []).map((l) => l.toLowerCase());
  if (verified.some((l) => NATIVE_LANGUAGES.has(l))) {
    // No primary language but a native verified one means the label is missing,
    // not that the voice is foreign.
    return language === '' ? 'native' : 'verified';
  }
  return 'foreign';
}

/** "ženski · mlad · razgovorni" — only the parts the provider actually reported. */
export function describeVoice(v: RawVoice): string {
  const parts = [
    GENDER_SR[(v.gender ?? '').toLowerCase()],
    AGE_SR[(v.age ?? '').toLowerCase()],
    USE_CASE_SR[(v.useCase ?? '').toLowerCase()],
  ].filter((p): p is string => Boolean(p));
  return parts.join(' · ');
}

const FIT_ORDER: Record<VoiceFit, number> = { native: 0, verified: 1, foreign: 2 };

/**
 * Rank the account's voices for a Serbian customer: native first, then the ones
 * ElevenLabs has verified on a native language, then everyone else. Within a
 * group the order is alphabetical, so the list does not reshuffle between calls
 * — the API returns them in an order that is not stable and not meaningful.
 *
 * Nothing is dropped. The customer keeps every voice the account pays for; the
 * UI is responsible for saying what the groups mean.
 */
export function curateVoices(voices: RawVoice[]): CuratedVoice[] {
  return voices
    .map((v) => ({ ...v, fit: voiceFit(v), description: describeVoice(v) }))
    .sort((a, b) => {
      const byFit = FIT_ORDER[a.fit] - FIT_ORDER[b.fit];
      if (byFit !== 0) return byFit;
      return a.name.localeCompare(b.name, 'sr');
    });
}

/**
 * The voice a wizard should start on: the best-fitting one available.
 *
 * Until now the default was whatever the provider listed first, which on this
 * account is an English voice — so the out-of-the-box experience for a Serbian
 * ad was a foreign accent, chosen by nobody.
 */
export function defaultVoiceId(voices: RawVoice[]): string | undefined {
  return curateVoices(voices)[0]?.id;
}

/** Serbian heading + explanation for each group, so the UI never invents its own. */
export const VOICE_FIT_COPY: Record<VoiceFit, { title: string; hint: string }> = {
  native: {
    title: 'Naši glasovi',
    hint: 'Govore srpski/hrvatski kao maternji — bez stranog naglaska.',
  },
  verified: {
    title: 'Provereni za naš jezik',
    hint: 'Strani glasovi koje je provajder potvrdio za naš jezik. Naglasak je blag, ali postoji.',
  },
  foreign: {
    title: 'Strani glasovi',
    hint: 'Izgovaraju srpski, ali sa naglaskom jezika iz kog dolaze. Poslušaj pre nego što izabereš.',
  },
};
