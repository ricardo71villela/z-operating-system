-- ============================================================
-- Z FIND — Audit Delete Compatibility v1
-- ============================================================
--
-- Purpose:
--   Preserve Z Find lifecycle audit history while restoring the
--   operational hard-delete behaviour already supported by the
--   Admin application.
--
-- Context:
--   find.listing_state_history and
--   find.representation_state_history are append-style audit
--   records populated only from protected database triggers /
--   convergence backfill.
--
--   Their local entity UUIDs are historical identifiers.
--   They must survive deletion of the operational Listing or
--   Representation they describe.
--
-- Deliberately:
--   - no ON DELETE CASCADE (audit history must not disappear);
--   - no ON DELETE SET NULL (historical local UUID must survive);
--   - no change to actor_profile_id;
--   - no change to Verification subject retention policy;
--   - no Trust implementation;
--   - no canonical Core capability duplication.
--
-- This migration drops only the two foreign-key constraints
-- coupling lifecycle audit rows to operational parent lifetime.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Preconditions
-- ------------------------------------------------------------

do $$
begin
  if pg_catalog.to_regclass(
    'find.listing_state_history'
  ) is null then
    raise exception
      'Audit delete compatibility requires find.listing_state_history';
  end if;

  if pg_catalog.to_regclass(
    'find.representation_state_history'
  ) is null then
    raise exception
      'Audit delete compatibility requires find.representation_state_history';
  end if;

  if pg_catalog.to_regclass(
    'public.listings'
  ) is null then
    raise exception
      'Audit delete compatibility requires public.listings';
  end if;

  if pg_catalog.to_regclass(
    'public.representations'
  ) is null then
    raise exception
      'Audit delete compatibility requires public.representations';
  end if;
end
$$;


-- ------------------------------------------------------------
-- 2. Listing audit reference
-- ------------------------------------------------------------
--
-- Do not depend on PostgreSQL's automatically generated
-- constraint name. Remove whichever FK on
-- find.listing_state_history references public.listings.
--
-- listing_id itself remains NOT NULL and retains the immutable
-- local Listing UUID after operational deletion.
-- ------------------------------------------------------------

do $$
declare
  v_constraint_name text;
begin
  for v_constraint_name in
    select c.conname
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class child
      on child.oid = c.conrelid
    join pg_catalog.pg_namespace child_ns
      on child_ns.oid = child.relnamespace
    where c.contype = 'f'
      and child_ns.nspname = 'find'
      and child.relname = 'listing_state_history'
      and c.confrelid =
        pg_catalog.to_regclass('public.listings')
  loop
    execute pg_catalog.format(
      'alter table find.listing_state_history drop constraint %I',
      v_constraint_name
    );
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class child
      on child.oid = c.conrelid
    join pg_catalog.pg_namespace child_ns
      on child_ns.oid = child.relnamespace
    where c.contype = 'f'
      and child_ns.nspname = 'find'
      and child.relname = 'listing_state_history'
      and c.confrelid =
        pg_catalog.to_regclass('public.listings')
  ) then
    raise exception
      'Listing lifecycle history still references public.listings after compatibility migration';
  end if;
end
$$;


comment on column
  find.listing_state_history.listing_id
is
  'Immutable local Z Find Listing UUID retained as historical audit identity even after the operational Listing is deleted. Deliberately not a foreign key to public.listings.';


-- ------------------------------------------------------------
-- 3. Representation audit reference
-- ------------------------------------------------------------
--
-- representation_id remains NOT NULL and retains the immutable
-- local Representation UUID after operational deletion.
-- ------------------------------------------------------------

do $$
declare
  v_constraint_name text;
begin
  for v_constraint_name in
    select c.conname
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class child
      on child.oid = c.conrelid
    join pg_catalog.pg_namespace child_ns
      on child_ns.oid = child.relnamespace
    where c.contype = 'f'
      and child_ns.nspname = 'find'
      and child.relname = 'representation_state_history'
      and c.confrelid =
        pg_catalog.to_regclass('public.representations')
  loop
    execute pg_catalog.format(
      'alter table find.representation_state_history drop constraint %I',
      v_constraint_name
    );
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class child
      on child.oid = c.conrelid
    join pg_catalog.pg_namespace child_ns
      on child_ns.oid = child.relnamespace
    where c.contype = 'f'
      and child_ns.nspname = 'find'
      and child.relname = 'representation_state_history'
      and c.confrelid =
        pg_catalog.to_regclass('public.representations')
  ) then
    raise exception
      'Representation lifecycle history still references public.representations after compatibility migration';
  end if;
end
$$;


comment on column
  find.representation_state_history.representation_id
is
  'Immutable local Z Find Representation UUID retained as historical audit identity even after the operational Representation is deleted. Deliberately not a foreign key to public.representations.';


-- ------------------------------------------------------------
-- 4. Architectural boundary
-- ------------------------------------------------------------

comment on table find.listing_state_history is
  'Append-style Z Find Listing lifecycle audit history. Historical listing_id survives operational deletion; lifecycle history remains distinct from Representation and Verification lifecycle.';

comment on table find.representation_state_history is
  'Append-style Z Find Representation lifecycle audit history. Historical representation_id survives operational deletion; lifecycle history remains distinct from Listing and Verification lifecycle.';
