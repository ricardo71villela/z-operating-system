-- ============================================================
-- Z FIND — MIGRATION 0001: Initial Schema (Staging)
-- ============================================================
-- Per approved Sprint B Supabase Schema Proposal v1, revised across
-- three structural correction cycles:
--   CTO Review 0001            — representations RLS gap; land/
--                                 development domain model fix
--   CTO Final Review 0002       — explicit GRANTs; publication
--                                 deduplication constraint
--   CTO Foundation Audit (6-lang) — configurable languages, currency,
--                                 media foundation, translation and
--                                 publication lifecycle
-- Every table has RLS enabled from creation — never added later.
--
-- IMPORTANT: RLS policies alone do NOT grant Data API access. This
-- project has "Automatically expose new tables" disabled, so
-- PostgREST requires explicit Postgres-level GRANT statements in
-- addition to RLS policies — RLS filters WHICH rows a role can
-- see/affect; GRANT determines WHETHER the role can touch the table
-- at all. Both are required together. See the GRANTS section near
-- the end of this file for the exact, least-privilege matrix, and
-- role_table_grants verification queries.
--
-- Public read access is granted ONLY where the public marketplace
-- needs it (published listings + their supporting data). Public
-- INSERT is granted, intentionally and narrowly, on `leads` and
-- `searches` only — anon has exactly two, deliberate write paths.
-- Everything else (no RLS policy AND no GRANT) defaults to no access
-- until an authenticated role is explicitly given one in migration
-- 0002.
-- ============================================================

-- ---------------- system_languages ----------------
-- Configurable, NOT a hardcoded enum. Adding a 7th language later is
-- a data change (one INSERT here) — it must never again require a
-- CHECK constraint or migration. This table is the single source of
-- truth every locale-bearing table below references via a real FK.
create table system_languages (
  code text primary key,               -- e.g. 'pt-PT', 'en', 'fr', 'es', 'de', 'it'
  display_name text not null,          -- e.g. 'Portuguese (Portugal)'
  native_name text not null,           -- e.g. 'Português (Portugal)'
  enabled boolean not null default true,
  is_default boolean not null default false,
  sort_order int not null default 0
);
alter table system_languages enable row level security;

-- Exactly one default language, enforced by the database, not by
-- application discipline alone.
create unique index uq_one_default_language
  on system_languages(is_default)
  where is_default = true;

insert into system_languages (code, display_name, native_name, enabled, is_default, sort_order) values
  ('pt-PT', 'Portuguese (Portugal)', 'Português (Portugal)', true, true,  1),
  ('en',    'English',               'English',              true, false, 2),
  ('fr',    'French',                'Français',             true, false, 3),
  ('es',    'Spanish',               'Español',              true, false, 4),
  ('de',    'German',                'Deutsch',              true, false, 5),
  ('it',    'Italian',               'Italiano',             true, false, 6);

-- ---------------- organisations ----------------
create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_iso text not null,
  created_at timestamptz not null default now()
);
alter table organisations enable row level security;

-- ---------------- partners ----------------
create table partners (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references organisations(id), -- nullable: independent individuals
  name text not null,
  role text not null check (role in ('agency', 'promoter')),
  trust_level text,
  avg_response_hours numeric,
  enquiry_policy jsonb not null default '{"direct":true,"qualified":false,"assisted":false}'::jsonb,
  created_at timestamptz not null default now()
);
alter table partners enable row level security;

-- ---------------- zones_lite ----------------
create table zones_lite (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  country_iso text not null
);
alter table zones_lite enable row level security;

-- ---------------- developments ----------------
create table developments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  promoter_partner_id uuid references partners(id),
  zone_lite_id uuid references zones_lite(id),
  created_at timestamptz not null default now()
);
alter table developments enable row level security;

