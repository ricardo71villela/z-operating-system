# Sprint B — Week 1 Execution Guide (run this on your Mac, not in any sandbox)

> **Scope of migration 0001 — read this first.**
> This migration creates the schema, indexes, storage bucket, and **public
> read-only** RLS policies (anonymous visitors can read published listings
> and submit leads/searches). It does **not** grant any authenticated
> (admin/partner_user) write access — there is no policy yet that lets a
> logged-in user create, update, or publish anything. **Admin CRUD is not
> operational after this migration.** Authenticated policies are explicitly
> deferred to **migration 0002**, once `auth.js` can be tested against real
> sessions rather than guessed at (see `services/auth.js`'s module comment).
> The connectivity test below only proves read access works — it does not
> and cannot prove Admin functionality, because that functionality doesn't
> exist yet.
>
> **Revised in this delivery (CTO Final Review 0002):** explicit `GRANT`
> statements added — RLS policies alone do not grant Data API access when
> "Automatically expose new tables" is disabled, which this project uses.
> `anon` receives exactly SELECT on 8 tables and INSERT on 2 (`leads`,
> `searches`) — nothing else, nowhere. `authenticated` receives nothing yet,
> intentionally, until migration 0002. A new constraint also guarantees a
> Representation can have at most one *published* Listing at a time (drafts
> may still exist alongside it).
>
> **Revised again in this delivery (CTO Foundation Audit, 6 languages):**
> languages are now a configurable `system_languages` table (6 seeded: PT,
> EN, FR, ES, DE, IT — adding a 7th is a data change, never a schema
> change). `listings.currency_iso` is now mandatory, with no default and
> ISO-4217-style format validation. The flat `media` table is replaced by a
> 5-table foundation (`media_assets`, `media_variants`, `listing_media`,
> `development_media`, `media_asset_content`) supporting reuse between a
> Development and its units, multiple derived variants per original, and
> localized ALT/caption text. `listing_content` gained a translation
> lifecycle (`missing`/`ai_generated`/`reviewed`/`approved`) and content
> provenance (`human`/`ai`). `listings.status` expanded to a real
> publication lifecycle (`draft`/`incomplete`/`pending_review`/`ready`/
> `published`/`suspended`/`archived`) with nullable `readiness_score` /
> `readiness_updated_at` fields, prepared but not yet scored. See
> `docs/consolidation/MIGRATION-0001-VERIFICATION.md` for the full,
> transaction-safe proof of all of this — run it before trusting any of it.

## 1. Apply migration 0001

1. Open your Supabase project dashboard → **SQL Editor**.
2. Open `supabase/migrations/0001_product_backbone.sql` from this delivery.
3. Copy its entire contents, paste into a new SQL Editor query, click **Run**.
4. Expected output: `Success. No rows returned` (DDL statements don't return rows).

## 2. Confirm the tables exist

In SQL Editor, run:
```sql
select table_name from information_schema.tables
where table_schema = 'public'
order by table_name;
```
**Expected:** 17 rows — `developments, leads, listing_content, listings, media_assets, media_variants, listing_media, development_media, media_asset_content, organisations, partners, profiles, properties, representations, searches, system_languages, zones_lite`.

## 2b. Run the full verification script

See `docs/consolidation/MIGRATION-0001-VERIFICATION.md` — a single, transaction-safe SQL script (seeds its own test data, tests 24 scenarios including languages, currency, the media foundation, and Development-level storage access, rolls everything back at the end). Run it in full before proceeding — this is the real proof the migration works, not just that the schema exists.

## 3. Confirm RLS is enabled on every table

```sql
select relname, relrowsecurity
from pg_class
join pg_namespace on pg_namespace.oid = pg_class.relnamespace
where pg_namespace.nspname = 'public' and relkind = 'r'
order by relname;
```
**Expected:** all 17 rows show `relrowsecurity = true`. If any show `false`, stop and tell me — do not proceed.

## 4. Confirm the storage bucket exists

Dashboard → **Storage** → confirm a bucket named `listing-media` exists, marked **not public** (access is governed entirely by the storage policy in the migration, not bucket-level public access).

## 5. Create the first admin user

1. Dashboard → **Authentication** → **Users** → **Add user** → enter your own email + a password. Note the generated **User UID**.
2. Back in SQL Editor, link it to a profile:
```sql
insert into profiles (id, partner_id, role)
values ('PASTE-USER-UID-HERE', null, 'admin');
```
(`partner_id` is `null` for an admin who isn't tied to one specific partner.)

## 6. Configure local environment variables

```bash
cd z-find-platform    # or wherever this delivery is extracted
cp .env.example .env
```
Edit `.env`:
```
SUPABASE_URL=<staging-project-url>
SUPABASE_ANON_KEY=<publishable-key>
```

## 7. Install dependencies

```bash
npm install
npm install dotenv --save-dev
```

## 8. Run the connectivity test

```bash
node -r dotenv/config scripts/test-connectivity.js
```

**Expected output:**
```
Z Find — Supabase connectivity test
Target: <staging-project-url>

SUCCESS — connected and read from zones_lite.
Rows returned: 0 (0 is fine — table can be empty).
[]
```
Exit code `0` (`echo $?` to confirm).

## 9. If it fails instead

- **`malformed_response` mentioning a missing table** → migration wasn't applied (redo Step 1).
- **`network_failure`** → check your own internet connection; this is not expected on your Mac.
- **`authorization_failure`** → tell me immediately, don't try to fix RLS yourself — send me the exact error message.

## 10. Send me back

- The full console output of Step 8 (success or failure, either way).
- Confirmation of Step 3's query result (all `true`, or which ones aren't).

Only once I have that will I begin the full async marketplace migration.
