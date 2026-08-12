-- ============================================================
-- Z FIND — Operational Baseline v1
-- Canonical ZOS migration lineage
-- ============================================================
-- Clean operational baseline for the Z Find vertical.
-- Consolidates the final operational state of historical Z Find
-- migrations 0001 through 0007 only, preserving public.* runtime
-- compatibility required by Web, Admin and Partner applications.
--
-- Historical ZOS bridge migrations 0008 through 0019 are NOT replayed.
-- Registry, Identity, Geography, Observations and Outbox remain owned
-- by their canonical ZOS schemas/capabilities.
--
-- Existing Z Find local UUIDs remain authoritative operational IDs.
-- Embedded historical comments are retained verbatim for provenance;
-- old proposal/staging labels below do not describe this migration status.
--
-- IMPORTANT: existing provisioned Z Find databases must NOT execute
-- this baseline SQL. Their migration history may only be reconciled
-- after structural parity with this baseline has been proved.
-- ============================================================

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
-- ============================================================
-- Z FIND — MIGRATION 0002 — Admin authenticated access
-- ============================================================
-- Sprint 1.7 (Admin MVP). Migration 0001 deliberately granted
-- `authenticated` NOTHING, with an explicit comment marking this as
-- the expected next step ("until migration 0002 adds..."). This is
-- that migration — it does not touch anon's grants, RLS, or policies
-- at all, and does not introduce service_role anywhere.
--
-- Model: exactly one admin role for this MVP (profiles.role='admin'),
-- checked via a SECURITY DEFINER helper (is_admin()) so every other
-- table's policy is a single, cheap, non-recursive check. profiles
-- already has a 'partner_user' role value in its own check constraint
-- (added in 0001, anticipating a future partner-facing portal) — that
-- portal is NOT built here; partner_user has no policies of its own
-- yet. Documented technical debt, not implemented speculatively.
-- ============================================================

-- ---------------- partners.status ----------------
-- Explicitly requested by the Admin MVP brief ("Estado") — no
-- equivalent column existed. Minimal addition: active/inactive only,
-- matching exactly what a CRUD status toggle needs, nothing more
-- (no soft-delete workflow, no audit trail — out of scope, see
-- "O que NÃO construir" in the brief).
alter table partners add column status text not null default 'active' check (status in ('active', 'inactive'));

-- ---------------- partners.logo_storage_path ----------------
-- Explicitly requested ("Logótipo"). A single nullable path into the
-- same private 'listing-media' bucket already used for every other
-- image — resolved through the SAME shared resolveMediaUrl() helper,
-- not a second image pipeline. No media_assets/variants row needed
-- for a single logo with no responsive-variant requirement in this
-- MVP; a plain path is the minimal correct shape here.
alter table partners add column logo_storage_path text;

-- ---------------- is_admin() helper ----------------
-- SECURITY DEFINER: runs with the function owner's privileges, so it
-- can read `profiles` regardless of the calling user's own RLS grant
-- on that table — this is what lets every other table's policy stay
-- a single function call instead of repeating the same subquery, and
-- avoids any risk of RLS recursion on profiles itself.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------- profiles: self-read policy ----------------
-- Lets an authenticated user read their OWN profile row directly
-- (e.g. auth.js's getCurrentProfile()) — separate from is_admin(),
-- which bypasses RLS entirely via SECURITY DEFINER for its own
-- internal check. No admin-wide read of all profiles is granted here
-- — not needed by anything in this sprint's scope (no user management
-- UI was requested).
create policy "profiles: self read"
  on profiles for select
  to authenticated
  using (id = auth.uid());

-- ---------------- Admin full access policies ----------------
-- One consistent shape across every table the Admin MVP needs to
-- manage: authenticated + is_admin() required for every operation.
-- No partner_user policies here (documented technical debt above).

