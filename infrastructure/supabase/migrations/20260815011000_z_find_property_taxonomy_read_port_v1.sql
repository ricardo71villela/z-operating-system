begin;

-- ============================================================
-- Z FIND — PROPERTY TAXONOMY AUTHORING READ PORT V1
--
-- Phase 4R R2.3A
--
-- property_classes / property_subtypes remain server-owned
-- reference tables:
--
--   * no browser table SELECT grant
--   * no browser table mutation grant
--   * no duplicated subtype authority in application code
--
-- Authenticated Admin / Partner authoring surfaces consume the
-- taxonomy through this read-only SECURITY DEFINER command port.
--
-- This function deliberately returns enabled state as data rather
-- than hiding disabled taxonomy rows. That allows future authoring
-- UIs to preserve/display historical disabled classifications while
-- refusing them as choices for new writes.
-- ============================================================

create or replace function public.zfind_authoring_property_taxonomy()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
begin

  if v_actor is null
     or not exists (
       select 1
       from public.profiles p
       where p.id = v_actor
         and p.role in ('admin', 'partner_user')
     )
  then
    raise exception
      'Admin or Partner role required'
      using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object(

    'classes',
    (
      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'code', pc.code,
            'enabled', pc.enabled,
            'sort_order', pc.sort_order
          )
          order by pc.sort_order, pc.code
        ),
        '[]'::jsonb
      )
      from public.property_classes pc
    ),

    'subtypes',
    (
      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'code', ps.code,
            'property_class', ps.property_class,
            'enabled', ps.enabled,
            'sort_order', ps.sort_order
          )
          order by
            ps.property_class,
            ps.sort_order,
            ps.code
        ),
        '[]'::jsonb
      )
      from public.property_subtypes ps
    )
  );

end;
$$;


revoke all
on function public.zfind_authoring_property_taxonomy()
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_authoring_property_taxonomy()
to authenticated;


comment on function public.zfind_authoring_property_taxonomy() is
  'Authenticated Z Find Admin/Partner read port for authoritative Property class/subtype taxonomy. Reference tables remain directly inaccessible to browser roles.';

commit;
