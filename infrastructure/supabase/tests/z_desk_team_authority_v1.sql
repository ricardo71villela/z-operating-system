\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email)
values
  ('d7777777-7777-4777-8777-777777777701','desk-owner@example.test'),
  ('d7777777-7777-4777-8777-777777777702','desk-member@example.test'),
  ('d7777777-7777-4777-8777-777777777703','desk-second@example.test')
on conflict(id) do nothing;

create temp table _desk_team as
select public.zdesk_bootstrap_workspace(
  'd7777777-7777-4777-8777-777777777701',
  'desk-owner@example.test',
  'Desk Team Authority',
  null
) as owner_payload;

do $$
declare
  v_workspace_id uuid := ((select owner_payload from _desk_team)->>'workspaceId')::uuid;
  v_owner_member_id uuid := ((select owner_payload from _desk_team)->>'workspaceMemberId')::uuid;
  v_org_id uuid := ((select owner_payload from _desk_team)->>'organisationId')::uuid;
  v_invite jsonb;
  v_accept jsonb;
  v_member_id uuid;
  v_membership_id uuid;
  v_person_id uuid;
begin
  v_invite := public.zdesk_create_invitation(
    v_workspace_id,
    v_owner_member_id,
    'Desk-Member@Example.Test',
    'member',
    repeat('a',64),
    now() + interval '7 days'
  );

  if v_invite->>'role' <> 'member' or v_invite->>'email' <> 'desk-member@example.test' then
    raise exception 'Desk invitation normalization/role contract failed';
  end if;

  if exists (
    select 1 from zos.memberships m
    join zos.persons p on p.id=m.person_id
    where p.auth_user_id='d7777777-7777-4777-8777-777777777702'::uuid
      and m.organisation_id=v_org_id
  ) then
    raise exception 'Invitation creation must not pre-create canonical membership before acceptance';
  end if;

  v_accept := public.zdesk_accept_invitation(
    'd7777777-7777-4777-8777-777777777702',
    repeat('a',64)
  );

  v_member_id := (v_accept->>'workspaceMemberId')::uuid;
  v_membership_id := (v_accept->>'membershipId')::uuid;

  select person_id into v_person_id from zos.memberships where id=v_membership_id;
  if not exists (
    select 1 from zos.persons
    where id=v_person_id and auth_user_id='d7777777-7777-4777-8777-777777777702'::uuid
  ) then
    raise exception 'Accepted Desk invitation did not bind canonical ZOS Person';
  end if;
  if not exists (
    select 1 from zos.memberships
    where id=v_membership_id and organisation_id=v_org_id and status='active'
  ) then
    raise exception 'Accepted Desk invitation did not activate canonical ZOS Membership';
  end if;
  if not exists (
    select 1 from desk.workspace_members
    where id=v_member_id and workspace_id=v_workspace_id and membership_id=v_membership_id
      and role='member' and status='active'
  ) then
    raise exception 'Accepted Desk invitation did not activate Desk projection';
  end if;
  if not exists (
    select 1 from desk.workspace_invitations
    where token_hash=repeat('a',64) and status='accepted' and accepted_membership_id=v_membership_id
  ) then
    raise exception 'Accepted Desk invitation lifecycle not retained';
  end if;

  perform public.zdesk_set_member_role(v_workspace_id,v_owner_member_id,v_member_id,'admin');
  if (select role from desk.workspace_members where id=v_member_id) <> 'admin' then
    raise exception 'Desk owner role-management authority failed';
  end if;
end; $$;

-- Admins may invite members, but may never mint another admin/owner authority.
do $$
declare
  v_workspace_id uuid := ((select owner_payload from _desk_team)->>'workspaceId')::uuid;
  v_admin_member_id uuid;
  v_failed boolean := false;
begin
  select wm.id into v_admin_member_id
  from desk.workspace_members wm
  join zos.memberships m on m.id=wm.membership_id
  join zos.persons p on p.id=m.person_id
  where wm.workspace_id=v_workspace_id
    and p.auth_user_id='d7777777-7777-4777-8777-777777777702'::uuid;

  begin
    perform public.zdesk_create_invitation(
      v_workspace_id,
      v_admin_member_id,
      'desk-second@example.test',
      'admin',
      repeat('b',64),
      now() + interval '7 days'
    );
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Desk admin unexpectedly gained admin-invite authority';
  end if;
end; $$;

-- Ownership cannot be granted through invitation or ordinary role mutation.
do $$
declare
  v_workspace_id uuid := ((select owner_payload from _desk_team)->>'workspaceId')::uuid;
  v_owner_member_id uuid := ((select owner_payload from _desk_team)->>'workspaceMemberId')::uuid;
  v_failed boolean := false;
begin
  begin
    perform public.zdesk_create_invitation(
      v_workspace_id,
      v_owner_member_id,
      'desk-second@example.test',
      'owner',
      repeat('c',64),
      now() + interval '7 days'
    );
  exception when invalid_parameter_value then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Desk invitation unexpectedly allowed owner role';
  end if;
end; $$;

-- Invitation tokens are server-only data; browser roles get no direct table access.
do $$
begin
  if has_table_privilege('authenticated','desk.workspace_invitations','SELECT') then
    raise exception 'authenticated can directly read Desk invitation token hashes';
  end if;
  if has_table_privilege('authenticated','desk.workspace_invitations','INSERT') then
    raise exception 'authenticated can directly create Desk invitations';
  end if;
  if not has_table_privilege('service_role','desk.workspace_invitations','SELECT') then
    raise exception 'service_role lacks Desk invitation authority';
  end if;
  if has_function_privilege('authenticated','public.zdesk_accept_invitation(uuid,text)','EXECUTE') then
    raise exception 'authenticated can directly execute server-only Desk invitation acceptance';
  end if;
end; $$;

select 'Z_DESK_TEAM_AUTHORITY_V1=PASS' as result;
rollback;
