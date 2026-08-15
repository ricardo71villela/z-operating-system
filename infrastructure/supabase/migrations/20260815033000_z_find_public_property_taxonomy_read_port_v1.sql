-- ============================================================
-- Z FIND — PHASE 4R R2.5A
-- Public Property Taxonomy Read Port v1
--
-- Public consumers need canonical Property classification without
-- receiving direct SELECT authority on taxonomy tables.
--
-- Labels remain presentation/i18n concerns.
-- Only enabled structural taxonomy is projected publicly.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Fail-fast authority gates
-- ------------------------------------------------------------

do $r25a_pre$
begin
  if to_regprocedure(
    'public.zfind_public_property_taxonomy()'
  ) is not null then
    raise exception
      'R2.5A public Property taxonomy RPC already exists';
  end if;

  if not exists (
    select 1
    from public.property_classes pc
    where pc.code = 'residential'
      and pc.enabled = true
  ) then
    raise exception
      'Residential Property class missing or disabled';
  end if;

  if not exists (
    select 1
    from public.property_classes pc
    where pc.code = 'commercial'
      and pc.enabled = true
  ) then
    raise exception
      'Commercial Property class missing or disabled';
  end if;

  if not exists (
    select 1
    from public.property_classes pc
    where pc.code = 'land'
      and pc.enabled = true
  ) then
    raise exception
      'Land Property class missing or disabled';
  end if;

  if (
    select count(*)
    from public.property_classes pc
    where pc.enabled = true
  ) <> 3 then
    raise exception
      'R2.5A expected exactly three enabled Property classes';
  end if;

  if (
    select count(*)
    from public.property_subtypes ps
    where ps.enabled = true
  ) <> 7 then
    raise exception
      'R2.5A expected exactly seven enabled Property subtypes';
  end if;
end
$r25a_pre$;

-- ------------------------------------------------------------
-- 2. Public enabled-only taxonomy projection
-- ------------------------------------------------------------

create function public.zfind_public_property_taxonomy()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select pg_catalog.jsonb_build_object(

    'classes',
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'code', pc.code,
            'sort_order', pc.sort_order
          )
          order by pc.sort_order, pc.code
        )
        from public.property_classes pc
        where pc.enabled = true
      ),
      '[]'::jsonb
    ),

    'subtypes',
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'code', ps.code,
            'property_class', ps.property_class,
            'sort_order', ps.sort_order
          )
          order by
            case ps.property_class
              when 'residential' then 1
              when 'commercial' then 2
              when 'land' then 3
              else 999
            end,
            ps.sort_order,
            ps.code
        )
        from public.property_subtypes ps
        join public.property_classes pc
          on pc.code = ps.property_class
        where ps.enabled = true
          and pc.enabled = true
      ),
      '[]'::jsonb
    )
  );
$function$;

-- ------------------------------------------------------------
-- 3. Narrow execution authority
-- ------------------------------------------------------------

revoke all
on function public.zfind_public_property_taxonomy()
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_public_property_taxonomy()
to anon, authenticated;

-- ------------------------------------------------------------
-- 4. Security + semantic post-conditions
-- ------------------------------------------------------------

do $r25a_post$
declare
  v_payload jsonb;
begin
  if pg_catalog.has_table_privilege(
    'anon',
    'public.property_classes',
    'SELECT'
  ) then
    raise exception
      'Anon must not gain direct Property class SELECT';
  end if;

  if pg_catalog.has_table_privilege(
    'anon',
    'public.property_subtypes',
    'SELECT'
  ) then
    raise exception
      'Anon must not gain direct Property subtype SELECT';
  end if;

  if pg_catalog.has_table_privilege(
    'authenticated',
    'public.property_classes',
    'SELECT'
  ) then
    raise exception
      'Authenticated must not gain direct Property class SELECT';
  end if;

  if pg_catalog.has_table_privilege(
    'authenticated',
    'public.property_subtypes',
    'SELECT'
  ) then
    raise exception
      'Authenticated must not gain direct Property subtype SELECT';
  end if;

  if not pg_catalog.has_function_privilege(
    'anon',
    'public.zfind_public_property_taxonomy()',
    'EXECUTE'
  ) then
    raise exception
      'Anon must execute public Property taxonomy read port';
  end if;

  if not pg_catalog.has_function_privilege(
    'authenticated',
    'public.zfind_public_property_taxonomy()',
    'EXECUTE'
  ) then
    raise exception
      'Authenticated must execute public Property taxonomy read port';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.zfind_authoring_property_taxonomy()',
    'EXECUTE'
  ) then
    raise exception
      'R2.5A must not expose the authoring taxonomy RPC to anon';
  end if;

  select public.zfind_public_property_taxonomy()
    into v_payload;

  if pg_catalog.jsonb_array_length(
    v_payload -> 'classes'
  ) <> 3 then
    raise exception
      'Public taxonomy must project exactly three enabled classes';
  end if;

  if pg_catalog.jsonb_array_length(
    v_payload -> 'subtypes'
  ) <> 7 then
    raise exception
      'Public taxonomy must project exactly seven enabled subtypes';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      v_payload -> 'subtypes'
    ) x
    where x ->> 'code' in (
      'commercial',
      'development',
      'building',
      'mixed_use',
      'btr',
      'pbsa',
      'senior_living'
    )
  ) then
    raise exception
      'Public taxonomy contains forbidden subtype concepts';
  end if;
end
$r25a_post$;

commit;
