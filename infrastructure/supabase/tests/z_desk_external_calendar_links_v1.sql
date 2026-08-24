\set ON_ERROR_STOP on
begin;

insert into auth.users(id, email)
values
  ('d4444444-4444-4444-8444-444444444444', 'desk-cal-a@example.test'),
  ('d5555555-5555-4555-8555-555555555555', 'desk-cal-b@example.test')
on conflict (id) do nothing;

create temp table _desk_cal_a as
select public.zdesk_bootstrap_workspace(
  'd4444444-4444-4444-8444-444444444444',
  'desk-cal-a@example.test',
  'Desk Calendar A',
  null
) as payload;

create temp table _desk_cal_b as
select public.zdesk_bootstrap_workspace(
  'd5555555-5555-4555-8555-555555555555',
  'desk-cal-b@example.test',
  'Desk Calendar B',
  null
) as payload;

do $$
declare
  a_workspace uuid := ((select payload from _desk_cal_a)->>'workspaceId')::uuid;
  b_workspace uuid := ((select payload from _desk_cal_b)->>'workspaceId')::uuid;
  a_event uuid;
  google_integration uuid;
  microsoft_integration uuid;
  b_integration uuid;
begin
  insert into desk.events(
    workspace_id,title,starts_at,ends_at,source,status
  ) values(
    a_workspace,'Desk confirmed meeting',now()+interval '1 hour',now()+interval '2 hours','manual','confirmed'
  ) returning id into a_event;

  insert into desk.integrations(workspace_id,provider,external_account_id)
  values(a_workspace,'google_calendar','calendar-a-google@example.test')
  returning id into google_integration;

  insert into desk.integrations(workspace_id,provider,external_account_id)
  values(a_workspace,'microsoft_calendar','calendar-a-ms@example.test')
  returning id into microsoft_integration;

  insert into desk.integrations(workspace_id,provider,external_account_id)
  values(b_workspace,'google_calendar','calendar-b-google@example.test')
  returning id into b_integration;

  insert into desk.event_external_links(workspace_id,event_id,integration_id,external_event_id)
  values
    (a_workspace,a_event,google_integration,'google-event-1'),
    (a_workspace,a_event,microsoft_integration,'ms-event-1');

  if (select count(*) from desk.event_external_links where event_id=a_event) <> 2 then
    raise exception 'one Desk event did not retain two independent external calendar links';
  end if;

  begin
    insert into desk.event_external_links(workspace_id,event_id,integration_id,external_event_id)
    values(a_workspace,a_event,b_integration,'cross-workspace-event');
    raise exception 'cross-workspace calendar link unexpectedly accepted';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into desk.event_external_links(workspace_id,event_id,integration_id,external_event_id)
    values(a_workspace,a_event,google_integration,'duplicate-link');
    raise exception 'duplicate event/integration calendar link unexpectedly accepted';
  exception when unique_violation then null;
  end;
end; $$;

do $$
begin
  if has_table_privilege('authenticated','desk.event_external_links','SELECT') then
    raise exception 'authenticated can read server-only external calendar links';
  end if;
  if not has_table_privilege('service_role','desk.event_external_links','SELECT') then
    raise exception 'service_role lacks external calendar link authority';
  end if;
end; $$;

select 'Z_DESK_EXTERNAL_CALENDAR_LINKS_V1=PASS' as result;
rollback;
