-- ============================================================
-- ZOS Core — Z Studio Identity Bridge extension v1
-- ============================================================
--
-- Extends the existing ZOS Identity Bridge with one additional human
-- identity contract owned by Z Studio:
--
--   studio / account / <auth.uid()>
--
-- This does NOT create a canonical zos.persons row for every auth.users row.
-- A Studio identity must first exist locally (studio.accounts); its DB-owned
-- trigger registers the identity as local_only. Only then may the authenticated
-- bridge link it to the caller's canonical ZOS person.
--
-- Existing Find/Jobs semantics remain unchanged. Mobility remains unsupported.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Extend the trusted local identity registration contract
-- ------------------------------------------------------------

create or replace function platform_internal.register_local_person_identity(
  p_domain_code text,
  p_local_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_domain_code text;
  v_local_entity_type text;
  v_binding_id uuid;
begin
  if p_local_user_id is null then
    raise exception 'local user id is required'
      using errcode = '22004';
  end if;

  if not exists (
    select 1
    from auth.users u
    where u.id = p_local_user_id
  ) then
    raise exception 'auth user does not exist'
      using errcode = '23503';
  end if;

  v_domain_code := lower(trim(coalesce(p_domain_code, '')));

  case v_domain_code
    when 'find' then
      v_local_entity_type := 'profile';
    when 'jobs' then
      v_local_entity_type := 'person';
    when 'studio' then
      v_local_entity_type := 'account';
    else
      raise exception 'unsupported identity domain: %', p_domain_code
        using errcode = '22023';
  end case;

  select rb.id
    into v_binding_id
  from zos.registry_bindings rb
  where rb.domain_code = v_domain_code
    and rb.local_entity_type = v_local_entity_type
    and rb.local_entity_id = p_local_user_id::text
    and rb.retired_at is null;

  if v_binding_id is not null then
    return v_binding_id;
  end if;

  insert into zos.registry_bindings (
    domain_code,
    local_entity_type,
    local_entity_id,
    binding_status
  )
  values (
    v_domain_code,
    v_local_entity_type,
    p_local_user_id::text,
    'local_only'
  )
  on conflict do nothing
  returning id
    into v_binding_id;

  if v_binding_id is null then
    select rb.id
      into v_binding_id
    from zos.registry_bindings rb
    where rb.domain_code = v_domain_code
      and rb.local_entity_type = v_local_entity_type
      and rb.local_entity_id = p_local_user_id::text
      and rb.retired_at is null;
  end if;

  if v_binding_id is null then
    raise exception 'local identity could not be registered'
      using errcode = '23505';
  end if;

  return v_binding_id;
end;
$$;

revoke execute
on function platform_internal.register_local_person_identity(text, uuid)
from public, anon, authenticated, service_role;

comment on function platform_internal.register_local_person_identity(text, uuid) is
  'Privately registers an existing Auth user as a local Find, Jobs or Z Studio human identity without assigning canonical ZOS identity.';


-- ------------------------------------------------------------
-- 2. Extend self-scoped registry policies to Studio accounts
-- ------------------------------------------------------------

drop policy if exists zos_registry_bindings_self_person_select
on zos.registry_bindings;

drop policy if exists zos_registry_bindings_self_person_update
on zos.registry_bindings;

create policy zos_registry_bindings_self_person_select
on zos.registry_bindings
for select
to authenticated
using (
  auth.uid() is not null
  and retired_at is null
  and local_entity_id = auth.uid()::text
  and (
    (domain_code = 'find' and local_entity_type = 'profile')
    or
    (domain_code = 'jobs' and local_entity_type = 'person')
    or
    (domain_code = 'studio' and local_entity_type = 'account')
  )
  and (
    (
      binding_status = 'local_only'
      and canonical_entity_type is null
      and canonical_entity_id is null
      and linked_at is null
    )
    or
    (
      binding_status = 'linked'
      and canonical_entity_type = 'person'
      and canonical_entity_id = (
        select p.id::text
        from zos.persons p
        where p.auth_user_id = auth.uid()
      )
    )
  )
);

create policy zos_registry_bindings_self_person_update
on zos.registry_bindings
for update
to authenticated
using (
  auth.uid() is not null
  and retired_at is null
  and local_entity_id = auth.uid()::text
  and (
    (domain_code = 'find' and local_entity_type = 'profile')
    or
    (domain_code = 'jobs' and local_entity_type = 'person')
    or
    (domain_code = 'studio' and local_entity_type = 'account')
  )
  and (
    (
      binding_status = 'local_only'
      and canonical_entity_type is null
      and canonical_entity_id is null
      and linked_at is null
    )
    or
    (
      binding_status = 'linked'
      and canonical_entity_type = 'person'
      and canonical_entity_id = (
        select p.id::text
        from zos.persons p
        where p.auth_user_id = auth.uid()
      )
    )
  )
)
with check (
  auth.uid() is not null
  and retired_at is null
  and local_entity_id = auth.uid()::text
  and (
    (domain_code = 'find' and local_entity_type = 'profile')
    or
    (domain_code = 'jobs' and local_entity_type = 'person')
    or
    (domain_code = 'studio' and local_entity_type = 'account')
  )
  and binding_status = 'linked'
  and canonical_entity_type = 'person'
  and canonical_entity_id = (
    select p.id::text
    from zos.persons p
    where p.auth_user_id = auth.uid()
  )
  and linked_at is not null
);


-- ------------------------------------------------------------
-- 3. Extend authenticated binding reads to Studio
-- ------------------------------------------------------------

create or replace function zos_api.current_identity_bindings()
returns table (
  binding_id uuid,
  domain_code text,
  local_entity_type text,
  local_entity_id text,
  canonical_person_id uuid,
  binding_status text,
  linked_at timestamptz
)
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select
    rb.id,
    rb.domain_code,
    rb.local_entity_type,
    rb.local_entity_id,
    p.id,
    rb.binding_status,
    rb.linked_at
  from zos.registry_bindings rb
  join zos.persons p
    on p.id::text = rb.canonical_entity_id
  where auth.uid() is not null
    and p.auth_user_id = auth.uid()
    and rb.canonical_entity_type = 'person'
    and rb.binding_status = 'linked'
    and rb.retired_at is null
    and (
      (rb.domain_code = 'find' and rb.local_entity_type = 'profile')
      or
      (rb.domain_code = 'jobs' and rb.local_entity_type = 'person')
      or
      (rb.domain_code = 'studio' and rb.local_entity_type = 'account')
    )
  order by rb.domain_code, rb.local_entity_type;
$$;


-- ------------------------------------------------------------
-- 4. Extend the idempotent application-facing bridge to Studio
-- ------------------------------------------------------------

create or replace function zos_api.ensure_current_identity_binding(
  p_domain_code text
)
returns table (
  binding_id uuid,
  domain_code text,
  local_entity_type text,
  local_entity_id text,
  canonical_person_id uuid,
  binding_status text,
  linked_at timestamptz
)
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $$
declare
  v_auth_user_id uuid;
  v_domain_code text;
  v_local_entity_type text;
  v_person_id uuid;
  v_binding zos.registry_bindings%rowtype;
begin
  v_auth_user_id := auth.uid();

  if v_auth_user_id is null then
    raise exception 'authentication required'
      using errcode = '28000';
  end if;

  v_domain_code := lower(trim(coalesce(p_domain_code, '')));

  case v_domain_code
    when 'find' then
      v_local_entity_type := 'profile';
    when 'jobs' then
      v_local_entity_type := 'person';
    when 'studio' then
      v_local_entity_type := 'account';
    else
      raise exception 'unsupported identity domain: %', p_domain_code
        using errcode = '22023';
  end case;

  select ep.person_id
    into v_person_id
  from zos_api.ensure_current_person(null) ep;

  if v_person_id is null then
    raise exception 'canonical ZOS person could not be resolved'
      using errcode = '23514';
  end if;

  select rb.*
    into v_binding
  from zos.registry_bindings rb
  where rb.domain_code = v_domain_code
    and rb.local_entity_type = v_local_entity_type
    and rb.local_entity_id = v_auth_user_id::text
    and rb.retired_at is null;

  if found then
    if v_binding.binding_status = 'local_only' then
      update zos.registry_bindings rb
      set
        canonical_entity_type = 'person',
        canonical_entity_id = v_person_id::text,
        binding_status = 'linked',
        linked_at = now()
      where rb.id = v_binding.id
      returning rb.*
        into v_binding;

    elsif v_binding.binding_status = 'linked'
      and v_binding.canonical_entity_type = 'person'
      and v_binding.canonical_entity_id = v_person_id::text then
      null;

    else
      raise exception
        'active local identity is already bound to a different canonical authority'
        using errcode = '23514';
    end if;

  else
    raise exception
      'local identity is not registered for domain %',
      v_domain_code
      using errcode = '23514';
  end if;

  return query
  select
    v_binding.id,
    v_binding.domain_code,
    v_binding.local_entity_type,
    v_binding.local_entity_id,
    v_person_id,
    v_binding.binding_status,
    v_binding.linked_at;
end;
$$;


-- ------------------------------------------------------------
-- 5. Preserve the existing RPC execution boundary
-- ------------------------------------------------------------

revoke execute
on function zos_api.current_identity_bindings()
from public, anon, authenticated, service_role;

revoke execute
on function zos_api.ensure_current_identity_binding(text)
from public, anon, authenticated, service_role;

grant execute
on function zos_api.current_identity_bindings()
to authenticated;

grant execute
on function zos_api.ensure_current_identity_binding(text)
to authenticated;

comment on function zos_api.current_identity_bindings() is
  'Returns active Find, Jobs and Z Studio human identity bindings for the authenticated canonical ZOS person.';

comment on function zos_api.ensure_current_identity_binding(text) is
  'Idempotently links a pre-registered Find, Jobs or Z Studio local identity to the authenticated canonical zos.persons identity.';
