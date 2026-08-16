-- ===========================================================================
-- 0010 — reserve credits at enqueue, so concurrent jobs cannot overspend.
--
-- THE HOLE THIS CLOSES. Credits are charged on SUCCESS, in the worker, minutes
-- after the job was enqueued. `POST /api/jobs` therefore admitted work against
-- a balance nobody had touched yet: a user with 15 credits could enqueue
-- fifteen 15-credit matrix jobs inside one rate-limit window, all fifteen ran
-- the real pipeline — ElevenLabs characters, Lambda invocations, kie/fal images
-- — and only the first `charge_credits` could succeed. `charge_credits`
-- protects the USER from going negative; nothing protected the COMPANY from
-- paying fifteen providers for one sale.
--
-- 35bdf4c fixed the wide version of this in the app: the route sums the cost of
-- the caller's queued+running jobs and requires the balance to cover that plus
-- the new job. That killed the minutes-long window. What it cannot kill is the
-- millisecond one — two requests that read the same in-flight set before either
-- inserts — because a check in application code is not a lock.
--
-- This migration adds the lock. `reserve_credits` takes the profile row's write
-- lock, so two concurrent calls are serialised by Postgres and the second sees
-- the first one's hold.
--
-- WHY A SEPARATE TABLE rather than a balance decrement: a hold is not a charge.
-- The customer has not bought anything yet, the job may fail (and then must not
-- be billed), and `credits_ledger` is an audit trail of money that actually
-- moved. Mixing a provisional amount into either would make both lie.
--
-- EXPIRY IS LOAD-BEARING. A worker that is killed mid-job never releases its
-- hold, and without expiry that user's credits would be frozen forever by a
-- crash. Holds therefore carry `expires_at` and anything past it is ignored and
-- swept opportunistically. One hour is comfortably longer than the slowest
-- render observed (90.7s end to end) and short enough that a crash costs the
-- customer one hour, not their balance.
-- ===========================================================================

create table if not exists public.credits_holds (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  -- One hold per job, enforced: a retry that reserved twice would double-count
  -- against the balance and lock the customer out of their own credits.
  job_id     uuid not null unique,
  amount     integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 hour'
);

-- The only query that matters: "what does this user currently have on hold".
create index if not exists credits_holds_user_idx
  on public.credits_holds (user_id, expires_at);

-- Same posture as every other money table: RLS on, and NO policies at all, so
-- the client roles cannot read or write it. Every access is service-role or a
-- SECURITY DEFINER function.
alter table public.credits_holds enable row level security;

-- ---------------------------------------------------------------------------
-- reserve_credits — the actual lock.
--
-- Returns true when the hold was placed, false when the balance cannot cover
-- it. FALSE IS NOT AN ERROR: a caller out of credits is an ordinary 402, not an
-- exception, and raising here would make the route's error path hard to tell
-- from a real database failure.
-- ---------------------------------------------------------------------------
create or replace function public.reserve_credits(
  p_user_id uuid,
  p_job_id  uuid,
  p_amount  integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_held    integer;
begin
  if p_amount is null or p_amount <= 0 then
    return false;
  end if;

  -- Serialises concurrent reservations for THIS user. Everything below runs
  -- with the row lock held, which is the whole point of the function.
  select balance into v_balance
    from public.profiles
   where id = p_user_id
   for update;

  if v_balance is null then
    return false;
  end if;

  -- Opportunistic sweep: expired holds belong to jobs whose worker died. Doing
  -- it here rather than in a scheduled task means the cleanup happens exactly
  -- when someone needs the credits back.
  delete from public.credits_holds
   where user_id = p_user_id
     and expires_at <= now();

  select coalesce(sum(amount), 0) into v_held
    from public.credits_holds
   where user_id = p_user_id;

  if v_balance - v_held < p_amount then
    return false;
  end if;

  insert into public.credits_holds (user_id, job_id, amount)
  values (p_user_id, p_job_id, p_amount)
  on conflict (job_id) do nothing;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- release_credits — drop a hold, whatever the job's outcome was.
--
-- Called after a successful charge (the money moved, the hold has done its job)
-- and after a failure (nothing was charged, the credits go back to available).
-- Idempotent on purpose: a retry that releases twice must be a no-op, not an
-- error, because the retry path is exactly where a crash leaves things unclear.
-- ---------------------------------------------------------------------------
create or replace function public.release_credits(p_job_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.credits_holds where job_id = p_job_id;
$$;

-- Neither function is for clients. Same revoke pattern as add_credits /
-- charge_credits: only the service role (and other SECURITY DEFINER code) may
-- call them.
revoke all on function public.reserve_credits(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.release_credits(uuid) from public, anon, authenticated;

-- Confirm after applying — both must return zero rows:
--
--   select grantee, privilege_type from information_schema.routine_privileges
--    where routine_name in ('reserve_credits','release_credits')
--      and grantee in ('anon','authenticated');
--
--   select policyname from pg_policies where tablename = 'credits_holds';
