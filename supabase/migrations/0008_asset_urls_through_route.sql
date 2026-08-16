-- ===========================================================================
-- 0008 — point existing asset urls at our own route instead of the bucket.
--
-- Companion to 26a0f34 (2026-08-16), which stopped `S3CompatibleStorage.upload`
-- returning the bucket's PERMANENT PUBLIC url and made it return
-- `/api/storage/<key>` instead — the same shape MockStorage always returned.
-- That route authorises the caller (an `assets` row they can see under RLS, or
-- their own user id embedded in an `uploads/<uid>/…` key) and then redirects to
-- a signed url that expires within the hour.
--
-- WHY THIS MIGRATION EXISTS: the code change only governs rows written from now
-- on. Every row written BEFORE it still holds `${R2_PUBLIC_URL}/<key}` — an
-- unauthenticated, permanent, guessable url. Those rows are why the bucket
-- cannot simply be made private: closing it would turn each of them into a dead
-- link in "Moje reklame", which is the exact failure class `persistRemoteAsset`
-- was written to prevent.
--
-- So: rewrite them, THEN close the bucket.
--
-- TWO TABLES, NOT ONE. `assets` is the ownership record, but the dashboard and
-- the wizard poller both render `jobs.result -> assets[] -> url`
-- (apps/web/src/app/app/reklame/page.tsx, GET /api/jobs/:id). Rewriting only
-- `assets` would leave every screen a customer actually looks at unchanged.
--
-- SAFETY. The new url is never parsed out of the old one — it is built from
-- `storage_key` / `storageKey`, which is the authoritative key the object was
-- uploaded under. Rows without one (mock results, external urls we never took
-- ownership of) are left exactly as they are: fabricating a key for them would
-- point the route at an object that does not exist. Nothing is deleted, and
-- re-running this migration is a no-op — both statements exclude rows that are
-- already in the target form.
--
-- BEFORE RUNNING, see what it will touch (this changes nothing):
--
--     select id, url, storage_key from public.assets
--      where storage_key is not null and url like 'http%';
--
--     select j.id, e->>'url' as url, e->>'storageKey' as storage_key
--       from public.jobs j, jsonb_array_elements(j.result->'assets') e
--      where jsonb_typeof(j.result->'assets') = 'array'
--        and e->>'storageKey' is not null and e->>'url' like 'http%';
--
-- Written 2026-08-16. NEVER EXECUTED against any database — there is no local
-- Postgres in this repo to run it on, so the SELECTs above are the check.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- 1. The ownership records.
-- --------------------------------------------------------------------------
update public.assets
   set url = '/api/storage/' || storage_key
 where storage_key is not null
   -- Only absolute urls: a row already in the `/api/storage/...` form is done,
   -- and this is what makes the migration re-runnable.
   and url like 'http%'
   and url is distinct from '/api/storage/' || storage_key;

-- --------------------------------------------------------------------------
-- 2. What the customer actually sees.
--
-- `result` is `{"assets":[{"kind":…,"url":…,"storageKey":…}, …]}`. The array is
-- rebuilt element by element, with `with ordinality` + `order by ord` because
-- `jsonb_agg` has no inherent order and the shots in an ad are not a set — a
-- silently reordered array would be a different video.
--
-- An element keeps its url unless it has BOTH a storageKey and an absolute url,
-- which mirrors statement 1 exactly.
-- --------------------------------------------------------------------------
update public.jobs j
   set result = jsonb_set(
         j.result,
         '{assets}',
         (
           select jsonb_agg(
                    case
                      when e->>'storageKey' is not null and e->>'url' like 'http%'
                        then jsonb_set(e, '{url}', to_jsonb('/api/storage/' || (e->>'storageKey')))
                      else e
                    end
                    order by ord
                  )
             from jsonb_array_elements(j.result->'assets') with ordinality as t(e, ord)
         )
       )
 where jsonb_typeof(j.result->'assets') = 'array'
   and exists (
     select 1
       from jsonb_array_elements(j.result->'assets') e
      where e->>'storageKey' is not null
        and e->>'url' like 'http%'
   );
