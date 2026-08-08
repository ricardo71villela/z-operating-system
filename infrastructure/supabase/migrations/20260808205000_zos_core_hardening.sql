-- ============================================================
-- ZOS CORE DATABASE v1 — HARDENING
-- ============================================================
-- Structural hardening before the first controlled deployment.
-- No application grants or RLS policies are introduced here.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Canonical organisations
-- ------------------------------------------------------------

alter table zos.organisations
  add constraint zos_organisations_name_not_blank check (
    char_length(trim(name)) > 0
  );

alter table zos.organisations
  add constraint zos_organisations_country_iso_format check (
    country_iso is null
    or country_iso ~ '^[A-Z]{2}$'
  );


-- ------------------------------------------------------------
-- 2. Membership temporal integrity
-- ------------------------------------------------------------

alter table zos.memberships
  add constraint zos_memberships_time_order check (
    ended_at is null
    or joined_at is null
    or ended_at >= joined_at
  );


-- ------------------------------------------------------------
-- 3. Registry binding temporal integrity
-- ------------------------------------------------------------

alter table zos.registry_bindings
  add constraint zos_registry_bindings_time_order check (
    retired_at is null
    or linked_at is null
    or retired_at >= linked_at
  );


-- ------------------------------------------------------------
-- 4. Metric namespace semantics
-- ------------------------------------------------------------
-- A metric namespace is not necessarily the same thing as a ZOS
-- platform domain. Example:
--   code = real_estate.area_sqm
--   namespace_code = real_estate
-- while the producing platform domain may be "find".

alter table zos.metric_definitions
  rename column domain_code to namespace_code;

alter index zos.idx_zos_metric_definitions_domain
  rename to idx_zos_metric_definitions_namespace;

comment on column zos.metric_definitions.namespace_code is
  'Semantic namespace of the metric code, such as real_estate, automotive, jobs or marketplace. It is not necessarily a ZOS platform domain code.';


-- ------------------------------------------------------------
-- 5. Integration Outbox lease / crash recovery
-- ------------------------------------------------------------
-- "processing" must be a leased state rather than a terminal limbo.
-- An expired lease makes the message eligible for recovery by a
-- dispatcher even if the previous worker crashed.

alter table platform_internal.integration_outbox
  add column locked_at timestamptz;

alter table platform_internal.integration_outbox
  add column lock_expires_at timestamptz;

alter table platform_internal.integration_outbox
  add column locked_by text check (
    locked_by is null
    or char_length(trim(locked_by)) > 0
  );

alter table platform_internal.integration_outbox
  add constraint platform_integration_outbox_lease_shape check (
    (
      locked_at is null
      and lock_expires_at is null
      and locked_by is null
    )
    or
    (
      locked_at is not null
      and lock_expires_at is not null
      and locked_by is not null
    )
  );

alter table platform_internal.integration_outbox
  add constraint platform_integration_outbox_lease_time check (
    locked_at is null
    or (
      locked_at >= occurred_at
      and lock_expires_at >= locked_at
    )
  );

alter table platform_internal.integration_outbox
  drop constraint platform_integration_outbox_status_shape;

alter table platform_internal.integration_outbox
  add constraint platform_integration_outbox_status_shape check (
    (
      status = 'pending'
      and published_at is null
      and locked_at is null
      and lock_expires_at is null
      and locked_by is null
    )
    or
    (
      status = 'processing'
      and published_at is null
      and locked_at is not null
      and lock_expires_at is not null
      and locked_by is not null
    )
    or
    (
      status = 'published'
      and published_at is not null
      and locked_at is null
      and lock_expires_at is null
      and locked_by is null
    )
    or
    (
      status = 'failed'
      and published_at is null
      and last_error is not null
      and char_length(trim(last_error)) > 0
      and locked_at is null
      and lock_expires_at is null
      and locked_by is null
    )
  );

comment on column platform_internal.integration_outbox.locked_at is
  'Timestamp at which a dispatcher claimed the message for processing.';

comment on column platform_internal.integration_outbox.lock_expires_at is
  'Lease expiry timestamp. A processing message with an expired lease is eligible for recovery.';

comment on column platform_internal.integration_outbox.locked_by is
  'Identifier of the dispatcher or worker currently holding the processing lease.';

drop index platform_internal.idx_platform_integration_outbox_dispatch;

create index idx_platform_integration_outbox_dispatch
  on platform_internal.integration_outbox(
    status,
    available_at,
    lock_expires_at,
    occurred_at
  )
  where status in ('pending','failed','processing');


-- ------------------------------------------------------------
-- 6. Shared updated_at infrastructure
-- ------------------------------------------------------------

create or replace function platform_internal.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

comment on function platform_internal.set_updated_at() is
  'Shared internal trigger function that maintains updated_at on mutable ZOS Core and platform_internal tables.';


-- Attach the trigger automatically to every current base table in
-- zos or platform_internal that exposes an updated_at column.

do $$
declare
  target_table record;
begin
  for target_table in
    select
      c.table_schema,
      c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
    where c.table_schema in ('zos', 'platform_internal')
      and c.column_name = 'updated_at'
      and t.table_type = 'BASE TABLE'
    order by c.table_schema, c.table_name
  loop
    execute format(
      'drop trigger if exists set_updated_at on %I.%I',
      target_table.table_schema,
      target_table.table_name
    );

    execute format(
      'create trigger set_updated_at before update on %I.%I for each row execute function platform_internal.set_updated_at()',
      target_table.table_schema,
      target_table.table_name
    );
  end loop;
end;
$$;
