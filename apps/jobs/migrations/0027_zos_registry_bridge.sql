-- 0027_zos_registry_bridge.sql
-- Z Jobs -> ZOS v1.1 compatibility bridge.
--
-- Persons, organizations and locations are strong candidates for canonical
-- cross-vertical Registry identity. Z Jobs keeps its existing UUIDs as local
-- primary keys and can attach a future ZOS Registry id without a destructive
-- migration. Job offers/applications remain owned by the Employment domain.

begin;

alter table persons
  add column if not exists zos_registry_id text;

alter table organizations
  add column if not exists zos_registry_id text;

alter table locations
  add column if not exists zos_registry_id text;

create unique index if not exists uq_persons_zos_registry_id
  on persons(zos_registry_id) where zos_registry_id is not null;
create unique index if not exists uq_organizations_zos_registry_id
  on organizations(zos_registry_id) where zos_registry_id is not null;
create unique index if not exists uq_locations_zos_registry_id
  on locations(zos_registry_id) where zos_registry_id is not null;

comment on column persons.zos_registry_id is
  'Optional canonical identity in the shared ZOS Registry. Local user_id remains stable during progressive convergence.';
comment on column organizations.zos_registry_id is
  'Optional canonical organization identity in ZOS Registry. Z Jobs organization semantics remain local.';
comment on column locations.zos_registry_id is
  'Optional shared ZOS Geography/Registry identity; local location id remains valid.';

commit;
