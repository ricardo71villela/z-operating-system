-- ============================================================
-- Z Studio — account-owned content persistence v1
-- ============================================================
-- Persistent, cross-device Studio creations. Canonical human identity remains
-- in ZOS; content ownership is enforced through the local studio.accounts id,
-- which is exactly auth.uid(). Browser roles never receive direct access to
-- studio.* tables: narrow RPCs derive ownership from auth.uid().
--
-- Media lives in a private Supabase Storage bucket under:
--   <auth.uid()>/<project_id>/<kind>/<object>
-- ============================================================

-- ------------------------------------------------------------
-- 1. Persistent projects
-- ------------------------------------------------------------
create table studio.projects (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references studio.accounts(id) on delete restrict,
  title text not null default 'Untitled creation'
    check (char_length(title) between 1 and 160),
  status text not null default 'draft'
    check (status in ('draft', 'archived')),
  revision bigint not null default 1 check (revision > 0),
  state_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(state_json) = 'object')
    check (octet_length(state_json::text) <= 1048576),
  cover_asset_path text,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, account_id)
);

comment on table studio.projects is
'Account-owned Z Studio creation authority. Stores editable project state; binary media is stored privately in Supabase Storage.';

create index idx_studio_projects_account_updated
  on studio.projects(account_id, updated_at desc);
create index idx_studio_projects_account_active
  on studio.projects(account_id, updated_at desc)
  where status = 'draft';

alter table studio.projects enable row level security;
revoke all on studio.projects from public, anon, authenticated;
grant select, insert, update, delete on studio.projects to service_role;

-- ------------------------------------------------------------
-- 2. Project asset manifest
-- ------------------------------------------------------------
create table studio.project_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  account_id uuid not null,
  storage_path text not null unique,
  kind text not null check (kind in ('photo', 'video', 'logo')),
  position integer not null default 0 check (position >= 0),
  mime_type text,
  byte_size bigint check (byte_size is null or (byte_size >= 0 and byte_size <= 52428800)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, account_id)
    references studio.projects(id, account_id)
    on delete cascade
);

comment on table studio.project_assets is
'Private media manifest for a Z Studio project. Storage paths are account/project scoped and never public by default.';

create index idx_studio_project_assets_project_position
  on studio.project_assets(project_id, kind, position, created_at);
create index idx_studio_project_assets_account
  on studio.project_assets(account_id, project_id);

alter table studio.project_assets enable row level security;
revoke all on studio.project_assets from public, anon, authenticated;
grant select, insert, update, delete on studio.project_assets to service_role;

-- ------------------------------------------------------------
-- 3. Private Storage authority
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('zstudio-projects', 'zstudio-projects', false)
on conflict (id) do update
set name = excluded.name,
    public = false;

-- Supabase Storage already owns/operates storage.objects. We add only policies;
-- no custom tables/functions are created inside the protected storage schema.
drop policy if exists zstudio_projects_storage_select on storage.objects;
drop policy if exists zstudio_projects_storage_insert on storage.objects;
drop policy if exists zstudio_projects_storage_update on storage.objects;
drop policy if exists zstudio_projects_storage_delete on storage.objects;

create policy zstudio_projects_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'zstudio-projects'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

create policy zstudio_projects_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'zstudio-projects'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