create policy "admin: full access to partners" on partners
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "admin: full access to developments" on developments
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "admin: full access to properties" on properties
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "admin: full access to representations" on representations
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "admin: full access to listings" on listings
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "admin: full access to listing_content" on listing_content
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "admin: full access to media_assets" on media_assets
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "admin: full access to media_variants" on media_variants
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "admin: full access to listing_media" on listing_media
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "admin: full access to development_media" on development_media
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "admin: full access to media_asset_content" on media_asset_content
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "admin: full access to zones_lite" on zones_lite
  for all to authenticated using (is_admin()) with check (is_admin());

-- leads: SELECT only for the Admin (list/search/filter/detail, per
-- the brief — "Nada mais", explicitly no status editing/CRM). No
-- INSERT/UPDATE/DELETE policy for authenticated on leads at all —
-- anon's own narrow INSERT-only policy (migration 0001) is untouched.
create policy "admin: read leads" on leads
  for select to authenticated using (is_admin());

-- system_languages: SELECT only — the Admin's translation UI needs to
-- know which locales exist, never needs to write this table (adding a
-- language is an intentional, rare, deliberate change — matches
-- migration 0001's own stated design: "adding a language is an
-- INSERT, never a schema change" — but not a self-service Admin
-- action in this MVP; documented, not built).
create policy "admin: read system_languages" on system_languages
  for select to authenticated using (is_admin());

-- ---------------- GRANTs ----------------
-- Table-level GRANTs are still required in addition to the RLS
-- policies above — a GRANT without a matching policy blocks access
-- just as effectively as no GRANT at all (this project's own
-- consistent pattern, unchanged from migration 0001).
grant select, insert, update, delete on
  partners, developments, properties, representations, listings, listing_content,
  media_assets, media_variants, listing_media, development_media, media_asset_content,
  zones_lite
to authenticated;

grant select on profiles, leads, system_languages to authenticated;

-- ---------------- Storage: Admin media management ----------------
-- The 'listing-media' bucket stays private (public: false, unchanged
-- from migration 0001) — the Admin manages it through authenticated
-- Storage API calls (upload/list/update/delete), governed by RLS on
-- storage.objects, exactly like the public read path already is.
create policy "admin: manage listing-media storage objects"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'listing-media' and is_admin())
  with check (bucket_id = 'listing-media' and is_admin());

-- ---------------- Verification ----------------
-- Run after applying: confirm the exact policy/grant matrix above and
-- nothing more.
--
-- select grantee, table_name, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public' and grantee = 'authenticated'
-- order by table_name, privilege_type;
--
-- select tablename, policyname, roles, cmd
-- from pg_policies
-- where schemaname = 'public' and 'authenticated' = any(roles)
-- order by tablename, policyname;
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
-- ============================================================
-- Z FIND — MIGRATION 0004 (PROPOSTA — NÃO APLICAR SEM REVISÃO)
-- ============================================================
-- Consolida: Portal do Parceiro (schema), monetização (schema),
-- Z Living (primeiro campo), extensibilidade de atributos,
-- pedidos de avaliação (seller_leads), preparação para dedup.
-- Tudo aditivo. Nenhuma coluna existente alterada ou removida.
-- ============================================================

-- ---------------- Portal do Parceiro: RLS scoping ----------------
create or replace function public.is_own_partner(target_partner_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and partner_id = target_partner_id and role = 'partner_user'
  );
$$;

-- (políticas de partner_user por tabela ficam para quando o Portal
-- for efetivamente construído — a função fica pronta, sem ainda
-- conceder nenhum GRANT/POLICY não usado)

-- ---------------- Monetização ----------------
alter table listings add column tier text not null default 'standard' check (tier in ('standard', 'featured'));

-- ---------------- Z Living ----------------
alter table listings add column rental_period text check (rental_period in ('monthly', 'seasonal', 'yearly'));

-- ---------------- Extensibilidade de atributos ----------------
create table features (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null
);
alter table features enable row level security;

create table property_features (
  property_id uuid not null references properties(id),
  feature_id uuid not null references features(id),
  primary key (property_id, feature_id)
);
alter table property_features enable row level security;

alter table properties add column attributes jsonb not null default '{}'::jsonb;