-- ---------------- properties ----------------
create table properties (
  id uuid primary key default gen_random_uuid(),
  subtype text not null check (subtype in ('apartment', 'villa', 'land')),
  typology text,
  area_sqm numeric,
  floor int,
  zone_lite_id uuid references zones_lite(id),
  development_id uuid references developments(id), -- nullable
  created_at timestamptz not null default now()
);
alter table properties enable row level security;

-- ---------------- representations ----------------
-- A Representation targets EITHER a Property OR a Development, never
-- both — "target_type" discriminates which, and the check constraint
-- enforces exactly one of the two FKs is set, matching the
-- discriminator. This lets a Listing represent a Development directly
-- without a generic/polymorphic table.
create table representations (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('property', 'development')),
  property_id uuid references properties(id),
  development_id uuid references developments(id),
  partner_id uuid not null references partners(id),
  status text not null check (status in ('proposed', 'active', 'ended', 'disputed')),
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz not null default now(),
  constraint representations_target_shape check (
    (target_type = 'property' and property_id is not null and development_id is null)
    or
    (target_type = 'development' and development_id is not null and property_id is null)
  )
);
alter table representations enable row level security;

-- "One active representation per represented target" — enforced by
-- the database, not just application logic — for BOTH target types.
create unique index uq_one_active_representation_per_property
  on representations(property_id)
  where status = 'active' and target_type = 'property';

create unique index uq_one_active_representation_per_development
  on representations(development_id)
  where status = 'active' and target_type = 'development';

-- ---------------- listings ----------------
-- Publication lifecycle expanded (CTO Foundation Audit) to represent
-- the real editorial/QA workflow, not just draft/live/off:
--   draft          — being authored, not yet ready for review
--   incomplete     — missing required fields, cannot proceed
--   pending_review — submitted, awaiting human or automated check
--   ready          — passed checks, awaiting a publish action
--   published      — live on the public marketplace
--   suspended       — temporarily hidden (was 'unpublished' before this
--                     revision — split into 'suspended' vs 'archived'
--                     because those are different real intents: a
--                     temporary pause vs. a permanent retirement)
--   archived        — permanently retired, never expected to return
--
-- currency_iso has NO default — every insert must state it explicitly.
-- This migration does not implement exchange rates or conversion.
create table listings (
  id uuid primary key default gen_random_uuid(),
  representation_id uuid not null references representations(id),
  channel text not null check (channel in ('standard', 'offmarket')),
  price_current numeric not null,
  currency_iso text not null,
  price_is_from boolean not null default false,
  status text not null check (status in (
    'draft', 'incomplete', 'pending_review', 'ready', 'published', 'suspended', 'archived'
  )) default 'draft',
  readiness_score numeric,           -- nullable — Listing Quality Engine scoring, NOT implemented yet
  readiness_updated_at timestamptz,  -- nullable — set only once scoring logic exists
  created_at timestamptz not null default now(),
  constraint listings_currency_iso_format check (currency_iso ~ '^[A-Z]{3}$')
);
alter table listings enable row level security;

-- Deduplication constraint: a partial unique index on
-- (representation_id) WHERE status = 'published'. This permits any
-- number of non-published rows for the same Representation (draft
-- history, a future "new version before republishing" workflow) while
-- making it structurally impossible for two rows to be 'published' at
-- once for the same Representation — enforced by Postgres itself.
create unique index uq_one_published_listing_per_representation
  on listings(representation_id)
  where status = 'published';

-- ---------------- listing_content ----------------
-- locale now references system_languages — NOT a hardcoded CHECK.
-- Adding a 7th language requires a row in system_languages only.
--
-- Translation lifecycle (CTO Foundation Audit): tracks how each
-- localized row came to exist and whether it has been vetted, and
-- distinguishes human-authored from AI-generated content — the
-- provenance the CTO asked for, without implementing AI translation.
create table listing_content (
  listing_id uuid not null references listings(id),
  locale text not null references system_languages(code),
  title text not null,
  description text,
  translation_status text not null check (
    translation_status in ('missing', 'ai_generated', 'reviewed', 'approved')
  ) default 'missing',
  content_source text not null check (content_source in ('human', 'ai')) default 'human',
  updated_at timestamptz not null default now(),
  primary key (listing_id, locale)
);
alter table listing_content enable row level security;

