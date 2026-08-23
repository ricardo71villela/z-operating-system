create schema if not exists desk;
comment on schema desk is 'Z Desk domain. Canonical human and organisation identity remains in zos.*.';
grant usage on schema desk to authenticated, service_role;

create table desk.workspaces (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null unique references zos.organisations(id) on delete restrict,
  status text not null default 'active' check (status in ('active','suspended','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table desk.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references desk.workspaces(id) on delete cascade,
  membership_id uuid not null unique references zos.memberships(id) on delete restrict,
  role text not null default 'member' check (role in ('owner','admin','member')),
  status text not null default 'active' check (status in ('invited','active','suspended','revoked')),
  whatsapp_number text,
  preferred_language text not null default 'fr' check (preferred_language in ('fr','en','es','pt','it','de')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create index idx_desk_workspace_members_workspace on desk.workspace_members(workspace_id);

create or replace function desk.enforce_workspace_membership_organisation()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare membership_org uuid; workspace_org uuid;
begin
  select organisation_id into membership_org from zos.memberships where id = new.membership_id;
  select organisation_id into workspace_org from desk.workspaces where id = new.workspace_id;
  if membership_org is null or workspace_org is null or membership_org <> workspace_org then
    raise exception 'Desk workspace membership must reference the same canonical ZOS organisation' using errcode='23514';
  end if;
  return new;
end; $$;
create trigger enforce_workspace_membership_organisation
before insert or update of workspace_id, membership_id on desk.workspace_members
for each row execute function desk.enforce_workspace_membership_organisation();

create table desk.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references desk.workspaces(id) on delete cascade,
  provider text not null check (provider in ('gmail','microsoft','whatsapp','google_calendar','microsoft_calendar')),
  external_account_id text not null,
  sync_state jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','error','disconnected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, external_account_id),
  unique (provider, external_account_id)
);

create table desk.integration_credentials (
  integration_id uuid primary key references desk.integrations(id) on delete cascade,
  encrypted_payload text not null,
  iv text not null,
  auth_tag text not null,
  key_version integer not null default 1 check (key_version > 0),
  updated_at timestamptz not null default now()
);

create table desk.oauth_states (
  token_hash text primary key,
  workspace_id uuid not null references desk.workspaces(id) on delete cascade,
  person_id uuid not null references zos.persons(id) on delete cascade,
  provider text not null check (provider in ('gmail','microsoft','google_calendar','microsoft_calendar')),
  purpose text not null check (purpose in ('email_connect','calendar_connect')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create or replace function desk.current_person_id()
returns uuid language sql security definer stable set search_path = pg_catalog as $$
  select id from zos.persons where auth_user_id = auth.uid() limit 1;
$$;
create or replace function desk.is_workspace_member(p_workspace_id uuid)
returns boolean language sql security definer stable set search_path = pg_catalog as $$
  select exists (
    select 1 from desk.workspace_members wm
    join desk.workspaces w on w.id=wm.workspace_id and w.status='active'
    join zos.memberships m on m.id=wm.membership_id and m.status='active'
    join zos.persons p on p.id=m.person_id
    where wm.workspace_id=p_workspace_id and wm.status='active'
      and p.auth_user_id=auth.uid() and m.organisation_id=w.organisation_id
  );
$$;
create or replace function desk.workspace_role(p_workspace_id uuid)
returns text language sql security definer stable set search_path = pg_catalog as $$
  select wm.role from desk.workspace_members wm
  join desk.workspaces w on w.id=wm.workspace_id and w.status='active'
  join zos.memberships m on m.id=wm.membership_id and m.status='active'
  join zos.persons p on p.id=m.person_id
  where wm.workspace_id=p_workspace_id and wm.status='active'
    and p.auth_user_id=auth.uid() and m.organisation_id=w.organisation_id limit 1;
$$;
revoke all on function desk.current_person_id() from public;
revoke all on function desk.is_workspace_member(uuid) from public;
revoke all on function desk.workspace_role(uuid) from public;
grant execute on function desk.current_person_id() to authenticated, service_role;
grant execute on function desk.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function desk.workspace_role(uuid) to authenticated, service_role;

alter table desk.workspaces enable row level security;
alter table desk.workspace_members enable row level security;
alter table desk.integrations enable row level security;
alter table desk.integration_credentials enable row level security;
alter table desk.oauth_states enable row level security;
create policy desk_workspaces_read_member on desk.workspaces for select using (desk.is_workspace_member(id));
create policy desk_workspace_members_read_member on desk.workspace_members for select using (desk.is_workspace_member(workspace_id));
grant select on desk.workspaces, desk.workspace_members to authenticated;
revoke all on desk.integrations, desk.integration_credentials, desk.oauth_states from authenticated;
grant all on desk.workspaces, desk.workspace_members, desk.integrations, desk.integration_credentials, desk.oauth_states to service_role;
grant usage, select on all sequences in schema desk to service_role;

create trigger set_updated_at before update on desk.workspaces for each row execute function platform_internal.set_updated_at();
create trigger set_updated_at before update on desk.workspace_members for each row execute function platform_internal.set_updated_at();
create trigger set_updated_at before update on desk.integrations for each row execute function platform_internal.set_updated_at();
create trigger set_updated_at before update on desk.integration_credentials for each row execute function platform_internal.set_updated_at();

create or replace function public.zdesk_bootstrap_workspace(
  p_auth_user_id uuid, p_email text, p_name text, p_organisation_id uuid default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_person_id uuid; v_org_id uuid; v_membership_id uuid;
  v_workspace_id uuid; v_member_id uuid; v_role text;
begin
  if not exists (select 1 from auth.users where id=p_auth_user_id) then
    raise exception 'Unknown authenticated user' using errcode='42501';
  end if;
  insert into zos.persons(auth_user_id,display_name)
  values (p_auth_user_id,nullif(trim(coalesce(p_email,'')),''))
  on conflict (auth_user_id) do update set updated_at=zos.persons.updated_at
  returning id into v_person_id;

  select w.id,wm.id,w.organisation_id,m.id,wm.role
  into v_workspace_id,v_member_id,v_org_id,v_membership_id,v_role
  from desk.workspace_members wm join desk.workspaces w on w.id=wm.workspace_id
  join zos.memberships m on m.id=wm.membership_id
  where m.person_id=v_person_id and m.status='active' and wm.status='active' and w.status='active'
    and (p_organisation_id is null or w.organisation_id=p_organisation_id)
  order by wm.created_at limit 1;
  if v_workspace_id is not null then
    return jsonb_build_object('workspaceId',v_workspace_id,'workspaceMemberId',v_member_id,
      'organisationId',v_org_id,'membershipId',v_membership_id,'role',v_role,'created',false);
  end if;

  if p_organisation_id is null then
    insert into zos.organisations(name) values (coalesce(nullif(trim(p_name),''),'Z Desk organisation')) returning id into v_org_id;
    insert into zos.memberships(person_id,organisation_id,status,joined_at)
      values (v_person_id,v_org_id,'active',now()) returning id into v_membership_id;
  else
    v_org_id:=p_organisation_id;
    select id into v_membership_id from zos.memberships
      where person_id=v_person_id and organisation_id=v_org_id and status='active' limit 1;
    if v_membership_id is null then
      raise exception 'Authenticated person is not an active member of the requested organisation' using errcode='42501';
    end if;
  end if;

  insert into desk.workspaces(organisation_id) values (v_org_id)
    on conflict (organisation_id) do update set updated_at=desk.workspaces.updated_at returning id into v_workspace_id;
  select case when exists(select 1 from desk.workspace_members where workspace_id=v_workspace_id) then 'member' else 'owner' end into v_role;
  insert into desk.workspace_members(workspace_id,membership_id,role,status)
    values(v_workspace_id,v_membership_id,v_role,'active')
    on conflict (membership_id) do update set status='active' returning id,role into v_member_id,v_role;
  return jsonb_build_object('workspaceId',v_workspace_id,'workspaceMemberId',v_member_id,
    'organisationId',v_org_id,'membershipId',v_membership_id,'role',v_role,'created',true);
end; $$;
revoke all on function public.zdesk_bootstrap_workspace(uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.zdesk_bootstrap_workspace(uuid,text,text,uuid) to service_role;