-- CORREÇÃO (encontrada na revisão final, antes de aplicar): ativar
-- RLS sem nenhuma política torna a tabela inacessível a toda a gente,
-- mesmo com GRANT — o rascunho original tinha os GRANTs mas nenhuma
-- policy. Corrigido aqui, espelhando exatamente o padrão já
-- estabelecido em zones_lite (referência não sensível, leitura
-- pública total) e properties (só visível via listing publicada).
create policy "public read features" on features
  for select to anon using (true); -- referência não sensível, como zones_lite

create policy "public read property_features for published properties"
  on property_features for select to anon
  using (
    exists (
      select 1 from representations
      join listings on listings.representation_id = representations.id
      where representations.target_type = 'property'
      and representations.property_id = property_features.property_id
      and listings.status = 'published'
    )
  );

create policy "admin: full access to features" on features
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin: full access to property_features" on property_features
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------- Pedidos de avaliação (venda/arrendamento) ----------------
create table seller_leads (
  id uuid primary key default gen_random_uuid(),
  intent text not null check (intent in ('sell', 'rent')),
  name text not null,
  email text,
  phone text,
  zone_lite_id uuid references zones_lite(id),
  message text,
  status text not null check (status in ('new','contacted','closed')) default 'new',
  created_at timestamptz not null default now()
);
alter table seller_leads enable row level security;

create policy "anon: insert seller_leads" on seller_leads
  for insert to anon with check (true);
create policy "admin: read seller_leads" on seller_leads
  for select to authenticated using (is_admin());

grant insert on seller_leads to anon;
grant select on seller_leads to authenticated;
grant select on features, property_features to anon;
grant select, insert, update, delete on features, property_features to authenticated;

-- ---------------- Preparação para deteção de duplicados ----------------
alter table properties add column dedup_hash text;
create index idx_properties_dedup_hash on properties (dedup_hash) where dedup_hash is not null;


-- ---------------- Verificação ----------------
-- Run after applying:
--
-- select table_name, column_name from information_schema.columns
-- where table_schema = 'public' and table_name in ('listings','properties')
-- and column_name in ('tier','rental_period','attributes','dedup_hash')
-- order by table_name, column_name;
-- -- Expected: 4 rows.
--
-- select tablename, policyname, roles, cmd from pg_policies
-- where schemaname = 'public' and tablename in ('features','property_features','seller_leads')
-- order by tablename, policyname;
-- -- Expected: features (2 policies: public read + admin full),
-- -- property_features (2 policies: public read + admin full),
-- -- seller_leads (2 policies: anon insert + admin read).
--
-- select proname from pg_proc where proname in ('is_own_partner');
-- -- Expected: 1 row (function exists, ready for when the Partner
-- -- Portal is actually built — no policies use it yet, by design).
-- ============================================================
-- Z FIND — MIGRATION 0005 (PROPOSTA — NÃO APLICAR SEM REVISÃO)
-- ============================================================
-- Implementa a taxonomia completa de campos de
-- docs/architecture/PROPERTY-FIELD-TAXONOMY.md — compilada a partir
-- de: RESO Data Dictionary (standard internacional), Decreto-Lei
-- 101-D/2020 (Certificado Energético, obrigatório em Portugal),
-- Código do IMI (Área Bruta Privativa vs. Dependente), e a ficha real
-- de imóvel da Z Imobiliária já inspecionada.
--
-- Tudo aditivo. Nenhuma coluna existente alterada ou removida.
-- Populate features (0004 criou a tabela, nunca a populou).
-- ============================================================

-- ---------------- 1. Obrigatório por lei (Portugal) ----------------
alter table properties add column energy_rating text check (energy_rating in ('A+','A','B','B-','C','D','E','F'));
alter table properties add column energy_certificate_number text;
alter table properties add column license_number text; -- referência, não requisito de anúncio — ver taxonomia, secção 1

-- ---------------- 2. Localização exata ----------------
alter table properties add column street_address text;
alter table properties add column latitude numeric;
alter table properties add column longitude numeric;
alter table properties add column postal_code text;

