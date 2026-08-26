\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email)
values
  ('daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01','today-owner@example.test'),
  ('daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02','today-member@example.test')
on conflict(id) do nothing;

create temp table _desk_today as
select public.zdesk_bootstrap_workspace(
  'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01',
  'today-owner@example.test',
  'Desk Today E2E',
  null
) as owner_payload;

do $$
declare
  v_workspace_id uuid := ((select owner_payload from _desk_today)->>'workspaceId')::uuid;
  v_org_id uuid := ((select owner_payload from _desk_today)->>'organisationId')::uuid;
  v_person_id uuid;
  v_membership_id uuid;
  v_member_id uuid;
  v_contact_id uuid;
  v_thread_id uuid;
  v_message_task uuid;
  v_message_event uuid;
begin
  insert into zos.persons(auth_user_id,display_name)
  values('daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02','Today Member')
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

  insert into desk.contacts(workspace_id,display_name,email)
  values(v_workspace_id,'Client Today','client-today@example.test') returning id into v_contact_id;
  insert into desk.threads(workspace_id,contact_id,email_thread_id,subject,last_message_at)
  values(v_workspace_id,v_contact_id,'today-e2e-thread','Need action',now()) returning id into v_thread_id;
  insert into desk.messages(workspace_id,thread_id,channel,direction,body,state)
  values(v_workspace_id,v_thread_id,'email','inbound','Please prepare the proposal','pending_decision') returning id into v_message_task;
  insert into desk.messages(workspace_id,thread_id,channel,direction,body,state)
  values(v_workspace_id,v_thread_id,'email','inbound','Can we meet tomorrow?','pending_decision') returning id into v_message_event;

  create temp table _desk_today_ids(member_id uuid,thread_id uuid,message_task uuid,message_event uuid) on commit drop;
  insert into _desk_today_ids values(v_member_id,v_thread_id,v_message_task,v_message_event);
end; $$;

-- Communication -> linked task -> message action state.
do $$
declare
  v_workspace_id uuid := ((select owner_payload from _desk_today)->>'workspaceId')::uuid;
  v_member_id uuid := (select member_id from _desk_today_ids);
  v_thread_id uuid := (select thread_id from _desk_today_ids);
  v_message_id uuid := (select message_task from _desk_today_ids);
  v_action jsonb;
  v_task_id uuid;
begin
  v_action := public.zdesk_create_message_action(
    v_workspace_id,v_member_id,v_message_id,'task','Prepare client proposal',null,'2026-09-20T17:00:00Z',null,null
  );
  v_task_id := (v_action->>'taskId')::uuid;
  if v_task_id is null then raise exception 'Today message did not create task action'; end if;
  if (select thread_id from desk.tasks where id=v_task_id)<>v_thread_id then raise exception 'Task lost source communication thread link'; end if;
  if (select state from desk.messages where id=v_message_id)<>'action_pending' then raise exception 'Message did not enter action_pending after task creation'; end if;
  if not exists(select 1 from desk.message_actions where message_id=v_message_id and task_id=v_task_id and action_type='task') then
    raise exception 'Message-to-task audit link missing';
  end if;
end; $$;

-- Communication -> draft meeting -> explicit human confirmation.
do $$
declare
  v_workspace_id uuid := ((select owner_payload from _desk_today)->>'workspaceId')::uuid;
  v_member_id uuid := (select member_id from _desk_today_ids);
  v_thread_id uuid := (select thread_id from _desk_today_ids);
  v_message_id uuid := (select message_event from _desk_today_ids);
  v_action jsonb;
  v_event_id uuid;
begin
  v_action := public.zdesk_create_message_action(
    v_workspace_id,v_member_id,v_message_id,'meeting','Client meeting',null,null,
    '2026-09-21T09:00:00Z','2026-09-21T10:00:00Z'
  );
  v_event_id := (v_action->>'eventId')::uuid;
  if (select status from desk.events where id=v_event_id)<>'draft' then raise exception 'Message meeting bypassed draft-first human confirmation'; end if;
  if (select thread_id from desk.events where id=v_event_id)<>v_thread_id then raise exception 'Meeting lost source communication thread link'; end if;
  perform public.zdesk_confirm_event(v_workspace_id,v_member_id,v_event_id);
  if (select status from desk.events where id=v_event_id)<>'confirmed' then raise exception 'Human confirmation did not confirm message meeting'; end if;
  if not exists(select 1 from desk.message_actions where message_id=v_message_id and event_id=v_event_id and action_type='meeting') then
    raise exception 'Message-to-event audit link missing';
  end if;
end; $$;

-- Resolution is server-authorised and cannot be followed by silent new actions.
do $$
declare
  v_workspace_id uuid := ((select owner_payload from _desk_today)->>'workspaceId')::uuid;
  v_member_id uuid := (select member_id from _desk_today_ids);
  v_message_id uuid := (select message_task from _desk_today_ids);
  v_failed boolean := false;
begin
  perform public.zdesk_resolve_message(v_workspace_id,v_member_id,v_message_id);
  if (select state from desk.messages where id=v_message_id)<>'resolved' then raise exception 'Message resolution failed'; end if;
  begin
    perform public.zdesk_create_message_action(v_workspace_id,v_member_id,v_message_id,'task','Illegal after resolve',null,null,null,null);
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'Resolved message unexpectedly created another action'; end if;
end; $$;

do $$
begin
  if has_function_privilege('authenticated','public.zdesk_resolve_message(uuid,uuid,uuid)','EXECUTE') then
    raise exception 'authenticated can directly resolve Desk message';
  end if;
  if has_function_privilege('authenticated','public.zdesk_create_message_action(uuid,uuid,uuid,text,text,uuid,timestamptz,timestamptz,timestamptz)','EXECUTE') then
    raise exception 'authenticated can directly create Desk message action';
  end if;
end; $$;

select 'Z_DESK_TODAY_ACTION_AUTHORITY_V1=PASS' as result;
rollback;