-- ---------------- MEDIA FOUNDATION ----------------
-- Replaces the prior flat `media` table. Five small tables, real
-- foreign keys throughout (no unvalidated polymorphic entity_type/
-- entity_id) — satisfies: immutable originals, derived variants,
-- association to both Listings and Developments (with reuse — the
-- same asset can be linked to a Development AND to one of its unit
-- Listings), a media kind beyond photographs, visibility, a cover
-- flag independent of ordering, and localized ALT/caption text
-- without a hardcoded language column. No image processing, AI
-- tagging, hashing, transcoding, or CDN logic is implemented here —
-- schema only.

-- The immutable original file + its core, format-level metadata.
create table media_assets (
  id uuid primary key default gen_random_uuid(),
  media_type text not null check (media_type in ('image', 'video', 'document')),
  visibility text not null check (visibility in ('public', 'internal')) default 'public',
  original_storage_path text not null,
  mime_type text,
  file_size_bytes bigint,
  width int,
  height int,
  created_at timestamptz not null default now()
);
alter table media_assets enable row level security;

-- Derived/processed files (thumbnails, web-optimized sizes, etc.).
-- variant_type is free text, not enumerated — like language codes,
-- future variant kinds must be a data change, not a schema change.
create table media_variants (
  id uuid primary key default gen_random_uuid(),
  media_asset_id uuid not null references media_assets(id),
  variant_type text not null,
  storage_path text not null,
  mime_type text,
  file_size_bytes bigint,
  width int,
  height int,
  created_at timestamptz not null default now()
);
alter table media_variants enable row level security;

-- Association: a media asset attached to a Listing. Real FK, not
-- polymorphic. position/is_cover live on the ASSOCIATION, not the
-- asset — the same asset can be the cover in one context and not
-- another, and ordering is inherently per-context, not global.
create table listing_media (
  media_asset_id uuid not null references media_assets(id),
  listing_id uuid not null references listings(id),
  position int not null default 0,
  is_cover boolean not null default false,
  primary key (media_asset_id, listing_id)
);
alter table listing_media enable row level security;

-- Association: a media asset attached to a Development directly —
-- independent of any specific unit Listing, satisfying "reuse between
-- Developments and their units": the same media_asset_id can appear
-- here AND in listing_media for one of the Development's unit
-- Listings, without duplicating the underlying file.
create table development_media (
  media_asset_id uuid not null references media_assets(id),
  development_id uuid not null references developments(id),
  position int not null default 0,
  is_cover boolean not null default false,
  primary key (media_asset_id, development_id)
);
alter table development_media enable row level security;

-- Localized ALT text / caption — same pattern as listing_content,
-- referencing system_languages, never a hardcoded language column.
create table media_asset_content (
  media_asset_id uuid not null references media_assets(id),
  locale text not null references system_languages(code),
  alt_text text,
  caption text,
  primary key (media_asset_id, locale)
);
alter table media_asset_content enable row level security;

-- ---------------- leads ----------------
create table leads (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id),
  contact_type text not null check (contact_type in ('direct', 'qualified', 'assisted')),
  name text,
  email text,
  phone text,
  message text,
  status text not null check (status in ('new', 'contacted', 'closed')) default 'new',
  created_at timestamptz not null default now()
);
alter table leads enable row level security;

-- ---------------- searches ----------------
create table searches (
  id uuid primary key default gen_random_uuid(),
  filters jsonb not null default '{}'::jsonb,
  result_count int not null default 0,
  created_at timestamptz not null default now()
);
alter table searches enable row level security;

-- ---------------- profiles (links Supabase Auth users to a Partner) ----------------
create table profiles (
  id uuid primary key references auth.users(id),
  partner_id uuid references partners(id),
  role text not null check (role in ('admin', 'partner_user'))
);
alter table profiles enable row level security;

