/**
 * Generate a handful of ElevenLabs music + SFX samples so their quality can be
 * judged BY EAR before anything is built on top of them (`TODO.md` §4a).
 *
 * NOT app code and not wired to anything — it sits next to the other kept
 * drivers here (`verify-full-pipeline.mts`, `verify-lambda-presign.mts`) for
 * one specific reason: **it lives in git on purpose.** The first version was
 * written into `scratchpad/`, which is gitignored, while `TODO.md` pointed at
 * it as "ready to run the moment the key lands" — and the key it needs is most
 * likely on the OTHER machine, where a gitignored file does not exist. A
 * document pointing at a file that cannot be there is worse than no document.
 *
 * Output still goes to `scratchpad/audio-samples/` (gitignored): the mp3s are
 * disposable artefacts and have no business in the repository.
 *
 * Reads ELEVENLABS_API_KEY out of the repo-root .env directly rather than
 * taking it as an argument — a key passed on a command line lands in
 * PowerShell's ConsoleHost_history.txt permanently. The value is never printed.
 *
 * ⚠️ Generating samples for internal evaluation is not the same as shipping
 * them to customers. Whether tracks generated here may be embedded in videos
 * DELIVERED to paying customers is an open licence question — see `TODO.md`
 * §4a before this output goes anywhere near a customer-facing feature.
 *
 * Run from the repo root:  node apps/worker/scripts/gen-audio-samples.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// Three levels up from apps/worker/scripts/ — the repo root, where .env lives.
const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const OUT_DIR = path.join(ROOT, 'scratchpad', 'audio-samples');

async function readKey() {
  const env = await readFile(path.join(ROOT, '.env'), 'utf8');
  const line = env.split(/\r?\n/).find((l) => /^\s*ELEVENLABS_API_KEY=/.test(l));
  if (!line) throw new Error('ELEVENLABS_API_KEY not found in .env');
  /**
   * Strip an INLINE COMMENT before anything else. This line in .env is written
   * as `ELEVENLABS_API_KEY=<key>   # note`, and taking everything after the `=`
   * hands the API a key with a comment glued to it — which comes back as a
   * flat `401 invalid_api_key` and looks exactly like a revoked key. Cost one
   * confused round trip; the tell was that the value contained whitespace.
   */
  const value = line
    .slice(line.indexOf('=') + 1)
    .split('#')[0]
    .trim()
    .replace(/^["']|["']$/g, '');
  if (value.length < 10) throw new Error('ELEVENLABS_API_KEY looks empty');
  return value;
}

/**
 * Six moods, chosen against what this product actually sells: short-form ads
 * for Balkan COD e-commerce, where the voiceover is the message and the music
 * is a bed under it. Every one is forced instrumental — a vocal track fights
 * the voice for the same frequencies and the same attention.
 *
 * 15 seconds because that is the middle of the three ad lengths the wizard
 * offers (10/15/30). Long enough to judge, short enough to be cheap.
 */
const MUSIC = [
  ['energetic-pop', 'Upbeat modern pop instrumental, punchy drums, bright synths, confident and commercial, loopable bed for a short product ad'],
  ['urban-trap', 'Modern trap instrumental, deep 808 bass, crisp hi-hats, minimal melody, street fashion energy'],
  ['calm-trust', 'Calm warm instrumental, soft piano and light strings, trustworthy and reassuring, gentle and unobtrusive'],
  ['corporate-clean', 'Clean corporate instrumental, light plucked synth, steady soft beat, neutral and professional, sits under a voiceover'],
  ['playful-fun', 'Playful upbeat instrumental, marimba and claps, cheerful and light, friendly consumer product feel'],
  ['cinematic-build', 'Cinematic instrumental build, soft start rising to a confident hit, dramatic but clean, no vocals'],
];

/** Four short cues. The CTA card is the one place the composition already mounts an SFX. */
const SFX = [
  ['whoosh', 'Short clean whoosh transition, quick air swipe', 1.5],
  ['pop', 'Short soft UI pop, bubbly and light', 1],
  ['ding', 'Bright positive notification ding, single hit, clean', 1.5],
  ['riser', 'Short tension riser building to a soft impact', 2.5],
];

async function post(url, key, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} — ${detail.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const key = await readKey();
  await mkdir(OUT_DIR, { recursive: true });
  let ok = 0;
  let failed = 0;

  for (const [name, prompt] of MUSIC) {
    const started = Date.now();
    try {
      const buf = await post(
        'https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128',
        key,
        { prompt, music_length_ms: 15_000, force_instrumental: true, model_id: 'music_v2' },
      );
      const file = path.join(OUT_DIR, `music-${name}.mp3`);
      await writeFile(file, buf);
      ok++;
      console.log(`OK   music ${name.padEnd(16)} ${(buf.length / 1024).toFixed(0).padStart(5)} KB  ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } catch (err) {
      failed++;
      console.log(`FAIL music ${name.padEnd(16)} ${err.message}`);
    }
  }

  for (const [name, prompt, seconds] of SFX) {
    const started = Date.now();
    try {
      const buf = await post(
        'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',
        key,
        { text: prompt, duration_seconds: seconds, prompt_influence: 0.3 },
      );
      const file = path.join(OUT_DIR, `sfx-${name}.mp3`);
      await writeFile(file, buf);
      ok++;
      console.log(`OK   sfx   ${name.padEnd(16)} ${(buf.length / 1024).toFixed(0).padStart(5)} KB  ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } catch (err) {
      failed++;
      console.log(`FAIL sfx   ${name.padEnd(16)} ${err.message}`);
    }
  }

  console.log(`\n${ok} generated, ${failed} failed → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('fatal:', err.message);
  process.exit(1);
});
