-- Z Desk — canonical team invitations + role authority v1
-- Pending invitations are Desk workflow metadata only. Accepted identity and
-- organisation membership are always materialized through zos.persons and
-- zos.memberships before a Desk workspace member becomes active.

create table desk.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references desk.workspaces(id) on delete cascade,
  invited_email text not null check (char_length(trim(invited_email)) between 3 and 320),
  role text not null check (role in ('admin','member')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by_member_id uuid not null,
  accepted_membership_id uuid references zos.memberships(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, invited_by_member_id)
    references desk.workspace_members(workspace_id, id) on delete restrict,
  check (expires_at > created_at),
  check (
    (status = 'accepted' and accepted_at is not null and accepted_membership_id is not null)
    or
    (status <> 'accepted' and accepted_at is null and accepted_membership_id is null)
  )
);

create unique index idx_desk_workspace_invitations_pending_email
  on desk.workspace_invitations(workspace_id, lower(trim(invited_email)))
  where status = 'pending';
create index idx_desk_workspace_invitations_workspace_created
  on desk.workspace_invitations(workspace_id, created_at desc);

alter table desk.workspace_invitations enable row level security;
revoke all on desk.workspace_invitations from authenticated;
grant all on desk.workspace_invitations to service_role;
grant usage, select on all sequences in schema desk to service_role;
create trigger set_updated_at before update on desk.workspace_invitations
for each row execute function platform_internal.set_updated_at();

