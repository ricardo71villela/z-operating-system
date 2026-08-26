-- Z Desk — personnel authority + privacy v1
-- Personnel data is private-by-default. Browser users may read only their own detailed rows;
-- owner/admin team views are served through the canonical authenticated API boundary.

create or replace function desk.current_workspace_member_id(p_workspace_id uuid)
returns uuid
language sql
security definer
stable
set search_path = pg_catalog
as $$
  select wm.id
  from desk.workspace_members wm
  join desk.workspaces w on w.id=wm.workspace_id and w.status='active'
  join zos.memberships m on m.id=wm.membership_id and m.status='active'
  join zos.persons p on p.id=m.person_id
  where wm.workspace_id=p_workspace_id
    and wm.status='active'
    and p.auth_user_id=auth.uid()
    and m.organisation_id=w.organisation_id
  limit 1;
$$;
revoke all on function desk.current_workspace_member_id(uuid) from public;
grant execute on function desk.current_workspace_member_id(uuid) to authenticated, service_role;

alter table desk.absences
  add column requested_by uuid,
  add column decided_by uuid,
  add column decided_at timestamptz;
update desk.absences set requested_by=member_id where requested_by is null;
alter table desk.absences drop constraint absences_status_check;
alter table desk.absences add constraint absences_status_check check(status in('requested','approved','rejected','cancelled'));
alter table desk.absences
  add constraint desk_absences_requested_by_fk foreign key(workspace_id,requested_by)
    references desk.workspace_members(workspace_id,id) on delete set null,
  add constraint desk_absences_decided_by_fk foreign key(workspace_id,decided_by)
    references desk.workspace_members(workspace_id,id) on delete set null;

alter table desk.overtime_entries
  add column submitted_by uuid,
  add column decided_by uuid,
  add column decided_at timestamptz;
update desk.overtime_entries set submitted_by=member_id where submitted_by is null;
alter table desk.overtime_entries drop constraint overtime_entries_status_check;
alter table desk.overtime_entries add constraint overtime_entries_status_check check(status in('pending','approved','rejected','cancelled'));
alter table desk.overtime_entries
  add constraint desk_overtime_submitted_by_fk foreign key(workspace_id,submitted_by)
    references desk.workspace_members(workspace_id,id) on delete set null,
  add constraint desk_overtime_decided_by_fk foreign key(workspace_id,decided_by)
    references desk.workspace_members(workspace_id,id) on delete set null;

drop policy desk_work_schedules_read_member on desk.work_schedules;
drop policy desk_absences_read_member on desk.absences;
drop policy desk_schedule_overrides_read_member on desk.schedule_overrides;
drop policy desk_schedule_validations_read_member on desk.schedule_validations;
drop policy desk_overtime_read_member on desk.overtime_entries;

create policy desk_work_schedules_private_read on desk.work_schedules for select using(
  desk.workspace_role(workspace_id) in ('owner','admin')
  or member_id=desk.current_workspace_member_id(workspace_id)
);
create policy desk_absences_private_read on desk.absences for select using(
  desk.workspace_role(workspace_id) in ('owner','admin')
  or member_id=desk.current_workspace_member_id(workspace_id)
);
create policy desk_schedule_overrides_private_read on desk.schedule_overrides for select using(
  desk.workspace_role(workspace_id) in ('owner','admin')
  or member_id=desk.current_workspace_member_id(workspace_id)
);
create policy desk_schedule_validations_private_read on desk.schedule_validations for select using(
  desk.workspace_role(workspace_id) in ('owner','admin')
  or member_id=desk.current_workspace_member_id(workspace_id)
);
create policy desk_overtime_private_read on desk.overtime_entries for select using(
  desk.workspace_role(workspace_id) in ('owner','admin')
  or member_id=desk.current_workspace_member_id(workspace_id)
);

