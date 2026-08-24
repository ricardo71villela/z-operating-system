-- Z Desk — task + event mutation authority v1
-- All write decisions are based on server-derived workspace/member authority.
-- Browser roles retain read-only RLS access; service-role RPCs enforce actor permissions.

alter table desk.events
  add column created_by uuid;
alter table desk.events
  add constraint desk_events_created_by_fk
  foreign key (workspace_id, created_by)
  references desk.workspace_members(workspace_id, id) on delete set null;

create or replace function desk.server_actor_role(p_workspace_id uuid, p_member_id uuid)
returns text
language sql
security definer
stable
set search_path = pg_catalog
as $$
  select wm.role
  from desk.workspace_members wm
  join desk.workspaces w on w.id=wm.workspace_id and w.status='active'
  join zos.memberships m on m.id=wm.membership_id and m.status='active'
  where wm.workspace_id=p_workspace_id and wm.id=p_member_id and wm.status='active'
  limit 1;
$$;
revoke all on function desk.server_actor_role(uuid,uuid) from public, anon, authenticated;
grant execute on function desk.server_actor_role(uuid,uuid) to service_role;

create or replace function public.zdesk_create_task(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_title text,
  p_description text,
  p_assigned_to uuid,
  p_due_date timestamptz,
  p_thread_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_assigned_to uuid := coalesce(p_assigned_to,p_actor_member_id);
  v_task desk.tasks%rowtype;
begin
  if v_actor_role is null then
    raise exception 'Active Desk member authority required' using errcode='42501';
  end if;
  if nullif(trim(coalesce(p_title,'')),'') is null then
    raise exception 'Task title is required' using errcode='22023';
  end if;
  if not exists (
    select 1 from desk.workspace_members wm
    join zos.memberships m on m.id=wm.membership_id and m.status='active'
    where wm.workspace_id=p_workspace_id and wm.id=v_assigned_to and wm.status='active'
  ) then
    raise exception 'Task assignee must be an active member of the same Desk workspace' using errcode='42501';
  end if;
  if v_actor_role='member' and v_assigned_to<>p_actor_member_id then
    raise exception 'Desk members may create tasks only for themselves' using errcode='42501';
  end if;
  if p_thread_id is not null and not exists (
    select 1 from desk.threads where id=p_thread_id and workspace_id=p_workspace_id
  ) then
    raise exception 'Task thread must belong to the same Desk workspace' using errcode='42501';
  end if;

  insert into desk.tasks(
    workspace_id,title,description,created_by,assigned_to,task_type,due_date,thread_id,source
  ) values (
    p_workspace_id,trim(p_title),p_description,p_actor_member_id,v_assigned_to,
    case when v_assigned_to=p_actor_member_id then 'personal' else 'mission' end,
    p_due_date,p_thread_id,'manual'
  ) returning * into v_task;
  return to_jsonb(v_task);
end;
$$;

create or replace function public.zdesk_move_task(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_task_id uuid,
  p_status text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_assigned_to uuid;
begin
  if v_actor_role is null then raise exception 'Active Desk member authority required' using errcode='42501'; end if;
  if p_status not in ('todo','in_progress','done') then raise exception 'Invalid task status' using errcode='22023'; end if;
  select assigned_to into v_assigned_to from desk.tasks
    where id=p_task_id and workspace_id=p_workspace_id for update;
  if v_assigned_to is null then raise exception 'Desk task not found' using errcode='22023'; end if;
  if v_actor_role='member' and v_assigned_to<>p_actor_member_id then
    raise exception 'Desk members may move only tasks assigned to themselves' using errcode='42501';
  end if;
  update desk.tasks set status=p_status where id=p_task_id and workspace_id=p_workspace_id;
  return jsonb_build_object('taskId',p_task_id,'status',p_status);
end;
$$;

create or replace function public.zdesk_reassign_task(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_task_id uuid,
  p_assigned_to uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_created_by uuid;
  v_task_type text;
begin
  if v_actor_role not in ('owner','admin') then
    raise exception 'Desk owner or admin task reassignment authority required' using errcode='42501';
  end if;
  if not exists (
    select 1 from desk.workspace_members wm
    join zos.memberships m on m.id=wm.membership_id and m.status='active'
    where wm.workspace_id=p_workspace_id and wm.id=p_assigned_to and wm.status='active'
  ) then
    raise exception 'Task assignee must be an active member of the same Desk workspace' using errcode='42501';
  end if;
  select created_by into v_created_by from desk.tasks
    where id=p_task_id and workspace_id=p_workspace_id for update;
  if v_created_by is null then raise exception 'Desk task not found' using errcode='22023'; end if;
  v_task_type := case when p_assigned_to=v_created_by then 'personal' else 'mission' end;
  update desk.tasks set assigned_to=p_assigned_to,task_type=v_task_type
    where id=p_task_id and workspace_id=p_workspace_id;
  return jsonb_build_object('taskId',p_task_id,'assignedTo',p_assigned_to,'taskType',v_task_type);
end;
$$;

create or replace function public.zdesk_update_task(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_task_id uuid,
  p_patch jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_task desk.tasks%rowtype;
  v_key text;
  v_title text;
  v_description text;
  v_due_date timestamptz;
begin
  if v_actor_role is null then raise exception 'Active Desk member authority required' using errcode='42501'; end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'Task patch must be an object' using errcode='22023'; end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('title','description','dueDate') then raise exception 'Unsupported task patch field: %',v_key using errcode='22023'; end if;
  end loop;

  select * into v_task from desk.tasks where id=p_task_id and workspace_id=p_workspace_id for update;
  if not found then raise exception 'Desk task not found' using errcode='22023'; end if;
  if v_actor_role='member' and p_actor_member_id not in (v_task.created_by,v_task.assigned_to) then
    raise exception 'Desk member cannot update this task' using errcode='42501';
  end if;

  v_title := v_task.title;
  v_description := v_task.description;
  v_due_date := v_task.due_date;
  if p_patch ? 'title' then
    v_title := nullif(trim(coalesce(p_patch->>'title','')),'');
    if v_title is null then raise exception 'Task title cannot be empty' using errcode='22023'; end if;
  end if;
  if p_patch ? 'description' then
    v_description := case when p_patch->'description'='null'::jsonb then null else p_patch->>'description' end;
  end if;
  if p_patch ? 'dueDate' then
    v_due_date := case when p_patch->'dueDate'='null'::jsonb then null else (p_patch->>'dueDate')::timestamptz end;
  end if;

  update desk.tasks set title=v_title,description=v_description,due_date=v_due_date
    where id=p_task_id and workspace_id=p_workspace_id returning * into v_task;
  return to_jsonb(v_task);
end;
$$;

create or replace function public.zdesk_delete_task(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_task_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_created_by uuid;
begin
  if v_actor_role is null then raise exception 'Active Desk member authority required' using errcode='42501'; end if;
  select created_by into v_created_by from desk.tasks
    where id=p_task_id and workspace_id=p_workspace_id for update;
  if v_created_by is null then raise exception 'Desk task not found' using errcode='22023'; end if;
  if v_actor_role='member' and v_created_by<>p_actor_member_id then
    raise exception 'Desk members may delete only tasks they created' using errcode='42501';
  end if;
  delete from desk.tasks where id=p_task_id and workspace_id=p_workspace_id;
  return jsonb_build_object('taskId',p_task_id,'deleted',true);
end;
$$;

create or replace function public.zdesk_create_event(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_thread_id uuid,
  p_event_type text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_event desk.events%rowtype;
begin
  if v_actor_role is null then raise exception 'Active Desk member authority required' using errcode='42501'; end if;
  if nullif(trim(coalesce(p_title,'')),'') is null then raise exception 'Event title is required' using errcode='22023'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then raise exception 'Event end must be after start' using errcode='22023'; end if;
  if p_event_type not in ('meeting','follow_up_block') then raise exception 'Invalid Desk event type' using errcode='22023'; end if;
  if p_thread_id is not null and not exists (
    select 1 from desk.threads where id=p_thread_id and workspace_id=p_workspace_id
  ) then raise exception 'Event thread must belong to same Desk workspace' using errcode='42501'; end if;

  insert into desk.events(workspace_id,thread_id,title,starts_at,ends_at,source,status,event_type,created_by)
  values(p_workspace_id,p_thread_id,trim(p_title),p_starts_at,p_ends_at,'manual','draft',p_event_type,p_actor_member_id)
  returning * into v_event;
  return to_jsonb(v_event);
end;
$$;

create or replace function public.zdesk_update_event(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_event_id uuid,
  p_patch jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_event desk.events%rowtype;
  v_key text;
  v_title text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_event_type text;
begin
  if v_actor_role is null then raise exception 'Active Desk member authority required' using errcode='42501'; end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'Event patch must be an object' using errcode='22023'; end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('title','startsAt','endsAt','eventType') then raise exception 'Unsupported event patch field: %',v_key using errcode='22023'; end if;
  end loop;

  select * into v_event from desk.events where id=p_event_id and workspace_id=p_workspace_id for update;
  if not found then raise exception 'Desk event not found' using errcode='22023'; end if;
  if v_event.status<>'draft' or v_event.source='external_sync' then raise exception 'Only non-external draft events may be edited' using errcode='42501'; end if;
  if v_actor_role='member' and not (v_event.source='manual' and v_event.created_by=p_actor_member_id) then
    raise exception 'Desk member cannot edit this event' using errcode='42501';
  end if;

  v_title := v_event.title;
  v_starts_at := v_event.starts_at;
  v_ends_at := v_event.ends_at;
  v_event_type := v_event.event_type;
  if p_patch ? 'title' then
    v_title := nullif(trim(coalesce(p_patch->>'title','')),'');
    if v_title is null then raise exception 'Event title cannot be empty' using errcode='22023'; end if;
  end if;
  if p_patch ? 'startsAt' then v_starts_at := (p_patch->>'startsAt')::timestamptz; end if;
  if p_patch ? 'endsAt' then v_ends_at := (p_patch->>'endsAt')::timestamptz; end if;
  if p_patch ? 'eventType' then
    v_event_type := p_patch->>'eventType';
    if v_event_type not in ('meeting','follow_up_block') then raise exception 'Invalid Desk event type' using errcode='22023'; end if;
  end if;
  if v_starts_at is null or v_ends_at is null or v_ends_at<=v_starts_at then raise exception 'Event end must be after start' using errcode='22023'; end if;

  update desk.events set title=v_title,starts_at=v_starts_at,ends_at=v_ends_at,event_type=v_event_type
    where id=p_event_id and workspace_id=p_workspace_id returning * into v_event;
  return to_jsonb(v_event);
end;
$$;

create or replace function public.zdesk_confirm_event(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_event_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_event desk.events%rowtype;
begin
  if v_actor_role is null then raise exception 'Active Desk member authority required' using errcode='42501'; end if;
  select * into v_event from desk.events where id=p_event_id and workspace_id=p_workspace_id for update;
  if not found then raise exception 'Desk event not found' using errcode='22023'; end if;
  if v_event.status<>'draft' or v_event.source='external_sync' then raise exception 'Only non-external draft events may be confirmed' using errcode='42501'; end if;
  if v_actor_role='member' and not (v_event.source='manual' and v_event.created_by=p_actor_member_id) then
    raise exception 'Desk member cannot confirm this event' using errcode='42501';
  end if;
  update desk.events set status='confirmed' where id=p_event_id and workspace_id=p_workspace_id;
  return jsonb_build_object('eventId',p_event_id,'confirmed',true);
end;
$$;

create or replace function public.zdesk_reject_event(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_event_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_event desk.events%rowtype;
begin
  if v_actor_role is null then raise exception 'Active Desk member authority required' using errcode='42501'; end if;
  select * into v_event from desk.events where id=p_event_id and workspace_id=p_workspace_id for update;
  if not found then raise exception 'Desk event not found' using errcode='22023'; end if;
  if v_event.status<>'draft' or v_event.source='external_sync' then raise exception 'Only non-external draft events may be rejected' using errcode='42501'; end if;
  if v_actor_role='member' and not (v_event.source='manual' and v_event.created_by=p_actor_member_id) then
    raise exception 'Desk member cannot reject this event' using errcode='42501';
  end if;
  update desk.events set status='cancelled' where id=p_event_id and workspace_id=p_workspace_id;
  return jsonb_build_object('eventId',p_event_id,'rejected',true);
end;
$$;

revoke all on function public.zdesk_create_task(uuid,uuid,text,text,uuid,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.zdesk_move_task(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.zdesk_reassign_task(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.zdesk_update_task(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.zdesk_delete_task(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.zdesk_create_event(uuid,uuid,text,timestamptz,timestamptz,uuid,text) from public,anon,authenticated;
revoke all on function public.zdesk_update_event(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.zdesk_confirm_event(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.zdesk_reject_event(uuid,uuid,uuid) from public,anon,authenticated;

grant execute on function public.zdesk_create_task(uuid,uuid,text,text,uuid,timestamptz,uuid) to service_role;
grant execute on function public.zdesk_move_task(uuid,uuid,uuid,text) to service_role;
grant execute on function public.zdesk_reassign_task(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.zdesk_update_task(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.zdesk_delete_task(uuid,uuid,uuid) to service_role;
grant execute on function public.zdesk_create_event(uuid,uuid,text,timestamptz,timestamptz,uuid,text) to service_role;
grant execute on function public.zdesk_update_event(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.zdesk_confirm_event(uuid,uuid,uuid) to service_role;
grant execute on function public.zdesk_reject_event(uuid,uuid,uuid) to service_role;

comment on column desk.events.created_by is
  'Desk workspace member who created a manual event. AI/external events may remain null and require elevated decision authority.';
