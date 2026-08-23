\set ON_ERROR_STOP on
begin;

-- Z Studio content persistence contract v1
-- Proves account ownership, revision safety, private asset authority and
-- non-destructive archive behavior on the disposable convergence database.

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'studio-owner-a@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'studio-owner-b@example.test')
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
select public.zstudio_ensure_account();

create temp table _zstudio_p1 as
select *
from public.zstudio_save_project(
  null,
  null,
  'Campaign Alpha',
  '{"lang":"en","format":"feed45","content":{"title":"Alpha","price":"100"}}'::jsonb
);

do $$
begin
  if (select count(*) from _zstudio_p1) <> 1 then
    raise exception 'project create did not return exactly one row';
  end if;
  if (select revision from _zstudio_p1) <> 1 then
    raise exception 'new project revision must start at 1';
  end if;
end;
$$;

select public.zstudio_register_project_asset(
  (select project_id from _zstudio_p1),
  '11111111-1111-4111-8111-111111111111/' || (select project_id::text from _zstudio_p1) || '/photos/cover.jpg',
  'photo',
  0,
  'image/jpeg',
  12345
);

select public.zstudio_set_project_cover(
  (select project_id from _zstudio_p1),
  '11111111-1111-4111-8111-111111111111/' || (select project_id::text from _zstudio_p1) || '/photos/cover.jpg'
);

create temp table _zstudio_loaded as
select * from public.zstudio_get_project((select project_id from _zstudio_p1));

do $$
begin
  if (select count(*) from _zstudio_loaded) <> 1 then
    raise exception 'owner could not reopen own project';
  end if;
  if (select state_json #>> '{content,title}' from _zstudio_loaded) <> 'Alpha' then
    raise exception 'project state did not round-trip';
  end if;
  if (select jsonb_array_length(asset_manifest) from _zstudio_loaded) <> 1 then
    raise exception 'asset manifest did not round-trip';
  end if;
end;
$$;

create temp table _zstudio_p1_v2 as
select *
from public.zstudio_save_project(
  (select project_id from _zstudio_p1),
  1,
  'Campaign Alpha Updated',
  '{"lang":"en","format":"story","content":{"title":"Alpha Updated"}}'::jsonb
);

do $$
begin
  if (select revision from _zstudio_p1_v2) <> 2 then
    raise exception 'project update did not advance revision';
  end if;
end;
$$;

-- Stale writers must fail rather than overwrite a newer device/session.
do $$
begin
  begin
    perform *
    from public.zstudio_save_project(
      (select project_id from _zstudio_p1),
      1,
      'Stale overwrite',
      '{"content":{"title":"must not win"}}'::jsonb
    );
    raise exception 'stale revision unexpectedly overwrote project';
  exception
    when serialization_failure then
      null;
  end;
end;
$$;

-- A second account cannot list or open the first account project.
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
select public.zstudio_ensure_account();

do $$
begin
  if (select count(*) from public.zstudio_list_projects()) <> 0 then
    raise exception 'account B can list account A project';
  end if;
  begin
    perform 1 from public.zstudio_get_project((select project_id from _zstudio_p1));
    raise exception 'account B can open account A project';
  exception
    when no_data_found then
      null;
  end;
end;
$$;

create temp table _zstudio_p2 as
select *
from public.zstudio_save_project(
  null,
  null,
  'Owner B Project',
  '{"content":{"title":"B"}}'::jsonb
);

do $$
begin
  if (select count(*) from public.zstudio_list_projects()) <> 1 then
    raise exception 'account B own library count invalid';
  end if;
end;
$$;

-- Cross-account storage-path registration is rejected even for an owned project.
do $$
begin
  begin
    perform public.zstudio_register_project_asset(
      (select project_id from _zstudio_p2),
      '11111111-1111-4111-8111-111111111111/' || (select project_id::text from _zstudio_p2) || '/photos/foreign.jpg',
      'photo', 0, 'image/jpeg', 10
    );
    raise exception 'foreign storage prefix unexpectedly accepted';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

-- Return to A: own project is still there and can be archived non-destructively.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

do $$
begin
  if (select count(*) from public.zstudio_list_projects()) <> 1 then
    raise exception 'account A library lost own project';
  end if;
end;
$$;

select public.zstudio_archive_project((select project_id from _zstudio_p1));

do $$
begin
  if (select count(*) from public.zstudio_list_projects()) <> 0 then
    raise exception 'archived project still appears in active library';
  end if;
  if not exists (
    select 1 from studio.projects
    where id = (select project_id from _zstudio_p1)
      and status = 'archived'
  ) then
    raise exception 'archive deleted or failed to retain project authority';
  end if;
end;
$$;

-- Browser roles use narrow RPCs, not direct Studio table access.
do $$
begin
  if has_table_privilege('authenticated', 'studio.projects', 'SELECT') then
    raise exception 'authenticated has direct SELECT on studio.projects';
  end if;
  if has_table_privilege('authenticated', 'studio.project_assets', 'SELECT') then
    raise exception 'authenticated has direct SELECT on studio.project_assets';
  end if;
  if not has_function_privilege('authenticated', 'public.zstudio_save_project(uuid,bigint,text,jsonb)', 'EXECUTE') then
    raise exception 'authenticated cannot execute zstudio_save_project';
  end if;
  if not has_function_privilege('authenticated', 'public.zstudio_list_projects()', 'EXECUTE') then
    raise exception 'authenticated cannot execute zstudio_list_projects';
  end if;
end;
$$;

-- Bucket remains private and every operation has an account-scoped RLS policy.
do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'zstudio-projects' and public = false
  ) then
    raise exception 'zstudio-projects private bucket missing';
  end if;
  if (
    select count(*)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'zstudio_projects_storage_select',
        'zstudio_projects_storage_insert',
        'zstudio_projects_storage_update',
        'zstudio_projects_storage_delete'
      )
  ) <> 4 then
    raise exception 'Z Studio storage RLS policy set incomplete';
  end if;
end;
$$;

select 'ZSTUDIO_CONTENT_PERSISTENCE_V1=PASS' as result;
rollback;