-- ============================================================
-- RLS POLICIES — Phase 1 (restrictive defaults)
-- ============================================================
-- Public (anon) read access: ONLY published listings and the data
-- needed to render them on the public marketplace. Anon also has two,
-- deliberate, narrow write paths (INSERT only, on `leads` and
-- `searches`) — this is NOT a "no write access for anon anywhere"
-- model. Everywhere else, anon has neither a policy nor a GRANT.
-- Authenticated write policies (admin/partner_user scoped to their
-- own organisation/partner) are deliberately deferred to migration
-- 0002, once auth.js is implemented and can be tested against real
-- policies rather than guessed at.

create policy "public read enabled languages"
  on system_languages for select
  to anon
  using (enabled = true);

create policy "public read published listings"
  on listings for select
  to anon
  using (status = 'published');

create policy "public read listing content"
  on listing_content for select
  to anon
  using (
    exists (
      select 1 from listings
      where listings.id = listing_content.listing_id
      and listings.status = 'published'
    )
  );

create policy "public read properties referenced by published listings"
  on properties for select
  to anon
  using (
    exists (
      select 1 from representations
      join listings on listings.representation_id = representations.id
      where representations.target_type = 'property'
      and representations.property_id = properties.id
      and listings.status = 'published'
    )
  );

create policy "public read zones_lite"
  on zones_lite for select
  to anon
  using (true); -- non-sensitive reference data, safe to expose fully

-- Covers BOTH ways a Development can become publicly visible:
-- (1) directly represented and listed as its own target, or
-- (2) reachable because one of its Property units is published.
create policy "public read developments referenced by published listings"
  on developments for select
  to anon
  using (
    exists (
      select 1 from representations
      join listings on listings.representation_id = representations.id
      where representations.target_type = 'development'
      and representations.development_id = developments.id
      and listings.status = 'published'
    )
    or
    exists (
      select 1 from properties
      join representations on representations.property_id = properties.id and representations.target_type = 'property'
      join listings on listings.representation_id = representations.id
      where properties.development_id = developments.id
      and listings.status = 'published'
    )
  );

-- representations had NO anon SELECT policy in an earlier revision,
-- which silently broke every embedded query that joins through it
-- AND every OTHER policy that references representations in a
-- subquery (developments, partners) — RLS applies to subqueries too,
-- not just the outermost table. Scoped tightly: only ACTIVE
-- representations tied to a PUBLISHED listing are visible.
create policy "public read active representations for published listings"
  on representations for select
  to anon
  using (
    status = 'active'
    and exists (
      select 1 from listings
      where listings.representation_id = representations.id
      and listings.status = 'published'
    )
  );

create policy "public read partners representing published listings"
  on partners for select
  to anon
  using (
    exists (
      select 1 from representations
      join listings on listings.representation_id = representations.id
      where representations.partner_id = partners.id
      and listings.status = 'published'
    )
  );

-- ---- Media foundation policies ----
-- Same lesson as representations above, applied proactively this time:
-- every table an embedded query can touch needs its own policy, not
-- just the outermost one. media_assets/variants/content are visible
-- only when reachable from a published Listing OR a publicly-visible
-- Development, and only if visibility = 'public'.

create policy "public read public media assets for published content"
  on media_assets for select
  to anon
  using (
    visibility = 'public'
    and (
      exists (
        select 1 from listing_media
        join listings on listings.id = listing_media.listing_id
        where listing_media.media_asset_id = media_assets.id
        and listings.status = 'published'
      )
      or
      exists (
        select 1 from development_media
        join developments on developments.id = development_media.development_id
        where development_media.media_asset_id = media_assets.id
        -- Development visibility here intentionally mirrors the
        -- "public read developments" policy's OR-of-two-paths logic;
        -- kept simple by re-using the same developments row (already
        -- policy-protected) as the visibility gate.
      )
    )
  );

