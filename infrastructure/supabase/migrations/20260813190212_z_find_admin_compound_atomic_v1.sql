-- ============================================================
-- Z FIND — Admin Compound Atomic Commands v1
-- ============================================================
--
-- Converts multi-round-trip Admin mutations into transactional,
-- server-authorized database commands.
--
-- Covers:
--   - Property / Development hard delete
--   - Property / Development duplicate
--   - Property / Development feature replacement
--   - Listing / Development media cover selection
--   - Listing / Development media reorder
--
-- Lifecycle audit history deliberately survives operational
-- hard deletion, per Audit Delete Compatibility v1.
--
-- Verification assessments remain immutable authoritative truth.
-- Leads are never cascade-deleted by these commands.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Atomic Property / Development hard delete
-- ------------------------------------------------------------

create or replace function public.zfind_admin_delete_asset(
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
  v_count bigint;
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
  -- PROPERTY
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


    -- Verification truth makes the operational entity non-deletable.
    select count(*)
    into v_count
    from find.verification_assessments va
    where va.property_id = p_asset_id;

    if v_count > 0 then
      raise exception
        'Cannot delete Property: % verification assessment(s) exist',
        v_count
        using errcode = '55000';
    end if;


    -- Lock every Representation, not merely the first one.
    perform 1
    from public.representations r
    where r.target_type = 'property'
      and r.property_id = p_asset_id
    for update;


    select count(*)
    into v_count
    from find.verification_assessments va
    where va.representation_id in (
      select r.id
      from public.representations r
      where r.target_type = 'property'
        and r.property_id = p_asset_id
    );

    if v_count > 0 then
      raise exception
        'Cannot delete Property: % Representation verification assessment(s) exist',
        v_count
        using errcode = '55000';
    end if;


    -- Lock every Listing under every Representation.
    perform 1
    from public.listings l
    join public.representations r
      on r.id = l.representation_id
    where r.target_type = 'property'
      and r.property_id = p_asset_id
    for update of l;


    -- Leads are real business history and are never destroyed here.
    select count(*)
    into v_count
    from public.leads le
    join public.listings l
      on l.id = le.listing_id
    join public.representations r
      on r.id = l.representation_id
    where r.target_type = 'property'
      and r.property_id = p_asset_id;

    if v_count > 0 then
      raise exception
        'Cannot delete Property: % real lead(s) exist; unpublish instead',
        v_count
        using errcode = '55000';
    end if;


    -- Structural Listing-owned rows.
    delete from public.listing_content lc
    where lc.listing_id in (
      select l.id
      from public.listings l
      join public.representations r
        on r.id = l.representation_id
      where r.target_type = 'property'
        and r.property_id = p_asset_id
    );

    delete from public.listing_media lm
    where lm.listing_id in (
      select l.id
      from public.listings l
      join public.representations r
        on r.id = l.representation_id
      where r.target_type = 'property'
        and r.property_id = p_asset_id
    );

    delete from public.price_history ph
    where ph.listing_id in (
      select l.id
      from public.listings l
      join public.representations r
        on r.id = l.representation_id
      where r.target_type = 'property'
        and r.property_id = p_asset_id
    );

    delete from public.listings l
    where l.representation_id in (
      select r.id
      from public.representations r
      where r.target_type = 'property'
        and r.property_id = p_asset_id
    );

    delete from public.representations r
    where r.target_type = 'property'
      and r.property_id = p_asset_id;

    delete from public.property_features pf
    where pf.property_id = p_asset_id;

    delete from public.properties p
    where p.id = p_asset_id;


    return jsonb_build_object(
      'deleted', true,
      'kind', 'property',
      'id', p_asset_id
    );


  -- ----------------------------------------------------------
  -- DEVELOPMENT
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


    -- A Development containing units must be resolved explicitly,
    -- never partially destroyed.
    select count(*)
    into v_count
    from public.properties p
    where p.development_id = p_asset_id;

    if v_count > 0 then
      raise exception
        'Cannot delete Development: % child Propert(y/ies) still exist',
        v_count
        using errcode = '55000';
    end if;


    select count(*)
    into v_count
    from find.verification_assessments va
    where va.development_id = p_asset_id;

    if v_count > 0 then
      raise exception
        'Cannot delete Development: % verification assessment(s) exist',
        v_count
        using errcode = '55000';
    end if;


    perform 1
    from public.representations r
    where r.target_type = 'development'
      and r.development_id = p_asset_id
    for update;


    select count(*)
    into v_count
    from find.verification_assessments va
    where va.representation_id in (
      select r.id
      from public.representations r
      where r.target_type = 'development'
        and r.development_id = p_asset_id
    );

    if v_count > 0 then
      raise exception
        'Cannot delete Development: % Representation verification assessment(s) exist',
        v_count
        using errcode = '55000';
    end if;


    perform 1
    from public.listings l
    join public.representations r
      on r.id = l.representation_id
    where r.target_type = 'development'
      and r.development_id = p_asset_id
    for update of l;


    select count(*)
    into v_count
    from public.leads le
    join public.listings l
      on l.id = le.listing_id
    join public.representations r
      on r.id = l.representation_id
    where r.target_type = 'development'
      and r.development_id = p_asset_id;

    if v_count > 0 then
      raise exception
        'Cannot delete Development: % real lead(s) exist; unpublish instead',
        v_count
        using errcode = '55000';
    end if;


    delete from public.listing_content lc
    where lc.listing_id in (
      select l.id
      from public.listings l
      join public.representations r
        on r.id = l.representation_id
      where r.target_type = 'development'
        and r.development_id = p_asset_id
    );

    delete from public.listing_media lm
    where lm.listing_id in (
      select l.id
      from public.listings l
      join public.representations r
        on r.id = l.representation_id
      where r.target_type = 'development'
        and r.development_id = p_asset_id
    );

    delete from public.price_history ph
    where ph.listing_id in (
      select l.id
      from public.listings l
      join public.representations r
        on r.id = l.representation_id
      where r.target_type = 'development'
        and r.development_id = p_asset_id
    );

    delete from public.listings l
    where l.representation_id in (
      select r.id
      from public.representations r
      where r.target_type = 'development'
        and r.development_id = p_asset_id
    );

    delete from public.representations r
    where r.target_type = 'development'
      and r.development_id = p_asset_id;

    delete from public.development_features df
    where df.development_id = p_asset_id;

    delete from public.development_media dm
    where dm.development_id = p_asset_id;

    delete from public.developments d
    where d.id = p_asset_id;


    return jsonb_build_object(
      'deleted', true,
      'kind', 'development',
      'id', p_asset_id
    );

  else
    raise exception 'p_kind must be property or development'
      using errcode = '22023';
  end if;
end;
$$;


revoke all
on function public.zfind_admin_delete_asset(text, uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_admin_delete_asset(text, uuid)
to authenticated;



-- ------------------------------------------------------------
-- 2. Atomic duplicate
-- ------------------------------------------------------------

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
      price_current,
      currency_iso,
      price_is_from,
      status
    )
    values (
      v_new_rep.id,
      'standard',
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
      price_current,
      currency_iso,
      price_is_from,
      status
    )
    values (
      v_new_rep.id,
      'standard',
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


revoke all
on function public.zfind_admin_duplicate_asset(text, uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_admin_duplicate_asset(text, uuid)
to authenticated;



-- ------------------------------------------------------------
-- 3. Atomic feature replacement
-- ------------------------------------------------------------

create or replace function public.zfind_admin_replace_features(
  p_kind text,
  p_asset_id uuid,
  p_feature_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_count bigint;
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

  p_feature_ids := coalesce(p_feature_ids, '{}'::uuid[]);


  if exists (
    select 1
    from unnest(p_feature_ids) x(feature_id)
    where x.feature_id is null
  ) then
    raise exception 'Feature IDs cannot contain null'
      using errcode = '22023';
  end if;


  if exists (
    select 1
    from (
      select distinct x.feature_id
      from unnest(p_feature_ids) x(feature_id)
    ) requested
    where not exists (
      select 1
      from public.features f
      where f.id = requested.feature_id
    )
  ) then
    raise exception 'One or more Feature IDs do not exist'
      using errcode = '22023';
  end if;


  select count(distinct x.feature_id)
  into v_count
  from unnest(p_feature_ids) x(feature_id);


  if p_kind = 'property' then

    perform 1
    from public.properties p
    where p.id = p_asset_id
    for update;

    if not found then
      raise exception 'Property % not found', p_asset_id
        using errcode = '22023';
    end if;


    delete from public.property_features pf
    where pf.property_id = p_asset_id;

    insert into public.property_features (
      property_id,
      feature_id
    )
    select
      p_asset_id,
      requested.feature_id
    from (
      select distinct x.feature_id
      from unnest(p_feature_ids) x(feature_id)
    ) requested;


  elsif p_kind = 'development' then

    perform 1
    from public.developments d
    where d.id = p_asset_id
    for update;

    if not found then
      raise exception 'Development % not found', p_asset_id
        using errcode = '22023';
    end if;


    delete from public.development_features df
    where df.development_id = p_asset_id;

    insert into public.development_features (
      development_id,
      feature_id
    )
    select
      p_asset_id,
      requested.feature_id
    from (
      select distinct x.feature_id
      from unnest(p_feature_ids) x(feature_id)
    ) requested;


  else
    raise exception 'p_kind must be property or development'
      using errcode = '22023';
  end if;


  return jsonb_build_object(
    'kind', p_kind,
    'id', p_asset_id,
    'feature_count', v_count
  );
end;
$$;


revoke all
on function public.zfind_admin_replace_features(text, uuid, uuid[])
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_admin_replace_features(text, uuid, uuid[])
to authenticated;



-- ------------------------------------------------------------
-- 4. Atomic cover selection
-- ------------------------------------------------------------

create or replace function public.zfind_admin_set_media_cover(
  p_kind text,
  p_owner_id uuid,
  p_media_asset_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();

  v_listing_media public.listing_media%rowtype;
  v_development_media public.development_media%rowtype;
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

  if p_owner_id is null or p_media_asset_id is null then
    raise exception 'Owner and media asset IDs are required'
      using errcode = '22023';
  end if;


  if p_kind = 'listing' then

    perform 1
    from public.listings l
    where l.id = p_owner_id
    for update;

    if not found then
      raise exception 'Listing % not found', p_owner_id
        using errcode = '22023';
    end if;


    perform 1
    from public.listing_media lm
    where lm.listing_id = p_owner_id
      and lm.media_asset_id = p_media_asset_id
    for update;

    if not found then
      raise exception 'Media asset is not linked to this Listing'
        using errcode = '22023';
    end if;


    update public.listing_media lm
    set is_cover = false
    where lm.listing_id = p_owner_id;

    update public.listing_media lm
    set is_cover = true
    where lm.listing_id = p_owner_id
      and lm.media_asset_id = p_media_asset_id
    returning *
    into v_listing_media;

    return to_jsonb(v_listing_media);


  elsif p_kind = 'development' then

    perform 1
    from public.developments d
    where d.id = p_owner_id
    for update;

    if not found then
      raise exception 'Development % not found', p_owner_id
        using errcode = '22023';
    end if;


    perform 1
    from public.development_media dm
    where dm.development_id = p_owner_id
      and dm.media_asset_id = p_media_asset_id
    for update;

    if not found then
      raise exception 'Media asset is not linked to this Development'
        using errcode = '22023';
    end if;


    update public.development_media dm
    set is_cover = false
    where dm.development_id = p_owner_id;

    update public.development_media dm
    set is_cover = true
    where dm.development_id = p_owner_id
      and dm.media_asset_id = p_media_asset_id
    returning *
    into v_development_media;

    return to_jsonb(v_development_media);


  else
    raise exception 'p_kind must be listing or development'
      using errcode = '22023';
  end if;
end;
$$;


revoke all
on function public.zfind_admin_set_media_cover(text, uuid, uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_admin_set_media_cover(text, uuid, uuid)
to authenticated;



-- ------------------------------------------------------------
-- 5. Atomic media reorder
-- ------------------------------------------------------------

create or replace function public.zfind_admin_reorder_media(
  p_kind text,
  p_owner_id uuid,
  p_media_asset_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_existing_count bigint;
  v_requested_count bigint;
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

  if p_owner_id is null then
    raise exception 'p_owner_id is required'
      using errcode = '22023';
  end if;

  p_media_asset_ids := coalesce(p_media_asset_ids, '{}'::uuid[]);


  if exists (
    select 1
    from unnest(p_media_asset_ids) x(media_asset_id)
    where x.media_asset_id is null
  ) then
    raise exception 'Media order cannot contain null IDs'
      using errcode = '22023';
  end if;


  select count(*)
  into v_requested_count
  from unnest(p_media_asset_ids) x(media_asset_id);


  if v_requested_count <>
     (
       select count(distinct x.media_asset_id)
       from unnest(p_media_asset_ids) x(media_asset_id)
     )
  then
    raise exception 'Media order cannot contain duplicate IDs'
      using errcode = '22023';
  end if;


  if p_kind = 'listing' then

    perform 1
    from public.listings l
    where l.id = p_owner_id
    for update;

    if not found then
      raise exception 'Listing % not found', p_owner_id
        using errcode = '22023';
    end if;


    select count(*)
    into v_existing_count
    from public.listing_media lm
    where lm.listing_id = p_owner_id;


    if v_existing_count <> v_requested_count then
      raise exception
        'Media reorder must contain the complete Listing gallery (% expected, % supplied)',
        v_existing_count,
        v_requested_count
        using errcode = '22023';
    end if;


    if exists (
      select 1
      from unnest(p_media_asset_ids) x(media_asset_id)
      where not exists (
        select 1
        from public.listing_media lm
        where lm.listing_id = p_owner_id
          and lm.media_asset_id = x.media_asset_id
      )
    ) then
      raise exception 'Media order contains an asset not linked to this Listing'
        using errcode = '22023';
    end if;


    with ordered as (
      select
        x.media_asset_id,
        x.ordinality - 1 as position
      from unnest(p_media_asset_ids)
        with ordinality as x(media_asset_id, ordinality)
    )
    update public.listing_media lm
    set position = ordered.position
    from ordered
    where lm.listing_id = p_owner_id
      and lm.media_asset_id = ordered.media_asset_id;


  elsif p_kind = 'development' then

    perform 1
    from public.developments d
    where d.id = p_owner_id
    for update;

    if not found then
      raise exception 'Development % not found', p_owner_id
        using errcode = '22023';
    end if;


    select count(*)
    into v_existing_count
    from public.development_media dm
    where dm.development_id = p_owner_id;


    if v_existing_count <> v_requested_count then
      raise exception
        'Media reorder must contain the complete Development gallery (% expected, % supplied)',
        v_existing_count,
        v_requested_count
        using errcode = '22023';
    end if;


    if exists (
      select 1
      from unnest(p_media_asset_ids) x(media_asset_id)
      where not exists (
        select 1
        from public.development_media dm
        where dm.development_id = p_owner_id
          and dm.media_asset_id = x.media_asset_id
      )
    ) then
      raise exception 'Media order contains an asset not linked to this Development'
        using errcode = '22023';
    end if;


    with ordered as (
      select
        x.media_asset_id,
        x.ordinality - 1 as position
      from unnest(p_media_asset_ids)
        with ordinality as x(media_asset_id, ordinality)
    )
    update public.development_media dm
    set position = ordered.position
    from ordered
    where dm.development_id = p_owner_id
      and dm.media_asset_id = ordered.media_asset_id;


  else
    raise exception 'p_kind must be listing or development'
      using errcode = '22023';
  end if;


  return jsonb_build_object(
    'kind', p_kind,
    'owner_id', p_owner_id,
    'media_count', v_requested_count
  );
end;
$$;


revoke all
on function public.zfind_admin_reorder_media(text, uuid, uuid[])
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_admin_reorder_media(text, uuid, uuid[])
to authenticated;
