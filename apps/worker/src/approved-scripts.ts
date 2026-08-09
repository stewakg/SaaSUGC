/**
 * Validation for scripts the user approved in the wizard and sent along in a
 * job's `params`.
 *
 * This input is UNTRUSTED. It arrives from the browser through POST /api/jobs
 * like any other param, so it gets validated the same way rather than being
 * spread into the pipeline on faith — a malformed entry here would otherwise
 * surface as a crash deep inside the render, long after the credits check.
 *
 * The length cap is a cost control, not tidiness: ElevenLabs bills per
 * character, so an unbounded `script` field is a direct route from a crafted
 * request to a large TTS bill — multiplied by `count`, which can be 15.
 */
import type { SpeakerGender } from '@adgen/core';

export interface ApprovedScript {
  angle: string;
  script: string;
  estDurationSec: number;
}

/**
 * ~2000 characters is roughly two minutes of speech — far beyond any ad, and
 * generous enough that a legitimate edit never hits it.
 */
export const MAX_SCRIPT_CHARS = 2000;

/**
 * Returns the usable approved scripts, or null when there are none — null means
 * "generate normally", so a malformed payload degrades to the old behaviour
 * instead of failing the job.
 *
 * Individual bad entries are dropped rather than rejecting the whole batch: if
 * four of five scripts are fine, the user gets four videos, not an error.
 */
export function approvedScripts(raw: unknown): ApprovedScript[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const out: ApprovedScript[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;

    const script = typeof e.script === 'string' ? e.script.trim() : '';
    if (!script) continue;

    out.push({
      script: script.slice(0, MAX_SCRIPT_CHARS),
      angle: typeof e.angle === 'string' && e.angle.trim() ? e.angle.trim() : 'korisnikova skripta',
      estDurationSec:
        typeof e.estDurationSec === 'number' && e.estDurationSec > 0 ? e.estDurationSec : 15,
    });
  }

  return out.length > 0 ? out : null;
}

/** Narrows an untrusted param to the gender union; anything else means "no instruction". */
export function speakerGenderOf(raw: unknown): SpeakerGender | undefined {
  return raw === 'male' || raw === 'female' ? raw : undefined;
}
