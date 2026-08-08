create table zos.memberships (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references zos.persons(id) on delete restrict,
  organisation_id uuid not null references zos.organisations(id) on delete restrict,
  status text not null default 'active' check (status in ('invited','active','suspended','revoked')),
  joined_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, organisation_id)
);

comment on table zos.memberships is 'Canonical relationship between a ZOS person and organisation. Vertical-specific roles and permissions remain owned by their domains.';

alter table zos.memberships enable row level security;

create index idx_zos_memberships_person_id on zos.memberships(person_id);
create index idx_zos_memberships_organisation_id on zos.memberships(organisation_id);
