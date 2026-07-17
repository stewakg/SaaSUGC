-- =============================================================================
-- 0001_init_schema.sql — core domain tables (INFRASTRUCTURE.md §3)
-- Tables: profiles, credits_ledger, jobs, assets.
-- Includes: enums, indexes, RLS policies, the signup-bonus trigger, and the
-- atomic charge-on-success function used by the worker.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type job_type   as enum ('matrix','edit','image_ads','mix','quick_test','translate','enhance','remove_text','ai_video');
exception when duplicate_object then null; end $$;

do $$ begin
  create type job_status as enum ('queued','running','done','error');
exception when duplicate_object then null; end $$;

do $$ begin
  create type asset_kind as enum ('video','image','audio');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  balance     integer not null default 0,  -- cached running total of credits_ledger
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- credits_ledger  (delta int: +topup / -spend). Balance = sum(deltas).
-- ---------------------------------------------------------------------------
create table if not exists public.credits_ledger (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  delta       integer not null,
  reason      text not null,
  job_id      uuid,
  created_at  timestamptz not null default now()
);

create index if not exists credits_ledger_user_idx     on public.credits_ledger(user_id, created_at desc);
create index if not exists credits_ledger_job_idx      on public.credits_ledger(job_id) where job_id is not null;

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------
create table if not exists public.jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        job_type   not null,
  status      job_status not null default 'queued',
  params      jsonb      not null default '{}'::jsonb,
  result      jsonb,
  cost        integer    not null default 0,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists jobs_user_status_idx on public.jobs(user_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- assets
-- ---------------------------------------------------------------------------
create table if not exists public.assets (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  kind         asset_kind not null,
  storage_key  text not null,
  url          text not null,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists assets_job_idx  on public.assets(job_id);
create index if not exists assets_user_idx on public.assets(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at trigger for jobs
-- ---------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at before update on public.jobs
  for each row execute function public.tg_set_updated_at();

-- ===========================================================================
-- ROW LEVEL SECURITY
-- Users can read/write only their own rows. Worker uses the service-role key,
-- which bypasses RLS — so it can update any job. Never expose that key client-side.
-- ===========================================================================
alter table public.profiles       enable row level security;
alter table public.credits_ledger enable row level security;
alter table public.jobs           enable row level security;
alter table public.assets         enable row level security;

-- profiles: a user sees only their own profile.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- credits_ledger: read own; no direct inserts by client (server/worker only).
drop policy if exists "ledger_select_own" on public.credits_ledger;
create policy "ledger_select_own" on public.credits_ledger
  for select using (auth.uid() = user_id);

-- jobs: read own. Inserts/updates are done via service-role (worker) or RPC,
-- not by direct client writes, to enforce the balance/charge rules.
drop policy if exists "jobs_select_own" on public.jobs;
create policy "jobs_select_own" on public.jobs
  for select using (auth.uid() = user_id);

-- assets: read own.
drop policy if exists "assets_select_own" on public.assets;
create policy "assets_select_own" on public.assets
  for select using (auth.uid() = user_id);

-- ===========================================================================
-- SIGNUP BONUS: on new auth.users row → create profile with 3 free credits.
-- INFRASTRUCTURE §3: profiles.balance default 3 (free credits on signup).
-- We grant via the ledger so the total is always reconstructable.
-- ===========================================================================
create or replace function public.signup_bonus_credits()
returns integer language sql as $$ select 3; $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  bonus integer;
begin
  bonus := public.signup_bonus_credits();

  insert into public.profiles (id, email, balance)
  values (new.id, coalesce(new.email, ''), bonus)
  on conflict (id) do nothing;

  insert into public.credits_ledger (user_id, delta, reason, job_id)
  values (new.id, bonus, 'signup_bonus', null);

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- CHARGE-ON-SUCCESS (atomic, SECURITY DEFINER, called by the worker via RPC).
-- Inserts a negative ledger row AND updates the cached balance in ONE tx.
-- Fails if it would drive the balance negative (defensive; shouldn't happen
-- because we check balance on enqueue, but guards against races).
-- ===========================================================================
create or replace function public.charge_credits(
  p_user_id uuid,
  p_job_id  uuid,
  p_amount  integer
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.credits_ledger (user_id, delta, reason, job_id)
  values (p_user_id, -p_amount, 'job_spend', p_job_id);

  update public.profiles
     set balance = balance - p_amount
   where id = p_user_id
     and balance >= p_amount;  -- never go negative

  if not found then
    -- balance dropped below amount (race / concurrent spend). Refund the ledger
    -- row we just wrote and raise so the caller knows it didn't charge.
    delete from public.credits_ledger
     where user_id = p_user_id and job_id = p_job_id and reason = 'job_spend';
    raise exception 'insufficient_balance';
  end if;
end $$;

-- Grant execute to the service role (anon/authenticated never need this).
revoke all on function public.charge_credits(uuid, uuid, integer) from public, anon, authenticated;
-- (service_role bypasses grants; no explicit grant needed, but keep it minimal.)