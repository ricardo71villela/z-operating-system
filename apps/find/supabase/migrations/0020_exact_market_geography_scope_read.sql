-- ============================================================
-- Z FIND — MIGRATION 0020
-- Exact-market Geography scope read foundation
-- ============================================================
--
-- This migration DOES NOT:
--   * create canonical Geography locations;
--   * seed Geography external codes;
--   * bind zones_lite automatically;
--   * infer geography from names, cities or parent countries.
--
-- Canonical Geography remains owned by zos.geography_locations and
-- its command/reconciliation workflow.
--
-- zones_lite remains the lightweight Z Find marketplace projection.
-- Its optional geography_entity_id / geography_binding_status bridge
-- originated in the historical app migration 0012 and is currently
-- authoritative as a UUID FK through the ZOS infrastructure database
-- convergence migration 20260812135037.
--
-- This RPC only projects already-approved canonical Geography and
-- already-explicit linked zone bindings into a safe public Search
-- scope for the five exact sub-country markets.
--
-- The response distinguishes:
--   resolved=false  -> exact canonical market node is not available;
--   resolved=true   -> exact node exists, even if zero zones are bound.
--
-- This allows the browser to fail closed instead of substituting GB
-- for England/Scotland/Wales/Northern Ireland or AE for Dubai.
-- ============================================================

create function public.zfind_public_exact_market_scope(
  p_market_key text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with recursive
  requested as (
    select case
      when p_market_key in (
        'GB-ENG',
        'GB-SCT',
        'GB-WLS',
        'GB-NIR',
        'AE-DU'
      )
      then p_market_key
      else null
    end as market_key
  ),
  market_node as (
    select
      gl.id,
      gl.country_iso
    from requested r
    join zos.geography_external_codes gec
      on gec.code_system = 'ISO_3166-2'
     and gec.code = r.market_key
     and gec.country_iso = pg_catalog.split_part(r.market_key, '-', 1)
     and gec.valid_to is null
    join zos.geography_locations gl
      on gl.id = gec.location_id
     and gl.country_iso = gec.country_iso
     and gl.status = 'active'
    where r.market_key is not null
  ),
  descendants as (
    select
      mn.id,
      mn.country_iso
    from market_node mn

    union all

    select
      child.id,
      child.country_iso
    from zos.geography_locations child
    join descendants parent
      on child.parent_id = parent.id
     and child.country_iso = parent.country_iso
    where child.status = 'active'
  ),
  zone_ids as (
    select distinct
      z.id
    from public.zones_lite z
    join descendants d
      on z.geography_entity_id = d.id
    where z.geography_binding_status = 'linked'
  )
  select pg_catalog.jsonb_build_object(
    'market_key',
    p_market_key,
    'resolved',
    exists (
      select 1
      from market_node
    ),
    'zone_lite_ids',
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          zone_ids.id
          order by zone_ids.id
        )
        from zone_ids
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all
on function public.zfind_public_exact_market_scope(text)
from public;

grant execute
on function public.zfind_public_exact_market_scope(text)
to anon, authenticated;

comment on function public.zfind_public_exact_market_scope(text)
is 'Read-only Z Find exact-market Geography projection. Resolves only the five approved exact marketplace keys through canonical Geography external codes and explicit linked zones_lite bindings. Returns resolved=false rather than substituting a parent country.';
