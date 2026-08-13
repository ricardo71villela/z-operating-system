-- ============================================================
-- Z FIND — Partner Safe Remove / Delete Workflow v1
--
-- Partner UX contract:
--   The promoter can remove its own Property / Development.
--
-- Physical deletion:
--   Used when there is no protected commercial/audit dependency.
--
-- Protected retirement:
--   Used when Leads, Verification or retained representation
--   relationships make physical deletion inappropriate.
--
-- Protected records are NEVER deleted merely to make an asset
-- removable.
--
-- Lifecycle history remains authoritative and is preserved.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Explicit operational removal marker
-- ------------------------------------------------------------

alter table public.properties
  add column if not exists removed_at timestamptz;

alter table public.developments
  add column if not exists removed_at timestamptz;

comment on column public.properties.removed_at is
'Operational removal marker. Null means active in Partner inventory. Non-null means removed from Partner operation while protected history may remain.';

comment on column public.developments.removed_at is
'Operational removal marker. Null means active in Partner inventory. Non-null means removed from Partner operation while protected history may remain.';

create index if not exists properties_removed_at_idx
  on public.properties (removed_at);

create index if not exists developments_removed_at_idx
  on public.developments (removed_at);


-- ------------------------------------------------------------
-- 2. Ownership predicates now exclude removed assets
--
-- This also prevents an authenticated Partner from calling the
-- existing edit / feature / child-create commands against an asset
-- after it has been removed.
-- ------------------------------------------------------------

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
      and d.removed_at is null
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
      and pr.removed_at is null
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
            and d.removed_at is null
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
-- 3. Partner Safe Remove command
-- ------------------------------------------------------------

