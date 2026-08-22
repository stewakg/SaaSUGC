/**
 * GET /api/voices — lists the voices the ACTIVE voice provider actually offers.
 *
 * Exists because the Matrix wizard used to hardcode the mock provider's ids
 * (`voice_srp_f1`, …). That was harmless while Matrix forced MockVoiceProvider,
 * but once it moved to the real provider (`eae4b4c`) those ids became invalid —
 * ElevenLabs answers `404 voice_not_found` and the whole job fails. The list has
 * to come from whichever provider is actually configured, so it can never drift
 * from what the worker will call.
 *
 * Auth'd: the voice catalogue is account data, not public.
 */
import { NextResponse } from 'next/server';
import { createProviders } from '@adgen/core';
import { curateVoices } from '@adgen/core/voices';
import { createServerClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // Every call reaches ElevenLabs, whose quota is billed and finite. Generous,
  // because the wizard legitimately fetches this on mount — but not unbounded,
  // or one signed-in user holding a page open in a reload loop can exhaust the
  // account's provider quota for everyone.
  const rl = await rateLimit(`voices:${user.id}`, 30, 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'rate_limited', retryAfterSeconds: rl.resetSeconds }, { status: 429 });
  }

  try {
    const { voice } = createProviders();
    /**
     * Curated here rather than in the browser: the ranking is a product rule
     * (native voices first, foreign accents last and labelled), and every
     * wizard that lists voices must get the same order. Doing it client-side
     * would leave each page free to disagree.
     */
    const voices = curateVoices(await voice.listVoices());
    return NextResponse.json({ provider: voice.name, voices });
  } catch (err) {
    console.error('[voices] list failed:', err);
    return NextResponse.json({ error: 'voices_unavailable' }, { status: 502 });
  }
}
