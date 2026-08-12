/**
 * POST /api/generate-scripts — writes ad-script candidates for the wizard to
 * show BEFORE a job is submitted.
 *
 * Why it lives here and not in the worker: the alternative is a two-phase job
 * (a new `jobs` status, a worker state machine, polling) to pause after script
 * generation and wait for approval. Generating in the wizard and passing the
 * approved scripts in the job's `params` gets the same product for a fraction
 * of the work — the worker just uses `params.scripts` when present.
 *
 * It also fixes an ordering problem in the product: charging is
 * charge-on-success for the whole job, so today a user pays 15 credits and
 * only then sees the script. A script costs about a cent to write; letting the
 * user approve it first is strictly better for both sides.
 *
 * Speaker gender is resolved HERE, from the voice id, rather than trusted from
 * the client. Serbian marks gender on past tense and adjectives, so a script
 * written for the wrong voice is unusable — and the wizard has already dropped
 * this field once (it fetched `gender` from /api/voices and discarded it while
 * mapping). Server-side resolution means that class of bug can't come back.
 *
 * NOT CHARGED YET. Scripts are meant to cost ~1 credit, but `charge_credits`
 * cannot safely be called twice for one job — its rollback deletes by
 * user_id + job_id + reason rather than by the row it inserted, so a later
 * failed charge would refund this one. That needs migration 0005 first; see
 * INFRASTRUCTURE.md F5.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createProviders } from '@adgen/core';
import type { SpeakerGender } from '@adgen/core';
import { createServerClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';
import { toAdSeconds } from '@adgen/core';

/** Enough candidates that one is usable, few enough to actually read. */
const MAX_COUNT = 8;
const DEFAULT_COUNT = 5;
const PRODUCT_MAX_CHARS = 200;
const BENEFITS_MAX_CHARS = 500;

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // Tighter than /api/jobs: this spends real provider money on every call and
  // regeneration is a single click, so it is the easiest endpoint to run up.
  const rl = await rateLimit(`scripts:${user.id}`, 6, 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'rate_limited', retryAfterSeconds: rl.resetSeconds }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const product = str(body.product).slice(0, PRODUCT_MAX_CHARS);
  if (!product) {
    return NextResponse.json({ error: 'missing_product' }, { status: 400 });
  }

  const count = clampCount(body.count);
  const voiceId = str(body.voiceId);

  try {
    const { script, voice } = createProviders();
    const speakerGender = voiceId ? await resolveGender(voice.listVoices(), voiceId) : undefined;

    const { variants } = await script.generateVariants({
      product,
      benefits: str(body.benefits).slice(0, BENEFITS_MAX_CHARS),
      tone: str(body.tone) || 'energičan',
      language: str(body.language) || 'srpski',
      style: str(body.style) || 'UGC',
      // Written FOR the length the user chose, not a fixed 15s — the wizard
      // shows these scripts for approval, so a mismatch here would have the
      // user approving a 15s script and receiving a 10s ad.
      durations: [toAdSeconds(body.targetSeconds)],
      count,
      speakerGender,
    });

    // `speakerGender` is echoed so the wizard can say which voice the copy was
    // written for — and so a mismatch is visible rather than silent.
    return NextResponse.json({ variants, speakerGender: speakerGender ?? null, provider: script.name });
  } catch (err) {
    console.error('[generate-scripts] failed:', err);
    return NextResponse.json({ error: 'script_generation_failed' }, { status: 502 });
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function clampCount(raw: unknown): number {
  const n = typeof raw === 'number' ? Math.floor(raw) : DEFAULT_COUNT;
  if (!Number.isFinite(n) || n < 1) return DEFAULT_COUNT;
  return Math.min(n, MAX_COUNT);
}

/**
 * Providers report gender as a free-form label (ElevenLabs passes through
 * `labels.gender`), so anything outside male/female — including a missing
 * label on a cloned voice — yields undefined and the prompt stays neutral.
 * Guessing would be worse: a script in the wrong gender is unusable, while a
 * neutral one is merely less colourful.
 *
 * A failed voice lookup must not fail the whole request either — scripts in
 * the model's default gender still beat an error page.
 */
async function resolveGender(
  voicesPromise: Promise<{ id: string; gender: string }[]>,
  voiceId: string,
): Promise<SpeakerGender | undefined> {
  try {
    const voices = await voicesPromise;
    const g = voices.find((v) => v.id === voiceId)?.gender?.toLowerCase();
    return g === 'male' || g === 'female' ? g : undefined;
  } catch (err) {
    console.warn('[generate-scripts] voice lookup failed, writing gender-neutral copy:', err);
    return undefined;
  }
}
