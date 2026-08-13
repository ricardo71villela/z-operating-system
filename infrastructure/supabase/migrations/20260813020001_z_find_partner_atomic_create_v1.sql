-- Z FIND — Partner atomic create commands v1
--
-- Property/Development creation and their initial proposed Representation
-- are one server-side command and one database transaction.
--
-- Security boundary:
--   * the browser never supplies partner_id;
--   * auth.uid() is resolved server-side;
--   * direct Partner INSERT into properties/developments is removed;
--   * direct Partner mutation of representations is removed;
--   * the command functions alone bootstrap the owned graph.

-- ============================================================
-- Harden existing ownership helper
-- ============================================================

create or replace function public.is_own_partner(target_partner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.partner_id = target_partner_id
      and p.role = 'partner_user'
  );
$$;

revoke all on function public.is_own_partner(uuid)
from public, anon, authenticated, service_role;

grant execute on function public.is_own_partner(uuid)
to authenticated;


-- ============================================================
-- Close direct bootstrap paths
-- ============================================================

-- A Partner must not be able to create an orphan Property or Development
-- by bypassing the command RPC.

drop policy if exists "partner: create properties"
on public.properties;

drop policy if exists "partner: create developments"
on public.developments;


-- A Partner must not manufacture or re-point Representations directly.
-- In particular, partner_id, target and initial status are server-owned
-- decisions during creation.

drop policy if exists "partner: manage own representations"
on public.representations;

create policy "partner: view own representations"
on public.representations
for select
to authenticated
using (public.is_own_partner(partner_id));


-- ============================================================
-- Atomic Property command
-- ============================================================

create or replace function public.zfind_partner_create_property(
  p_subtype text,
  p_typology text default null,
  p_area_sqm numeric default null,
  p_floor integer default null,
  p_zone_lite_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_partner_id uuid;
  v_property public.properties%rowtype;
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

  -- subtype validity remains enforced independently by the table CHECK.
  insert into public.properties (
    subtype,
    typology,
    area_sqm,
    floor,
    zone_lite_id
  )
  values (
    p_subtype,
    p_typology,
    p_area_sqm,
    p_floor,
    p_zone_lite_id
  )
  returning *
  into v_property;

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

  return to_jsonb(v_property);
end;
$$;

comment on function public.zfind_partner_create_property(
  text,
  text,
  numeric,
  integer,
  uuid
) is
'Atomically creates a Z Find Property and its proposed Representation. Partner ownership is derived exclusively from auth.uid(); direct Partner bootstrap INSERTs are denied by RLS.';

revoke all on function public.zfind_partner_create_property(
  text,
  text,
  numeric,
  integer,
  uuid
)
from public, anon, authenticated, service_role;

grant execute on function public.zfind_partner_create_property(
  text,
  text,
  numeric,
  integer,
  uuid
)
to authenticated;


-- ============================================================
-- Atomic Development command
-- ============================================================

create or replace function public.zfind_partner_create_development(
  p_name text,
  p_zone_lite_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_partner_id uuid;
  v_development public.developments%rowtype;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Development name is required'
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

  insert into public.developments (
    name,
    zone_lite_id
  )
  values (
    btrim(p_name),
    p_zone_lite_id
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

  return to_jsonb(v_development);
end;
$$;

comment on function public.zfind_partner_create_development(
  text,
  uuid
) is
'Atomically creates a Z Find Development and its proposed Representation. Partner ownership is derived exclusively from auth.uid(); direct Partner bootstrap INSERTs are denied by RLS.';

revoke all on function public.zfind_partner_create_development(
  text,
  uuid
)
from public, anon, authenticated, service_role;

grant execute on function public.zfind_partner_create_development(
  text,
  uuid
)
to authenticated;