create policy "public read variants of visible media assets"
  on media_variants for select
  to anon
  using (
    exists (
      select 1 from media_assets
      where media_assets.id = media_variants.media_asset_id
      and media_assets.visibility = 'public'
    )
  );

create policy "public read listing_media associations for published listings"
  on listing_media for select
  to anon
  using (
    exists (
      select 1 from listings
      where listings.id = listing_media.listing_id
      and listings.status = 'published'
    )
  );

create policy "public read development_media associations"
  on development_media for select
  to anon
  using (
    exists (
      select 1 from developments
      where developments.id = development_media.development_id
    )
  );

create policy "public read media asset content for visible assets"
  on media_asset_content for select
  to anon
  using (
    exists (
      select 1 from media_assets
      where media_assets.id = media_asset_content.media_asset_id
      and media_assets.visibility = 'public'
    )
  );

create policy "public insert leads"
  on leads for insert
  to anon
  with check (true); -- anyone may submit a lead; no read access granted below

create policy "public insert searches"
  on searches for insert
  to anon
  with check (true); -- anonymous search logging; no read access granted below

-- ============================================================
-- STORAGE — media bucket
-- ============================================================
insert into storage.buckets (id, name, public)
values ('listing-media', 'listing-media', false)
on conflict (id) do nothing;

-- Covers files reachable through BOTH association paths:
--   (a) media_assets/media_variants -> listing_media -> published Listing
--   (b) media_assets/media_variants -> development_media -> publicly
--       visible Development (reusing the EXACT same two-path visibility
--       rule as the "public read developments" policy: either the
--       Development has its own direct published Listing, or at least
--       one of its unit Properties does)
-- Path (b) was missing entirely in the prior revision — a Development-
-- level image could be visible in database queries (media_assets' own
-- RLS policy already covered both paths) while its actual Storage
-- object still returned access denied, because ONLY path (a) existed
-- here. Same class of bug as the original representations gap: two
-- separate gates (table RLS and Storage RLS) must each be fixed, not
-- just one.
create policy "public read media files for published listings"
  on storage.objects for select
  to anon
  using (
    bucket_id = 'listing-media'
    and (
      -- (a) original, via a published Listing
      exists (
        select 1 from media_assets
        join listing_media on listing_media.media_asset_id = media_assets.id
        join listings on listings.id = listing_media.listing_id
        where media_assets.original_storage_path = storage.objects.name
        and listings.status = 'published'
      )
      or
      -- (a) variant, via a published Listing
      exists (
        select 1 from media_variants
        join listing_media on listing_media.media_asset_id = media_variants.media_asset_id
        join listings on listings.id = listing_media.listing_id
        where media_variants.storage_path = storage.objects.name
        and listings.status = 'published'
      )
      or
      -- (b) original, via a publicly visible Development
      exists (
        select 1 from media_assets
        join development_media on development_media.media_asset_id = media_assets.id
        join developments on developments.id = development_media.development_id
        where media_assets.original_storage_path = storage.objects.name
        and (
          exists (
            select 1 from representations
            join listings on listings.representation_id = representations.id
            where representations.target_type = 'development'
            and representations.development_id = developments.id
            and listings.status = 'published'
          )
          or
          exists (
            select 1 from properties
            join representations on representations.property_id = properties.id and representations.target_type = 'property'
            join listings on listings.representation_id = representations.id
            where properties.development_id = developments.id
            and listings.status = 'published'
          )
        )
      )
      or
      -- (b) variant, via a publicly visible Development
      exists (
        select 1 from media_variants
        join development_media on development_media.media_asset_id = media_variants.media_asset_id
        join developments on developments.id = development_media.development_id
        where media_variants.storage_path = storage.objects.name
        and (
          exists (
            select 1 from representations
            join listings on listings.representation_id = representations.id
            where representations.target_type = 'development'
            and representations.development_id = developments.id
            and listings.status = 'published'
          )
          or
          exists (
            select 1 from properties
            join representations on representations.property_id = properties.id and representations.target_type = 'property'
            join listings on listings.representation_id = representations.id
            where properties.development_id = developments.id
            and listings.status = 'published'
          )
        )
      )
    )
  );

