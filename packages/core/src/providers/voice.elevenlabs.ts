/**
 * Real VoiceProvider (F5): ElevenLabs TTS. Persists the returned MP3
 * through the injected Storage so tts() can return a real playable URL
 * (the mock returns a data: URI, which real players can't stream).
 *
 * Written now so it's ready to wire in once ELEVENLABS_API_KEY exists (see
 * ACCOUNTS.md) — never instantiated until then. NOT live-tested. The
 * `speed` field in voice_settings is ElevenLabs' documented speed control
 * (0.7-1.2, default 1.0) — re-verify against current ElevenLabs docs the
 * first time this actually runs against a real account.
 *
 * VoiceProvider.tts()'s return intentionally stays `{audioUrl}` only (no
 * storageKey) — unlike AIProvider/Renderer, nothing in the worker persists
 * a voice `assets` row today (Matrix tracks the tts() call but doesn't mux
 * real audio into the video yet — see runMatrixPipeline's comment in
 * apps/worker/src/index.ts). Revisit if/when that changes.
 */
import type { VoiceProvider, Storage } from '../interfaces.ts';

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
  }): Promise<{ audioUrl: string }> {
    const res = await fetch(`${API_BASE}/text-to-speech/${encodeURIComponent(input.voiceId)}`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.config.apiKey,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
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
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`ElevenLabs TTS failed (${res.status}): ${body}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const key = `voice/${Date.now()}-${input.voiceId}.mp3`;
    const { url } = await this.storage.upload(key, buffer, 'audio/mpeg');
    return { audioUrl: url };
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
      voices: { voice_id: string; name: string; labels?: { gender?: string } }[];
    };
    return json.voices.map((v) => ({ id: v.voice_id, name: v.name, gender: v.labels?.gender ?? 'unknown' }));
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}