create or replace function public.zdesk_replace_work_schedule(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_member_id uuid,
  p_schedule jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_item jsonb;
  v_count integer := 0;
begin
  if v_role not in ('owner','admin') then
    raise exception 'Desk owner or admin schedule authority required' using errcode='42501';
  end if;
  if not exists(select 1 from desk.workspace_members where workspace_id=p_workspace_id and id=p_member_id and status='active') then
    raise exception 'Schedule member must be active in the same Desk workspace' using errcode='42501';
  end if;
  if p_schedule is null or jsonb_typeof(p_schedule)<>'array' then
    raise exception 'Schedule must be a JSON array' using errcode='22023';
  end if;

  delete from desk.work_schedules where workspace_id=p_workspace_id and member_id=p_member_id;
  for v_item in select value from jsonb_array_elements(p_schedule) loop
    insert into desk.work_schedules(workspace_id,member_id,day_of_week,start_time,end_time)
    values(
      p_workspace_id,p_member_id,
      (v_item->>'dayOfWeek')::smallint,
      (v_item->>'startTime')::time,
      (v_item->>'endTime')::time
    );
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('memberId',p_member_id,'entries',v_count);
end;
$$;

create or replace function public.zdesk_request_absence(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_member_id uuid,
  p_type text,
  p_start_date date,
  p_end_date date,
  p_note text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_absence desk.absences%rowtype;
begin
  if v_role is null then raise exception 'Active Desk member authority required' using errcode='42501'; end if;
  if v_role='member' and p_member_id<>p_actor_member_id then
    raise exception 'Desk members may request absence only for themselves' using errcode='42501';
  end if;
  if not exists(select 1 from desk.workspace_members where workspace_id=p_workspace_id and id=p_member_id and status='active') then
    raise exception 'Absence member must be active in the same Desk workspace' using errcode='42501';
  end if;
  if p_type not in('vacation','sick','other','falta_justificada','falta_injustificada') then
    raise exception 'Invalid absence type' using errcode='22023';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then
    raise exception 'Invalid absence date range' using errcode='22023';
  end if;
  if exists(
    select 1 from desk.absences
    where workspace_id=p_workspace_id and member_id=p_member_id
      and status in('requested','approved')
      and start_date<=p_end_date and end_date>=p_start_date
  ) then
    raise exception 'Absence overlaps an existing active request' using errcode='23505';
  end if;

  insert into desk.absences(workspace_id,member_id,type,status,start_date,end_date,note,requested_by)
  values(p_workspace_id,p_member_id,p_type,'requested',p_start_date,p_end_date,p_note,p_actor_member_id)
  returning * into v_absence;
  return to_jsonb(v_absence);
end;
$$;

create or replace function public.zdesk_decide_absence(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_absence_id uuid,
  p_decision text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_status text;
begin
  if v_role not in ('owner','admin') then
    raise exception 'Desk owner or admin absence decision authority required' using errcode='42501';
  end if;
  if p_decision not in('approved','rejected') then raise exception 'Invalid absence decision' using errcode='22023'; end if;
  select status into v_status from desk.absences where workspace_id=p_workspace_id and id=p_absence_id for update;
  if v_status is null then raise exception 'Desk absence not found' using errcode='22023'; end if;
  if v_status<>'requested' then raise exception 'Only requested absence may be decided' using errcode='42501'; end if;
  update desk.absences set status=p_decision,decided_by=p_actor_member_id,decided_at=now()
  where workspace_id=p_workspace_id and id=p_absence_id;
  return jsonb_build_object('absenceId',p_absence_id,'status',p_decision);
end;
$$;

create or replace function public.zdesk_cancel_absence(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_absence_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_absence desk.absences%rowtype;
begin
  if v_role is null then raise exception 'Active Desk member authority required' using errcode='42501'; end if;
  select * into v_absence from desk.absences where workspace_id=p_workspace_id and id=p_absence_id for update;
  if not found then raise exception 'Desk absence not found' using errcode='22023'; end if;
  if v_absence.status not in('requested','approved') then raise exception 'Absence cannot be cancelled in its current state' using errcode='42501'; end if;
  if v_role='member' and not (v_absence.member_id=p_actor_member_id and v_absence.status='requested') then
    raise exception 'Desk members may cancel only their own pending absence request' using errcode='42501';
  end if;
  update desk.absences set status='cancelled',decided_by=p_actor_member_id,decided_at=now()
  where workspace_id=p_workspace_id and id=p_absence_id;
  return jsonb_build_object('absenceId',p_absence_id,'status','cancelled');
end;
$$;

create or replace function public.zdesk_upsert_schedule_override(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_member_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time,
  p_note text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_override desk.schedule_overrides%rowtype;
begin
  if v_role not in ('owner','admin') then raise exception 'Desk owner or admin schedule override authority required' using errcode='42501'; end if;
  if not exists(select 1 from desk.workspace_members where workspace_id=p_workspace_id and id=p_member_id and status='active') then
    raise exception 'Override member must be active in the same Desk workspace' using errcode='42501';
  end if;
  if p_date is null then raise exception 'Override date is required' using errcode='22023'; end if;
  if (p_start_time is null)<>(p_end_time is null) or (p_start_time is not null and p_end_time<=p_start_time) then
    raise exception 'Invalid override time range' using errcode='22023';
  end if;
  insert into desk.schedule_overrides(workspace_id,member_id,date,start_time,end_time,note)
  values(p_workspace_id,p_member_id,p_date,p_start_time,p_end_time,p_note)
  on conflict(workspace_id,member_id,date) do update
    set start_time=excluded.start_time,end_time=excluded.end_time,note=excluded.note
  returning * into v_override;
  return to_jsonb(v_override);
end;
$$;

create or replace function public.zdesk_delete_schedule_override(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_override_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
begin
  if v_role not in ('owner','admin') then raise exception 'Desk owner or admin schedule override authority required' using errcode='42501'; end if;
  if not exists(select 1 from desk.schedule_overrides where workspace_id=p_workspace_id and id=p_override_id) then
    raise exception 'Desk schedule override not found' using errcode='22023';
  end if;
  delete from desk.schedule_overrides where workspace_id=p_workspace_id and id=p_override_id;
  return jsonb_build_object('overrideId',p_override_id,'deleted',true);
end;
$$;

create or replace function public.zdesk_validate_schedule_week(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_member_id uuid,
  p_week_start date
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_validation desk.schedule_validations%rowtype;
begin
  if v_role not in ('owner','admin') then raise exception 'Desk owner or admin schedule validation authority required' using errcode='42501'; end if;
  if extract(isodow from p_week_start)<>1 then raise exception 'Week start must be Monday' using errcode='22023'; end if;
  if not exists(select 1 from desk.workspace_members where workspace_id=p_workspace_id and id=p_member_id and status='active') then
    raise exception 'Validation member must be active in the same Desk workspace' using errcode='42501';
  end if;
  insert into desk.schedule_validations(workspace_id,member_id,week_start_date,status,validated_at,validated_by)
  values(p_workspace_id,p_member_id,p_week_start,'validated',now(),p_actor_member_id)
  on conflict(workspace_id,member_id,week_start_date) do update
    set status='validated',validated_at=now(),validated_by=p_actor_member_id
  returning * into v_validation;
  return to_jsonb(v_validation);
end;
$$;

create or replace function public.zdesk_submit_overtime(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_member_id uuid,
  p_date date,
  p_hours numeric,
  p_note text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_entry desk.overtime_entries%rowtype;
begin
  if v_role is null then raise exception 'Active Desk member authority required' using errcode='42501'; end if;
  if v_role='member' and p_member_id<>p_actor_member_id then
    raise exception 'Desk members may submit overtime only for themselves' using errcode='42501';
  end if;
  if not exists(select 1 from desk.workspace_members where workspace_id=p_workspace_id and id=p_member_id and status='active') then
    raise exception 'Overtime member must be active in the same Desk workspace' using errcode='42501';
  end if;
  if p_date is null or p_hours is null or p_hours<=0 or p_hours>24 then raise exception 'Invalid overtime entry' using errcode='22023'; end if;
  insert into desk.overtime_entries(workspace_id,member_id,date,hours,note,status,submitted_by)
  values(p_workspace_id,p_member_id,p_date,p_hours,p_note,'pending',p_actor_member_id)
  returning * into v_entry;
  return to_jsonb(v_entry);
end;
$$;

create or replace function public.zdesk_decide_overtime(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_overtime_id uuid,
  p_decision text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_status text;
begin
  if v_role not in ('owner','admin') then raise exception 'Desk owner or admin overtime decision authority required' using errcode='42501'; end if;
  if p_decision not in('approved','rejected') then raise exception 'Invalid overtime decision' using errcode='22023'; end if;
  select status into v_status from desk.overtime_entries where workspace_id=p_workspace_id and id=p_overtime_id for update;
  if v_status is null then raise exception 'Desk overtime entry not found' using errcode='22023'; end if;
  if v_status<>'pending' then raise exception 'Only pending overtime may be decided' using errcode='42501'; end if;
  update desk.overtime_entries
  set status=p_decision,
      approved_by=case when p_decision='approved' then p_actor_member_id else null end,
      approved_at=case when p_decision='approved' then now() else null end,
      decided_by=p_actor_member_id,decided_at=now()
  where workspace_id=p_workspace_id and id=p_overtime_id;
  return jsonb_build_object('overtimeId',p_overtime_id,'status',p_decision);
end;
$$;

create or replace function public.zdesk_cancel_overtime(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_overtime_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_entry desk.overtime_entries%rowtype;
begin
  if v_role is null then raise exception 'Active Desk member authority required' using errcode='42501'; end if;
  select * into v_entry from desk.overtime_entries where workspace_id=p_workspace_id and id=p_overtime_id for update;
  if not found then raise exception 'Desk overtime entry not found' using errcode='22023'; end if;
  if v_entry.status not in('pending','approved') then raise exception 'Overtime cannot be cancelled in its current state' using errcode='42501'; end if;
  if v_role='member' and not (v_entry.member_id=p_actor_member_id and v_entry.status='pending') then
    raise exception 'Desk members may cancel only their own pending overtime' using errcode='42501';
  end if;
  update desk.overtime_entries
  set status='cancelled',approved_by=null,approved_at=null,decided_by=p_actor_member_id,decided_at=now()
  where workspace_id=p_workspace_id and id=p_overtime_id;
  return jsonb_build_object('overtimeId',p_overtime_id,'status','cancelled');
end;
$$;

revoke all on function public.zdesk_replace_work_schedule(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.zdesk_request_absence(uuid,uuid,uuid,text,date,date,text) from public,anon,authenticated;
revoke all on function public.zdesk_decide_absence(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.zdesk_cancel_absence(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.zdesk_upsert_schedule_override(uuid,uuid,uuid,date,time,time,text) from public,anon,authenticated;
revoke all on function public.zdesk_delete_schedule_override(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.zdesk_validate_schedule_week(uuid,uuid,uuid,date) from public,anon,authenticated;
revoke all on function public.zdesk_submit_overtime(uuid,uuid,uuid,date,numeric,text) from public,anon,authenticated;
revoke all on function public.zdesk_decide_overtime(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.zdesk_cancel_overtime(uuid,uuid,uuid) from public,anon,authenticated;

grant execute on function public.zdesk_replace_work_schedule(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.zdesk_request_absence(uuid,uuid,uuid,text,date,date,text) to service_role;
grant execute on function public.zdesk_decide_absence(uuid,uuid,uuid,text) to service_role;
grant execute on function public.zdesk_cancel_absence(uuid,uuid,uuid) to service_role;
grant execute on function public.zdesk_upsert_schedule_override(uuid,uuid,uuid,date,time,time,text) to service_role;
grant execute on function public.zdesk_delete_schedule_override(uuid,uuid,uuid) to service_role;
grant execute on function public.zdesk_validate_schedule_week(uuid,uuid,uuid,date) to service_role;
grant execute on function public.zdesk_submit_overtime(uuid,uuid,uuid,date,numeric,text) to service_role;
grant execute on function public.zdesk_decide_overtime(uuid,uuid,uuid,text) to service_role;
grant execute on function public.zdesk_cancel_overtime(uuid,uuid,uuid) to service_role;
