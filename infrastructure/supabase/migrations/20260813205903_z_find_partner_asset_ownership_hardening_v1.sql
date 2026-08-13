-- ============================================================
-- Z FIND — Partner Asset Ownership Hardening v1
--
-- Goals:
--   * Partner can create and edit its own inventory.
--   * Development units can only be created inside a Development
--     controlled by the authenticated Partner.
--   * Ownership / relationship fields are server-controlled.
--   * Partner feature replacement is atomic.
--   * Broad Partner FOR ALL policies are removed.
--   * Admin authority remains intact.
--   * Listing / Representation lifecycle remains independent.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Preconditions
-- ------------------------------------------------------------

do $$
begin
  if pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.partners') is null
     or pg_catalog.to_regclass('public.properties') is null
     or pg_catalog.to_regclass('public.developments') is null
     or pg_catalog.to_regclass('public.representations') is null
     or pg_catalog.to_regclass('public.listings') is null then
    raise exception 'Z Find Partner asset hardening prerequisites are missing';
  end if;
end;
$$;


-- ------------------------------------------------------------
-- 2. Canonical Partner control predicates
-- ------------------------------------------------------------

create or replace function public.zfind_partner_controls_representation(
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
    from public.profiles p
    join public.representations r
      on r.id = p_representation_id
    where p.id = auth.uid()
      and p.role = 'partner_user'
      and p.partner_id is not null
      and r.partner_id = p.partner_id
      and r.status <> 'ended'
  );
$$;

