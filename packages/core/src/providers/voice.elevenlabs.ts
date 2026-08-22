/**
 * Real VoiceProvider (F5): ElevenLabs TTS. Persists the returned MP3
 * through the injected Storage so tts() can return a real playable URL
 * (the mock returns a data: URI, which real players can't stream).
 *
 * ✅ LIVE-TESTED: listVoices() + tts() against a real account 2026-07-19 (58
 * voices, a real Serbian MP3 on disk); the `/with-timestamps` variant used here
 * was probed live 2026-08-05 and its `alignment` block folds cleanly into Serbian
 * word timings, diacritics included. The `speed` field in voice_settings is
 * ElevenLabs' documented speed control (0.7-1.2, default 1.0) — verified.
 *
 * tts() returns no `storageKey` (unlike AIProvider/Renderer) because nothing
 * persists a voice `assets` row — the audio is referenced by url straight from
 * the render. Revisit if voice assets ever need to be listed or cleaned up.
 */
import type { VoiceProvider, Storage } from '../interfaces.ts';
import type { CaptionWord } from '../types.ts';

const API_BASE = 'https://api.elevenlabs.io/v1';

export class ElevenLabsVoiceProvider implements VoiceProvider {
  readonly name = 'elevenlabs-voice';

  constructor(
    private readonly config: { apiKey: string },
    private readonly storage: Storage,
  ) {}

  async tts(input: {
    script: string;
    voiceId: string;
    model: string;
    stability: number;
    speed: number;
    language: string;
  }): Promise<{ audioUrl: string; durationSec?: number; words?: CaptionWord[] }> {
    // `/with-timestamps` returns JSON (base64 audio + character alignment) rather
    // than raw audio bytes, which is what lets captions follow the real speech
    // instead of an even-spread estimate. Verified against the live API 2026-08-05.
    const res = await fetch(
      `${API_BASE}/text-to-speech/${encodeURIComponent(input.voiceId)}/with-timestamps`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.config.apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: input.script,
          model_id: input.model || 'eleven_multilingual_v2',
          voice_settings: {
            stability: clamp(input.stability, 0, 1),
            similarity_boost: 0.75,
            speed: clamp(input.speed, 0.7, 1.2),
          },
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`ElevenLabs TTS failed (${res.status}): ${body}`);
    }

    const json = (await res.json()) as {
      audio_base64?: string;
      alignment?: {
        characters?: string[];
        character_start_times_seconds?: number[];
        character_end_times_seconds?: number[];
      };
    };

    if (!json.audio_base64) {
      throw new Error('ElevenLabs TTS returned no audio_base64');
    }

    const buffer = Buffer.from(json.audio_base64, 'base64');
    const key = `voice/${Date.now()}-${input.voiceId}.mp3`;
    const { url } = await this.storage.upload(key, buffer, 'audio/mpeg');

    const words = foldAlignmentIntoWords(json.alignment);
    const durationSec = words.length > 0 ? words[words.length - 1].endSec : undefined;
    return { audioUrl: url, durationSec, words: words.length > 0 ? words : undefined };
  }

  async listVoices(): Promise<{ id: string; name: string; gender: string }[]> {
    const res = await fetch(`${API_BASE}/voices`, {
      headers: { 'xi-api-key': this.config.apiKey },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`ElevenLabs list voices failed (${res.status}): ${body}`);
    }
    const json = (await res.json()) as {
      voices: {
        voice_id: string;
        name: string;
        labels?: { gender?: string; language?: string; accent?: string; age?: string; use_case?: string };
        verified_languages?: { language?: string }[];
      }[];
    };
    /**
     * The labels are carried through rather than flattened away, because they
     * are what tells a Serbian customer that an English voice will read their
     * ad with an English accent (see curateVoices). Measured on the live
     * account 2026-08-22: 38 of 58 voices are `en`, 10 are `de`, and only 5 are
     * ours — which the picker had no way to show.
     *
     * `verified_languages` repeats a language once per sample, so it is
     * de-duplicated here; callers only ever ask "is our language in there".
     */
    return json.voices.map((v) => ({
      id: v.voice_id,
      name: v.name,
      gender: v.labels?.gender ?? 'unknown',
      language: v.labels?.language,
      accent: v.labels?.accent,
      age: v.labels?.age,
      useCase: v.labels?.use_case,
      verifiedLanguages: [
        ...new Set((v.verified_languages ?? []).map((l) => l.language).filter((l): l is string => Boolean(l))),
      ],
    }));
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * ElevenLabs reports alignment per CHARACTER; captions need it per WORD. Walk the
 * characters, break on whitespace, and take each word's start from its first char
 * and its end from its last. Returns [] if the response carried no usable
 * alignment, which the caller treats as "fall back to estimated timings".
 */
function foldAlignmentIntoWords(alignment?: {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
}): CaptionWord[] {
  const chars = alignment?.characters;
  const starts = alignment?.character_start_times_seconds;
  const ends = alignment?.character_end_times_seconds;
  if (!chars || !starts || !ends) return [];
  if (chars.length !== starts.length || chars.length !== ends.length) return [];

  const words: CaptionWord[] = [];
  let text = '';
  let startSec = 0;
  for (let i = 0; i < chars.length; i++) {
    if (/\s/.test(chars[i])) {
      if (text) words.push({ text, startSec, endSec: ends[i - 1] });
      text = '';
      continue;
    }
    if (!text) startSec = starts[i];
    text += chars[i];
  }
  if (text) words.push({ text, startSec, endSec: ends[chars.length - 1] });
  return words;
}
