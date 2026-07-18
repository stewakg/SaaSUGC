-- =============================================================================
-- 0002_add_credits_function.sql — atomic credit top-up.
-- Mirrors charge_credits: inserts a ledger row AND updates the cached balance
-- in ONE transaction. Used by the dev-only "add credits" mock-billing route
-- (F1) and, later, the real Lemon Squeezy webhook handler (F6) — a client
-- read-then-write (SELECT balance, UPDATE balance = old + amount) loses
-- updates under concurrent requests; this doesn't.
-- =============================================================================
create or replace function public.add_credits(
  p_user_id uuid,
  p_amount  integer,
  p_reason  text
) returns integer language plpgsql security definer set search_path = public as $$
declare
  new_balance integer;
begin
  insert into public.credits_ledger (user_id, delta, reason, job_id)
  values (p_user_id, p_amount, p_reason, null);

  update public.profiles
     set balance = balance + p_amount
   where id = p_user_id
   returning balance into new_balance;

  return new_balance;
end $$;

-- Grant execute to the service role (anon/authenticated never need this).
revoke all on function public.add_credits(uuid, integer, text) from public, anon, authenticated;
