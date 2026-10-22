-- 0031_locations_reference.sql
-- Local/standalone mirror of the reference-location columns added on the
-- shared Supabase database by
-- infrastructure/supabase/migrations/20261022210000_z_jobs_locations_1_schema_be_lu_v1.sql
-- (official code, alternative name, population, accent-free search key).

alter table locations add column if not exists official_code text;
alter table locations add column if not exists alt_name text;
alter table locations add column if not exists population integer;
alter table locations add column if not exists search_key text;
create unique index if not exists locations_country_official_code_key
  on locations (country_code, official_code) where official_code is not null;
create index if not exists idx_locations_search_key on locations (country_code, search_key);
