-- ============================================================
-- Z FIND — MIGRATION 0003 — Seed official zones (Portugal)
-- ============================================================
-- Source of truth: packages/geography/geography.js (GEOGRAPHY.zones,
-- GEOGRAPHY.cities), cross-checked against
-- packages/import-engine/canonical-store-seed.js's PT rows
-- (PT-1312-04/09/11, PT-1305-02) — both agree exactly on the same 4
-- zones, names, and parent cities. No zone is invented here.
--
-- Only the PT-scoped zones are seeded, matching zones_lite's existing
-- country_iso='PT' usage throughout the project (Zones Lite has never
-- carried the FR zones also present in geography.js's fixture data —
-- those belong to Geography's fuller model, not this simplified
-- table). Every name below is identical across en/pt/fr in
-- geography.js (proper nouns), so there is no locale ambiguity in
-- picking a single `name` value for zones_lite's single text column.
--
-- No existing zones_lite row was found in any prior migration (0001,
-- 0002) — there is no UUID to preserve. `id` is left to its own
-- `default gen_random_uuid()` (migration 0001), exactly as every
-- other seed insert in this project already does (e.g.
-- system_languages).
--
-- Idempotency note: zones_lite (migration 0001) had no unique
-- constraint beyond its primary key `id` — since `id` is never
-- supplied here (left to its default), `on conflict do nothing`
-- would have no real target to match against and would silently
-- insert duplicates on rerun. A unique constraint on
-- (name, city, country_iso) is added to zones_lite itself (not
-- "another table") specifically so the required idempotency is
-- genuine, not cosmetic.
-- ============================================================

alter table zones_lite
  add constraint zones_lite_name_city_country_key unique (name, city, country_iso);

insert into zones_lite (name, city, country_iso) values
  ('Boavista',        'Porto',       'PT'),
  ('Foz do Douro',    'Porto',       'PT'),
  ('Cedofeita',       'Porto',       'PT'),
  ('Matosinhos Sul',  'Matosinhos',  'PT')
on conflict (name, city, country_iso) do nothing;

-- ---------------- Verification ----------------
-- Run after applying:
--
-- select name, city, country_iso from zones_lite where country_iso = 'PT' order by city, name;
-- -- Expected: exactly the 4 rows above, no duplicates.
--
-- select conname from pg_constraint where conname = 'zones_lite_name_city_country_key';
-- -- Expected: 1 row (confirms idempotency is real, not cosmetic).
