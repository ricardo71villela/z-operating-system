-- ============================================================
-- Z FIND — Rental Duplication + Bootstrap Convergence V1
--
-- Forward-only convergence after Rental Market Foundation.
--
-- Fixes:
--   1. Admin asset duplication preserves Listing transaction_type
--      and rental_period for both Property and Development.
--   2. Admin initial Listing explicitly starts as:
--          transaction_type = 'sale'
--          rental_period    = NULL
--   3. Partner Draft Listing explicitly starts with the same
--      commercial default.
--
-- Deliberately unchanged:
--   - duplicated Listing distribution resets to channel='standard';
--   - duplicated Listing lifecycle resets to status='draft';
--   - new Representations remain 'proposed';
--   - no Partner lifecycle authority is introduced.
-- ============================================================

create or replace function public.zfind_admin_duplicate_asset(
  p_kind text,
  p_asset_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();

  v_rep_count bigint;
  v_listing_count bigint;

  v_source_rep public.representations%rowtype;
  v_source_listing public.listings%rowtype;

  v_new_property public.properties%rowtype;
  v_new_development public.developments%rowtype;

  v_new_rep public.representations%rowtype;
  v_new_listing public.listings%rowtype;
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

  if p_asset_id is null then
    raise exception 'p_asset_id is required'
      using errcode = '22023';
  end if;


  -- ----------------------------------------------------------
  -- PROPERTY DUPLICATE
  -- ----------------------------------------------------------

  if p_kind = 'property' then

    perform 1
    from public.properties p
    where p.id = p_asset_id
    for update;

    if not found then
      raise exception 'Property % not found', p_asset_id
        using errcode = '22023';
    end if;


    select count(*)
    into v_rep_count
    from public.representations r
    where r.target_type = 'property'
      and r.property_id = p_asset_id;

    if v_rep_count > 1 then
      raise exception
        'Cannot duplicate Property: source has % Representations; resolve ambiguity first',
        v_rep_count
        using errcode = '55000';
    end if;


    if v_rep_count = 1 then
      select r.*
      into v_source_rep
      from public.representations r
      where r.target_type = 'property'
        and r.property_id = p_asset_id
      for update;

      select count(*)
      into v_listing_count
      from public.listings l
      where l.representation_id = v_source_rep.id;

      if v_listing_count > 1 then
        raise exception
          'Cannot duplicate Property: source Representation has % Listings; resolve ambiguity first',
          v_listing_count
          using errcode = '55000';
      end if;

      if v_listing_count = 1 then
        select l.*
        into v_source_listing
        from public.listings l
        where l.representation_id = v_source_rep.id
        for update;
      end if;
    end if;


    insert into public.properties (
      subtype,
      typology,
      area_sqm,
      floor,
      zone_lite_id,
      development_id
    )
    select
      p.subtype,
      p.typology,
      p.area_sqm,
      p.floor,
      p.zone_lite_id,
      p.development_id
    from public.properties p
    where p.id = p_asset_id
    returning *
    into v_new_property;


    if v_rep_count = 0 then
      return to_jsonb(v_new_property);
    end if;


    insert into public.representations (
      target_type,
      property_id,
      partner_id,
      status
    )
    values (
      'property',
      v_new_property.id,
      v_source_rep.partner_id,
      'proposed'
    )
    returning *
    into v_new_rep;


    if v_listing_count = 0 then
      return to_jsonb(v_new_property);
    end if;


    insert into public.listings (
      representation_id,
      channel,
      transaction_type,
      rental_period,
      price_current,
      currency_iso,
      price_is_from,
      status
    )
    values (
      v_new_rep.id,
      'standard',
      v_source_listing.transaction_type,
      v_source_listing.rental_period,
      v_source_listing.price_current,
      v_source_listing.currency_iso,
      v_source_listing.price_is_from,
      'draft'
    )
    returning *
    into v_new_listing;


    insert into public.listing_content (
      listing_id,
      locale,
      title,
      description
    )
    select
      v_new_listing.id,
      lc.locale,
      lc.title,
      lc.description
    from public.listing_content lc
    where lc.listing_id = v_source_listing.id;


    return to_jsonb(v_new_property);


  -- ----------------------------------------------------------
  -- DEVELOPMENT DUPLICATE
  -- ----------------------------------------------------------

  elsif p_kind = 'development' then

    perform 1
    from public.developments d
    where d.id = p_asset_id
    for update;

    if not found then
      raise exception 'Development % not found', p_asset_id
        using errcode = '22023';
    end if;


    select count(*)
    into v_rep_count
    from public.representations r
    where r.target_type = 'development'
      and r.development_id = p_asset_id;

    if v_rep_count > 1 then
      raise exception
        'Cannot duplicate Development: source has % Representations; resolve ambiguity first',
        v_rep_count
        using errcode = '55000';
    end if;


    if v_rep_count = 1 then
      select r.*
      into v_source_rep
      from public.representations r
      where r.target_type = 'development'
        and r.development_id = p_asset_id
      for update;

      select count(*)
      into v_listing_count
      from public.listings l
      where l.representation_id = v_source_rep.id;

      if v_listing_count > 1 then
        raise exception
          'Cannot duplicate Development: source Representation has % Listings; resolve ambiguity first',
          v_listing_count
          using errcode = '55000';
      end if;

      if v_listing_count = 1 then
        select l.*
        into v_source_listing
        from public.listings l
        where l.representation_id = v_source_rep.id
        for update;
      end if;
    end if;


    insert into public.developments (
      name,
      zone_lite_id,
      promoter_partner_id
    )
    select
      d.name || ' (copy)',
      d.zone_lite_id,
      d.promoter_partner_id
    from public.developments d
    where d.id = p_asset_id
    returning *
    into v_new_development;


    if v_rep_count = 0 then
      return to_jsonb(v_new_development);
    end if;


    insert into public.representations (
      target_type,
      development_id,
      partner_id,
      status
    )
    values (
      'development',
      v_new_development.id,
      v_source_rep.partner_id,
      'proposed'
    )
    returning *
    into v_new_rep;


    if v_listing_count = 0 then
      return to_jsonb(v_new_development);
    end if;


    insert into public.listings (
      representation_id,
      channel,
      transaction_type,
      rental_period,
      price_current,
      currency_iso,
      price_is_from,
      status
    )
    values (
      v_new_rep.id,
      'standard',
      v_source_listing.transaction_type,
      v_source_listing.rental_period,
      v_source_listing.price_current,
      v_source_listing.currency_iso,
      v_source_listing.price_is_from,
      'draft'
    )
    returning *
    into v_new_listing;


    insert into public.listing_content (
      listing_id,
      locale,
      title,
      description
    )
    select
      v_new_listing.id,
      lc.locale,
      lc.title,
      lc.description
    from public.listing_content lc
    where lc.listing_id = v_source_listing.id;


    return to_jsonb(v_new_development);

  else
    raise exception 'p_kind must be property or development'
      using errcode = '22023';
  end if;
end;
$$;


create or replace function public.zfind_admin_create_initial_listing(
  p_kind text,
  p_owner_id uuid,
  p_partner_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_rep public.representations%rowtype;
  v_listing public.listings%rowtype;
  v_rep_count integer;
  v_listing_count integer;
begin
  -- ----------------------------------------------------------
  -- Authentication / authorization belongs at the command
  -- boundary. Never trust the browser merely because this RPC
  -- is called from the Admin UI.
  -- ----------------------------------------------------------
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  ) then
    raise exception 'Admin authentication required'
      using errcode = '42501';
  end if;

  -- ----------------------------------------------------------
  -- Validate command arguments.
  -- ----------------------------------------------------------
  if p_kind is null or p_kind not in ('property', 'development') then
    raise exception 'kind must be property or development'
      using errcode = '22023';
  end if;

  if p_owner_id is null then
    raise exception 'owner_id is required'
      using errcode = '22023';
  end if;

  if p_partner_id is null then
    raise exception 'partner_id is required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.partners p
    where p.id = p_partner_id
  ) then
    raise exception 'Partner not found'
      using errcode = '22023';
  end if;

  -- ----------------------------------------------------------
  -- Lock the represented target.
  --
  -- This serializes competing bootstrap commands for the same
  -- Property/Development. A second transaction cannot observe
  -- "nothing exists" concurrently and create a duplicate graph.
  -- ----------------------------------------------------------
  if p_kind = 'property' then
    perform 1
    from public.properties p
    where p.id = p_owner_id
    for update;

    if not found then
      raise exception 'Property not found'
        using errcode = '22023';
    end if;
  else
    perform 1
    from public.developments d
    where d.id = p_owner_id
    for update;

    if not found then
      raise exception 'Development not found'
        using errcode = '22023';
    end if;
  end if;

  -- ----------------------------------------------------------
  -- This command is ONLY the initial bootstrap.
  --
  -- The schema intentionally permits multiple non-published
  -- Listings for future versioning workflows. We therefore do
  -- not add a database uniqueness constraint here.
  -- ----------------------------------------------------------
  select count(*)
  into v_listing_count
  from public.listings l
  join public.representations r
    on r.id = l.representation_id
  where
    (
      p_kind = 'property'
      and r.target_type = 'property'
      and r.property_id = p_owner_id
    )
    or
    (
      p_kind = 'development'
      and r.target_type = 'development'
      and r.development_id = p_owner_id
    );

  if v_listing_count > 0 then
    raise exception 'Initial listing already exists for this target'
      using errcode = '55000';
  end if;

  -- ----------------------------------------------------------
  -- Recover safely from a previous interrupted bootstrap:
  -- if exactly one Representation exists and no Listing exists,
  -- reuse it instead of manufacturing a second Representation.
  -- ----------------------------------------------------------
  select count(*)
  into v_rep_count
  from public.representations r
  where
    (
      p_kind = 'property'
      and r.target_type = 'property'
      and r.property_id = p_owner_id
    )
    or
    (
      p_kind = 'development'
      and r.target_type = 'development'
      and r.development_id = p_owner_id
    );

  if v_rep_count > 1 then
    raise exception 'Multiple representations exist without a listing; manual resolution required'
      using errcode = '55000';
  end if;

  if v_rep_count = 1 then
    select r.*
    into v_rep
    from public.representations r
    where
      (
        p_kind = 'property'
        and r.target_type = 'property'
        and r.property_id = p_owner_id
      )
      or
      (
        p_kind = 'development'
        and r.target_type = 'development'
        and r.development_id = p_owner_id
      )
    for update;

    if v_rep.partner_id <> p_partner_id then
      raise exception 'Existing representation belongs to a different partner'
        using errcode = '55000';
    end if;

    if v_rep.status not in ('proposed', 'active') then
      raise exception 'Existing representation is not eligible for initial listing bootstrap'
        using errcode = '55000';
    end if;
  else
    if p_kind = 'property' then
      insert into public.representations (
        target_type,
        property_id,
        partner_id,
        status
      )
      values (
        'property',
        p_owner_id,
        p_partner_id,
        'proposed'
      )
      returning *
      into v_rep;
    else
      insert into public.representations (
        target_type,
        development_id,
        partner_id,
        status
      )
      values (
        'development',
        p_owner_id,
        p_partner_id,
        'proposed'
      )
      returning *
      into v_rep;
    end if;
  end if;

  -- ----------------------------------------------------------
  -- The INSERT fires trg_zfind_listing_state_history.
  -- A newly-created Representation likewise fires its own
  -- lifecycle-history trigger.
  -- ----------------------------------------------------------
  insert into public.listings (
    representation_id,
    channel,
    transaction_type,
    rental_period,
    price_current,
    currency_iso,
    status
  )
  values (
    v_rep.id,
    'standard',
    'sale',
    null,
    0,
    'EUR',
    'draft'
  )
  returning *
  into v_listing;

  return to_jsonb(v_listing);
