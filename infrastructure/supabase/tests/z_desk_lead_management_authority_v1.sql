\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email)
values
  ('d9999999-9999-4999-8999-999999999901','lead-owner@example.test'),
  ('d9999999-9999-4999-8999-999999999902','lead-member@example.test')
on conflict(id) do nothing;

create temp table _desk_lead_seed as
select public.zdesk_bootstrap_workspace(
  'd9999999-9999-4999-8999-999999999901',
  'lead-owner@example.test',
  'Desk Lead Authority',
  null
) as owner_payload;

do $$
declare
  v_workspace_id uuid := ((select owner_payload from _desk_lead_seed)->>'workspaceId')::uuid;
  v_org_id uuid := ((select owner_payload from _desk_lead_seed)->>'organisationId')::uuid;
  v_person_id uuid;
  v_membership_id uuid;
  v_member_id uuid;
begin
  insert into zos.persons(auth_user_id,display_name)
  values('d9999999-9999-4999-8999-999999999902','Lead Member')
  on conflict(auth_user_id) do update set updated_at=zos.persons.updated_at
  returning id into v_person_id;
  insert into zos.memberships(person_id,organisation_id,status,joined_at)
  values(v_person_id,v_org_id,'active',now())
  on conflict(person_id,organisation_id) do update set status='active'
  returning id into v_membership_id;
  insert into desk.workspace_members(workspace_id,membership_id,role,status)
  values(v_workspace_id,v_membership_id,'member','active')
  on conflict(membership_id) do update set status='active'
  returning id into v_member_id;
  create temp table _desk_lead_member(member_id uuid,person_id uuid) on commit drop;
  insert into _desk_lead_member values(v_member_id,v_person_id);
end; $$;

do $$
declare
  v_workspace_id uuid := ((select owner_payload from _desk_lead_seed)->>'workspaceId')::uuid;
  v_owner_id uuid := ((select owner_payload from _desk_lead_seed)->>'workspaceMemberId')::uuid;
  v_member_id uuid := (select member_id from _desk_lead_member);
  v_lead jsonb;
  v_lead_id uuid;
  v_failed boolean;
begin
  v_lead := public.zdesk_create_lead(v_workspace_id,v_member_id,'Prospect One','prospect@example.test',null,'Prospect Co','referral','ZOS opportunity','z_find',null,'high','fr','2026-09-15T09:00:00Z','Initial qualification');
  v_lead_id := (v_lead->>'id')::uuid;
  if v_lead->>'owner_workspace_member_id' <> v_member_id::text or v_lead->>'status' <> 'new' then raise exception 'Lead capture did not preserve member ownership/default status'; end if;

  v_failed := false;
  begin
    perform public.zdesk_create_lead(v_workspace_id,v_member_id,'Illegal assignment',null,null,null,'manual',null,'z_desk',v_owner_id,'normal',null,null,null);
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'Member unexpectedly assigned a new lead to another workspace member'; end if;

  perform public.zdesk_update_lead(v_workspace_id,v_member_id,v_lead_id,'{"status":"contacted","score":35}'::jsonb);
  if (select status from desk.leads where id=v_lead_id) <> 'contacted' or (select score from desk.leads where id=v_lead_id) <> 35 then raise exception 'Assigned member could not update own lead'; end if;

  v_failed := false;
  begin
    perform public.zdesk_update_lead(v_workspace_id,v_member_id,v_lead_id,'{"status":"converted"}'::jsonb);
  exception when invalid_parameter_value then v_failed := true;
  end;
  if not v_failed then raise exception 'Lead bypassed dedicated canonical conversion authority'; end if;

  if (select count(*) from desk.lead_activities where lead_id=v_lead_id) < 2 then raise exception 'Lead audit trail did not record capture and update'; end if;
end; $$;

do $$
declare
  v_workspace_id uuid := ((select owner_payload from _desk_lead_seed)->>'workspaceId')::uuid;
  v_owner_id uuid := ((select owner_payload from _desk_lead_seed)->>'workspaceMemberId')::uuid;
  v_org_id uuid := ((select owner_payload from _desk_lead_seed)->>'organisationId')::uuid;
  v_member_id uuid := (select member_id from _desk_lead_member);
  v_person_id uuid := (select person_id from _desk_lead_member);
  v_lead jsonb;
  v_lead_id uuid;
  v_person_count bigint;
  v_org_count bigint;
  v_failed boolean;
begin
  v_lead := public.zdesk_create_lead(v_workspace_id,v_owner_id,'Canonical Prospect',null,'+33100000000',null,'manual',null,'z_desk',v_owner_id,'normal','fr',null,null);
  v_lead_id := (v_lead->>'id')::uuid;
  select count(*) into v_person_count from zos.persons;
  select count(*) into v_org_count from zos.organisations;

  v_failed := false;
  begin
    perform public.zdesk_convert_lead(v_workspace_id,v_member_id,v_lead_id,v_person_id,v_org_id);
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'Ordinary member unexpectedly gained canonical lead conversion authority'; end if;

  perform public.zdesk_convert_lead(v_workspace_id,v_owner_id,v_lead_id,v_person_id,v_org_id);
  if (select status from desk.leads where id=v_lead_id) <> 'converted' then raise exception 'Owner could not convert lead'; end if;
  if (select canonical_person_id from desk.leads where id=v_lead_id) <> v_person_id then raise exception 'Canonical person link missing'; end if;
  if (select canonical_organisation_id from desk.leads where id=v_lead_id) <> v_org_id then raise exception 'Canonical organisation link missing'; end if;
  if (select count(*) from zos.persons) <> v_person_count or (select count(*) from zos.organisations) <> v_org_count then raise exception 'Lead conversion unexpectedly created duplicate canonical identity'; end if;
end; $$;

do $$
begin
  if has_function_privilege('authenticated','public.zdesk_create_lead(uuid,uuid,text,text,text,text,text,text,text,uuid,text,text,timestamptz,text)','EXECUTE') then raise exception 'authenticated can directly execute lead creation RPC'; end if;
  if has_function_privilege('authenticated','public.zdesk_update_lead(uuid,uuid,uuid,jsonb)','EXECUTE') then raise exception 'authenticated can directly execute lead update RPC'; end if;
  if has_function_privilege('authenticated','public.zdesk_convert_lead(uuid,uuid,uuid,uuid,uuid)','EXECUTE') then raise exception 'authenticated can directly execute lead conversion RPC'; end if;
  if has_table_privilege('authenticated','desk.leads','INSERT') or has_table_privilege('authenticated','desk.leads','UPDATE') then raise exception 'authenticated unexpectedly has direct lead table mutation privilege'; end if;
end; $$;

select 'Z_DESK_LEAD_MANAGEMENT_AUTHORITY_V1=PASS' as result;
rollback;
