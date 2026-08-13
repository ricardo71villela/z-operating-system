-- ============================================================
-- Z FIND — Public RLS Runtime Convergence V1
--
-- Phase 3 runtime blocker:
-- anon SELECT on Properties / Developments / Representations /
-- Listings produced PostgreSQL 42P17:
--   infinite recursion detected in policy
--
-- Root cause:
-- public policies recursively queried other RLS-protected
-- marketplace relations:
--
--   properties
--      -> representations
--      -> listings
--      -> representations
--      -> properties/developments
--
-- Fix:
-- narrow SECURITY DEFINER visibility predicates evaluate the
-- complete public-truth invariant without recursively entering
-- the anon policies of the referenced relations.
--
-- Public truth remains:
--   Listing.status        = published
--   Representation.status = active
--   represented target    = not removed
--
-- No lifecycle authority is added.
-- No write privilege is added.
-- No RLS is disabled.
-- ============================================================


-- ------------------------------------------------------------
-- LISTING PUBLIC VISIBILITY
-- ------------------------------------------------------------

create or replace function public.zfind_public_listing_visible(
  p_listing_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.listings l
    join public.representations r
      on r.id = l.representation_id

    where l.id = p_listing_id
      and l.status = 'published'
      and r.status = 'active'

      and (
        (
          r.target_type = 'property'
          and exists (
            select 1
            from public.properties pr
            where pr.id = r.property_id
              and pr.removed_at is null
          )
        )

        or

        (
          r.target_type = 'development'
          and exists (
            select 1
            from public.developments d
            where d.id = r.development_id
              and d.removed_at is null
          )
        )
      )
  );
$$;


-- ------------------------------------------------------------
-- REPRESENTATION PUBLIC VISIBILITY
-- ------------------------------------------------------------

create or replace function public.zfind_public_representation_visible(
  p_representation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.representations r

    where r.id = p_representation_id
      and r.status = 'active'

      and exists (
        select 1
        from public.listings l
        where l.representation_id = r.id
          and l.status = 'published'
      )

      and (
        (
          r.target_type = 'property'
          and exists (
            select 1
            from public.properties pr
            where pr.id = r.property_id
              and pr.removed_at is null
          )
        )

        or

        (
          r.target_type = 'development'
          and exists (
            select 1
            from public.developments d
            where d.id = r.development_id
              and d.removed_at is null
          )
        )
      )
  );
$$;


-- ------------------------------------------------------------
-- PROPERTY PUBLIC VISIBILITY
-- ------------------------------------------------------------

create or replace function public.zfind_public_property_visible(
  p_property_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.properties pr

    where pr.id = p_property_id
      and pr.removed_at is null

      and exists (
        select 1

        from public.representations r

        join public.listings l
          on l.representation_id = r.id

        where r.target_type = 'property'
          and r.property_id = pr.id
          and r.status = 'active'
          and l.status = 'published'
      )
  );
$$;


-- ------------------------------------------------------------
-- DEVELOPMENT PUBLIC VISIBILITY
--
-- A Development is public when:
--   A) it has its own active Representation + published Listing
-- OR
--   B) it contains a non-removed Property which itself has an
--      active Representation + published Listing.
-- ------------------------------------------------------------

create or replace function public.zfind_public_development_visible(
  p_development_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.developments d

    where d.id = p_development_id
      and d.removed_at is null

      and (
        exists (
          select 1

          from public.representations r

          join public.listings l
            on l.representation_id = r.id

          where r.target_type = 'development'
            and r.development_id = d.id
            and r.status = 'active'
            and l.status = 'published'
        )

        or

        exists (
          select 1

          from public.properties pr

          join public.representations r
            on r.target_type = 'property'
           and r.property_id = pr.id

          join public.listings l
            on l.representation_id = r.id

          where pr.development_id = d.id
            and pr.removed_at is null
            and r.status = 'active'
            and l.status = 'published'
        )
      )
  );
$$;


-- ------------------------------------------------------------
-- These are public visibility predicates, not mutation RPCs.
--
-- anon requires EXECUTE because the functions are invoked by
-- anon SELECT policies.
-- They reveal only whether a UUID satisfies the exact public
-- publication invariant.
-- ------------------------------------------------------------

revoke all
on function public.zfind_public_listing_visible(uuid)
from public;

revoke all
on function public.zfind_public_representation_visible(uuid)
from public;

revoke all
on function public.zfind_public_property_visible(uuid)
from public;

revoke all
on function public.zfind_public_development_visible(uuid)
from public;


grant execute
on function public.zfind_public_listing_visible(uuid)
to anon;

grant execute
on function public.zfind_public_representation_visible(uuid)
to anon;

grant execute
on function public.zfind_public_property_visible(uuid)
to anon;

grant execute
on function public.zfind_public_development_visible(uuid)
to anon;


-- ------------------------------------------------------------
-- REPLACE ONLY THE RECURSIVE ANON SELECT POLICIES
-- ------------------------------------------------------------


drop policy if exists
  "public read properties referenced by published listings"
on public.properties;

create policy
  "public read properties referenced by published listings"
on public.properties
for select
to anon
using (
  public.zfind_public_property_visible(id)
);


drop policy if exists
  "public read developments referenced by published listings"
on public.developments;

create policy
  "public read developments referenced by published listings"
on public.developments
for select
to anon
using (
  public.zfind_public_development_visible(id)
);


drop policy if exists
  "public read active representations for published listings"
on public.representations;

create policy
  "public read active representations for published listings"
on public.representations
for select
to anon
using (
  public.zfind_public_representation_visible(id)
);


drop policy if exists
  "public read published listings"
on public.listings;

create policy
  "public read published listings"
on public.listings
for select
to anon
using (
  public.zfind_public_listing_visible(id)
);


drop policy if exists
  "public read listing content"
on public.listing_content;

create policy
  "public read listing content"
on public.listing_content
for select
to anon
using (
  public.zfind_public_listing_visible(listing_id)
);


drop policy if exists
  "public read listing_media associations for published listings"
on public.listing_media;

create policy
  "public read listing_media associations for published listings"
on public.listing_media
for select
to anon
using (
  public.zfind_public_listing_visible(listing_id)
);


drop policy if exists
  "public read development_media associations"
on public.development_media;

create policy
  "public read development_media associations"
on public.development_media
for select
to anon
using (
  public.zfind_public_development_visible(development_id)
);


comment on function public.zfind_public_listing_visible(uuid)
is
  'Internal anon-RLS visibility predicate. True only for a published Listing with active Representation and non-removed target. SECURITY DEFINER prevents recursive RLS evaluation.';

comment on function public.zfind_public_representation_visible(uuid)
is
  'Internal anon-RLS visibility predicate for active Representations backed by a published Listing and non-removed target.';

comment on function public.zfind_public_property_visible(uuid)
is
  'Internal anon-RLS visibility predicate for non-removed Properties backed by an active Representation and published Listing.';

comment on function public.zfind_public_development_visible(uuid)
is
  'Internal anon-RLS visibility predicate for non-removed Developments directly published or containing a publicly published Property.';