revoke all
on function public.zfind_partner_controls_representation(uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_partner_controls_representation(uuid)
to authenticated;


create or replace function public.zfind_partner_owns_development(
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
    from public.profiles p
    join public.developments d
      on d.id = p_development_id
    where p.id = auth.uid()
      and p.role = 'partner_user'
      and p.partner_id is not null
      and (
        d.promoter_partner_id = p.partner_id
        or exists (
          select 1
          from public.representations r
          where r.development_id = d.id
            and r.partner_id = p.partner_id
            and r.status <> 'ended'
        )
      )
  );
$$;

revoke all
on function public.zfind_partner_owns_development(uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_partner_owns_development(uuid)
to authenticated;


create or replace function public.zfind_partner_owns_property(
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
    from public.profiles p
    join public.properties pr
      on pr.id = p_property_id
    where p.id = auth.uid()
      and p.role = 'partner_user'
      and p.partner_id is not null
      and (
        exists (
          select 1
          from public.representations r
          where r.property_id = pr.id
            and r.partner_id = p.partner_id
            and r.status <> 'ended'
        )
        or exists (
          select 1
          from public.developments d
          where d.id = pr.development_id
            and (
              d.promoter_partner_id = p.partner_id
              or exists (
                select 1
                from public.representations dr
                where dr.development_id = d.id
                  and dr.partner_id = p.partner_id
                  and dr.status <> 'ended'
              )
            )
        )
      )
  );
$$;

revoke all
on function public.zfind_partner_owns_property(uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_partner_owns_property(uuid)
to authenticated;


-- ------------------------------------------------------------
-- 3. Remove direct Partner structural mutations
-- ------------------------------------------------------------

drop policy if exists "partner: create properties"
  on public.properties;

drop policy if exists "partner: update own properties"
  on public.properties;

drop policy if exists "partner: delete own properties"
  on public.properties;

drop policy if exists "partner: create developments"
  on public.developments;

drop policy if exists "partner: update own developments"
  on public.developments;

drop policy if exists "partner: delete own developments"
  on public.developments;


-- Replace SELECT ownership rules with canonical ownership predicates.

drop policy if exists "partner: view own properties"
  on public.properties;

create policy "partner: view own properties"
on public.properties
for select
to authenticated
using (
  public.zfind_partner_owns_property(id)
);


drop policy if exists "partner: view own developments"
  on public.developments;

create policy "partner: view own developments"
on public.developments
for select
to authenticated
using (
  public.zfind_partner_owns_development(id)
);


-- ------------------------------------------------------------
-- 4. Close broad child-table Partner FOR ALL policies
-- ------------------------------------------------------------

drop policy if exists "partner: manage own listing_content"
  on public.listing_content;

drop policy if exists "partner: view own listing_content"
  on public.listing_content;

create policy "partner: view own listing_content"
on public.listing_content
for select
to authenticated
using (
  exists (
    select 1
    from public.listings l
    where l.id = listing_content.listing_id
      and public.zfind_partner_controls_representation(
        l.representation_id
      )
  )
);


drop policy if exists "partner: manage own listing_media"
  on public.listing_media;

drop policy if exists "partner: view own listing_media"
  on public.listing_media;

create policy "partner: view own listing_media"
on public.listing_media
for select
to authenticated
using (
  exists (
    select 1
    from public.listings l
    where l.id = listing_media.listing_id
      and public.zfind_partner_controls_representation(
        l.representation_id
      )
  )
);


drop policy if exists "partner: manage own development_media"
  on public.development_media;

drop policy if exists "partner: view own development_media"
  on public.development_media;

create policy "partner: view own development_media"
on public.development_media
for select
to authenticated
using (
  public.zfind_partner_owns_development(
    development_media.development_id
  )
);


drop policy if exists "partner: manage own property_features"
  on public.property_features;

drop policy if exists "partner: view own property_features"
  on public.property_features;

create policy "partner: view own property_features"
on public.property_features
for select
to authenticated
using (
  public.zfind_partner_owns_property(
    property_features.property_id
  )
);


drop policy if exists "partner: manage own development_features"
  on public.development_features;

drop policy if exists "partner: view own development_features"
  on public.development_features;

create policy "partner: view own development_features"
on public.development_features
for select
to authenticated
using (
  public.zfind_partner_owns_development(
    development_features.development_id
  )
);


-- Partner Dashboard needs the feature catalogue itself.

drop policy if exists "partner: read features"
  on public.features;

create policy "partner: read features"
on public.features
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'partner_user'
      and p.partner_id is not null
  )
);


-- ------------------------------------------------------------
-- 5. Listing commercial edits remain Partner-controlled,
--    but only under a live/current Representation and never archived.
-- ------------------------------------------------------------

drop policy if exists
  "partner: update own listing commercial fields"
  on public.listings;

create policy "partner: update own listing commercial fields"
on public.listings
for update
to authenticated
using (
  status <> 'archived'
  and public.zfind_partner_controls_representation(
    representation_id
  )
)
with check (
  status <> 'archived'
  and public.zfind_partner_controls_representation(
    representation_id
  )
);


-- ------------------------------------------------------------
-- 6. Server-owned Property creation
--
-- Admin:
--   creates the Property exactly as before.
--
-- Partner:
--   creates Property + proposed Representation atomically.
--   If development_id is supplied, the Development MUST belong
--   to/control the authenticated Partner.
-- ------------------------------------------------------------

create or replace function public.zfind_create_property(
  p_subtype text,
  p_typology text default null,
  p_area_sqm numeric default null,
  p_floor integer default null,
  p_zone_lite_id uuid default null,
  p_development_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_role text;
  v_partner_id uuid;
  v_zone_lite_id uuid := p_zone_lite_id;
  v_property public.properties%rowtype;
  v_development public.developments%rowtype;
begin
  select p.role, p.partner_id
    into v_role, v_partner_id
  from public.profiles p
  where p.id = auth.uid();

  if v_role not in ('admin', 'partner_user') then
    raise exception 'Z Find asset mutation access required'
      using errcode = '42501';
  end if;

  if pg_catalog.btrim(pg_catalog.coalesce(p_subtype, '')) = '' then
    raise exception 'Property subtype is required'
      using errcode = '22023';
  end if;

  if v_role = 'partner_user' then
    if v_partner_id is null then
      raise exception 'Z Find Partner profile is not linked'
        using errcode = '42501';
    end if;

    if p_development_id is not null then
      select d.*
        into v_development
      from public.developments d
      where d.id = p_development_id
      for update;

      if not found then
        raise exception 'Development not found'
          using errcode = 'P0002';
      end if;

      if not public.zfind_partner_owns_development(
        p_development_id
      ) then
        raise exception
          'Cannot create a unit inside another Partner''s Development'
          using errcode = '42501';
      end if;

      if v_zone_lite_id is null then
        v_zone_lite_id := v_development.zone_lite_id;
      end if;
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
  values (
    pg_catalog.btrim(p_subtype),
    p_typology,
    p_area_sqm,
    p_floor,
    v_zone_lite_id,
    p_development_id
  )
  returning *
    into v_property;

  if v_role = 'partner_user' then
    insert into public.representations (
      target_type,
      property_id,
      partner_id,
      status
    )
    values (
      'property',
      v_property.id,
      v_partner_id,
      'proposed'
    );
  end if;

  return pg_catalog.to_jsonb(v_property);
end;
$$;

revoke all
on function public.zfind_create_property(
  text, text, numeric, integer, uuid, uuid
)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_create_property(
  text, text, numeric, integer, uuid, uuid
)
to authenticated;


-- ------------------------------------------------------------
-- 7. Correct the existing Partner Property create command.
--    It MUST be SECURITY DEFINER.
-- ------------------------------------------------------------

create or replace function public.zfind_partner_create_property(
  p_subtype text,
  p_typology text default null,
  p_area_sqm numeric default null,
  p_floor integer default null,
  p_zone_lite_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_partner_id uuid;
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

  return public.zfind_create_property(
    p_subtype,
    p_typology,
    p_area_sqm,
    p_floor,
    p_zone_lite_id,
    null
  );
end;
$$;

revoke all
on function public.zfind_partner_create_property(
  text, text, numeric, integer, uuid
)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_partner_create_property(
  text, text, numeric, integer, uuid
)
to authenticated;


-- ------------------------------------------------------------
-- 8. Correct the existing Partner Development create command.
--    Promoter ownership is now explicitly server-owned.
-- ------------------------------------------------------------

create or replace function public.zfind_partner_create_development(
  p_name text,
  p_zone_lite_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_partner_id uuid;
  v_development public.developments%rowtype;
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

  if pg_catalog.btrim(pg_catalog.coalesce(p_name, '')) = '' then
    raise exception 'Development name is required'
      using errcode = '22023';
  end if;

  insert into public.developments (
    name,
    zone_lite_id,
    promoter_partner_id
  )
  values (
    pg_catalog.btrim(p_name),
    p_zone_lite_id,
    v_partner_id
  )
  returning *
    into v_development;

  insert into public.representations (
    target_type,
    development_id,
    partner_id,
    status
  )
  values (
    'development',
    v_development.id,
    v_partner_id,
    'proposed'
  );

  return pg_catalog.to_jsonb(v_development);
end;
$$;

revoke all
on function public.zfind_partner_create_development(
  text, uuid
)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_partner_create_development(
  text, uuid
)
to authenticated;


-- ------------------------------------------------------------
-- 9. Server-owned asset edits
--
-- Same RPC serves Admin + Partner.
-- Partner ownership is derived from auth.uid().
-- Structural ownership relations cannot be changed by Partner.
-- ------------------------------------------------------------

create or replace function public.zfind_update_asset(
  p_kind text,
  p_asset_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_role text;
  v_bad_keys text[];
  v_property public.properties%rowtype;
  v_development public.developments%rowtype;
begin
  select p.role
    into v_role
  from public.profiles p
  where p.id = auth.uid();

  if v_role not in ('admin', 'partner_user') then
    raise exception 'Z Find asset mutation access required'
      using errcode = '42501';
  end if;

  if p_patch is null
     or pg_catalog.jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Asset patch must be a JSON object'
      using errcode = '22023';
  end if;


  if p_kind = 'property' then

    select pg_catalog.array_agg(k)
      into v_bad_keys
    from pg_catalog.jsonb_object_keys(p_patch) as keys(k)
    where not (
      k = any (
        array[
          'subtype',
          'typology',
          'area_sqm',
          'floor',
          'zone_lite_id',
          'development_id',
          'energy_rating',
          'energy_certificate_number',
          'license_number',
          'street_address',
          'postal_code',
          'latitude',
          'longitude',
          'bedrooms',
          'living_rooms',
          'bathrooms',
          'gross_private_area_sqm',
          'dependent_area_sqm',
          'plot_area_sqm',
          'year_built',
          'condition',
          'unit_floors',
          'condo_fee_monthly',
          'imi_annual',
          'taxable_value',
          'payment_terms',
          'accepts_trade',
          'agency_reference',
          'tour_360_url'
        ]::text[]
      )
    );

    if v_bad_keys is not null then
      raise exception 'Unsupported Property field(s): %',
        pg_catalog.array_to_string(v_bad_keys, ', ')
        using errcode = '22023';
    end if;

    select pr.*
      into v_property
    from public.properties pr
    where pr.id = p_asset_id
    for update;

    if not found then
      raise exception 'Property not found'
        using errcode = 'P0002';
    end if;

    if v_role = 'partner_user' then
      if not public.zfind_partner_owns_property(p_asset_id) then
        raise exception 'Partner does not control this Property'
          using errcode = '42501';
      end if;

      if p_patch ? 'development_id' then
        raise exception
          'Partner cannot change Property development ownership directly'
          using errcode = '42501';
      end if;
    end if;

    if p_patch ? 'subtype'
       and pg_catalog.btrim(
         pg_catalog.coalesce(p_patch ->> 'subtype', '')
       ) = '' then
      raise exception 'Property subtype cannot be empty'
        using errcode = '22023';
    end if;

    update public.properties pr
    set
      subtype =
        case when p_patch ? 'subtype'
          then p_patch ->> 'subtype'
          else pr.subtype end,

      typology =
        case when p_patch ? 'typology'
          then p_patch ->> 'typology'
          else pr.typology end,

      area_sqm =
        case when p_patch ? 'area_sqm'
          then (p_patch ->> 'area_sqm')::numeric
          else pr.area_sqm end,

      floor =
        case when p_patch ? 'floor'
          then (p_patch ->> 'floor')::integer
          else pr.floor end,

      zone_lite_id =
        case when p_patch ? 'zone_lite_id'
          then (p_patch ->> 'zone_lite_id')::uuid
          else pr.zone_lite_id end,

      development_id =
        case when p_patch ? 'development_id'
          then (p_patch ->> 'development_id')::uuid
          else pr.development_id end,

      energy_rating =
        case when p_patch ? 'energy_rating'
          then p_patch ->> 'energy_rating'
          else pr.energy_rating end,

      energy_certificate_number =
        case when p_patch ? 'energy_certificate_number'
          then p_patch ->> 'energy_certificate_number'
          else pr.energy_certificate_number end,

      license_number =
        case when p_patch ? 'license_number'
          then p_patch ->> 'license_number'
          else pr.license_number end,

      street_address =
        case when p_patch ? 'street_address'
          then p_patch ->> 'street_address'
          else pr.street_address end,

      postal_code =
        case when p_patch ? 'postal_code'
          then p_patch ->> 'postal_code'
          else pr.postal_code end,

      latitude =
        case when p_patch ? 'latitude'
          then (p_patch ->> 'latitude')::numeric
          else pr.latitude end,

      longitude =
        case when p_patch ? 'longitude'
          then (p_patch ->> 'longitude')::numeric
          else pr.longitude end,

      bedrooms =
        case when p_patch ? 'bedrooms'
          then (p_patch ->> 'bedrooms')::integer
          else pr.bedrooms end,

      living_rooms =
        case when p_patch ? 'living_rooms'
          then (p_patch ->> 'living_rooms')::integer
          else pr.living_rooms end,

      bathrooms =
        case when p_patch ? 'bathrooms'
          then (p_patch ->> 'bathrooms')::integer
          else pr.bathrooms end,

      gross_private_area_sqm =
        case when p_patch ? 'gross_private_area_sqm'
          then (p_patch ->> 'gross_private_area_sqm')::numeric
          else pr.gross_private_area_sqm end,

      dependent_area_sqm =
        case when p_patch ? 'dependent_area_sqm'
          then (p_patch ->> 'dependent_area_sqm')::numeric
          else pr.dependent_area_sqm end,

      plot_area_sqm =
        case when p_patch ? 'plot_area_sqm'
          then (p_patch ->> 'plot_area_sqm')::numeric
          else pr.plot_area_sqm end,

      year_built =
        case when p_patch ? 'year_built'
          then (p_patch ->> 'year_built')::integer
          else pr.year_built end,

      condition =
        case when p_patch ? 'condition'
          then p_patch ->> 'condition'
          else pr.condition end,

      unit_floors =
        case when p_patch ? 'unit_floors'
          then (p_patch ->> 'unit_floors')::integer
          else pr.unit_floors end,

      condo_fee_monthly =
        case when p_patch ? 'condo_fee_monthly'
          then (p_patch ->> 'condo_fee_monthly')::numeric
          else pr.condo_fee_monthly end,

      imi_annual =
        case when p_patch ? 'imi_annual'
          then (p_patch ->> 'imi_annual')::numeric
          else pr.imi_annual end,

      taxable_value =
        case when p_patch ? 'taxable_value'
          then (p_patch ->> 'taxable_value')::numeric
          else pr.taxable_value end,

      payment_terms =
        case when p_patch ? 'payment_terms'
          then p_patch ->> 'payment_terms'
          else pr.payment_terms end,

      accepts_trade =
        case when p_patch ? 'accepts_trade'
          then (p_patch ->> 'accepts_trade')::boolean
          else pr.accepts_trade end,

      agency_reference =
        case when p_patch ? 'agency_reference'
          then p_patch ->> 'agency_reference'
          else pr.agency_reference end,

      tour_360_url =
        case when p_patch ? 'tour_360_url'
          then p_patch ->> 'tour_360_url'
          else pr.tour_360_url end

    where pr.id = p_asset_id
    returning *
      into v_property;

    return pg_catalog.to_jsonb(v_property);


  elsif p_kind = 'development' then

    select pg_catalog.array_agg(k)
      into v_bad_keys
    from pg_catalog.jsonb_object_keys(p_patch) as keys(k)
    where not (
      k = any (
        array[
          'name',
          'zone_lite_id',
          'promoter_partner_id',
          'total_units',
          'building_floors',
          'footprint_area_sqm',
          'expected_completion',
          'project_phase',
          'developer_name'
        ]::text[]
      )
    );

    if v_bad_keys is not null then
      raise exception 'Unsupported Development field(s): %',
        pg_catalog.array_to_string(v_bad_keys, ', ')
        using errcode = '22023';
    end if;

    select d.*
      into v_development
    from public.developments d
    where d.id = p_asset_id
    for update;

    if not found then
      raise exception 'Development not found'
        using errcode = 'P0002';
    end if;

    if v_role = 'partner_user' then
      if not public.zfind_partner_owns_development(
        p_asset_id
      ) then
        raise exception 'Partner does not control this Development'
          using errcode = '42501';
      end if;

      if p_patch ? 'promoter_partner_id' then
        raise exception
          'Partner cannot change Development promoter ownership'
          using errcode = '42501';
      end if;
    end if;

    if p_patch ? 'name'
       and pg_catalog.btrim(
         pg_catalog.coalesce(p_patch ->> 'name', '')
       ) = '' then
      raise exception 'Development name cannot be empty'
        using errcode = '22023';
    end if;

    update public.developments d
    set
      name =
        case when p_patch ? 'name'
          then p_patch ->> 'name'
          else d.name end,

      zone_lite_id =
        case when p_patch ? 'zone_lite_id'
          then (p_patch ->> 'zone_lite_id')::uuid
          else d.zone_lite_id end,

      promoter_partner_id =
        case when p_patch ? 'promoter_partner_id'
          then (p_patch ->> 'promoter_partner_id')::uuid
          else d.promoter_partner_id end,

      total_units =
        case when p_patch ? 'total_units'
          then (p_patch ->> 'total_units')::integer
          else d.total_units end,

      building_floors =
        case when p_patch ? 'building_floors'
          then (p_patch ->> 'building_floors')::integer
          else d.building_floors end,

      footprint_area_sqm =
        case when p_patch ? 'footprint_area_sqm'
          then (p_patch ->> 'footprint_area_sqm')::numeric
          else d.footprint_area_sqm end,

      expected_completion =
        case when p_patch ? 'expected_completion'
          then (p_patch ->> 'expected_completion')::date
          else d.expected_completion end,

      project_phase =
        case when p_patch ? 'project_phase'
          then p_patch ->> 'project_phase'
          else d.project_phase end,

      developer_name =
        case when p_patch ? 'developer_name'
          then p_patch ->> 'developer_name'
          else d.developer_name end

    where d.id = p_asset_id
    returning *
      into v_development;

    return pg_catalog.to_jsonb(v_development);

  else
    raise exception 'Unsupported asset kind: %', p_kind
      using errcode = '22023';
  end if;
end;
$$;

revoke all
on function public.zfind_update_asset(
  text, uuid, jsonb
)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_update_asset(
  text, uuid, jsonb
)
to authenticated;


-- ------------------------------------------------------------
-- 10. Atomic feature replacement for Admin OR owning Partner
-- ------------------------------------------------------------

create or replace function public.zfind_replace_features(
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
  v_role text;
  v_feature_ids uuid[] :=
    pg_catalog.coalesce(
      p_feature_ids,
      array[]::uuid[]
    );
  v_requested integer;
  v_distinct integer;
  v_found integer;
begin
  select p.role
    into v_role
  from public.profiles p
  where p.id = auth.uid();

  if v_role not in ('admin', 'partner_user') then
    raise exception 'Z Find feature mutation access required'
      using errcode = '42501';
  end if;

  select pg_catalog.count(*)
    into v_requested
  from pg_catalog.unnest(v_feature_ids) as u(feature_id);

  select pg_catalog.count(distinct u.feature_id)
    into v_distinct
  from pg_catalog.unnest(v_feature_ids) as u(feature_id);

  if v_requested <> v_distinct then
    raise exception 'Feature list contains duplicates or null values'
      using errcode = '22023';
  end if;

  select pg_catalog.count(*)
    into v_found
  from public.features f
  where f.id = any(v_feature_ids);

  if v_found <> v_requested then
    raise exception 'Feature list contains unknown feature IDs'
      using errcode = '22023';
  end if;


  if p_kind = 'property' then

    perform 1
    from public.properties pr
    where pr.id = p_asset_id
    for update;

    if not found then
      raise exception 'Property not found'
        using errcode = 'P0002';
    end if;

    if v_role = 'partner_user'
       and not public.zfind_partner_owns_property(
         p_asset_id
       ) then
      raise exception 'Partner does not control this Property'
        using errcode = '42501';
    end if;

    delete from public.property_features
    where property_id = p_asset_id;

    insert into public.property_features (
      property_id,
      feature_id
    )
    select
      p_asset_id,
      u.feature_id
    from pg_catalog.unnest(v_feature_ids)
      as u(feature_id);


  elsif p_kind = 'development' then

    perform 1
    from public.developments d
    where d.id = p_asset_id
    for update;

    if not found then
      raise exception 'Development not found'
        using errcode = 'P0002';
    end if;

    if v_role = 'partner_user'
       and not public.zfind_partner_owns_development(
         p_asset_id
       ) then
      raise exception 'Partner does not control this Development'
        using errcode = '42501';
    end if;

    delete from public.development_features
    where development_id = p_asset_id;

    insert into public.development_features (
      development_id,
      feature_id
    )
    select
      p_asset_id,
      u.feature_id
    from pg_catalog.unnest(v_feature_ids)
      as u(feature_id);

  else
    raise exception 'Unsupported asset kind: %', p_kind
      using errcode = '22023';
  end if;

  return pg_catalog.jsonb_build_object(
    'kind', p_kind,
    'asset_id', p_asset_id,
    'feature_ids', pg_catalog.to_jsonb(v_feature_ids)
  );
end;
$$;

revoke all
on function public.zfind_replace_features(
  text, uuid, uuid[]
)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_replace_features(
  text, uuid, uuid[]
)
to authenticated;


comment on function public.zfind_create_property(
  text, text, numeric, integer, uuid, uuid
) is
'Server-owned Z Find Property creation. Admin keeps unrestricted creation semantics; Partner ownership is derived from auth.uid() and Development-unit creation is limited to Developments controlled by that Partner.';

comment on function public.zfind_update_asset(
  text, uuid, jsonb
) is
'Server-owned Z Find Property/Development editing. Partner may edit its own commercial/factual fields but cannot reassign structural ownership relationships.';

comment on function public.zfind_replace_features(
  text, uuid, uuid[]
) is
'Atomically replaces Property/Development features for Admin or the authenticated Partner that controls the asset.';
