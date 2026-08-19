/**
 * Generate a short Serbian preview line for EVERY ElevenLabs voice the account
 * offers and store each mp3 in R2 under `previews/voices/<voiceId>.mp3`, where
 * the wizard's ▶ button plays it (owner asked 2026-08-19: "za sve glasove
 * treba da ima preview dugme").
 *
 * Kept in git next to the other drivers for the same reason as
 * gen-audio-samples.mjs: a gitignored script cannot exist on the other machine.
 *
 * Reads ELEVENLABS_API_KEY and the R2_* values out of the repo-root .env
 * directly (same inline-comment-stripping lesson as gen-audio-samples.mjs —
 * a key with a comment glued on comes back as 401 invalid_api_key). Values are
 * never printed.
 *
 * IDEMPOTENT: a voice whose preview object already exists in R2 is skipped, so
 * re-running after new voices are added generates only the missing ones.
 * Cost: one TTS call is ~35 chars of eleven_multilingual_v2 — the whole
 * catalogue is well under a thousand characters.
 *
 * Run from the repo root:  node apps/worker/scripts/gen-voice-previews.mjs
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

// @aws-sdk/client-s3 is a dependency of @adgen/core, not of the worker, so pnpm
// does not make it resolvable from this directory — borrow core's resolution.
const requireFromCore = createRequire(path.join(ROOT, 'packages', 'core', 'package.json'));
const { S3Client, PutObjectCommand, HeadObjectCommand } = requireFromCore('@aws-sdk/client-s3');
const PREVIEW_TEXT = 'Ovako bi zvučala vaša reklama.';

async function readEnv() {
  const raw = await readFile(path.join(ROOT, '.env'), 'utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].split('#')[0].trim().replace(/^["']|["']$/g, '');
  }
  for (const name of ['ELEVENLABS_API_KEY', 'R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) {
    if (!out[name] || out[name].length < 5) throw new Error(`${name} missing/empty in .env`);
  }
  return out;
}

async function main() {
  const env = await readEnv();
  const s3 = new S3Client({
    region: 'auto',
    endpoint: env.R2_ENDPOINT,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });

  const voicesRes = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
  });
  if (!voicesRes.ok) throw new Error(`voices list failed: ${voicesRes.status}`);
  const { voices } = await voicesRes.json();
  console.log(`${voices.length} voices in the catalogue`);

  let made = 0;
  let skipped = 0;
  let failed = 0;
  for (const v of voices) {
    const key = `previews/voices/${v.voice_id}.mp3`;
    try {
      await s3.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
      skipped++;
      console.log(`SKIP ${v.name.padEnd(20)} (already in R2)`);
      continue;
    } catch {
      // not there yet — generate it
    }
    const started = Date.now();
    try {
      const ttsRes = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${v.voice_id}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({ text: PREVIEW_TEXT, model_id: 'eleven_multilingual_v2' }),
        },
      );
      if (!ttsRes.ok) throw new Error(`${ttsRes.status} ${(await ttsRes.text().catch(() => '')).slice(0, 200)}`);
      const buf = Buffer.from(await ttsRes.arrayBuffer());
      await s3.send(
        new PutObjectCommand({
          Bucket: env.R2_BUCKET,
          Key: key,
          Body: buf,
          ContentType: 'audio/mpeg',
        }),
      );
      made++;
      console.log(`OK   ${v.name.padEnd(20)} ${(buf.length / 1024).toFixed(0).padStart(4)} KB  ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } catch (err) {
      failed++;
      console.log(`FAIL ${v.name.padEnd(20)} ${err.message}`);
    }
  }
  console.log(`\n${made} generated, ${skipped} skipped, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('fatal:', err.message);
  process.exit(1);
});
