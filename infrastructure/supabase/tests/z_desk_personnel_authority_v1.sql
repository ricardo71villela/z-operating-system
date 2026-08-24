\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email)
values
  ('d9999999-9999-4999-8999-999999999901','personnel-owner@example.test'),
  ('d9999999-9999-4999-8999-999999999902','personnel-member@example.test')
on conflict(id) do nothing;

create temp table _desk_personnel as
select public.zdesk_bootstrap_workspace(
  'd9999999-9999-4999-8999-999999999901',
  'personnel-owner@example.test',
  'Desk Personnel Authority',
  null
) as owner_payload;

do $$
declare
  v_workspace_id uuid := ((select owner_payload from _desk_personnel)->>'workspaceId')::uuid;
  v_org_id uuid := ((select owner_payload from _desk_personnel)->>'organisationId')::uuid;
  v_person_id uuid;
  v_membership_id uuid;
  v_member_id uuid;
begin
  insert into zos.persons(auth_user_id,display_name)
  values('d9999999-9999-4999-8999-999999999902','Personnel Member')
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
  create temp table _desk_personnel_member(member_id uuid) on commit drop;
  insert into _desk_personnel_member values(v_member_id);
end; $$;

-- Schedule authority and self-service absence/overtime rules.
do $$
declare
  v_workspace_id uuid := ((select owner_payload from _desk_personnel)->>'workspaceId')::uuid;
  v_owner_id uuid := ((select owner_payload from _desk_personnel)->>'workspaceMemberId')::uuid;
  v_member_id uuid := (select member_id from _desk_personnel_member);
  v_absence jsonb;
  v_absence_id uuid;
  v_owner_absence jsonb;
  v_ot jsonb;
  v_ot_id uuid;
  v_owner_ot jsonb;
  v_failed boolean;
begin
  perform public.zdesk_replace_work_schedule(
    v_workspace_id,v_owner_id,v_member_id,
    '[{"dayOfWeek":1,"startTime":"09:00","endTime":"17:00"},{"dayOfWeek":2,"startTime":"09:00","endTime":"17:00"}]'::jsonb
  );
  if (select count(*) from desk.work_schedules where workspace_id=v_workspace_id and member_id=v_member_id)<>2 then
    raise exception 'Personnel schedule replacement failed';
  end if;

  v_failed := false;
  begin
    perform public.zdesk_replace_work_schedule(v_workspace_id,v_member_id,v_member_id,'[]'::jsonb);
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'Ordinary member unexpectedly gained schedule management authority'; end if;

  v_absence := public.zdesk_request_absence(v_workspace_id,v_member_id,v_member_id,'vacation','2026-09-07','2026-09-08','member request');
  v_absence_id := (v_absence->>'id')::uuid;
  v_failed := false;
  begin
    perform public.zdesk_decide_absence(v_workspace_id,v_member_id,v_absence_id,'approved');
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'Ordinary member unexpectedly decided own absence'; end if;
  perform public.zdesk_decide_absence(v_workspace_id,v_owner_id,v_absence_id,'approved');

  v_failed := false;
  begin
    perform public.zdesk_request_absence(v_workspace_id,v_member_id,v_owner_id,'vacation','2026-09-10','2026-09-10',null);
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'Ordinary member unexpectedly requested absence for another member'; end if;

  v_owner_absence := public.zdesk_request_absence(v_workspace_id,v_owner_id,v_owner_id,'other','2026-09-11','2026-09-11','owner private row');
  perform public.zdesk_decide_absence(v_workspace_id,v_owner_id,(v_owner_absence->>'id')::uuid,'approved');

  perform public.zdesk_upsert_schedule_override(v_workspace_id,v_owner_id,v_member_id,'2026-09-09','10:00','16:00','short day');
  perform public.zdesk_validate_schedule_week(v_workspace_id,v_owner_id,v_member_id,'2026-09-07');

  v_ot := public.zdesk_submit_overtime(v_workspace_id,v_member_id,v_member_id,'2026-09-09',2.5,'member overtime');
  v_ot_id := (v_ot->>'id')::uuid;
  v_failed := false;
  begin
    perform public.zdesk_decide_overtime(v_workspace_id,v_member_id,v_ot_id,'approved');
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'Ordinary member unexpectedly approved own overtime'; end if;
  perform public.zdesk_decide_overtime(v_workspace_id,v_owner_id,v_ot_id,'approved');

  v_failed := false;
  begin
    perform public.zdesk_submit_overtime(v_workspace_id,v_member_id,v_owner_id,'2026-09-09',1,null);
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'Ordinary member unexpectedly submitted overtime for another member'; end if;

  v_owner_ot := public.zdesk_submit_overtime(v_workspace_id,v_owner_id,v_owner_id,'2026-09-09',1,'owner private row');
  perform public.zdesk_decide_overtime(v_workspace_id,v_owner_id,(v_owner_ot->>'id')::uuid,'approved');
end; $$;

-- Real authenticated RLS: an ordinary member sees only their own detailed personnel rows.
select
  ((select owner_payload from _desk_personnel)->>'workspaceId') as workspace_id,
  ((select owner_payload from _desk_personnel)->>'workspaceMemberId') as owner_member_id,
  (select member_id::text from _desk_personnel_member) as member_id
\gset

select set_config('request.jwt.claim.sub','d9999999-9999-4999-8999-999999999902',true);
set local role authenticated;
select case when count(*)=1 then 'true' else 'false' end as member_absence_rls_ok
from desk.absences where workspace_id=:'workspace_id'::uuid
\gset
\if :member_absence_rls_ok
\else
  \echo 'Member absence RLS leaked another member row'
  \quit 1
\endif
select case when count(*)=1 then 'true' else 'false' end as member_overtime_rls_ok
from desk.overtime_entries where workspace_id=:'workspace_id'::uuid
\gset
\if :member_overtime_rls_ok
\else
  \echo 'Member overtime RLS leaked another member row'
  \quit 1
\endif
reset role;

select set_config('request.jwt.claim.sub','d9999999-9999-4999-8999-999999999901',true);
set local role authenticated;
select case when count(*)=2 then 'true' else 'false' end as owner_absence_rls_ok
from desk.absences where workspace_id=:'workspace_id'::uuid
\gset
\if :owner_absence_rls_ok
\else
  \echo 'Owner/admin personnel RLS did not expose authorised team view'
  \quit 1
\endif
reset role;

-- Browser clients cannot execute personnel mutation RPCs directly.
do $$
begin
  if has_function_privilege('authenticated','public.zdesk_request_absence(uuid,uuid,uuid,text,date,date,text)','EXECUTE') then
    raise exception 'authenticated can directly execute Desk absence request RPC';
  end if;
  if has_function_privilege('authenticated','public.zdesk_replace_work_schedule(uuid,uuid,uuid,jsonb)','EXECUTE') then
    raise exception 'authenticated can directly execute Desk schedule mutation RPC';
  end if;
  if has_function_privilege('authenticated','public.zdesk_decide_overtime(uuid,uuid,uuid,text)','EXECUTE') then
    raise exception 'authenticated can directly execute Desk overtime decision RPC';
  end if;
end; $$;

select 'Z_DESK_PERSONNEL_AUTHORITY_V1=PASS' as result;
rollback;
