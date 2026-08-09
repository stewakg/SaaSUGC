-- =============================================================================
-- 0005_charge_credits_per_stage.sql
--
-- Makes charge_credits safe to call MORE THAN ONCE for the same job, which
-- per-stage billing requires (scripts ~1 credit, audio ~2, video on creation —
-- stop halfway and you pay only that far).
--
-- THE BUG THIS FIXES (latent today, fires the moment a job charges twice):
-- 0001's rollback path deletes by user_id + job_id + reason, not by the row it
-- just inserted, and reason is hardcoded to 'job_spend':
--
--     delete from public.credits_ledger
--      where user_id = p_user_id and job_id = p_job_id and reason = 'job_spend';
--
-- With one charge per job that is harmless. With two, a second call that fails
-- on insufficient balance deletes BOTH ledger rows — the user is silently
-- refunded for the scripts they already received because they ran out of
-- credits for the audio. Balance and ledger then disagree.
--
-- Two changes:
--   1. Capture the inserted row's id and delete exactly that row. Correct
--      regardless of reason, and immune to concurrent charges on the same job.
--   2. Add p_reason so the ledger records WHICH stage was charged. Defaulted to
--      'job_spend' so every existing caller keeps working untouched.
--
-- Idempotent: create or replace, and the old 3-argument signature is dropped
-- explicitly because adding a defaulted parameter creates an OVERLOAD rather
-- than replacing it — leaving both would make `charge_credits(uuid, uuid, int)`
-- ambiguous and every existing call would fail with "function is not unique".
-- =============================================================================

drop function if exists public.charge_credits(uuid, uuid, integer);

create or replace function public.charge_credits(
  p_user_id uuid,
  p_job_id  uuid,
  p_amount  integer,
  p_reason  text default 'job_spend'
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_ledger_id uuid;
begin
  insert into public.credits_ledger (user_id, delta, reason, job_id)
  values (p_user_id, -p_amount, p_reason, p_job_id)
  returning id into v_ledger_id;

  update public.profiles
     set balance = balance - p_amount
   where id = p_user_id
     and balance >= p_amount;  -- never go negative

  if not found then
    -- Balance dropped below the amount (race / concurrent spend). Remove ONLY
    -- the row this call wrote — earlier stages of the same job stay charged,
    -- because the user did receive them.
    delete from public.credits_ledger where id = v_ledger_id;
    raise exception 'insufficient_balance';
  end if;
end $$;

-- Same posture as 0001: only the service role calls this.
revoke all on function public.charge_credits(uuid, uuid, integer, text) from public, anon, authenticated;