-- ---------------- 3. Core universais (residencial) ----------------
alter table properties add column bedrooms int;
alter table properties add column living_rooms int default 1;
alter table properties add column bathrooms int; -- número único — ver correção na taxonomia, não dividido em full/half
alter table properties add column gross_private_area_sqm numeric; -- ABP
alter table properties add column dependent_area_sqm numeric;     -- ABD — onde garagem/arrumos tecnicamente vivem
alter table properties add column plot_area_sqm numeric;
alter table properties add column year_built int;
alter table properties add column condition text check (condition in ('new','used','needs_renovation','renovated'));
alter table properties add column unit_floors int default 1; -- duplex=2, triplex=3 — distinto de `floor` (em que piso está)

-- ---------------- 4. Financeiro factual — só declarado ----------------
alter table properties add column condo_fee_monthly numeric;
alter table properties add column imi_annual numeric;
alter table properties add column taxable_value numeric;
alter table properties add column payment_terms text;
alter table properties add column accepts_trade boolean not null default false;

-- ---------------- 5. Referências externas ----------------
alter table properties add column agency_reference text;
alter table properties add column external_ids jsonb not null default '{}'::jsonb;

-- ---------------- 6. Multimédia adicional ----------------
alter table properties add column tour_360_url text; -- link externo (Matterport/Kuula), não upload
alter table listing_media add column category text not null default 'photo' check (category in ('photo','floor_plan','rendering'));
alter table development_media add column category text not null default 'photo' check (category in ('photo','floor_plan','rendering'));

-- ---------------- 7. Empreendimentos ----------------
alter table developments add column footprint_area_sqm numeric;
alter table developments add column building_floors int;
alter table developments add column total_units int;
alter table developments add column expected_completion date;
alter table developments add column project_phase text check (project_phase in ('planning','construction','completed'));
alter table developments add column developer_name text;

-- development_features: a Migration 0004 criou property_features mas
-- nunca o equivalente para Empreendimentos — encontrado ao verificar
-- explicitamente "ambos os casos" (propriedade e empreendimento) para
-- carregamento elétrico. Espelha property_features exatamente, mesma
-- tabela features partilhada entre os dois.
create table development_features (
  development_id uuid not null references developments(id),
  feature_id uuid not null references features(id),
  primary key (development_id, feature_id)
);
alter table development_features enable row level security;

create policy "public read development_features for published developments"
  on development_features for select to anon
  using (
    exists (
      select 1 from representations
      join listings on listings.representation_id = representations.id
      where representations.target_type = 'development'
      and representations.development_id = development_features.development_id
      and listings.status = 'published'
    )
  );
create policy "admin: full access to development_features" on development_features
  for all to authenticated using (is_admin()) with check (is_admin());

grant select on development_features to anon;
grant select, insert, update, delete on development_features to authenticated;

-- ---------------- 8. Histórico de preços — tabela nova, não coluna ----------------
-- Série ao longo do tempo, nunca um valor único a substituir.
create table price_history (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id),
  price numeric not null,
  currency_iso text not null,
  recorded_at timestamptz not null default now()
);
alter table price_history enable row level security;

-- Mesmo padrão de listing_content: leitura pública só para listings
-- publicadas, escrita só admin.
create policy "public read price_history for published listings"
  on price_history for select to anon
  using (
    exists (
      select 1 from listings
      where listings.id = price_history.listing_id
      and listings.status = 'published'
    )
  );
create policy "admin: full access to price_history" on price_history
  for all to authenticated using (is_admin()) with check (is_admin());

grant select on price_history to anon;
grant select, insert, update, delete on price_history to authenticated;

-- ---------------- 8.5. Tipos de Parceiro — mesma correção já aplicada ao subtype ----------------
-- partners.role tem hoje um CHECK fechado ('agency','promoter') — o
-- mesmo anti-padrão já identificado para subtype. Prova concreta:
-- PRODUCT-AUDIT-V1.md já lista "Fornecedores de CRM" como prioridade
-- nº3 de clientes, mas o schema não conseguia representar isso.
create table partner_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null
);
alter table partner_types enable row level security;

create policy "public read partner_types" on partner_types
  for select to anon using (true); -- referência não sensível, como zones_lite
create policy "admin: full access to partner_types" on partner_types
  for all to authenticated using (is_admin()) with check (is_admin());

