\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email)
values
  ('d8888888-8888-4888-8888-888888888801','mut-owner@example.test'),
  ('d8888888-8888-4888-8888-888888888802','mut-member@example.test')
on conflict(id) do nothing;

create temp table _desk_mutation as
select public.zdesk_bootstrap_workspace(
  'd8888888-8888-4888-8888-888888888801',
  'mut-owner@example.test',
  'Desk Mutation Authority',
  null
) as owner_payload;

do $$
declare
  v_workspace_id uuid := ((select owner_payload from _desk_mutation)->>'workspaceId')::uuid;
  v_org_id uuid := ((select owner_payload from _desk_mutation)->>'organisationId')::uuid;
  v_person_id uuid;
  v_membership_id uuid;
  v_member_id uuid;
begin
  insert into zos.persons(auth_user_id,display_name)
  values('d8888888-8888-4888-8888-888888888802','mut-member@example.test')
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
  create temp table _desk_member(member_id uuid) on commit drop;
  insert into _desk_member values(v_member_id);
end; $$;

-- Task actor authority: owner/admin can assign missions; members can act on their own work only.
do $$
declare
  v_workspace_id uuid := ((select owner_payload from _desk_mutation)->>'workspaceId')::uuid;
  v_owner_id uuid := ((select owner_payload from _desk_mutation)->>'workspaceMemberId')::uuid;
  v_member_id uuid := (select member_id from _desk_member);
  v_task jsonb;
  v_task_id uuid;
  v_personal jsonb;
  v_personal_id uuid;
  v_failed boolean;
begin
  v_task := public.zdesk_create_task(v_workspace_id,v_owner_id,'Mission','Owner assigned mission',v_member_id,null,null);
  v_task_id := (v_task->>'id')::uuid;
  if v_task->>'created_by' <> v_owner_id::text or v_task->>'assigned_to' <> v_member_id::text or v_task->>'task_type' <> 'mission' then
    raise exception 'Owner mission creation authority failed';
  end if;

  perform public.zdesk_move_task(v_workspace_id,v_member_id,v_task_id,'in_progress');
  if (select status from desk.tasks where id=v_task_id) <> 'in_progress' then
    raise exception 'Assigned member could not move own mission';
  end if;

  v_failed := false;
  begin
    perform public.zdesk_reassign_task(v_workspace_id,v_member_id,v_task_id,v_owner_id);
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'Member unexpectedly gained task reassignment authority'; end if;

  v_failed := false;
  begin
    perform public.zdesk_delete_task(v_workspace_id,v_member_id,v_task_id);
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'Assigned member unexpectedly deleted owner-created mission'; end if;

  v_failed := false;
  begin
    perform public.zdesk_create_task(v_workspace_id,v_member_id,'Illegal assignment',null,v_owner_id,null,null);
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'Member unexpectedly assigned a task to another member'; end if;

  v_personal := public.zdesk_create_task(v_workspace_id,v_member_id,'Personal',null,null,null,null);
  v_personal_id := (v_personal->>'id')::uuid;
  perform public.zdesk_update_task(v_workspace_id,v_member_id,v_personal_id,'{"title":"Personal updated","dueDate":null}'::jsonb);
  if (select title from desk.tasks where id=v_personal_id) <> 'Personal updated' then
    raise exception 'Member could not update own personal task';
  end if;
  perform public.zdesk_delete_task(v_workspace_id,v_member_id,v_personal_id);
  if exists(select 1 from desk.tasks where id=v_personal_id) then
    raise exception 'Member could not delete own personal task';
  end if;
end; $$;

-- Event actor authority: manual events are draft-first; AI drafts require elevated decision authority.
do $$
declare
  v_workspace_id uuid := ((select owner_payload from _desk_mutation)->>'workspaceId')::uuid;
  v_owner_id uuid := ((select owner_payload from _desk_mutation)->>'workspaceMemberId')::uuid;
  v_member_id uuid := (select member_id from _desk_member);
  v_manual jsonb;
  v_manual_id uuid;
  v_ai_id uuid;
  v_external_id uuid;
  v_failed boolean;
begin
  v_manual := public.zdesk_create_event(
    v_workspace_id,v_member_id,'Member meeting',
    '2026-09-01T09:00:00Z','2026-09-01T10:00:00Z',null,'meeting'
  );
  v_manual_id := (v_manual->>'id')::uuid;
  if v_manual->>'status' <> 'draft' or v_manual->>'source' <> 'manual' or v_manual->>'created_by' <> v_member_id::text then
    raise exception 'Manual event did not preserve draft-first creator authority';
  end if;
  perform public.zdesk_update_event(v_workspace_id,v_member_id,v_manual_id,'{"title":"Member meeting updated"}'::jsonb);
  perform public.zdesk_confirm_event(v_workspace_id,v_member_id,v_manual_id);
  if (select status from desk.events where id=v_manual_id) <> 'confirmed' then
    raise exception 'Manual event creator could not confirm own draft';
  end if;

  v_failed := false;
  begin
    perform public.zdesk_reject_event(v_workspace_id,v_member_id,v_manual_id);
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'Confirmed event unexpectedly allowed local-only rejection without provider cancellation flow'; end if;

  insert into desk.events(workspace_id,title,starts_at,ends_at,source,status,event_type,confidence_score)
  values(v_workspace_id,'AI suggestion','2026-09-02T09:00:00Z','2026-09-02T10:00:00Z','ai_suggested','draft','meeting',0.900)
  returning id into v_ai_id;

  v_failed := false;
  begin
    perform public.zdesk_confirm_event(v_workspace_id,v_member_id,v_ai_id);
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'Ordinary member unexpectedly confirmed workspace AI suggestion'; end if;
  perform public.zdesk_confirm_event(v_workspace_id,v_owner_id,v_ai_id);
  if (select status from desk.events where id=v_ai_id) <> 'confirmed' then
    raise exception 'Owner could not confirm AI suggestion';
  end if;

  insert into desk.events(workspace_id,title,starts_at,ends_at,source,status,event_type)
  values(v_workspace_id,'External','2026-09-03T09:00:00Z','2026-09-03T10:00:00Z','external_sync','draft','meeting')
  returning id into v_external_id;
  v_failed := false;
  begin
    perform public.zdesk_confirm_event(v_workspace_id,v_owner_id,v_external_id);
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'External-sync event unexpectedly entered outbound confirmation flow'; end if;
end; $$;

-- Browser roles remain unable to bypass server mutation policy.
do $$
begin
  if has_function_privilege('authenticated','public.zdesk_create_task(uuid,uuid,text,text,uuid,timestamptz,uuid)','EXECUTE') then
    raise exception 'authenticated can directly execute Desk task creation RPC';
  end if;
  if has_function_privilege('authenticated','public.zdesk_confirm_event(uuid,uuid,uuid)','EXECUTE') then
    raise exception 'authenticated can directly execute Desk event confirmation RPC';
  end if;
end; $$;

select 'Z_DESK_TASK_EVENT_MUTATION_AUTHORITY_V1=PASS' as result;
rollback;