-- Authenticated (admin/partner_user) upload/update/delete policies for
-- storage.objects are deferred to migration 0002, for the same reason
-- as the deferred authenticated table policies above: they need
-- auth.js implemented first so they can be tested against real
-- sessions, not guessed at.

-- ============================================================
-- Explicitly NOT granted to anon in this migration (no RLS policy,
-- no GRANT — both must be absent for "no access" to actually hold):
--   profiles, organisations, leads (select), searches (select)
-- Authenticated (admin/partner_user) RLS policies: deferred to
-- migration 0002. See the GRANTS section directly below for why
-- authenticated gets NO grants at all yet, not even for bootstrap.
-- ============================================================

-- ============================================================
-- INDEXES — on every foreign key used in filtering or joins
-- ============================================================
create index idx_partners_organisation_id on partners(organisation_id);
create index idx_developments_promoter_partner_id on developments(promoter_partner_id);
create index idx_developments_zone_lite_id on developments(zone_lite_id);
create index idx_properties_zone_lite_id on properties(zone_lite_id);
create index idx_properties_development_id on properties(development_id);
create index idx_representations_property_id on representations(property_id);
create index idx_representations_development_id on representations(development_id);
create index idx_representations_target_type on representations(target_type);
create index idx_representations_partner_id on representations(partner_id);
create index idx_representations_status on representations(status);
create index idx_listings_representation_id on listings(representation_id);
create index idx_listings_status on listings(status);
create index idx_listings_channel on listings(channel);
create index idx_media_variants_media_asset_id on media_variants(media_asset_id);
create index idx_listing_media_listing_id on listing_media(listing_id);
create index idx_listing_media_position on listing_media(listing_id, position);
create index idx_development_media_development_id on development_media(development_id);
create index idx_development_media_position on development_media(development_id, position);
create index idx_leads_listing_id on leads(listing_id);
create index idx_leads_status on leads(status);
create index idx_profiles_partner_id on profiles(partner_id);

-- ============================================================
-- GRANTS — explicit, least-privilege
-- ============================================================
-- Required in addition to every RLS policy above: with "Automatically
-- expose new tables" disabled, PostgREST/Supabase requires schema
-- USAGE plus per-table, per-operation GRANTs — RLS never substitutes
-- for this. No sequence GRANTs are needed: every primary key here
-- uses `gen_random_uuid()`, not a serial/identity column, so there is
-- no sequence for anon/authenticated to need access to.

grant usage on schema public to anon, authenticated;

-- anon: SELECT only, only on the tables the public marketplace reads.
grant select on
  system_languages, zones_lite, partners, developments, properties,
  representations, listings, listing_content,
  media_assets, media_variants, listing_media, development_media, media_asset_content
to anon;

-- anon: INSERT only, only on the two tables the public may write to.
-- No UPDATE, no DELETE, on anything, for anon — not granted anywhere
-- in this migration.
grant insert on leads, searches to anon;

-- authenticated: intentionally NOTHING granted yet. auth.js's
-- getCurrentProfile() will correctly fail with an authorization_failure
-- until migration 0002 adds both a GRANT SELECT on `profiles` and a
-- self-scoped RLS policy (id = auth.uid()) — granting bootstrap access
-- now, ahead of that policy, would let an authenticated user attempt a
-- profiles query with no RLS constraint yet defined to scope it,
-- which is a worse position than "correctly blocked until 0002".

-- ---------------- Verification: prove the exact grants above ----------------
-- Run this after applying the migration; expected result is EXACTLY
-- the matrix documented above, nothing more, nothing less. See
-- docs/consolidation/MIGRATION-0001-VERIFICATION.md, test 11, for the
-- full runnable version with expected output shown.
--
-- select grantee, table_name, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public'
-- and grantee in ('anon', 'authenticated')
-- order by grantee, table_name, privilege_type;