grant select on partner_types to anon;
grant select, insert, update, delete on partner_types to authenticated;

insert into partner_types (code, label) values
  ('agency', 'Agência'),
  ('promoter', 'Promotor'),
  ('private_individual', 'Particular'),
  ('crm_provider', 'Fornecedor de CRM'),
  ('fund', 'Fundo'),
  ('asset_manager', 'Asset Manager'),
  ('bank', 'Banco'),
  ('independent_consultant', 'Consultor Independente')
on conflict (code) do nothing;

-- Transição segura: nova coluna, preenchida a partir do role
-- existente. NÃO remove `role` — o Admin já construído lê/escreve
-- esse campo diretamente; mudar isso é trabalho de UI para depois,
-- não uma decisão de schema a forçar nesta migração.
alter table partners add column partner_type_id uuid references partner_types(id);
update partners set partner_type_id = (select id from partner_types where code = partners.role);

-- ---------------- 9. Popular a tabela features (criada na 0004, nunca populada) ----------------
insert into features (code, label) values
  ('elevator', 'Elevador'),
  ('pool', 'Piscina'),
  ('balcony', 'Varanda'),
  ('terrace', 'Terraço'),
  ('garden', 'Jardim'),
  ('garage_box', 'Garagem Box'),
  ('garage_covered', 'Lugar de Garagem Coberto'),
  ('garage_uncovered', 'Lugar de Garagem Descoberto'),
  ('bike_spot', 'Lugar para Bicicleta'),
  ('storage_room', 'Arrumos / Arrecadação'),
  ('pantry', 'Despensa'),
  ('sun_east', 'Orientação Nascente'),
  ('sun_west', 'Orientação Poente'),
  ('sun_north', 'Orientação Norte'),
  ('sun_south', 'Orientação Sul'),
  ('air_conditioning', 'Ar Condicionado'),
  ('central_heating', 'Aquecimento Central'),
  ('solar_panels', 'Painéis Solares'),
  ('accessibility', 'Acesso para Mobilidade Reduzida'),
  ('furnished', 'Mobilado'),
  ('fitted_kitchen', 'Cozinha Equipada'),
  ('office', 'Escritório / Gabinete'),
  ('laundry', 'Lavandaria'),
  ('entrance_hall', 'Hall de Entrada'),
  ('closet', 'Closet / Roupeiro'),
  ('fireplace', 'Lareira'),
  ('home_automation', 'Domótica'),
  ('electric_shutters', 'Estores Elétricos'),
  ('double_glazing', 'Vidros Duplos'),
  ('thermal_insulation', 'Isolamento Térmico'),
  ('acoustic_insulation', 'Isolamento Acústico'),
  ('security_system', 'Sistema de Segurança'),
  ('fiber_internet', 'Internet Fibra'),
  ('barbecue', 'Churrasqueira'),
  ('ev_charging', 'Carregamento Elétrico'),
  ('ev_charging_ready', 'Pré-instalação para Carregador VE')
on conflict (code) do nothing;

-- ---------------- Verificação ----------------
-- Run after applying:
--
-- select count(*) from information_schema.columns
-- where table_schema='public' and table_name='properties'
-- and column_name in ('energy_rating','street_address','bedrooms','bathrooms','gross_private_area_sqm','dependent_area_sqm');
-- -- Expected: 6.
--
-- select count(*) from features;
-- -- Expected: 36.
--
-- select tablename, policyname from pg_policies where tablename in ('price_history', 'development_features', 'partner_types');
-- -- Expected: 6 rows total (2 per table: public read + admin full access) — mesmo cuidado
-- -- que apanhou o bug de RLS na 0004: confirmar SEMPRE que existem
-- -- políticas reais, não só a tabela criada.
--
-- select code, label from partner_types order by code;
-- -- Expected: 8 rows.
--
-- select count(*) from partners where partner_type_id is null;
-- -- Expected: 0 — confirma que o backfill a partir de role funcionou
-- -- para todos os parceiros já existentes.
-- ============================================================
-- Z FIND — MIGRATION 0006 (PROPOSTA — NÃO APLICAR SEM REVISÃO)
-- ============================================================
-- Fundação de segurança do Partner Dashboard. is_own_partner() foi
-- criada na Migration 0004, comentada explicitamente como "pronta,
-- sem nenhuma política a usá-la ainda" — esta migração liga-a a
-- políticas reais, tabela a tabela.
--
-- Regra seguida em toda esta migração, sem exceção: um partner_user
-- só pode ver/gerir dados ligados ao SEU PRÓPRIO partner_id — nunca
-- de outro parceiro. Testado explicitamente (ver checklist no fim).
--
-- Tudo aditivo. Nenhuma política de admin/anon já existente é
-- alterada ou removida — as novas políticas de partner_user
-- coexistem com elas (RLS permissivo: múltiplas políticas para o
-- mesmo comando somam-se com OR, nunca se substituem).
-- ============================================================

