-- Z Mobility — Registry binding trigger hardening v1
-- The binding side effect crosses from Mobility-owned tables into
-- RLS-protected ZOS Core. It therefore runs as a narrowly scoped
-- SECURITY DEFINER function with a fixed search_path and no direct
-- browser-role execution grant.

create or replace function mobility.ensure_registry_binding()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into zos.registry_bindings (
    domain_code,
    local_entity_type,
    local_entity_id,
    binding_status
  )
  values (
    'mobility',
    tg_argv[0],
    new.id::text,
    'local_only'
  )
  on conflict do nothing;
  return new;
end;
$$;

comment on function mobility.ensure_registry_binding() is
  'Trigger-only bridge creating local_only ZOS Registry bindings for Mobility identities. SECURITY DEFINER is required to cross the Core RLS boundary; fixed search_path and revoked direct execution keep the privilege surface narrow.';

revoke all on function mobility.ensure_registry_binding() from public;
revoke all on function mobility.ensure_registry_binding() from anon;
revoke all on function mobility.ensure_registry_binding() from authenticated;
revoke all on function mobility.ensure_registry_binding() from service_role;
