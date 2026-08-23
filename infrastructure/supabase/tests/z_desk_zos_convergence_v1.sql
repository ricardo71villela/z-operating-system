\set ON_ERROR_STOP on
begin;

insert into auth.users(id, email)
values
  ('d1111111-1111-4111-8111-111111111111', 'desk-a@example.test'),
  ('d2222222-2222-4222-8222-222222222222', 'desk-b@example.test')
on conflict (id) do nothing;

create temp table _desk_a as
select public.zdesk_bootstrap_workspace(
  'd1111111-1111-4111-8111-111111111111', 'desk-a@example.test', 'Desk A', null
) as payload;
create temp table _desk_b as
select public.zdesk_bootstrap_workspace(
  'd2222222-2222-4222-8222-222222222222', 'desk-b@example.test', 'Desk B', null
) as payload;

do $$ begin
  if to_regclass('public.desk_tenants') is not null then raise exception 'legacy public.desk_tenants authority must not exist'; end if;
  if to_regclass('public.desk_users') is not null then raise exception 'legacy public.desk_users authority must not exist'; end if;
  if to_regclass('desk.workspaces') is null or to_regclass('desk.workspace_members') is null then raise exception 'Desk workspace projection missing'; end if;
end; $$;

do $$ begin
  if (select count(*) from zos.persons where auth_user_id in (
    'd1111111-1111-4111-8111-111111111111','d2222222-2222-4222-8222-222222222222'
  )) <> 2 then raise exception 'canonical ZOS Person linkage missing'; end if;
end; $$;

select set_config('request.jwt.claim.role', 'authenticated', false);
select set_config('request.jwt.claim.sub', 'd1111111-1111-4111-8111-111111111111', false);
do $$ declare
  a_workspace uuid := ((select payload from _desk_a)->>'workspaceId')::uuid;
  b_workspace uuid := ((select payload from _desk_b)->>'workspaceId')::uuid;
begin
  if not desk.is_workspace_member(a_workspace) then raise exception 'user A cannot resolve own Desk workspace'; end if;
  if desk.is_workspace_member(b_workspace) then raise exception 'user A can resolve user B Desk workspace'; end if;
end; $$;

select set_config('request.jwt.claim.sub', 'd2222222-2222-4222-8222-222222222222', false);
do $$ declare
  a_workspace uuid := ((select payload from _desk_a)->>'workspaceId')::uuid;
  b_workspace uuid := ((select payload from _desk_b)->>'workspaceId')::uuid;
begin
  if not desk.is_workspace_member(b_workspace) then raise exception 'user B cannot resolve own Desk workspace'; end if;
  if desk.is_workspace_member(a_workspace) then raise exception 'user B can resolve user A Desk workspace'; end if;
end; $$;

do $$ declare
  a_membership uuid := ((select payload from _desk_a)->>'membershipId')::uuid;
  b_workspace uuid := ((select payload from _desk_b)->>'workspaceId')::uuid;
begin
  begin
    insert into desk.workspace_members(workspace_id, membership_id, role) values (b_workspace, a_membership, 'member');
    raise exception 'cross-organisation Desk membership unexpectedly accepted';
  exception when check_violation then null; when unique_violation then null; end;
end; $$;

do $$ declare
  a_workspace uuid := ((select payload from _desk_a)->>'workspaceId')::uuid;
  a_member uuid := ((select payload from _desk_a)->>'workspaceMemberId')::uuid;
  b_member uuid := ((select payload from _desk_b)->>'workspaceMemberId')::uuid;
begin
  begin
    insert into desk.tasks(workspace_id, title, created_by, assigned_to, task_type)
      values (a_workspace, 'cross tenant', a_member, b_member, 'mission');
    raise exception 'cross-workspace task assignment unexpectedly accepted';
  exception when foreign_key_violation then null; end;
end; $$;

do $$ begin
  if not has_table_privilege('authenticated', 'desk.tasks', 'SELECT') then raise exception 'authenticated lacks expected Desk read privilege'; end if;
  if has_table_privilege('authenticated', 'desk.tasks', 'INSERT')
     or has_table_privilege('authenticated', 'desk.tasks', 'UPDATE')
     or has_table_privilege('authenticated', 'desk.tasks', 'DELETE') then
    raise exception 'authenticated has direct Desk mutation privilege';
  end if;
  if has_table_privilege('authenticated', 'desk.integration_credentials', 'SELECT') then raise exception 'authenticated can read provider credentials'; end if;
  if has_function_privilege('authenticated', 'public.zdesk_bootstrap_workspace(uuid,text,text,uuid)', 'EXECUTE') then
    raise exception 'authenticated can invoke server-only Desk bootstrap';
  end if;
end; $$;

select 'Z_DESK_ZOS_CONVERGENCE_V1=PASS' as result;
rollback;