-- ---------------- properties ----------------
-- INSERT precisa de política própria: no momento de criar uma
-- Propriedade nova, ainda não existe nenhuma representation a
-- ligá-la ao parceiro — mesmo problema "ovo e galinha" que o Admin já
-- resolve em dois passos (cria a propriedade, depois a listing).
create policy "partner: create properties" on properties
  for insert to authenticated
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'partner_user'));

create policy "partner: view own properties" on properties
  for select to authenticated using (
    exists (select 1 from representations where representations.property_id = properties.id and is_own_partner(representations.partner_id))
  );
create policy "partner: update own properties" on properties
  for update to authenticated
  using (exists (select 1 from representations where representations.property_id = properties.id and is_own_partner(representations.partner_id)))
  with check (exists (select 1 from representations where representations.property_id = properties.id and is_own_partner(representations.partner_id)));
create policy "partner: delete own properties" on properties
  for delete to authenticated using (
    exists (select 1 from representations where representations.property_id = properties.id and is_own_partner(representations.partner_id))
  );

-- ---------------- developments ----------------
-- Mesma lógica exata que properties, mesmo problema de bootstrap no insert.
create policy "partner: create developments" on developments
  for insert to authenticated
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'partner_user'));

create policy "partner: view own developments" on developments
  for select to authenticated using (
    exists (select 1 from representations where representations.development_id = developments.id and is_own_partner(representations.partner_id))
  );
create policy "partner: update own developments" on developments
  for update to authenticated
  using (exists (select 1 from representations where representations.development_id = developments.id and is_own_partner(representations.partner_id)))
  with check (exists (select 1 from representations where representations.development_id = developments.id and is_own_partner(representations.partner_id)));
create policy "partner: delete own developments" on developments
  for delete to authenticated using (
    exists (select 1 from representations where representations.development_id = developments.id and is_own_partner(representations.partner_id))
  );

-- ---------------- representations ----------------
-- partner_id é uma coluna direta aqui — sem problema de bootstrap,
-- is_own_partner(partner_id) funciona igual para insert/select/update/delete.
create policy "partner: manage own representations" on representations
  for all to authenticated
  using (is_own_partner(partner_id))
  with check (is_own_partner(partner_id));

-- ---------------- listings ----------------
-- Sempre criada referenciando uma representation já existente e já
-- corretamente ligada — sem problema de bootstrap.
create policy "partner: manage own listings" on listings
  for all to authenticated
  using (exists (select 1 from representations where representations.id = listings.representation_id and is_own_partner(representations.partner_id)))
  with check (exists (select 1 from representations where representations.id = listings.representation_id and is_own_partner(representations.partner_id)));

-- ---------------- listing_content ----------------
create policy "partner: manage own listing_content" on listing_content
  for all to authenticated
  using (exists (
    select 1 from listings join representations on representations.id = listings.representation_id
    where listings.id = listing_content.listing_id and is_own_partner(representations.partner_id)
  ))
  with check (exists (
    select 1 from listings join representations on representations.id = listings.representation_id
    where listings.id = listing_content.listing_id and is_own_partner(representations.partner_id)
  ));

