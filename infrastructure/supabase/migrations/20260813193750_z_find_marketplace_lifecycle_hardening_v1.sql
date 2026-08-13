-- ============================================================
-- Z FIND — Marketplace Lifecycle Hardening v1
-- ============================================================
--
-- Representation and Listing deliberately retain independent
-- state machines.
--
-- This migration:
--   * removes the Partner Listing FOR ALL bypass;
--   * limits direct authenticated Listing UPDATE to commercial
--     fields only;
--   * removes direct authenticated INSERT/DELETE on Listings;
--   * removes direct authenticated writes to Representations;
--   * makes both lifecycles server-owned Admin commands;
--   * preserves the existing lifecycle-history triggers;
--   * does not introduce a universal ZOS lifecycle.
-- ============================================================


-- ============================================================
-- 1. LISTING WRITE BOUNDARY
-- ============================================================

drop policy if exists
  "partner: manage own listings"
on public.listings;

drop policy if exists
  "partner: view own listings"
on public.listings;

drop policy if exists
  "partner: update own listing commercial fields"
on public.listings;


create policy
  "partner: view own listings"
on public.listings
for select
to authenticated
using (
  exists (
    select 1
    from public.representations r
    where r.id = public.listings.representation_id
      and public.is_own_partner(r.partner_id)
  )
);


create policy
  "partner: update own listing commercial fields"
on public.listings
for update
to authenticated
using (
  exists (
    select 1
    from public.representations r
    where r.id = public.listings.representation_id
      and public.is_own_partner(r.partner_id)
  )
)
with check (
  exists (
    select 1
    from public.representations r
    where r.id = public.listings.representation_id
      and public.is_own_partner(r.partner_id)
  )
);


-- Remove broad table-level write privileges.
-- Admin lifecycle/bootstrap/delete now use SECURITY DEFINER commands.
revoke insert, delete, update
on public.listings
from authenticated;


-- Authenticated users may directly change only marketplace
-- commercial fields, still subject to RLS.
grant update (
  channel,
  price_current,
  currency_iso,
  price_is_from,
  tier,
  rental_period
)
on public.listings
to authenticated;


-- A published Listing must always carry a real positive price.
-- Current remote runtime contains no Listing rows, so this is
-- introduced without legacy reconciliation.
alter table public.listings
drop constraint if exists listings_published_positive_price;

alter table public.listings
add constraint listings_published_positive_price
check (
  status <> 'published'
  or price_current > 0
);


-- ============================================================
-- 2. REPRESENTATION WRITE BOUNDARY
-- ============================================================

-- Partner is already SELECT-only through RLS.
-- Remove direct authenticated writes so Admin lifecycle changes
-- must also go through the authoritative command.
revoke insert, update, delete
on public.representations
from authenticated;


-- ============================================================
-- 3. ADMIN REPRESENTATION STATE MACHINE
-- ============================================================

