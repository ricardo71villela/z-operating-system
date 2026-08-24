\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email)
values
  ('daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','integration-owner@example.test'),
  ('daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','integration-member@example.test')
on conflict(id) do nothing;

create temp table _desk_integration_management as
select public.zdesk_bootstrap_workspace(
  'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'integration-owner@example.test',
  'Desk Integration Management',
  null
) as owner_payload;

do $$
declare
  v_workspace_id uuid := ((select owner_payload from _desk_integration_management)->>'workspaceId')::uuid;
  v_org_id uuid := ((select owner_payload from _desk_integration_management)->>'organisationId')::uuid;
  v_person_id uuid;
  v_membership_id uuid;
  v_member_id uuid;
begin
  insert into zos.persons(auth_user_id,display_name)
  values('daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','Integration Member')
  on conflict(auth_user_id) do update set display_name=excluded.display_name
  returning id into v_person_id;
  insert into zos.memberships(person_id,organisation_id,status,joined_at)
  values(v_person_id,v_org_id,'active',now())
  on conflict(person_id,organisation_id) do update set status='active'
  returning id into v_membership_id;
  insert into desk.workspace_members(workspace_id,membership_id,role,status)
  values(v_workspace_id,v_membership_id,'member','active')
  on conflict(membership_id) do update set status='active'
  returning id into v_member_id;
  create temp table _desk_integration_member(member_id uuid) on commit drop;
  insert into _desk_integration_member values(v_member_id);
end; $$;

do $$
declare
  v_workspace_id uuid := ((select owner_payload from _desk_integration_management)->>'workspaceId')::uuid;
  v_owner_id uuid := ((select owner_payload from _desk_integration_management)->>'workspaceMemberId')::uuid;
  v_member_id uuid := (select member_id from _desk_integration_member);
  v_id uuid;
  v_failed boolean := false;
begin
  begin
    perform public.zdesk_register_integration(v_workspace_id,v_member_id,'gmail','member-forbidden@example.test');
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'Ordinary member unexpectedly gained workspace integration registration authority'; end if;

  v_id := public.zdesk_register_integration(v_workspace_id,v_owner_id,'gmail','manager@example.test');
  if v_id is null then raise exception 'Owner integration registration returned no id'; end if;
  if not exists(select 1 from desk.integrations where id=v_id and workspace_id=v_workspace_id and status='active') then
    raise exception 'Owner integration registration did not create active integration';
  end if;
end; $$;

do $$
begin
  if has_function_privilege('authenticated','public.zdesk_register_integration(uuid,uuid,text,text)','EXECUTE') then
    raise exception 'authenticated can directly execute Desk integration registration RPC';
  end if;
end; $$;

select 'Z_DESK_INTEGRATION_MANAGEMENT_AUTHORITY_V1=PASS' as result;
rollback;