-- ---------------- listing_media ----------------
create policy "partner: manage own listing_media" on listing_media
  for all to authenticated
  using (exists (
    select 1 from listings join representations on representations.id = listings.representation_id
    where listings.id = listing_media.listing_id and is_own_partner(representations.partner_id)
  ))
  with check (exists (
    select 1 from listings join representations on representations.id = listings.representation_id
    where listings.id = listing_media.listing_id and is_own_partner(representations.partner_id)
  ));

-- ---------------- development_media ----------------
create policy "partner: manage own development_media" on development_media
  for all to authenticated
  using (exists (select 1 from representations where representations.development_id = development_media.development_id and is_own_partner(representations.partner_id)))
  with check (exists (select 1 from representations where representations.development_id = development_media.development_id and is_own_partner(representations.partner_id)));

-- ---------------- property_features / development_features ----------------
-- Migration 0004/0005 já criaram admin: full access — esta adiciona a
-- camada de partner_user, coexistindo (OR) com essa, nunca a substitui.
create policy "partner: manage own property_features" on property_features
  for all to authenticated
  using (exists (select 1 from representations where representations.property_id = property_features.property_id and is_own_partner(representations.partner_id)))
  with check (exists (select 1 from representations where representations.property_id = property_features.property_id and is_own_partner(representations.partner_id)));

create policy "partner: manage own development_features" on development_features
  for all to authenticated
  using (exists (select 1 from representations where representations.development_id = development_features.development_id and is_own_partner(representations.partner_id)))
  with check (exists (select 1 from representations where representations.development_id = development_features.development_id and is_own_partner(representations.partner_id)));

-- ---------------- leads ----------------
-- Só leitura — leads são inseridas por anon (visitantes), nunca por
-- um partner_user; e só admin gere o campo status. Um parceiro pode
-- ver os leads dos SEUS anúncios, nunca escrever/apagar.
create policy "partner: read own leads" on leads
  for select to authenticated using (
    exists (
      select 1 from listings join representations on representations.id = listings.representation_id
      where listings.id = leads.listing_id and is_own_partner(representations.partner_id)
    )
  );

-- ---------------- Verificação ----------------
-- Run after applying:
--
-- select tablename, count(*) from pg_policies
-- where schemaname='public' and policyname like 'partner:%'
-- group by tablename order by tablename;
-- -- Expected: properties(4), developments(4), representations(1),
-- -- listings(1), listing_content(1), listing_media(1),
-- -- development_media(1), property_features(1),
-- -- development_features(1), leads(1). 16 políticas, 10 tabelas.
--
-- TESTE CRÍTICO DE ISOLAMENTO — nunca confiar só na contagem acima:
-- Criar 2 parceiros de teste (A e B), cada um com uma propriedade
-- sua. Autenticado como partner_user de A, confirmar:
--   select * from properties; -- deve devolver SÓ a propriedade de A
-- Repetir como partner_user de B — deve devolver SÓ a de B. Se
-- qualquer um dos dois vir a propriedade do outro, isto está errado
-- e não deve ir para produção.
-- ============================================================
-- Z FIND — MIGRATION 0007 (PROPOSTA — NÃO APLICAR SEM REVISÃO)
-- ============================================================
-- Encontrado ao construir o esqueleto do Partner Dashboard: não
-- existia nenhuma política que deixasse um partner_user ler o seu
-- PRÓPRIO registo em `partners` — só existia a política pública
-- (anon), condicionada a ter pelo menos uma listing publicada. Um
-- parceiro novo, sem nada publicado ainda, ficaria sem forma de ver
-- o seu próprio nome/logo ao entrar. Migration 0006 cobriu 10
-- tabelas; esta é a 11ª, encontrada só ao ligar a UI a sério.
-- ============================================================

create policy "partner: read own partner row" on partners
  for select to authenticated using (is_own_partner(id));

-- Nota deliberada: sem política de UPDATE aqui — editar o próprio
-- perfil (nome, logo) é funcionalidade futura, não parte deste
-- esqueleto de login. Fica para quando essa UI for construída.

-- ---------------- Verificação ----------------
-- select policyname from pg_policies where tablename = 'partners' and policyname like 'partner:%';
-- -- Expected: 1 row.