create policy zstudio_projects_storage_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'zstudio-projects'
  and split_part(name, '/', 1) = (select auth.uid())::text
)
with check (
  bucket_id = 'zstudio-projects'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

create policy zstudio_projects_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'zstudio-projects'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

-- ------------------------------------------------------------
-- 4. Save/create project with optimistic revision authority
-- ------------------------------------------------------------
create function public.zstudio_save_project(
  p_project_id uuid,
  p_expected_revision bigint,
  p_title text,
  p_state jsonb
)
returns table (
  project_id uuid,
  revision bigint,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_title text;
  v_project studio.projects%rowtype;
begin
  if v_auth_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  perform public.zstudio_ensure_account();

  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'project state must be a JSON object' using errcode = '22023';
  end if;
  if octet_length(p_state::text) > 1048576 then
    raise exception 'project state exceeds 1 MiB' using errcode = '22001';
  end if;

  v_title := left(trim(coalesce(p_title, '')), 160);
  if v_title = '' then v_title := 'Untitled creation'; end if;

  if p_project_id is null then
    insert into studio.projects (account_id, title, state_json, status, revision, last_opened_at)
    values (v_auth_user_id, v_title, p_state, 'draft', 1, now())
    returning * into v_project;
  else
    if p_expected_revision is null or p_expected_revision < 1 then
      raise exception 'expected revision required for project update' using errcode = '22023';
    end if;

    update studio.projects p
    set title = v_title,
        state_json = p_state,
        revision = p.revision + 1,
        updated_at = now(),
        last_opened_at = now()
    where p.id = p_project_id
      and p.account_id = v_auth_user_id
      and p.status = 'draft'
      and p.revision = p_expected_revision
    returning p.* into v_project;

    if not found then
      -- Deliberately do not reveal whether a foreign UUID exists. A stale
      -- revision and an unavailable project share the same safe conflict path.
      raise exception 'ZSTUDIO_PROJECT_CONFLICT' using errcode = '40001';
    end if;
  end if;

  return query
  select v_project.id, v_project.revision, v_project.updated_at;
end;
$$;

comment on function public.zstudio_save_project(uuid, bigint, text, jsonb) is
'Creates or revision-safely updates the authenticated caller own Studio project. Ownership is derived only from auth.uid(); stale revisions fail instead of overwriting.';

-- ------------------------------------------------------------
-- 5. List/open own projects
-- ------------------------------------------------------------
create function public.zstudio_list_projects()
returns table (
  project_id uuid,
  title text,
  status text,
  revision bigint,
  cover_asset_path text,
  created_at timestamptz,
  updated_at timestamptz,
  last_opened_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select p.id, p.title, p.status, p.revision, p.cover_asset_path,
         p.created_at, p.updated_at, p.last_opened_at
  from studio.projects p
  where auth.uid() is not null
    and p.account_id = auth.uid()
    and p.status = 'draft'
  order by p.updated_at desc, p.id desc
  limit 100;
$$;

create function public.zstudio_get_project(p_project_id uuid)
returns table (
  project_id uuid,
  title text,
  status text,
  revision bigint,
  state_json jsonb,
  cover_asset_path text,
  asset_manifest jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_project studio.projects%rowtype;
begin
  if v_auth_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  update studio.projects p
  set last_opened_at = now()
  where p.id = p_project_id
    and p.account_id = v_auth_user_id
    and p.status = 'draft'
  returning p.* into v_project;

  if not found then
    raise exception 'project unavailable' using errcode = 'P0002';
  end if;

  return query
  select
    v_project.id,
    v_project.title,
    v_project.status,
    v_project.revision,
    v_project.state_json,
    v_project.cover_asset_path,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'asset_id', a.id,
          'path', a.storage_path,
          'kind', a.kind,
          'position', a.position,
          'mime_type', a.mime_type,
          'byte_size', a.byte_size
        ) order by
          case a.kind when 'photo' then 1 when 'video' then 2 else 3 end,
          a.position,
          a.created_at
      )
      from studio.project_assets a
      where a.project_id = v_project.id
        and a.account_id = v_auth_user_id
    ), '[]'::jsonb),
    v_project.created_at,
    v_project.updated_at;
end;
$$;

comment on function public.zstudio_list_projects() is
'Lists only active projects owned by the authenticated Studio account.';
comment on function public.zstudio_get_project(uuid) is
'Returns one editable Studio project and private asset manifest only when owned by the authenticated account.';

-- ------------------------------------------------------------
-- 6. Asset registration/reconciliation
-- ------------------------------------------------------------
create function public.zstudio_register_project_asset(
  p_project_id uuid,
  p_storage_path text,
  p_kind text,
  p_position integer,
  p_mime_type text,
  p_byte_size bigint
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_asset_id uuid;
  v_prefix text;
begin
  if v_auth_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from studio.projects p
    where p.id = p_project_id
      and p.account_id = v_auth_user_id
      and p.status = 'draft'
  ) then
    raise exception 'project unavailable' using errcode = 'P0002';
  end if;

  v_prefix := v_auth_user_id::text || '/' || p_project_id::text || '/';
  if p_storage_path is null or left(p_storage_path, char_length(v_prefix)) <> v_prefix then
    raise exception 'asset path must be scoped to authenticated account/project' using errcode = '42501';
  end if;
  if p_kind not in ('photo', 'video', 'logo') then
    raise exception 'invalid asset kind' using errcode = '22023';
  end if;
  if p_position is null or p_position < 0 then
    raise exception 'invalid asset position' using errcode = '22023';
  end if;
  if p_byte_size is not null and (p_byte_size < 0 or p_byte_size > 52428800) then
    raise exception 'invalid asset size' using errcode = '22023';
  end if;

  insert into studio.project_assets (
    project_id, account_id, storage_path, kind, position, mime_type, byte_size
  ) values (
    p_project_id, v_auth_user_id, p_storage_path, p_kind, p_position,
    nullif(left(coalesce(p_mime_type, ''), 160), ''), p_byte_size
  )
  on conflict (storage_path) do update
  set position = excluded.position,
      mime_type = excluded.mime_type,
      byte_size = excluded.byte_size,
      updated_at = now()
  where studio.project_assets.project_id = p_project_id
    and studio.project_assets.account_id = v_auth_user_id
  returning id into v_asset_id;

  if v_asset_id is null then
    raise exception 'asset ownership conflict' using errcode = '42501';
  end if;
  return v_asset_id;
