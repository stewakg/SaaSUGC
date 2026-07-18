-- =============================================================================
-- 0004_billing_idempotency.sql — idempotent credit top-up keyed on an external
-- reference (e.g. a Lemon Squeezy order id), so a payment webhook delivered more
-- than once (Lemon Squeezy is at-least-once + retries on non-2xx) grants credits
-- EXACTLY once. Without this a retried/replayed paid webhook double-grants.
-- =============================================================================

alter table public.credits_ledger add column if not exists external_ref text;

-- At most one ledger row per external_ref; rows without one (job spends, dev
-- top-ups, signup bonus) stay unconstrained.
create unique index if not exists credits_ledger_external_ref_key
  on public.credits_ledger (external_ref) where external_ref is not null;

create or replace function public.add_credits_idempotent(
  p_user_id uuid,
  p_amount  integer,
  p_reason  text,
  p_external_ref text
) returns integer language plpgsql security definer set search_path = public as $$
declare
  new_balance integer;
begin
  -- The unique index on external_ref is the guard: a duplicate delivery raises
  -- unique_violation on insert and we no-op (return current balance).
  begin
    insert into public.credits_ledger (user_id, delta, reason, job_id, external_ref)
    values (p_user_id, p_amount, p_reason, null, p_external_ref);
  exception when unique_violation then
    select balance into new_balance from public.profiles where id = p_user_id;
    return new_balance;
  end;

  update public.profiles
     set balance = balance + p_amount
   where id = p_user_id
   returning balance into new_balance;

  return new_balance;
end $$;

revoke all on function public.add_credits_idempotent(uuid, integer, text, text) from public, anon, authenticated;