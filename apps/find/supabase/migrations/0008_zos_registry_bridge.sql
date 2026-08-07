-- ============================================================
-- Z FIND — MIGRATION 0008 — ZOS Registry Bridge v1.1
-- ============================================================
-- Additive compatibility bridge only. Existing Z Find UUIDs remain the
-- authoritative local identities. A future shared ZOS Registry may bind to
-- them through zos_registry_id without changing or duplicating local records.
-- ============================================================

create table registry_bindings (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('organisation','partner','property','development')),
  organisation_id uuid references organisations(id),
  partner_id uuid references partners(id),
  property_id uuid references properties(id),
  development_id uuid references developments(id),
  zos_registry_id uuid,
  binding_status text not null default 'local_only' check (binding_status in ('local_only','linked','merged','retired')),
  external_references jsonb not null default '{}'::jsonb,
  linked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registry_bindings_target_shape check (
    (entity_type = 'organisation' and organisation_id is not null and partner_id is null and property_id is null and development_id is null)
    or (entity_type = 'partner' and partner_id is not null and organisation_id is null and property_id is null and development_id is null)
    or (entity_type = 'property' and property_id is not null and organisation_id is null and partner_id is null and development_id is null)
    or (entity_type = 'development' and development_id is not null and organisation_id is null and partner_id is null and property_id is null)
  )
);
alter table registry_bindings enable row level security;

create unique index uq_registry_binding_organisation on registry_bindings(organisation_id) where organisation_id is not null;
create unique index uq_registry_binding_partner on registry_bindings(partner_id) where partner_id is not null;
create unique index uq_registry_binding_property on registry_bindings(property_id) where property_id is not null;
create unique index uq_registry_binding_development on registry_bindings(development_id) where development_id is not null;
create unique index uq_registry_binding_zos_id on registry_bindings(zos_registry_id) where zos_registry_id is not null;

insert into registry_bindings(entity_type, organisation_id)
select 'organisation', id from organisations on conflict do nothing;
insert into registry_bindings(entity_type, partner_id)
select 'partner', id from partners on conflict do nothing;
insert into registry_bindings(entity_type, property_id)
select 'property', id from properties on conflict do nothing;
insert into registry_bindings(entity_type, development_id)
select 'development', id from developments on conflict do nothing;

create policy "admin: full access to registry_bindings" on registry_bindings
  for all to authenticated using (is_admin()) with check (is_admin());
grant select, insert, update, delete on registry_bindings to authenticated;

comment on table registry_bindings is 'Compatibility bridge to a future shared ZOS Registry. Does not create a second canonical identity.';