end;
$$;

create function public.zstudio_prune_project_assets(
  p_project_id uuid,
  p_keep_paths text[]
)
returns text[]
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_removed text[];
begin
  if v_auth_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from studio.projects p
    where p.id = p_project_id
      and p.account_id = v_auth_user_id
      and p.status = 'draft'
  ) then
    raise exception 'project unavailable' using errcode = 'P0002';
  end if;

  with removed as (
    delete from studio.project_assets a
    where a.project_id = p_project_id
      and a.account_id = v_auth_user_id
      and not (a.storage_path = any(coalesce(p_keep_paths, array[]::text[])))
    returning a.storage_path
  )
  select coalesce(array_agg(storage_path), array[]::text[])
  into v_removed
  from removed;

  return coalesce(v_removed, array[]::text[]);
end;
$$;

create function public.zstudio_set_project_cover(
  p_project_id uuid,
  p_cover_asset_path text
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_auth_user_id uuid := auth.uid();
begin
  if v_auth_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_cover_asset_path is not null and not exists (
    select 1 from studio.project_assets a
    where a.project_id = p_project_id
      and a.account_id = v_auth_user_id
      and a.storage_path = p_cover_asset_path
  ) then
    raise exception 'cover asset unavailable' using errcode = 'P0002';
  end if;

  update studio.projects p
  set cover_asset_path = p_cover_asset_path,
      updated_at = now()
  where p.id = p_project_id
    and p.account_id = v_auth_user_id
    and p.status = 'draft';

  if not found then
    raise exception 'project unavailable' using errcode = 'P0002';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 7. Non-destructive removal from the active library
-- ------------------------------------------------------------
create function public.zstudio_archive_project(p_project_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_auth_user_id uuid := auth.uid();
begin
  if v_auth_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  update studio.projects p
  set status = 'archived',
      updated_at = now()
  where p.id = p_project_id
    and p.account_id = v_auth_user_id
    and p.status = 'draft';

  if not found then
    raise exception 'project unavailable' using errcode = 'P0002';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 8. RPC privilege boundary
-- ------------------------------------------------------------
revoke all on function public.zstudio_save_project(uuid, bigint, text, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.zstudio_list_projects()
from public, anon, authenticated, service_role;
revoke all on function public.zstudio_get_project(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.zstudio_register_project_asset(uuid, text, text, integer, text, bigint)
from public, anon, authenticated, service_role;
revoke all on function public.zstudio_prune_project_assets(uuid, text[])
from public, anon, authenticated, service_role;
revoke all on function public.zstudio_set_project_cover(uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.zstudio_archive_project(uuid)
from public, anon, authenticated, service_role;

grant execute on function public.zstudio_save_project(uuid, bigint, text, jsonb)
to authenticated, service_role;
grant execute on function public.zstudio_list_projects()
to authenticated, service_role;
grant execute on function public.zstudio_get_project(uuid)
to authenticated, service_role;
grant execute on function public.zstudio_register_project_asset(uuid, text, text, integer, text, bigint)
to authenticated, service_role;
grant execute on function public.zstudio_prune_project_assets(uuid, text[])
to authenticated, service_role;
grant execute on function public.zstudio_set_project_cover(uuid, text)
to authenticated, service_role;
grant execute on function public.zstudio_archive_project(uuid)
to authenticated, service_role;

comment on function public.zstudio_register_project_asset(uuid, text, text, integer, text, bigint) is
'Registers or reorders one private project asset after validating account/project path ownership.';
comment on function public.zstudio_prune_project_assets(uuid, text[]) is
'Removes obsolete asset-manifest rows for the authenticated project and returns paths eligible for private Storage cleanup.';
comment on function public.zstudio_set_project_cover(uuid, text) is
'Sets an authenticated project cover only to an asset already owned by that project.';
comment on function public.zstudio_archive_project(uuid) is
'Non-destructively removes the authenticated project from the active My Creations library.';
