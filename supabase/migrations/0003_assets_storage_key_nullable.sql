-- =============================================================================
-- 0003_assets_storage_key_nullable.sql
-- storage_key is only meaningful when the asset was actually uploaded to our
-- Storage provider. Mock/placeholder assets (and, from F5 on, AI-provider
-- results served straight from the provider's own CDN) have no key of ours —
-- forcing a fabricated one made the column lie rather than describe reality.
-- =============================================================================
alter table public.assets alter column storage_key drop not null;
