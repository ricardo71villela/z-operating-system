\set ON_ERROR_STOP on
begin;

insert into auth.users(id, email)
values ('d3333333-3333-4333-8333-333333333333', 'desk-worker@example.test')
on conflict (id) do nothing;

create temp table _desk_worker as
select public.zdesk_bootstrap_workspace(
  'd3333333-3333-4333-8333-333333333333',
  'desk-worker@example.test',
  'Desk Worker',
  null
) as payload;

do $$
declare
  v_workspace_id uuid := ((select payload from _desk_worker)->>'workspaceId')::uuid;
  contact_id uuid;
  thread_id uuid;
begin
  insert into desk.contacts(workspace_id,email,display_name)
  values(v_workspace_id,'sender@example.test','Sender')
  on conflict(workspace_id,email) do update set display_name=excluded.display_name
  returning id into contact_id;

  insert into desk.threads(workspace_id,contact_id,email_thread_id,subject)
  values(v_workspace_id,contact_id,'thread-1','Hello')
  on conflict(workspace_id,email_thread_id) do update set subject=excluded.subject
  returning id into thread_id;

  insert into desk.messages(
    workspace_id,thread_id,channel,direction,external_message_id,body
  ) values(
    v_workspace_id,thread_id,'email','inbound','provider-message-1','First copy'
  );

  begin
    insert into desk.messages(
      workspace_id,thread_id,channel,direction,external_message_id,body
    ) values(
      v_workspace_id,thread_id,'email','inbound','provider-message-1','Duplicate copy'
    );
    raise exception 'duplicate provider message unexpectedly accepted';
  exception when unique_violation then null;
  end;

  insert into desk.events(
    workspace_id,title,starts_at,ends_at,source,status,
    external_calendar_provider,external_calendar_event_id
  ) values(
    v_workspace_id,'External event',now()+interval '1 hour',now()+interval '2 hours',
    'external_sync','confirmed','google_calendar','event-1'
  )
  on conflict(workspace_id,external_calendar_provider,external_calendar_event_id)
  do update set title=excluded.title;
end; $$;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname='desk'
      and indexname='uq_desk_contacts_workspace_email'
      and indexdef not ilike '% where %'
  ) then raise exception 'Desk contact email upsert authority is not a full unique index'; end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname='desk'
      and indexname='uq_desk_events_external'
      and indexdef not ilike '% where %'
  ) then raise exception 'Desk external calendar upsert authority is not a full unique index'; end if;
end; $$;

select 'Z_DESK_WORKER_INGESTION_V1=PASS' as result;
rollback;