create or replace function public.zdesk_create_invitation(
  p_workspace_id uuid,
  p_invited_by_member_id uuid,
  p_email text,
  p_role text,
  p_token_hash text,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role text;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_invitation_id uuid;
begin
  if v_email = '' or position('@' in v_email) <= 1 or char_length(v_email) > 320 then
    raise exception 'A valid invitation email is required' using errcode='22023';
  end if;
  if p_role not in ('admin','member') then
    raise exception 'Desk invitations may grant only admin or member' using errcode='22023';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invitation token hash' using errcode='22023';
  end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '30 days' then
    raise exception 'Invitation expiry must be within the next 30 days' using errcode='22023';
  end if;

  select wm.role into v_actor_role
  from desk.workspace_members wm
  join desk.workspaces w on w.id=wm.workspace_id and w.status='active'
  join zos.memberships m on m.id=wm.membership_id and m.status='active'
  where wm.id=p_invited_by_member_id
    and wm.workspace_id=p_workspace_id
    and wm.status='active'
  for update of wm;

  if v_actor_role is null or v_actor_role not in ('owner','admin') then
    raise exception 'Desk owner or admin invitation authority required' using errcode='42501';
  end if;
  if v_actor_role = 'admin' and p_role <> 'member' then
    raise exception 'Desk admins may invite members only' using errcode='42501';
  end if;

  update desk.workspace_invitations
  set status='expired'
  where workspace_id=p_workspace_id
    and status='pending'
    and expires_at <= now();

  if exists (
    select 1 from desk.workspace_invitations
    where workspace_id=p_workspace_id
      and status='pending'
      and lower(trim(invited_email))=v_email
  ) then
    raise exception 'A pending Desk invitation already exists for this email' using errcode='23505';
  end if;

  insert into desk.workspace_invitations(
    workspace_id, invited_email, role, token_hash, invited_by_member_id, expires_at
  ) values (
    p_workspace_id, v_email, p_role, p_token_hash, p_invited_by_member_id, p_expires_at
  ) returning id into v_invitation_id;

  return jsonb_build_object(
    'invitationId', v_invitation_id,
    'email', v_email,
    'role', p_role,
    'expiresAt', p_expires_at
  );
end;
$$;

create or replace function public.zdesk_accept_invitation(
  p_auth_user_id uuid,
  p_token_hash text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_invitation desk.workspace_invitations%rowtype;
  v_auth_email text;
  v_org_id uuid;
  v_person_id uuid;
  v_membership_id uuid;
  v_membership_status text;
  v_workspace_member_id uuid;
  v_workspace_member_role text;
  v_workspace_member_status text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invitation token' using errcode='42501';
  end if;

  select lower(trim(email)) into v_auth_email
  from auth.users
  where id=p_auth_user_id;
  if v_auth_email is null or v_auth_email = '' then
    raise exception 'Authenticated email is required to accept a Desk invitation' using errcode='42501';
  end if;

  select * into v_invitation
  from desk.workspace_invitations
  where token_hash=p_token_hash
    and status='pending'
    and expires_at > now()
  for update;
  if not found then
    raise exception 'Desk invitation is invalid or expired' using errcode='42501';
  end if;
  if lower(trim(v_invitation.invited_email)) <> v_auth_email then
    raise exception 'Desk invitation email does not match the authenticated account' using errcode='42501';
  end if;

  select organisation_id into v_org_id
  from desk.workspaces
  where id=v_invitation.workspace_id and status='active';
  if v_org_id is null then
    raise exception 'Desk workspace is not active' using errcode='42501';
  end if;

  insert into zos.persons(auth_user_id, display_name)
  values (p_auth_user_id, v_auth_email)
  on conflict (auth_user_id) do update set updated_at=zos.persons.updated_at
  returning id into v_person_id;

  select id,status into v_membership_id,v_membership_status
  from zos.memberships
  where person_id=v_person_id and organisation_id=v_org_id
  for update;

  if v_membership_id is null then
    insert into zos.memberships(person_id,organisation_id,status,joined_at)
    values(v_person_id,v_org_id,'active',now())
    returning id into v_membership_id;
  elsif v_membership_status = 'invited' then
    update zos.memberships
    set status='active', joined_at=coalesce(joined_at,now()), ended_at=null
    where id=v_membership_id;
  elsif v_membership_status <> 'active' then
    raise exception 'Canonical ZOS membership cannot be activated by a Desk invitation' using errcode='42501';
  end if;

  select id,role,status
  into v_workspace_member_id,v_workspace_member_role,v_workspace_member_status
  from desk.workspace_members
  where workspace_id=v_invitation.workspace_id and membership_id=v_membership_id
  for update;

  if v_workspace_member_id is null then
    insert into desk.workspace_members(workspace_id,membership_id,role,status)
    values(v_invitation.workspace_id,v_membership_id,v_invitation.role,'active')
    returning id,role into v_workspace_member_id,v_workspace_member_role;
  elsif v_workspace_member_status = 'active' then
    -- Never use a later invitation to silently demote/promote an existing active member.
    null;
  else
    update desk.workspace_members
    set status='active',
        role=case when v_workspace_member_role='owner' then 'owner' else v_invitation.role end
    where id=v_workspace_member_id
    returning role into v_workspace_member_role;
  end if;

  update desk.workspace_invitations
  set status='accepted', accepted_at=now(), accepted_membership_id=v_membership_id
  where id=v_invitation.id;

  return jsonb_build_object(
    'workspaceId', v_invitation.workspace_id,
    'workspaceMemberId', v_workspace_member_id,
    'organisationId', v_org_id,
    'membershipId', v_membership_id,
    'role', v_workspace_member_role
  );
end;
$$;

create or replace function public.zdesk_set_member_role(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_target_member_id uuid,
  p_role text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role text;
  v_target_role text;
begin
  if p_role not in ('admin','member') then
    raise exception 'Desk member role must be admin or member' using errcode='22023';
  end if;

  select role into v_actor_role
  from desk.workspace_members
  where id=p_actor_member_id and workspace_id=p_workspace_id and status='active'
  for update;
  if v_actor_role <> 'owner' then
    raise exception 'Only the Desk owner may change member roles' using errcode='42501';
  end if;

  select role into v_target_role
  from desk.workspace_members
  where id=p_target_member_id and workspace_id=p_workspace_id and status='active'
  for update;
  if v_target_role is null then
    raise exception 'Desk member not found' using errcode='22023';
  end if;
  if v_target_role = 'owner' then
    raise exception 'Desk ownership transfer requires a separate authority flow' using errcode='42501';
  end if;

  update desk.workspace_members
  set role=p_role
  where id=p_target_member_id and workspace_id=p_workspace_id;

  return jsonb_build_object('workspaceMemberId',p_target_member_id,'role',p_role);
end;
$$;

revoke all on function public.zdesk_create_invitation(uuid,uuid,text,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.zdesk_accept_invitation(uuid,text) from public, anon, authenticated;
revoke all on function public.zdesk_set_member_role(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.zdesk_create_invitation(uuid,uuid,text,text,text,timestamptz) to service_role;
grant execute on function public.zdesk_accept_invitation(uuid,text) to service_role;
grant execute on function public.zdesk_set_member_role(uuid,uuid,uuid,text) to service_role;

comment on table desk.workspace_invitations is
  'Desk invitation workflow metadata. It never replaces canonical zos.persons or zos.memberships identity authority.';
comment on function public.zdesk_accept_invitation(uuid,text) is
  'Server-only atomic acceptance: authenticated Supabase identity -> canonical ZOS Person/Membership -> Desk workspace member.';
