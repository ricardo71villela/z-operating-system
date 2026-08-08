create table zos.registry_bindings (
  id uuid primary key default gen_random_uuid(),
  domain_code text not null check (char_length(trim(domain_code)) > 0),
  local_entity_type text not null check (char_length(trim(local_entity_type)) > 0),
  local_entity_id text not null check (char_length(trim(local_entity_id)) > 0),
  canonical_entity_type text check (canonical_entity_type is null or char_length(trim(canonical_entity_type)) > 0),
  canonical_entity_id text check (canonical_entity_id is null or char_length(trim(canonical_entity_id)) > 0),
  binding_status text not null default 'local_only' check (binding_status in ('local_only','linked','retired')),
  linked_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zos_registry_bindings_canonical_pair check (
    (canonical_entity_type is null and canonical_entity_id is null)
    or
    (canonical_entity_type is not null and canonical_entity_id is not null)
  ),
  constraint zos_registry_bindings_status_shape check (
    (binding_status = 'local_only' and canonical_entity_id is null and linked_at is null and retired_at is null)
    or
    (binding_status = 'linked' and canonical_entity_id is not null and linked_at is not null and retired_at is null)
    or
    (binding_status = 'retired' and retired_at is not null)
  )
);

comment on table zos.registry_bindings is 'Cross-vertical binding from a domain-owned local identity to a canonical ZOS authority. Does not create a second canonical identity.';

alter table zos.registry_bindings enable row level security;

create unique index uq_zos_registry_bindings_active_local
  on zos.registry_bindings(domain_code, local_entity_type, local_entity_id)
  where retired_at is null;

create index idx_zos_registry_bindings_canonical
  on zos.registry_bindings(canonical_entity_type, canonical_entity_id)
  where canonical_entity_id is not null and retired_at is null;
