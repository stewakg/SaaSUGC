/**
 * Unit tests for ElevenLabsVoiceProvider (F5).
 *
 * Why this file exists: ElevenLabsVoiceProvider is LIVE-TESTED against a real
 * account, but the branches that guard against bad inputs — clamping, missing
 * alignment, mismatched array lengths, non-ok responses — only matter when
 * something goes wrong, and the live account is healthy. These tests pin every
 * branch with a faked fetch and a fake Storage; no socket is ever opened.
 *
 * Isolation notes (same discipline as renderer.lambda.test.ts):
 *  - globalThis.fetch is replaced with a vi.fn() in beforeEach and restored in
 *    afterEach alongside vi.restoreAllMocks(). A leaked mock would silently
 *    route every later file's fetch through this stub.
 *  - The fake Storage.upload is a vi.fn() so both its return value (the cdn url)
 *    and its arguments (key, decoded buffer, content type) can be asserted.
 *  - No real network call is ever made.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ElevenLabsVoiceProvider } from './voice.elevenlabs.ts';
import type { Storage } from '../interfaces.ts';
import type { CaptionWord } from '../types.ts';

// The url our fake Storage hands back from upload(). A sentinel on a domain that
// is NOT the ElevenLabs API, so asserting it proves ownership transferred.
const STORAGE_URL = 'https://cdn.example.invalid/voice/x.mp3';

/**
 * Build a minimal fake Response shape. ElevenLabsVoiceProvider reads `.ok`,
 * `.status`, `.text()` (on error) and `.json()` (on success) — never the body
 * stream — so this object is enough without constructing a real Response.
 */
function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** A Response whose text() returns an arbitrary string (for error bodies). */
function textResponse(text: string, status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({ text }),
    text: async () => text,
  } as unknown as Response;
}

