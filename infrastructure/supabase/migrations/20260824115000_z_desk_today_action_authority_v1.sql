-- Z Desk — Today communication-to-action authority v1
-- Message decisions and action creation are server-authorised and preserve traceability to the source communication.

create table desk.message_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references desk.workspaces(id) on delete cascade,
  message_id uuid not null references desk.messages(id) on delete cascade,
  thread_id uuid not null references desk.threads(id) on delete cascade,
  actor_member_id uuid not null,
  action_type text not null check(action_type in('task','meeting','follow_up')),
  task_id uuid references desk.tasks(id) on delete set null,
  event_id uuid references desk.events(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key(workspace_id,actor_member_id) references desk.workspace_members(workspace_id,id) on delete restrict,
  check((action_type='task' and task_id is not null and event_id is null)
     or (action_type in('meeting','follow_up') and event_id is not null and task_id is null))
);
create index idx_desk_message_actions_message on desk.message_actions(workspace_id,message_id,created_at);
alter table desk.message_actions enable row level security;
revoke all on desk.message_actions from anon, authenticated;
grant all on desk.message_actions to service_role;

create or replace function public.zdesk_resolve_message(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_message_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_state text;
begin
  if v_role is null then raise exception 'Active Desk member authority required' using errcode='42501'; end if;
  select state into v_state from desk.messages where id=p_message_id and workspace_id=p_workspace_id for update;
  if v_state is null then raise exception 'Desk message not found' using errcode='22023'; end if;
  update desk.messages set state='resolved' where id=p_message_id and workspace_id=p_workspace_id;
  return jsonb_build_object('messageId',p_message_id,'resolved',true);
end;
$$;

create or replace function public.zdesk_create_message_action(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_message_id uuid,
  p_action_type text,
  p_title text,
  p_assigned_to uuid default null,
  p_due_date timestamptz default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_message desk.messages%rowtype;
  v_result jsonb;
  v_task_id uuid;
  v_event_id uuid;
  v_action_id uuid;
begin
  if v_role is null then raise exception 'Active Desk member authority required' using errcode='42501'; end if;
  if p_action_type not in('task','meeting','follow_up') then raise exception 'Invalid message action type' using errcode='22023'; end if;
  if nullif(trim(coalesce(p_title,'')),'') is null then raise exception 'Message action title is required' using errcode='22023'; end if;

  select * into v_message from desk.messages where id=p_message_id and workspace_id=p_workspace_id for update;
  if not found then raise exception 'Desk message not found' using errcode='22023'; end if;
  if v_message.state='resolved' then raise exception 'Resolved message cannot create a new action' using errcode='42501'; end if;

  if p_action_type='task' then
    v_result := public.zdesk_create_task(
      p_workspace_id,p_actor_member_id,trim(p_title),null,p_assigned_to,p_due_date,v_message.thread_id
    );
    v_task_id := (v_result->>'id')::uuid;
  else
    if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then
      raise exception 'Message calendar action requires a valid start/end range' using errcode='22023';
    end if;
    v_result := public.zdesk_create_event(
      p_workspace_id,p_actor_member_id,trim(p_title),p_starts_at,p_ends_at,v_message.thread_id,
      case when p_action_type='follow_up' then 'follow_up_block' else 'meeting' end
    );
    v_event_id := (v_result->>'id')::uuid;
  end if;

  insert into desk.message_actions(workspace_id,message_id,thread_id,actor_member_id,action_type,task_id,event_id)
  values(p_workspace_id,p_message_id,v_message.thread_id,p_actor_member_id,p_action_type,v_task_id,v_event_id)
  returning id into v_action_id;

  update desk.messages set state='action_pending' where id=p_message_id and workspace_id=p_workspace_id;

  return jsonb_build_object(
    'actionId',v_action_id,
    'actionType',p_action_type,
    'messageId',p_message_id,
    'threadId',v_message.thread_id,
    'taskId',v_task_id,
    'eventId',v_event_id,
    'result',v_result
  );
end;
$$;

revoke all on function public.zdesk_resolve_message(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.zdesk_create_message_action(uuid,uuid,uuid,text,text,uuid,timestamptz,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.zdesk_resolve_message(uuid,uuid,uuid) to service_role;
grant execute on function public.zdesk_create_message_action(uuid,uuid,uuid,text,text,uuid,timestamptz,timestamptz,timestamptz) to service_role;
