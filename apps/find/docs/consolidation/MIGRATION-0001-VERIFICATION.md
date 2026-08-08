# Migration 0001 — Verification Queries (Revision 6 — corrected)

**Revision 6 fixes two real defects found by the first real execution against Supabase, not by static review:**

1. **TESTS 5/6 expected the wrong outcome.** `anon` has no GRANT of any kind on `leads`/`searches` — a SELECT attempt fails with `permission denied for table X` (SQLSTATE `42501`, `insufficient_privilege`) **before** RLS is even evaluated. The prior revision incorrectly expected "0 rows, no error" (the correct outcome for RLS-filtered SELECTs on a table anon actually has base privilege on — not the case here, by design).
2. **Every "expected failure" test used `SAVEPOINT`/`ROLLBACK TO SAVEPOINT`, which does not work when a whole script is submitted as one batch.** `ROLLBACK TO SAVEPOINT` is a command the *client* must send *after* seeing an error — in a single pasted-and-run script, the batch aborts at the first unhandled error and never reaches it. This is exactly what happened in the real run. Every expected-failure test now uses a PL/pgSQL `DO $$ ... EXCEPTION WHEN ... END $$;` block instead — the exception is caught *inside* the block, by Postgres itself, so the script keeps running regardless of how it's submitted.

Run this as **one continuous script** in the Supabase SQL Editor, top to bottom, after applying the migration. It seeds its own temporary data and **rolls everything back at the end** (one `begin;`, one final `rollback;` — nothing in between commits). Each `DO` block ends with `RAISE NOTICE 'TEST N PASSED: ...'` on success — these appear in the SQL Editor's output/log panel, giving you an auditable, readable trail of exactly which assertions passed, not just an absence of errors.

**One pattern still used for positive existence checks:** `select 1 / count(*) from ...`. If the row is correctly visible, this evaluates to `1` (pass). If it were ever invisible when it shouldn't be, Postgres raises a loud `division by zero` error — deliberately, so a failure can never be silently missed by skimming past a `0`.