end;
$$;


create or replace function public.zfind_partner_ensure_draft_listing(
  p_kind text,
  p_asset_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_partner_id uuid;
  v_rep public.representations%rowtype;
  v_listing public.listings%rowtype;
begin
  select p.partner_id
    into v_partner_id
  from public.profiles p
  where p.id = auth.uid()
    and p.role = 'partner_user';

  if v_partner_id is null then
    raise exception 'Z Find Partner access required'
      using errcode = '42501';
  end if;

  if p_kind not in ('property', 'development') then
    raise exception 'kind must be property or development'
      using errcode = '22023';
  end if;


  if p_kind = 'property' then

    perform 1
    from public.properties pr
    where pr.id = p_asset_id
      and pr.removed_at is null
    for update;

    if not found then
      raise exception 'Property not found'
        using errcode = 'P0002';
    end if;

    if not public.zfind_partner_owns_property(p_asset_id) then
      raise exception 'Partner does not control this Property'
        using errcode = '42501';
    end if;

    if exists (
      select 1
      from public.representations r
      where r.property_id = p_asset_id
        and r.partner_id <> v_partner_id
        and r.status <> 'ended'
    ) then
      raise exception
        'Another Partner has a non-ended Representation for this Property'
        using errcode = '42501';
    end if;

    select r.*
      into v_rep
    from public.representations r
    where r.property_id = p_asset_id
      and r.partner_id = v_partner_id
      and r.status <> 'ended'
    order by r.created_at desc, r.id desc
    limit 1
    for update;

    if not found then
      insert into public.representations (
        target_type,
        property_id,
        partner_id,
        status
      )
      values (
        'property',
        p_asset_id,
        v_partner_id,
        'proposed'
      )
      returning *
        into v_rep;
    end if;


  else

    perform 1
    from public.developments d
    where d.id = p_asset_id
      and d.removed_at is null
    for update;

    if not found then
      raise exception 'Development not found'
        using errcode = 'P0002';
    end if;

    if not public.zfind_partner_owns_development(p_asset_id) then
      raise exception 'Partner does not control this Development'
        using errcode = '42501';
    end if;

    if exists (
      select 1
      from public.representations r
      where r.development_id = p_asset_id
        and r.partner_id <> v_partner_id
        and r.status <> 'ended'
    ) then
      raise exception
        'Another Partner has a non-ended Representation for this Development'
        using errcode = '42501';
    end if;

    select r.*
      into v_rep
    from public.representations r
    where r.development_id = p_asset_id
      and r.partner_id = v_partner_id
      and r.status <> 'ended'
    order by r.created_at desc, r.id desc
    limit 1
    for update;

    if not found then
      insert into public.representations (
        target_type,
        development_id,
        partner_id,
        status
      )
      values (
        'development',
        p_asset_id,
        v_partner_id,
        'proposed'
      )
      returning *
        into v_rep;
    end if;

  end if;


  select l.*
    into v_listing
  from public.listings l
  where l.representation_id = v_rep.id
    and l.status <> 'archived'
  order by l.created_at desc, l.id desc
  limit 1
  for update;

  if found then
    return pg_catalog.to_jsonb(v_listing);
  end if;


  insert into public.listings (
    representation_id,
    channel,
    transaction_type,
    rental_period,
    price_current,
    currency_iso,
    price_is_from,
    status
  )
  values (
    v_rep.id,
    'standard',
    'sale',
    null,
    0,
    'EUR',
    false,
    'draft'
  )
  returning *
    into v_listing;

  return pg_catalog.to_jsonb(v_listing);
end;
$$;
-- ------------------------------------------------------------
-- Preserve the already-validated command exposure.
-- CREATE OR REPLACE retains privileges, but keep the boundary
-- explicit in this convergence migration.
-- ------------------------------------------------------------

revoke all
on function public.zfind_admin_duplicate_asset(text, uuid)
from public;

revoke all
on function public.zfind_admin_duplicate_asset(text, uuid)
from anon;

grant execute
on function public.zfind_admin_duplicate_asset(text, uuid)
to authenticated;


revoke all
on function public.zfind_admin_create_initial_listing(
  text,
  uuid,
  uuid
)
from public;

revoke all
on function public.zfind_admin_create_initial_listing(
  text,
  uuid,
  uuid
)
from anon;

grant execute
on function public.zfind_admin_create_initial_listing(
  text,
  uuid,
  uuid
)
to authenticated;


revoke all
on function public.zfind_partner_ensure_draft_listing(
  text,
  uuid
)
from public;

revoke all
on function public.zfind_partner_ensure_draft_listing(
  text,
  uuid
)
from anon;

grant execute
on function public.zfind_partner_ensure_draft_listing(
  text,
  uuid
)
to authenticated;


comment on function public.zfind_admin_duplicate_asset(
  text,
  uuid
) is
  'Admin-only atomic asset duplication. Rental convergence preserves transaction_type and rental_period while duplicated Listings restart draft/standard.';


comment on function public.zfind_admin_create_initial_listing(
  text,
  uuid,
  uuid
) is
  'Admin-only initial Listing bootstrap. New Listings explicitly start as sale with no rental period.';


comment on function public.zfind_partner_ensure_draft_listing(
  text,
  uuid
) is
  'Partner-owned Draft Listing bootstrap. New Listings explicitly start as sale with no rental period; Partner may later author rent through the commercial boundary.';
