-- ============================================================
-- Z FIND — MIGRATION 0015 — Registry Binding Invariant
-- ============================================================
-- Every local Registry-eligible Z Find entity must have exactly one
-- registry_bindings row.
--
-- Local UUIDs remain authoritative:
--   organisations.id
--   partners.id
--   properties.id
--   developments.id
--
-- registry_bindings does NOT create a second canonical entity.
-- It only provides the optional binding point to the shared ZOS Registry.
--
-- Migration 0008 backfilled entities that existed at that moment.
-- This migration makes that relationship durable for every future entity.
-- ============================================================

create function public.zfind_create_registry_binding_for_entity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  case tg_table_name

    when 'organisations' then
      insert into registry_bindings(entity_type, organisation_id)
      values ('organisation', new.id)
      on conflict do nothing;

    when 'partners' then
      insert into registry_bindings(entity_type, partner_id)
      values ('partner', new.id)
      on conflict do nothing;

    when 'properties' then
      insert into registry_bindings(entity_type, property_id)
      values ('property', new.id)
      on conflict do nothing;

    when 'developments' then
      insert into registry_bindings(entity_type, development_id)
      values ('development', new.id)
      on conflict do nothing;

    else
      raise exception
        'Unsupported Registry binding trigger source table: %',
        tg_table_name;
  end case;

  return new;
end;
$$;


create trigger organisations_create_registry_binding
after insert on organisations
for each row
execute function public.zfind_create_registry_binding_for_entity();

create trigger partners_create_registry_binding
after insert on partners
for each row
execute function public.zfind_create_registry_binding_for_entity();

create trigger properties_create_registry_binding
after insert on properties
for each row
execute function public.zfind_create_registry_binding_for_entity();

create trigger developments_create_registry_binding
after insert on developments
for each row
execute function public.zfind_create_registry_binding_for_entity();


-- Defensive reconciliation for entities created after migration 0008
-- but before this invariant was installed.

insert into registry_bindings(entity_type, organisation_id)
select 'organisation', id
from organisations
on conflict do nothing;

insert into registry_bindings(entity_type, partner_id)
select 'partner', id
from partners
on conflict do nothing;

insert into registry_bindings(entity_type, property_id)
select 'property', id
from properties
on conflict do nothing;

insert into registry_bindings(entity_type, development_id)
select 'development', id
from developments
on conflict do nothing;


-- Trigger-only infrastructure function; not an application RPC.

revoke all on function public.zfind_create_registry_binding_for_entity() from public;

comment on function public.zfind_create_registry_binding_for_entity()
is 'Maintains Z Find local entity -> shared ZOS Registry binding rows without replacing local entity UUIDs.';