create or replace function public.zfind_partner_remove_asset(
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
  v_now timestamptz := pg_catalog.statement_timestamp();

  v_property_ids uuid[] := array[]::uuid[];
  v_rep_ids uuid[] := array[]::uuid[];
  v_listing_ids uuid[] := array[]::uuid[];

  v_has_verification boolean := false;
  v_has_leads boolean := false;
  v_has_foreign_representation boolean := false;
  v_has_foreign_nonended_representation boolean := false;

  v_archived_listings integer := 0;
  v_ended_representations integer := 0;
begin

  if p_kind not in ('property', 'development') then
    raise exception 'Unsupported asset kind: %', p_kind
      using errcode = '22023';
  end if;

  select p.partner_id
    into v_partner_id
  from public.profiles p
  where p.id = auth.uid()
    and p.role = 'partner_user';

  if v_partner_id is null then
    raise exception 'Z Find Partner access required'
      using errcode = '42501';
  end if;


  -- ==========================================================
  -- PROPERTY
  -- ==========================================================

  if p_kind = 'property' then

    perform 1
    from public.properties pr
    where pr.id = p_asset_id
      and pr.removed_at is null
    for update;

    if not found then
      raise exception 'Property not found or already removed'
        using errcode = 'P0002';
    end if;

    if not public.zfind_partner_owns_property(p_asset_id) then
      raise exception 'Partner does not control this Property'
        using errcode = '42501';
    end if;

    v_property_ids := array[p_asset_id];

    select array(
      select r.id
      from public.representations r
      where r.property_id = p_asset_id
      order by r.id
    )
    into v_rep_ids;

    select array(
      select l.id
      from public.listings l
      where l.representation_id = any(v_rep_ids)
      order by l.id
    )
    into v_listing_ids;


    select exists (
      select 1
      from public.representations r
      where r.property_id = p_asset_id
        and r.partner_id <> v_partner_id
    )
    into v_has_foreign_representation;


    select exists (
      select 1
      from public.representations r
      where r.property_id = p_asset_id
        and r.partner_id <> v_partner_id
        and r.status <> 'ended'
    )
    into v_has_foreign_nonended_representation;


    if v_has_foreign_nonended_representation then
      raise exception
        'Property has a non-ended Representation belonging to another Partner; Admin review is required before removal'
        using errcode = '42501';
    end if;


    select exists (
      select 1
      from find.verification_assessments va
      where va.property_id = p_asset_id
         or va.representation_id = any(v_rep_ids)
    )
    into v_has_verification;


    select exists (
      select 1
      from public.leads le
      where le.listing_id = any(v_listing_ids)
    )
    into v_has_leads;


    -- --------------------------------------------------------
    -- Clean asset: genuine physical deletion.
    --
    -- Audit state-history rows deliberately have no parent FK
    -- and therefore remain historical evidence.
    -- --------------------------------------------------------

    if not v_has_verification
       and not v_has_leads
       and not v_has_foreign_representation then

      delete from public.listing_content
      where listing_id = any(v_listing_ids);

      delete from public.listing_media
      where listing_id = any(v_listing_ids);

      delete from public.price_history
      where listing_id = any(v_listing_ids);

      delete from public.listings
      where id = any(v_listing_ids);

      delete from public.representations
      where id = any(v_rep_ids);

      delete from public.property_features
      where property_id = p_asset_id;

      delete from public.properties
      where id = p_asset_id;

      return pg_catalog.jsonb_build_object(
        'kind', 'property',
        'asset_id', p_asset_id,
        'mode', 'hard_deleted'
      );
    end if;


    -- --------------------------------------------------------
    -- Protected asset:
    -- 1. Archive own Listings.
    -- 2. End own active/disputed Representations.
    -- 3. Leave proposed Representation untouched if present;
    --    the removed_at marker makes it operationally invisible.
    -- 4. Never mutate another Partner's historical Representation.
    -- --------------------------------------------------------

    update public.listings l
       set status = 'archived'
     where l.representation_id in (
       select r.id
       from public.representations r
       where r.property_id = p_asset_id
         and r.partner_id = v_partner_id
     )
       and l.status <> 'archived';

    get diagnostics v_archived_listings = row_count;


    update public.representations r
       set status = 'ended',
           end_date = pg_catalog.coalesce(
             r.end_date,
             current_date
           )
     where r.property_id = p_asset_id
       and r.partner_id = v_partner_id
       and r.status in ('active', 'disputed');

    get diagnostics v_ended_representations = row_count;


    update public.properties
       set removed_at = v_now
     where id = p_asset_id;


    return pg_catalog.jsonb_build_object(
      'kind', 'property',
      'asset_id', p_asset_id,
      'mode', 'retired',
      'protected_by_leads', v_has_leads,
      'protected_by_verification', v_has_verification,
      'foreign_historical_representation',
        v_has_foreign_representation,
      'archived_listings', v_archived_listings,
      'ended_representations', v_ended_representations
    );

  end if;


  -- ==========================================================
  -- DEVELOPMENT
  -- ==========================================================

  perform 1
  from public.developments d
  where d.id = p_asset_id
    and d.removed_at is null
  for update;

  if not found then
    raise exception 'Development not found or already removed'
      using errcode = 'P0002';
  end if;

  if not public.zfind_partner_owns_development(p_asset_id) then
    raise exception 'Partner does not control this Development'
      using errcode = '42501';
  end if;


  -- Lock all child Properties in deterministic order.
  perform 1
  from public.properties pr
  where pr.development_id = p_asset_id
  order by pr.id
  for update;


  select array(
    select pr.id
    from public.properties pr
    where pr.development_id = p_asset_id
    order by pr.id
  )
  into v_property_ids;


  select array(
    select r.id
    from public.representations r
    where r.development_id = p_asset_id
       or r.property_id = any(v_property_ids)
    order by r.id
  )
  into v_rep_ids;


  select array(
    select l.id
    from public.listings l
    where l.representation_id = any(v_rep_ids)
    order by l.id
  )
  into v_listing_ids;


  select exists (
    select 1
    from public.representations r
    where (
      r.development_id = p_asset_id
      or r.property_id = any(v_property_ids)
    )
      and r.partner_id <> v_partner_id
  )
  into v_has_foreign_representation;


  select exists (
    select 1
    from public.representations r
    where (
      r.development_id = p_asset_id
      or r.property_id = any(v_property_ids)
    )
      and r.partner_id <> v_partner_id
      and r.status <> 'ended'
  )
  into v_has_foreign_nonended_representation;


  if v_has_foreign_nonended_representation then
    raise exception
      'Development or one of its units has a non-ended Representation belonging to another Partner; Admin review is required before removal'
      using errcode = '42501';
  end if;


  select exists (
    select 1
    from find.verification_assessments va
    where va.development_id = p_asset_id
       or va.property_id = any(v_property_ids)
       or va.representation_id = any(v_rep_ids)
  )
  into v_has_verification;


  select exists (
    select 1
    from public.leads le
    where le.listing_id = any(v_listing_ids)
  )
  into v_has_leads;


  -- ----------------------------------------------------------
  -- Clean Development tree:
  -- hard-delete Development + clean child units atomically.
  -- ----------------------------------------------------------

  if not v_has_verification
     and not v_has_leads
     and not v_has_foreign_representation then

    delete from public.listing_content
    where listing_id = any(v_listing_ids);

    delete from public.listing_media
    where listing_id = any(v_listing_ids);

    delete from public.price_history
    where listing_id = any(v_listing_ids);

    delete from public.listings
    where id = any(v_listing_ids);

    delete from public.representations
    where id = any(v_rep_ids);

    delete from public.property_features
    where property_id = any(v_property_ids);

    delete from public.development_features
    where development_id = p_asset_id;

    delete from public.development_media
    where development_id = p_asset_id;

    delete from public.properties
    where id = any(v_property_ids);

    delete from public.developments
    where id = p_asset_id;

    return pg_catalog.jsonb_build_object(
      'kind', 'development',
      'asset_id', p_asset_id,
      'mode', 'hard_deleted',
      'deleted_units',
        pg_catalog.coalesce(
          pg_catalog.array_length(v_property_ids, 1),
          0
        )
    );
  end if;


  -- ----------------------------------------------------------
  -- Protected Development tree:
  -- archive only this Partner's Listings,
  -- end only this Partner's active/disputed Representations,
  -- hide Development + all child Properties operationally.
  -- ----------------------------------------------------------

  update public.listings l
     set status = 'archived'
   where l.representation_id in (
     select r.id
     from public.representations r
     where (
       r.development_id = p_asset_id
       or r.property_id = any(v_property_ids)
     )
       and r.partner_id = v_partner_id
   )
     and l.status <> 'archived';

  get diagnostics v_archived_listings = row_count;


  update public.representations r
     set status = 'ended',
         end_date = pg_catalog.coalesce(
           r.end_date,
           current_date
         )
   where (
     r.development_id = p_asset_id
     or r.property_id = any(v_property_ids)
   )
     and r.partner_id = v_partner_id
     and r.status in ('active', 'disputed');

  get diagnostics v_ended_representations = row_count;


  update public.properties
     set removed_at = v_now
   where id = any(v_property_ids);


  update public.developments
     set removed_at = v_now
   where id = p_asset_id;


  return pg_catalog.jsonb_build_object(
    'kind', 'development',
    'asset_id', p_asset_id,
    'mode', 'retired',
    'protected_by_leads', v_has_leads,
    'protected_by_verification', v_has_verification,
    'foreign_historical_representation',
      v_has_foreign_representation,
    'removed_units',
      pg_catalog.coalesce(
        pg_catalog.array_length(v_property_ids, 1),
        0
      ),
    'archived_listings', v_archived_listings,
    'ended_representations', v_ended_representations
  );

end;
$$;


revoke all
on function public.zfind_partner_remove_asset(text, uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_partner_remove_asset(text, uuid)
to authenticated;


comment on function public.zfind_partner_remove_asset(text, uuid) is
'Partner-owned safe removal command. Physically deletes clean Property/Development graphs; otherwise retires them operationally while preserving Leads, Verification and lifecycle audit history.';
