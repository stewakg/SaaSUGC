-- ===========================================================================
-- 0007 — stop a user granting themselves credits.
--
-- FOUND 2026-08-13 by the security audit, and it was exploitable from a browser
-- console with nothing but a normal logged-in session.
--
-- `profiles` holds `balance`, and 0001 shipped this policy:
--
--     create policy "profiles_update_own" on public.profiles
--       for update using (auth.uid() = id) with check (auth.uid() = id);
--
-- RLS is row-level, not column-level, so "you may update your own row" means
-- "you may update your own BALANCE". Any authenticated user could run
--
--     supabase.from('profiles').update({ balance: 999999 })
--
-- and then spend it: POST /api/jobs admits a job whenever `profile.balance >=
-- cost`, and the worker charges on success against that same cached total. The
-- cost of that is not credits — it is real money at ElevenLabs, OpenRouter,
-- kie.ai/fal.ai and Lambda, per video, for as long as nobody notices.
--
-- Nothing legitimate is lost by closing it: NOTHING in the codebase writes to
-- `profiles` from a client. It is read in exactly two places (the balance shown
-- in the app shell, and the balance check in /api/jobs). Every real write goes
-- through the service role (worker) or a SECURITY DEFINER RPC (add_credits,
-- add_credits_idempotent, charge_credits), and both bypass RLS by design.
--
-- Two independent locks, because one is a policy and the other is a grant:
--   1. drop the update policy — no client UPDATE is permitted at all;
--   2. revoke the column privileges anyway, so re-adding a policy later (or an
--      over-broad one written in a hurry) still cannot move `balance`.
-- ===========================================================================

drop policy if exists "profiles_update_own" on public.profiles;

-- Defence in depth: even WITH a permissive policy, these columns stay read-only
-- to the client roles. `id` is in the list because a row whose id could be
-- rewritten is a row that could be pointed at somebody else's profile.
revoke update (balance, id) on public.profiles from anon, authenticated;

-- Nothing else about the table changes: the select policy from 0001
-- ("profiles_select_own") is untouched, so a user still reads their own row and
-- only their own row.