create or replace function public.zfind_admin_transition_representation(
  p_representation_id uuid,
  p_to_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_rep public.representations%rowtype;
  v_conflicts bigint;
  v_published bigint;
begin

  if v_actor is null
     or not exists (
       select 1
       from public.profiles p
       where p.id = v_actor
         and p.role = 'admin'
     )
  then
    raise exception 'Admin role required'
      using errcode = '42501';
  end if;


  if p_representation_id is null then
    raise exception 'p_representation_id is required'
      using errcode = '22023';
  end if;


  if p_to_status not in (
    'proposed',
    'active',
    'ended',
    'disputed'
  ) then
    raise exception 'Invalid Representation state: %', p_to_status
      using errcode = '22023';
  end if;


  select r.*
  into v_rep
  from public.representations r
  where r.id = p_representation_id
  for update;


  if not found then
    raise exception 'Representation % not found', p_representation_id
      using errcode = '22023';
  end if;


  -- Idempotent command: no state change, no duplicate history.
  if v_rep.status = p_to_status then
    return to_jsonb(v_rep);
  end if;


  -- ----------------------------------------------------------
  -- Legal Representation transitions
  --
  -- proposed -> active | disputed
  -- active   -> ended  | disputed
  -- disputed -> active | ended
  -- ended    -> terminal
  -- ----------------------------------------------------------

  if not (
       (v_rep.status = 'proposed'
        and p_to_status in ('active', 'disputed'))

    or (v_rep.status = 'active'
        and p_to_status in ('ended', 'disputed'))

    or (v_rep.status = 'disputed'
        and p_to_status in ('active', 'ended'))
  ) then
    raise exception
      'Illegal Representation transition: % -> %',
      v_rep.status,
      p_to_status
      using errcode = '55000';
  end if;


  -- An active Representation cannot disappear underneath a live
  -- public Listing. Suspend/archive the Listing first.
  if v_rep.status = 'active'
     and p_to_status in ('ended', 'disputed')
  then
    select count(*)
    into v_published
    from public.listings l
    where l.representation_id = v_rep.id
      and l.status = 'published';

    if v_published > 0 then
      raise exception
        'Cannot move active Representation to % while % published Listing(s) exist; suspend or archive them first',
        p_to_status,
        v_published
        using errcode = '55000';
    end if;
  end if;


  -- Give a clear domain error before the existing unique partial
  -- index would reject a second active Representation.
  if p_to_status = 'active' then

    if v_rep.target_type = 'property' then
      select count(*)
      into v_conflicts
      from public.representations r
      where r.id <> v_rep.id
        and r.target_type = 'property'
        and r.property_id = v_rep.property_id
        and r.status = 'active';

    elsif v_rep.target_type = 'development' then
      select count(*)
      into v_conflicts
      from public.representations r
      where r.id <> v_rep.id
        and r.target_type = 'development'
        and r.development_id = v_rep.development_id
        and r.status = 'active';

    else
      raise exception 'Unsupported Representation target_type'
        using errcode = '55000';
    end if;


    if v_conflicts > 0 then
      raise exception
        'Cannot activate Representation: represented target already has an active Representation'
        using errcode = '55000';
    end if;
  end if;


  update public.representations r
  set
    status = p_to_status,
    end_date = case
      when p_to_status = 'ended' then current_date
      else null
    end
  where r.id = v_rep.id
  returning *
  into v_rep;


  -- Existing lifecycle trigger remains authoritative and records
  -- auth.uid() as actor_profile_id.
  return to_jsonb(v_rep);
end;
$$;


comment on function public.zfind_admin_transition_representation(
  uuid,
  text
) is
  'Admin-only authoritative Representation lifecycle transition. Enforces legal transitions and prevents ending/disputing a Representation beneath a published Listing.';


revoke all
on function public.zfind_admin_transition_representation(uuid, text)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_admin_transition_representation(uuid, text)
to authenticated;



-- ============================================================
-- 4. ADMIN LISTING STATE MACHINE
-- ============================================================

create or replace function public.zfind_admin_transition_listing(
  p_listing_id uuid,
  p_to_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_listing public.listings%rowtype;
  v_rep public.representations%rowtype;
  v_other_published bigint;
begin

  if v_actor is null
     or not exists (
       select 1
       from public.profiles p
       where p.id = v_actor
         and p.role = 'admin'
     )
  then
    raise exception 'Admin role required'
      using errcode = '42501';
  end if;


  if p_listing_id is null then
    raise exception 'p_listing_id is required'
      using errcode = '22023';
  end if;


  if p_to_status not in (
    'draft',
    'incomplete',
    'pending_review',
    'ready',
    'published',
    'suspended',
    'archived'
  ) then
    raise exception 'Invalid Listing state: %', p_to_status
      using errcode = '22023';
  end if;


  select l.*
  into v_listing
  from public.listings l
  where l.id = p_listing_id
  for update;


  if not found then
    raise exception 'Listing % not found', p_listing_id
      using errcode = '22023';
  end if;


  select r.*
  into v_rep
  from public.representations r
  where r.id = v_listing.representation_id
  for update;


  if not found then
    raise exception 'Listing Representation not found'
      using errcode = '55000';
  end if;


  -- Idempotent command.
  if v_listing.status = p_to_status then
    return to_jsonb(v_listing);
  end if;


  -- ----------------------------------------------------------
  -- Legal Listing transitions
  --
  -- draft
  --   -> incomplete | pending_review | archived
  --
  -- incomplete
  --   -> draft | pending_review | archived
  --
  -- pending_review
  --   -> incomplete | ready | archived
  --
  -- ready
  --   -> pending_review | published | archived
  --
  -- published
  --   -> suspended | archived
  --
  -- suspended
  --   -> ready | archived
  --
  -- archived
  --   -> terminal
  --
  -- Critically: EVERY transition to published comes from ready.
  -- ----------------------------------------------------------

  if not (
       (v_listing.status = 'draft'
        and p_to_status in (
          'incomplete',
          'pending_review',
          'archived'
        ))

    or (v_listing.status = 'incomplete'
        and p_to_status in (
          'draft',
          'pending_review',
          'archived'
        ))

    or (v_listing.status = 'pending_review'
        and p_to_status in (
          'incomplete',
          'ready',
          'archived'
        ))

    or (v_listing.status = 'ready'
        and p_to_status in (
          'pending_review',
          'published',
          'archived'
        ))

    or (v_listing.status = 'published'
        and p_to_status in (
          'suspended',
          'archived'
        ))

    or (v_listing.status = 'suspended'
        and p_to_status in (
          'ready',
          'archived'
        ))
  ) then
    raise exception
      'Illegal Listing transition: % -> %',
      v_listing.status,
      p_to_status
      using errcode = '55000';
  end if;


  -- "ready" and "published" are meaningful quality states.
  -- No readiness-score engine exists yet, so we enforce only
  -- objective minimum operational data and do NOT fabricate a
  -- readiness score.
  if p_to_status in ('ready', 'published') then

    if v_listing.price_current <= 0 then
      raise exception
        'Listing must have a positive price before becoming %',
        p_to_status
        using errcode = '55000';
    end if;


    if not exists (
      select 1
      from public.listing_content lc
      where lc.listing_id = v_listing.id
        and nullif(pg_catalog.btrim(lc.title), '') is not null
        and nullif(pg_catalog.btrim(lc.description), '') is not null
    ) then
      raise exception
        'Listing requires at least one non-empty title and description before becoming %',
        p_to_status
        using errcode = '55000';
    end if;

  end if;


  -- Public truth requires an active Representation.
  if p_to_status = 'published'
     and v_rep.status <> 'active'
  then
    raise exception
      'Listing cannot be published while Representation is %; activate the Representation first',
      v_rep.status
      using errcode = '55000';
  end if;


  -- Clearer error than relying only on the existing unique partial
  -- index for one published Listing per Representation.
  if p_to_status = 'published' then

    select count(*)
    into v_other_published
    from public.listings l
    where l.representation_id = v_listing.representation_id
      and l.id <> v_listing.id
      and l.status = 'published';


    if v_other_published > 0 then
      raise exception
        'Representation already has a published Listing'
        using errcode = '55000';
    end if;

  end if;


  update public.listings l
  set status = p_to_status
  where l.id = v_listing.id
  returning *
  into v_listing;


  -- Existing lifecycle trigger remains authoritative.
  return to_jsonb(v_listing);
end;
$$;


comment on function public.zfind_admin_transition_listing(
  uuid,
  text
) is
  'Admin-only authoritative Listing lifecycle transition. Publishing is allowed only from ready, requires an active Representation and objective minimum publishable content.';


revoke all
on function public.zfind_admin_transition_listing(uuid, text)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_admin_transition_listing(uuid, text)
to authenticated;
