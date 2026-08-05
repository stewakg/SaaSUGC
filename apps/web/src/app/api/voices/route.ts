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
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  try {
    const { voice } = createProviders();
    const voices = await voice.listVoices();
    return NextResponse.json({ provider: voice.name, voices });
  } catch (err) {
    console.error('[voices] list failed:', err);
    return NextResponse.json({ error: 'voices_unavailable' }, { status: 502 });
  }
}
