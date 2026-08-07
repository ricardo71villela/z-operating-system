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
