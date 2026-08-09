-- ============================================================
-- ZOS CORE ACCESS v1
-- ============================================================
-- Controlled application-facing boundary for ZOS Core.
--
-- Architecture:
--
--   Supabase client
--        |
--        v
--     zos_api          <-- exposed API boundary
--        |
--        v
--       zos            <-- NOT exposed through Data API
--
-- platform_internal remains completely private.
--
-- Access v1 exposes only canonical self-identity.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Dedicated API boundary
-- ------------------------------------------------------------

create schema if not exists zos_api;

revoke all on schema zos_api from public;
revoke all on schema zos_api from anon;
revoke all on schema zos_api from authenticated;
revoke all on schema zos_api from service_role;

grant usage on schema zos_api to authenticated;


-- ------------------------------------------------------------
-- 2. Preserve Core isolation
-- ------------------------------------------------------------

revoke all on schema zos from anon, authenticated, service_role;

revoke all on all tables in schema zos
  from anon, authenticated, service_role;

revoke all on all sequences in schema zos
  from anon, authenticated, service_role;

revoke all on schema platform_internal
  from anon, authenticated, service_role;


-- ------------------------------------------------------------
-- 3. Minimal authenticated access to canonical persons
-- ------------------------------------------------------------
-- zos itself is not an exposed Data API schema.
--
-- authenticated requires USAGE + minimal table privileges because
-- zos_api functions are SECURITY INVOKER.
--
-- RLS ensures that the role can only operate on its own person row.
-- ------------------------------------------------------------

grant usage on schema zos to authenticated;

grant select on zos.persons to authenticated;

grant insert (auth_user_id, display_name)
  on zos.persons to authenticated;

grant update (display_name)
  on zos.persons to authenticated;


-- ------------------------------------------------------------
-- 4. RLS: canonical self identity
-- ------------------------------------------------------------

drop policy if exists zos_persons_self_select on zos.persons;

create policy zos_persons_self_select
on zos.persons
for select
to authenticated
using (
  auth.uid() is not null
  and auth_user_id = auth.uid()
);


drop policy if exists zos_persons_self_insert on zos.persons;

create policy zos_persons_self_insert
on zos.persons
for insert
to authenticated
with check (
  auth.uid() is not null
  and auth_user_id = auth.uid()
);


drop policy if exists zos_persons_self_update on zos.persons;

create policy zos_persons_self_update
on zos.persons
for update
to authenticated
using (
  auth.uid() is not null
  and auth_user_id = auth.uid()
)
with check (
  auth.uid() is not null
  and auth_user_id = auth.uid()
);


-- ------------------------------------------------------------
-- 5. Current canonical person
-- ------------------------------------------------------------

create or replace function zos_api.current_person()
returns table (
  person_id uuid,
  display_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select
    p.id as person_id,
    p.display_name,
    p.created_at,
    p.updated_at
  from zos.persons p
  where p.auth_user_id = auth.uid()
  limit 1;
$$;

comment on function zos_api.current_person() is
  'Returns the canonical ZOS person associated with the currently authenticated Supabase user.';


-- ------------------------------------------------------------
-- 6. Idempotent canonical identity bootstrap
-- ------------------------------------------------------------

create or replace function zos_api.ensure_current_person(
  p_display_name text default null
)
returns table (
  person_id uuid,
  display_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_display_name text := nullif(pg_catalog.btrim(p_display_name), '');
begin
  if v_auth_user_id is null then
    raise exception 'authentication required'
      using errcode = '28000';
  end if;


  -- Update only when the caller supplied a genuinely different name.
  if v_display_name is not null then
    return query
    update zos.persons as p
       set display_name = v_display_name
     where p.auth_user_id = v_auth_user_id
       and p.display_name is distinct from v_display_name
    returning
      p.id,
      p.display_name,
      p.created_at,
      p.updated_at;

    if found then
      return;
    end if;
  end if;


  -- Normal idempotent path: person already exists.
  return query
  select
    p.id,
    p.display_name,
    p.created_at,
    p.updated_at
  from zos.persons p
  where p.auth_user_id = v_auth_user_id
  limit 1;

  if found then
    return;
  end if;


  -- First bootstrap. ON CONFLICT protects concurrent bootstrap calls.
  return query
  insert into zos.persons as p (
    auth_user_id,
    display_name
  )
  values (
    v_auth_user_id,
    v_display_name
  )
  on conflict (auth_user_id)
  do nothing
  returning
    p.id,
    p.display_name,
    p.created_at,
    p.updated_at;

  if found then
    return;
  end if;


  -- A concurrent transaction may have created the row first.
  return query
  select
    p.id,
    p.display_name,
    p.created_at,
    p.updated_at
  from zos.persons p
  where p.auth_user_id = v_auth_user_id
  limit 1;
end;
$$;

comment on function zos_api.ensure_current_person(text) is
  'Idempotently creates or resolves the canonical ZOS person for auth.uid().';


-- ------------------------------------------------------------
-- 7. RPC privileges
-- ------------------------------------------------------------

revoke all on function zos_api.current_person()
  from public, anon, authenticated, service_role;

revoke all on function zos_api.ensure_current_person(text)
  from public, anon, authenticated, service_role;

grant execute on function zos_api.current_person()
  to authenticated;

grant execute on function zos_api.ensure_current_person(text)
  to authenticated;


-- ------------------------------------------------------------
-- 8. Safe defaults for future API routines
-- ------------------------------------------------------------

alter default privileges for role postgres
in schema zos_api
revoke execute on functions from public;