**A distinction worth understanding before you run this:** TESTS 5–7 (leads/searches/listings) expect a hard `permission denied` error, because those tables have *no GRANT at all* for anon in this migration. TESTS 23–24 (storage) expect a silent "0 rows, no error" instead, because `storage.objects` is a Supabase-managed table anon already has baseline SELECT on by platform default — RLS is the only gate there, not a missing GRANT. Both behaviors are correct; they arise from different mechanisms. **This second part (Supabase's default storage.objects grant) is standard, expected Supabase behavior, not something verified live from this delivery — if TESTS 21–22 (which expect success) instead return a permission error, tell me immediately; that would be a new, different finding.**

If ANY assertion below fails differently than documented, **stop and tell me before creating real data.**

```sql
begin;

-- ============================================================
-- SETUP — seed one complete, realistic dataset (as the elevated
-- role the SQL Editor runs as by default — postgres, not anon)
-- ============================================================
insert into zones_lite (id, name, city, country_iso)
  values ('a0000000-0000-0000-0000-000000000001', 'Test Zone', 'Porto', 'PT');

insert into partners (id, name, role)
  values ('a0000000-0000-0000-0000-000000000002', 'Test Partner', 'agency');

insert into developments (id, name, zone_lite_id)
  values ('a0000000-0000-0000-0000-000000000003', 'Test Development', 'a0000000-0000-0000-0000-000000000001');

-- A land Property — this INSERT succeeding at all is the real proof
-- the subtype check constraint accepts 'land'.
insert into properties (id, subtype, area_sqm, zone_lite_id)
  values ('a0000000-0000-0000-0000-000000000004', 'land', 3200, 'a0000000-0000-0000-0000-000000000001');

-- An apartment Property, as a unit inside the test Development.
insert into properties (id, subtype, area_sqm, development_id, zone_lite_id)
  values ('a0000000-0000-0000-0000-000000000005', 'apartment', 62, 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001');

-- Representation + Listing for the land Property.
insert into representations (id, target_type, property_id, partner_id, status)
  values ('a0000000-0000-0000-0000-000000000006', 'property', 'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'active');

insert into listings (id, representation_id, channel, price_current, currency_iso, status)
  values ('a0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000006', 'standard', 1450000, 'EUR', 'published');

-- Representation + Listing directly for the Development itself.
insert into representations (id, target_type, development_id, partner_id, status)
  values ('a0000000-0000-0000-0000-000000000008', 'development', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'active');

insert into listings (id, representation_id, channel, price_current, currency_iso, price_is_from, status)
  values ('a0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000008', 'standard', 340000, 'EUR', true, 'published');

-- Localized content, exercising 2 of the 4 translation lifecycle states.
insert into listing_content (listing_id, locale, title, description, translation_status, content_source)
  values ('a0000000-0000-0000-0000-000000000007', 'en', 'Urban Plot', 'A 3,200 sqm plot.', 'approved', 'human');
insert into listing_content (listing_id, locale, title, description, translation_status, content_source)
  values ('a0000000-0000-0000-0000-000000000007', 'pt-PT', 'Lote Urbano', 'Um lote de 3.200 m².', 'ai_generated', 'ai');

-- One media asset, with TWO variants, attached to BOTH a Listing and
-- the Development directly, plus localized alt text in two languages.
insert into media_assets (id, media_type, visibility, original_storage_path, mime_type, width, height)
  values ('a0000000-0000-0000-0000-00000000000a', 'image', 'public', 'listings/plot-01-original.jpg', 'image/jpeg', 4000, 3000);

insert into media_variants (media_asset_id, variant_type, storage_path, mime_type, width, height) values
  ('a0000000-0000-0000-0000-00000000000a', 'thumbnail', 'listings/plot-01-thumb.jpg', 'image/jpeg', 400, 300),
  ('a0000000-0000-0000-0000-00000000000a', 'large',     'listings/plot-01-large.jpg', 'image/jpeg', 1600, 1200);

insert into listing_media (media_asset_id, listing_id, position, is_cover)
  values ('a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000007', 0, true);

insert into development_media (media_asset_id, development_id, position, is_cover)
  values ('a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000003', 0, true);

insert into media_asset_content (media_asset_id, locale, alt_text, caption) values
  ('a0000000-0000-0000-0000-00000000000a', 'en',    'Aerial view of the urban plot', null),
  ('a0000000-0000-0000-0000-00000000000a', 'pt-PT', 'Vista aérea do lote urbano',     null);

-- A draft listing, same representation as the published one above —
-- possible only because it is NOT published (the partial unique index
-- permits many non-published rows per representation).
insert into listings (id, representation_id, channel, price_current, currency_iso, status)
  values ('a0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000006', 'standard', 1450000, 'EUR', 'draft');

-- A lead, to prove anon can insert one but never read any.
insert into leads (listing_id, contact_type, message)
  values ('a0000000-0000-0000-0000-000000000007', 'direct', 'Pre-existing lead, must stay invisible to anon.');

-- ---- Revision 5 fixtures: isolate the development_media storage path ----
insert into media_assets (id, media_type, visibility, original_storage_path, mime_type, width, height)
  values ('a0000000-0000-0000-0000-00000000000c', 'image', 'public', 'developments/dev-only-original.jpg', 'image/jpeg', 3000, 2000);
insert into media_variants (media_asset_id, variant_type, storage_path, mime_type, width, height)
  values ('a0000000-0000-0000-0000-00000000000c', 'thumbnail', 'developments/dev-only-thumb.jpg', 'image/jpeg', 300, 200);
insert into development_media (media_asset_id, development_id, position, is_cover)
  values ('a0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000003', 1, false);

insert into media_assets (id, media_type, visibility, original_storage_path, mime_type)
  values ('a0000000-0000-0000-0000-00000000000d', 'image', 'internal', 'developments/dev-internal-only.jpg', 'image/jpeg');
insert into development_media (media_asset_id, development_id, position)
  values ('a0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-000000000003', 2);

insert into developments (id, name, zone_lite_id)
  values ('a0000000-0000-0000-0000-00000000000e', 'Invisible Development', 'a0000000-0000-0000-0000-000000000001');

insert into media_assets (id, media_type, visibility, original_storage_path, mime_type)
  values ('a0000000-0000-0000-0000-00000000000f', 'image', 'public', 'developments/invisible-dev-photo.jpg', 'image/jpeg');
insert into development_media (media_asset_id, development_id, position)
  values ('a0000000-0000-0000-0000-00000000000f', 'a0000000-0000-0000-0000-00000000000e', 0);

insert into storage.objects (bucket_id, name) values
  ('listing-media', 'developments/dev-only-original.jpg'),
  ('listing-media', 'developments/dev-only-thumb.jpg'),
  ('listing-media', 'developments/dev-internal-only.jpg'),
  ('listing-media', 'developments/invisible-dev-photo.jpg');

-- ============================================================
-- TEST 1 — anon can SELECT a published Property
-- ============================================================
set local role anon;
select 1 / count(*) from properties where id = 'a0000000-0000-0000-0000-000000000004';

-- ============================================================
-- TEST 2 — anon can SELECT a published Development
-- ============================================================
select 1 / count(*) from developments where id = 'a0000000-0000-0000-0000-000000000003';

-- ============================================================
-- TEST 3 — anon can SELECT a published Land listing (via its Property)
-- ============================================================
select 1 / count(*)
from properties p
join representations r on r.property_id = p.id and r.target_type = 'property'
join listings l on l.representation_id = r.id
where p.subtype = 'land' and l.status = 'published' and p.id = 'a0000000-0000-0000-0000-000000000004';

set local role postgres;

-- ============================================================
-- TEST 4 — anon can INSERT a Lead (positive case — no exception expected)
-- ============================================================
set local role anon;
insert into leads (listing_id, contact_type, message)
  values ('a0000000-0000-0000-0000-000000000007', 'direct', 'Test lead from verification script.');
-- Expected: succeeds silently (no error). If it errors, STOP.
set local role postgres;

-- ============================================================
-- TEST 5 — anon cannot SELECT Leads (CORRECTED — expects permission_denied, not empty rows)
-- ============================================================
set local role anon;
DO $$
BEGIN
  PERFORM 1 FROM leads;
  RAISE EXCEPTION 'TEST 5 FAILED: anon SELECT on leads unexpectedly succeeded';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST 5 PASSED: anon SELECT on leads correctly denied (insufficient_privilege / 42501)';
  WHEN OTHERS THEN
    RAISE;
END $$;

-- ============================================================
-- TEST 6 — anon cannot SELECT Searches (CORRECTED — same fix as TEST 5)
-- ============================================================
DO $$
BEGIN
  PERFORM 1 FROM searches;
  RAISE EXCEPTION 'TEST 6 FAILED: anon SELECT on searches unexpectedly succeeded';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST 6 PASSED: anon SELECT on searches correctly denied (insufficient_privilege / 42501)';
  WHEN OTHERS THEN
    RAISE;
END $$;
set local role postgres;

-- ============================================================
-- TEST 7 — anon cannot INSERT or UPDATE Listings (CORRECTED — DO block, not SAVEPOINT)
-- ============================================================
set local role anon;
DO $$
BEGIN
  INSERT INTO listings (representation_id, channel, price_current, currency_iso, status)
    VALUES ('a0000000-0000-0000-0000-000000000006', 'standard', 999999, 'EUR', 'published');
  RAISE EXCEPTION 'TEST 7a FAILED: anon INSERT on listings unexpectedly succeeded';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST 7a PASSED: anon INSERT on listings correctly denied (insufficient_privilege / 42501)';
  WHEN OTHERS THEN
    RAISE;
END $$;

DO $$
BEGIN
  UPDATE listings SET price_current = 1 WHERE id = 'a0000000-0000-0000-0000-000000000007';
  RAISE EXCEPTION 'TEST 7b FAILED: anon UPDATE on listings unexpectedly succeeded';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST 7b PASSED: anon UPDATE on listings correctly denied (insufficient_privilege / 42501)';
  WHEN OTHERS THEN
    RAISE;
END $$;
set local role postgres;

-- ============================================================
-- TEST 8 — inactive Representations are invisible
-- ============================================================
update representations set status = 'ended' where id = 'a0000000-0000-0000-0000-000000000006';
set local role anon;
select count(*) from representations where id = 'a0000000-0000-0000-0000-000000000006';
-- Expected: 0 — even though its Listing is published, an 'ended'
-- Representation must never be visible.
set local role postgres;
update representations set status = 'active' where id = 'a0000000-0000-0000-0000-000000000006'; -- restore for later tests

-- ============================================================
-- TEST 9 — unpublished (draft) Listings are invisible
-- ============================================================
set local role anon;
select count(*) from listings where id = 'a0000000-0000-0000-0000-00000000000b';
-- Expected: 0.
set local role postgres;

-- ============================================================
-- TEST 10 — a second published Listing for the same Representation is rejected (CORRECTED)
-- ============================================================
DO $$
BEGIN
  INSERT INTO listings (representation_id, channel, price_current, currency_iso, status)
    VALUES ('a0000000-0000-0000-0000-000000000006', 'standard', 1500000, 'EUR', 'published');
  RAISE EXCEPTION 'TEST 10 FAILED: duplicate published listing unexpectedly succeeded';
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'TEST 10 PASSED: duplicate published listing correctly rejected (unique_violation / 23505)';
  WHEN OTHERS THEN
    RAISE;
END $$;
-- Run as postgres (not anon) deliberately, to isolate the CONSTRAINT
-- itself from GRANT-level rejection — postgres has full privilege
-- here, so only the unique index can be the cause of a failure.

-- ============================================================
-- TEST 11 — role_table_grants matches the intended least-privilege matrix
-- ============================================================
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
and grantee in ('anon', 'authenticated')
order by grantee, table_name, privilege_type;
-- Expected: authenticated has ZERO rows. anon has SELECT on exactly:
--   system_languages, zones_lite, partners, developments, properties,
--   representations, listings, listing_content, media_assets,
--   media_variants, listing_media, development_media, media_asset_content
-- and INSERT on exactly: leads, searches. Nothing else, for either role.

-- ============================================================
-- TEST 12 — six initial languages exist through configuration
-- ============================================================
set local role anon;
select 1 / count(*) from system_languages where enabled = true; -- proves at least 1 exists (loud if 0)
select count(*) as enabled_language_count from system_languages where enabled = true; -- inspect: expected exactly 6
set local role postgres;

-- ============================================================
-- TEST 13 — a new (7th) language can be added WITHOUT a CHECK
-- constraint change — the core proof of the configurable language model.
-- ============================================================
insert into system_languages (code, display_name, native_name, enabled, sort_order)
  values ('nl', 'Dutch', 'Nederlands', true, 7);

insert into listing_content (listing_id, locale, title, translation_status, content_source)
  values ('a0000000-0000-0000-0000-000000000007', 'nl', 'Stedelijk Perceel', 'ai_generated', 'ai');

select 1 / count(*) from listing_content where listing_id = 'a0000000-0000-0000-0000-000000000007' and locale = 'nl';
-- Expected: 1 — the 7th language's content row exists, with zero DDL
-- between TEST 12 and here — only two INSERTs.

-- ============================================================
-- TEST 14 — listing currency is mandatory (CORRECTED — DO blocks)
-- ============================================================
DO $$
BEGIN
  INSERT INTO listings (representation_id, channel, price_current, status)
    VALUES ('a0000000-0000-0000-0000-000000000006', 'standard', 500000, 'published');
  RAISE EXCEPTION 'TEST 14a FAILED: missing currency unexpectedly succeeded';
EXCEPTION
  WHEN not_null_violation THEN
    RAISE NOTICE 'TEST 14a PASSED: missing currency correctly rejected (not_null_violation / 23502)';
  WHEN OTHERS THEN
    RAISE;
END $$;

DO $$
BEGIN
  INSERT INTO listings (representation_id, channel, price_current, currency_iso, status)
    VALUES ('a0000000-0000-0000-0000-000000000006', 'standard', 500000, 'euros', 'published');
  RAISE EXCEPTION 'TEST 14b FAILED: invalid currency format unexpectedly succeeded';
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE 'TEST 14b PASSED: invalid currency format correctly rejected (check_violation / 23514)';
  WHEN OTHERS THEN
    RAISE;
END $$;

-- ============================================================
-- TEST 15 — a Media Asset can be linked to a Listing
-- ============================================================
set local role anon;
select 1 / count(*)
from listing_media
where media_asset_id = 'a0000000-0000-0000-0000-00000000000a'
and listing_id = 'a0000000-0000-0000-0000-000000000007';

-- ============================================================
-- TEST 16 — a Media Asset can be linked to a Development
-- ============================================================
select 1 / count(*)
from development_media
where media_asset_id = 'a0000000-0000-0000-0000-00000000000a'
and development_id = 'a0000000-0000-0000-0000-000000000003';

-- ============================================================
-- TEST 17 — one asset may have multiple derived variants
-- ============================================================
select 1 / count(*) from media_variants where media_asset_id = 'a0000000-0000-0000-0000-00000000000a';
select count(*) as variant_count from media_variants where media_asset_id = 'a0000000-0000-0000-0000-00000000000a'; -- inspect: expected exactly 2

-- ============================================================
-- TEST 18 — localized media ALT text is supported (2 languages, same asset)
-- ============================================================
select 1 / count(*) from media_asset_content where media_asset_id = 'a0000000-0000-0000-0000-00000000000a';
select count(*) as alt_text_locale_count from media_asset_content where media_asset_id = 'a0000000-0000-0000-0000-00000000000a'; -- inspect: expected exactly 2
set local role postgres;

-- ============================================================
-- TEST 19 — translation lifecycle states are valid
-- ============================================================
insert into listing_content (listing_id, locale, title, translation_status, content_source)
  values
    ('a0000000-0000-0000-0000-000000000009', 'fr', 'Test Missing', 'missing', 'human'),
    ('a0000000-0000-0000-0000-000000000009', 'es', 'Test Reviewed', 'reviewed', 'human');
-- Expected: succeeds — 'missing' and 'reviewed' are both accepted.

DO $$
BEGIN
  INSERT INTO listing_content (listing_id, locale, title, translation_status)
    VALUES ('a0000000-0000-0000-0000-000000000009', 'de', 'Test Bad State', 'in_progress');
  RAISE EXCEPTION 'TEST 19b FAILED: invalid translation_status unexpectedly succeeded';
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE 'TEST 19b PASSED: invalid translation_status correctly rejected (check_violation / 23514)';
  WHEN OTHERS THEN
    RAISE;
END $$;

-- ============================================================
-- TEST 20 — publication lifecycle states are valid
-- ============================================================
insert into listings (representation_id, channel, price_current, currency_iso, status)
  values
    ('a0000000-0000-0000-0000-000000000008', 'standard', 1, 'EUR', 'incomplete'),
    ('a0000000-0000-0000-0000-000000000008', 'standard', 1, 'EUR', 'pending_review'),
    ('a0000000-0000-0000-0000-000000000008', 'standard', 1, 'EUR', 'ready'),
    ('a0000000-0000-0000-0000-000000000008', 'standard', 1, 'EUR', 'suspended'),
    ('a0000000-0000-0000-0000-000000000008', 'standard', 1, 'EUR', 'archived');
-- Expected: succeeds — all 5 non-published, non-draft states accepted.

DO $$
BEGIN
  INSERT INTO listings (representation_id, channel, price_current, currency_iso, status)
    VALUES ('a0000000-0000-0000-0000-000000000008', 'standard', 1, 'EUR', 'unpublished');
  RAISE EXCEPTION 'TEST 20b FAILED: invalid publication status unexpectedly succeeded';
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE 'TEST 20b PASSED: invalid publication status correctly rejected (check_violation / 23514)';
  WHEN OTHERS THEN
    RAISE;
END $$;

-- ============================================================
-- TEST 21 — a Development-only ORIGINAL file is authorized via storage
-- ============================================================
set local role anon;
select 1 / count(*) from storage.objects where bucket_id = 'listing-media' and name = 'developments/dev-only-original.jpg';

-- ============================================================
-- TEST 22 — a Development-only DERIVED VARIANT is authorized via storage
-- ============================================================
select 1 / count(*) from storage.objects where bucket_id = 'listing-media' and name = 'developments/dev-only-thumb.jpg';

-- ============================================================
-- TEST 23 — an INTERNAL Media Asset remains unauthorized via storage
-- ============================================================
select count(*) from storage.objects where bucket_id = 'listing-media' and name = 'developments/dev-internal-only.jpg';
-- Expected: 0 rows, no error (RLS-filtered — see the note at the top
-- of this document on why this differs from TEST 5/6's hard denial).

-- ============================================================
-- TEST 24 — an asset attached only to an INVISIBLE Development remains unauthorized
-- ============================================================
select count(*) from storage.objects where bucket_id = 'listing-media' and name = 'developments/invisible-dev-photo.jpg';
-- Expected: 0 rows, no error.
set local role postgres;

-- ============================================================
-- Discard everything — nothing from this script is left behind.
-- ============================================================
rollback;
```

## What each result tells you

| Test | Proves |
|---|---|
| 1–3 | Public property/development/land lookup works |
| 4 | Anon can insert a Lead |
| 5–6 | Leads/Searches SELECT correctly denied at the privilege level (`permission denied`), not merely RLS-filtered |
| 7 | Anon has no write path to Listings at all (`permission denied`) |
| 8 | Inactive Representations stay invisible even behind a published Listing |
| 9 | Draft Listings stay invisible |
| 10 | Duplicate published Listing per Representation is structurally impossible (`unique_violation`) |
| 11 | Grants match the exact intended matrix, nothing more |
| 12–13 | Six languages exist via configuration; a 7th requires data only, never a schema change |
| 14 | Currency is mandatory (`not_null_violation`) and format-validated (`check_violation`) |
| 15–18 | Media foundation: Listing linkage, Development linkage, multiple variants, localized alt text |
| 19–20 | Translation and publication lifecycle states are exactly the approved sets (`check_violation` for anything else) |
| 21–24 | Development-attached media is authorized at the Storage layer, not just in the database; internal-visibility and invisible-Development cases remain correctly denied |