describe('ElevenLabsVoiceProvider', () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;
  let storage: Storage;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    storage = {
      name: 'fake-storage',
      upload: vi.fn().mockResolvedValue({ url: STORAGE_URL }),
      getUrl: vi.fn().mockReturnValue(STORAGE_URL),
    } as unknown as Storage;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  /** Default base input for tts(); individual tests override fields. */
  function ttsInput(overrides: Partial<Parameters<ElevenLabsVoiceProvider['tts']>[0]> = {}) {
    return {
      script: 'ab cd',
      voiceId: 'VOICEID',
      model: 'eleven_multilingual_v2',
      stability: 0.5,
      speed: 1.0,
      language: 'sr',
      ...overrides,
    };
  }


  // -------------------------------------------------------------------------
  // tts()
  // -------------------------------------------------------------------------

  describe('tts()', () => {
    it('1. success with alignment folds characters into words, sets durationSec and audioUrl', async () => {
      const audioBase64 = Buffer.from('hi').toString('base64');
      fetchMock.mockResolvedValue(
        jsonResponse({
          audio_base64: audioBase64,
          alignment: {
            characters: ['a', 'b', ' ', 'c', 'd'],
            character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4],
            character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5],
          },
        }),
      );

      const provider = new ElevenLabsVoiceProvider({ apiKey: 'test-key' }, storage);
      const result = await provider.tts(ttsInput());

      expect(result.words).toEqual<CaptionWord[]>([
        { text: 'ab', startSec: 0, endSec: 0.2 },
        { text: 'cd', startSec: 0.3, endSec: 0.5 },
      ]);
      expect(result.durationSec).toBe(0.5);
      expect(result.audioUrl).toBe(STORAGE_URL);
    });

    it('2. storage.upload is called once with the decoded audio, a voice/<ts>-<voiceId>.mp3 key and audio/mpeg', async () => {
      const audioBase64 = Buffer.from('hi').toString('base64');
      fetchMock.mockResolvedValue(
        jsonResponse({
          audio_base64: audioBase64,
          alignment: {
            characters: ['a', 'b', ' ', 'c', 'd'],
            character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4],
            character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5],
          },
        }),
      );

      const provider = new ElevenLabsVoiceProvider({ apiKey: 'test-key' }, storage);
      await provider.tts(ttsInput({ voiceId: 'VOICEID' }));

      expect(storage.upload).toHaveBeenCalledTimes(1);
      const [key, body, contentType] = (storage.upload as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(key).toMatch(/^voice\/\d+-VOICEID\.mp3$/);
      expect(Buffer.isBuffer(body)).toBe(true);
      expect(body).toEqual(Buffer.from(audioBase64, 'base64'));
      expect(contentType).toBe('audio/mpeg');
    });

    it('3. voice_settings clamps stability/speed and empty model falls back to eleven_multilingual_v2', async () => {
      // First call: high out-of-range values clamp to the maximums.
      fetchMock.mockResolvedValueOnce(jsonResponse({ audio_base64: Buffer.from('a').toString('base64') }));
      const provider = new ElevenLabsVoiceProvider({ apiKey: 'test-key' }, storage);
      await provider.tts(ttsInput({ stability: 5, speed: 9, model: '' }));

      const bodyHigh = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(bodyHigh.voice_settings.stability).toBe(1);
      expect(bodyHigh.voice_settings.speed).toBe(1.2);
      expect(bodyHigh.voice_settings.similarity_boost).toBe(0.75);
      expect(bodyHigh.model_id).toBe('eleven_multilingual_v2');

      // Second call: low out-of-range values clamp to the minimums.
      fetchMock.mockResolvedValueOnce(jsonResponse({ audio_base64: Buffer.from('b').toString('base64') }));
      await provider.tts(ttsInput({ stability: -3, speed: 0.1 }));

      const bodyLow = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(bodyLow.voice_settings.stability).toBe(0);
      expect(bodyLow.voice_settings.speed).toBe(0.7);
    });

    it('4. voiceId is URL-encoded in the endpoint', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ audio_base64: Buffer.from('a').toString('base64') }));
      const provider = new ElevenLabsVoiceProvider({ apiKey: 'test-key' }, storage);

      await provider.tts(ttsInput({ voiceId: 'a b/c' }));

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('text-to-speech/a%20b%2Fc/with-timestamps');
    });

    it('5. response without alignment yields no words and no durationSec, but still the storage url', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ audio_base64: Buffer.from('a').toString('base64') }));
      const provider = new ElevenLabsVoiceProvider({ apiKey: 'test-key' }, storage);

      const result = await provider.tts(ttsInput());

      expect(result.words).toBeUndefined();
      expect(result.durationSec).toBeUndefined();
      expect(result.audioUrl).toBe(STORAGE_URL);
    });

    it('6. mismatched alignment array lengths is treated as no alignment', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          audio_base64: Buffer.from('a').toString('base64'),
          alignment: {
            characters: ['a', 'b', 'c'],
            character_start_times_seconds: [0, 0.1, 0.2],
            character_end_times_seconds: [0.1, 0.2], // length 2, not 3
          },
        }),
      );
      const provider = new ElevenLabsVoiceProvider({ apiKey: 'test-key' }, storage);

      const result = await provider.tts(ttsInput());

      expect(result.words).toBeUndefined();
    });

    it('7. non-ok response rejects with status and body, and does not upload', async () => {
      fetchMock.mockResolvedValue(textResponse('rate limited', 429));
      const provider = new ElevenLabsVoiceProvider({ apiKey: 'test-key' }, storage);

      await expect(provider.tts(ttsInput())).rejects.toThrow(/429/);
      await expect(provider.tts(ttsInput())).rejects.toThrow(/rate limited/);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('8. ok response with no audio_base64 rejects and does not upload', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}));
      const provider = new ElevenLabsVoiceProvider({ apiKey: 'test-key' }, storage);

      await expect(provider.tts(ttsInput())).rejects.toThrow(/no audio_base64/);
      expect(storage.upload).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // listVoices()
  // -------------------------------------------------------------------------

  describe('listVoices()', () => {
    it('9. maps voice_id/name/labels and defaults gender to unknown; url ends with /voices and carries xi-api-key', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          voices: [
            { voice_id: 'v1', name: 'Ana', labels: { gender: 'female' } },
            { voice_id: 'v2', name: 'Marko' },
          ],
        }),
      );
      const provider = new ElevenLabsVoiceProvider({ apiKey: 'test-key' }, storage);

      const voices = await provider.listVoices();

      expect(voices).toEqual([
        { id: 'v1', name: 'Ana', gender: 'female' },
        { id: 'v2', name: 'Marko', gender: 'unknown' },
      ]);

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url.endsWith('/voices')).toBe(true);
      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers['xi-api-key']).toBe('test-key');
    });

    it('10. non-ok listVoices rejects with the status', async () => {
      fetchMock.mockResolvedValue(textResponse('unauthorized', 401));
      const provider = new ElevenLabsVoiceProvider({ apiKey: 'test-key' }, storage);

      await expect(provider.listVoices()).rejects.toThrow(/401/);
    });
  });
});

