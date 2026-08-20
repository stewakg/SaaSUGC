-- ===========================================================================
-- 0013 — voice clones, and the consent that has to exist before one does
-- ===========================================================================
--
-- WHY A TABLE AND NOT A CHECKBOX. Cloning a voice means uploading a recording
-- of a real person to a US provider (ElevenLabs) under OUR account. Under GDPR
-- a voiceprint used to identify or synthesise a person is a SPECIAL CATEGORY of
-- personal data (Art. 9) — the kind that needs EXPLICIT consent, not the
-- blanket agreement someone gives by using a website. Explicit consent that
-- cannot be produced later is the same as no consent at all, so the proof is a
-- row: who consented, to what wording, from which address, when.
--
-- THE CLONE LIVES ON OUR ELEVENLABS ACCOUNT, NOT THE CUSTOMER'S. That is the
-- fact that drives most of this file. The operator can see every clone and every
-- generation in the ElevenLabs dashboard; the customer cannot. So:
--   * `provider_voice_id` is the handle we need to DELETE the clone when the
--     customer asks — without it the voice outlives the account, on a third
--     party's servers, which is exactly the deletion failure regulators look for;
--   * `deleted_at` records that we asked for that deletion, because "we deleted
--     it" is a claim we must be able to evidence;
--   * `consent_text` stores the wording SHOWN AT THE TIME, not a pointer to the
--     current terms page. Terms change; what a person agreed to does not.
--
-- WHOSE VOICE IS IT. `subject` distinguishes the customer cloning their OWN
-- voice from cloning someone else's with that person's permission. They are not
-- the same risk: the second one needs consent from a person who never visits our
-- site, which is why `third_party_name` exists and why the app must refuse to
-- proceed without it. This column exists so the distinction is recorded rather
-- than assumed.
--
-- NOT APPLIED, NOT WIRED. No code reads this table yet; it lands before the
-- feature so the feature cannot ship without somewhere to put the consent.
-- ===========================================================================

create table if not exists public.voice_clones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- What the customer calls it in the picker.
  label text not null,

  -- ElevenLabs' voice id. Nullable because the row is written BEFORE the
  -- provider call: consent must be recorded first, and a clone we failed to
  -- create must not leave a row claiming a voice that does not exist.
  provider_voice_id text,
  provider text not null default 'elevenlabs',

  -- 'self' = the customer's own voice. 'third_party' = someone else's, with
  -- that person's permission — which is a different legal footing, so it is a
  -- value here rather than a flag inferred from the presence of a name.
  subject text not null check (subject in ('self', 'third_party')),
  third_party_name text,

  -- The consent record. `consent_text` is the exact wording displayed; storing a
  -- version string instead would leave us unable to say what was agreed once the
  -- terms page changes.
  consent_at timestamptz not null default now(),
  consent_text text not null,
  consent_ip inet,

  created_at timestamptz not null default now(),
  -- When we asked the provider to delete the clone. NOT the same as the row
  -- disappearing: the row is the evidence that the deletion happened.
  deleted_at timestamptz,

  -- A third-party clone without a named subject is not a consent record, it is a
  -- blank. Enforced here so no future code path can write one.
  constraint voice_clones_third_party_needs_name
    check (subject <> 'third_party' or (third_party_name is not null and length(trim(third_party_name)) > 0))
);

create index if not exists voice_clones_user_id_idx on public.voice_clones (user_id);
-- The clones that still exist at the provider — the set that has to be deleted
-- when an account goes away, and the set the operator can see in the dashboard.
create index if not exists voice_clones_live_idx
  on public.voice_clones (user_id)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- RLS. Same posture as every other table here: the browser reads its own rows
-- and writes NONE. Creating a clone spends provider quota and needs the consent
-- record to be trustworthy, so it goes through the service role, like jobs.
-- ---------------------------------------------------------------------------
alter table public.voice_clones enable row level security;

drop policy if exists "voice_clones_select_own" on public.voice_clones;
create policy "voice_clones_select_own" on public.voice_clones
  for select using (auth.uid() = user_id);

-- Deliberately no insert/update/delete policy: a client that could edit its own
-- consent record could also forge one.

-- Verification (run by hand after applying):
--
--   select policyname, cmd from pg_policies where tablename = 'voice_clones';
--   -- expect exactly one row: voice_clones_select_own / SELECT
--
--   insert into public.voice_clones (user_id, label, subject, consent_text)
--   values ('<some-uuid>', 'test', 'third_party', 'x');
--   -- expect ERROR: violates check constraint "voice_clones_third_party_needs_name"
