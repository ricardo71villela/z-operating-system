-- Z Desk — transversal lead management authority v1
-- Leads are pre-canonical operational opportunities. Canonical identity remains in zos.persons / zos.organisations.
-- Browser roles retain read-only RLS access. All mutations are service-role RPCs using server-derived workspace/member authority.

create table desk.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references desk.workspaces(id) on delete cascade,
  contact_id uuid references desk.contacts(id) on delete set null,
  canonical_person_id uuid references zos.persons(id) on delete set null,
  canonical_organisation_id uuid references zos.organisations(id) on delete set null,
  owner_workspace_member_id uuid not null,
  created_by_member_id uuid not null,
  source_channel text not null default 'manual' check(source_channel in('email','whatsapp','form','referral','manual','other')),
  source_detail text,
  display_name text,
  email text,
  phone text,
  company_name text,
  language text check(language is null or char_length(language) between 2 and 12),
  interest text,
  destination_product text not null default 'z_desk' check(destination_product in('z_find','z_mobility','z_jobs','z_fashion','z_studio','z_desk')),
  status text not null default 'new' check(status in('new','contacted','qualified','nurturing','converted','disqualified')),
  priority text not null default 'normal' check(priority in('low','normal','high','urgent')),
  score integer not null default 0 check(score between 0 and 100),
  next_follow_up_at timestamptz,
  notes text,
  converted_at timestamptz,
  converted_by_member_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  foreign key(workspace_id,owner_workspace_member_id) references desk.workspace_members(workspace_id,id) on delete restrict,
  foreign key(workspace_id,created_by_member_id) references desk.workspace_members(workspace_id,id) on delete restrict,
  foreign key(workspace_id,converted_by_member_id) references desk.workspace_members(workspace_id,id) on delete set null,
  check(num_nonnulls(display_name,email,phone)>0),
  check((status='converted')=(converted_at is not null)),
  check(status<>'converted' or num_nonnulls(canonical_person_id,canonical_organisation_id)>0)
);

create index idx_desk_leads_workspace_status on desk.leads(workspace_id,status,updated_at desc);
create index idx_desk_leads_owner_follow_up on desk.leads(workspace_id,owner_workspace_member_id,next_follow_up_at) where status not in('converted','disqualified');
create index idx_desk_leads_destination on desk.leads(workspace_id,destination_product,status);

create table desk.lead_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references desk.workspaces(id) on delete cascade,
  lead_id uuid not null,
  actor_workspace_member_id uuid not null,
  action text not null check(action in('created','updated','converted')),
  detail jsonb not null default '{}'::jsonb check(jsonb_typeof(detail)='object'),
  created_at timestamptz not null default now(),
  foreign key(workspace_id,lead_id) references desk.leads(workspace_id,id) on delete cascade,
  foreign key(workspace_id,actor_workspace_member_id) references desk.workspace_members(workspace_id,id) on delete restrict
);
create index idx_desk_lead_activities_lead on desk.lead_activities(workspace_id,lead_id,created_at desc);

alter table desk.leads enable row level security;
alter table desk.lead_activities enable row level security;

create policy desk_leads_read_member on desk.leads for select using(desk.is_workspace_member(workspace_id));
create policy desk_lead_activities_read_member on desk.lead_activities for select using(desk.is_workspace_member(workspace_id));

grant select on desk.leads, desk.lead_activities to authenticated;
grant all on desk.leads, desk.lead_activities to service_role;

create or replace function public.zdesk_create_lead(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_display_name text,
  p_email text,
  p_phone text,
  p_company_name text,
  p_source_channel text,
  p_interest text,
  p_destination_product text,
  p_owner_member_id uuid,
  p_priority text,
  p_language text,
  p_next_follow_up_at timestamptz,
  p_notes text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_owner_member_id uuid := coalesce(p_owner_member_id,p_actor_member_id);
  v_lead desk.leads%rowtype;
begin
  if v_actor_role is null then
    raise exception 'Active Desk member authority required' using errcode='42501';
  end if;
  if nullif(trim(coalesce(p_display_name,'')),'') is null
     and nullif(trim(coalesce(p_email,'')),'') is null
     and nullif(trim(coalesce(p_phone,'')),'') is null then
    raise exception 'Lead requires name, email or phone' using errcode='22023';
  end if;
  if p_source_channel not in ('email','whatsapp','form','referral','manual','other') then
    raise exception 'Invalid lead source channel' using errcode='22023';
  end if;
  if p_destination_product not in ('z_find','z_mobility','z_jobs','z_fashion','z_studio','z_desk') then
    raise exception 'Invalid lead destination product' using errcode='22023';
  end if;
  if p_priority not in ('low','normal','high','urgent') then
    raise exception 'Invalid lead priority' using errcode='22023';
  end if;
  if not exists (
    select 1 from desk.workspace_members wm
    join zos.memberships m on m.id=wm.membership_id and m.status='active'
    where wm.workspace_id=p_workspace_id and wm.id=v_owner_member_id and wm.status='active'
  ) then
    raise exception 'Lead owner must be an active member of the same Desk workspace' using errcode='42501';
  end if;
  if v_actor_role='member' and v_owner_member_id<>p_actor_member_id then
    raise exception 'Desk members may assign new leads only to themselves' using errcode='42501';
  end if;

  insert into desk.leads(
    workspace_id,owner_workspace_member_id,created_by_member_id,source_channel,
    display_name,email,phone,company_name,language,interest,destination_product,
    priority,next_follow_up_at,notes
  ) values (
    p_workspace_id,v_owner_member_id,p_actor_member_id,p_source_channel,
    nullif(trim(coalesce(p_display_name,'')),''),nullif(trim(coalesce(p_email,'')),''),
    nullif(trim(coalesce(p_phone,'')),''),nullif(trim(coalesce(p_company_name,'')),''),
    nullif(trim(coalesce(p_language,'')),''),nullif(trim(coalesce(p_interest,'')),''),
    p_destination_product,p_priority,p_next_follow_up_at,nullif(trim(coalesce(p_notes,'')),'')
  ) returning * into v_lead;

  insert into desk.lead_activities(workspace_id,lead_id,actor_workspace_member_id,action,detail)
  values(p_workspace_id,v_lead.id,p_actor_member_id,'created',jsonb_build_object('source',p_source_channel,'destinationProduct',p_destination_product));

  return to_jsonb(v_lead);
end;
$$;

create or replace function public.zdesk_update_lead(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_lead_id uuid,
  p_patch jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_lead desk.leads%rowtype;
  v_key text;
  v_status text;
  v_priority text;
  v_score integer;
  v_next_follow_up_at timestamptz;
  v_destination_product text;
  v_owner_member_id uuid;
  v_notes text;
  v_interest text;
begin
  if v_actor_role is null then raise exception 'Active Desk member authority required' using errcode='42501'; end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'Lead patch must be an object' using errcode='22023'; end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('status','priority','score','nextFollowUpAt','destinationProduct','ownerMemberId','notes','interest') then
      raise exception 'Unsupported lead patch field: %',v_key using errcode='22023';
    end if;
  end loop;

  select * into v_lead from desk.leads where id=p_lead_id and workspace_id=p_workspace_id for update;
  if not found then raise exception 'Desk lead not found' using errcode='22023'; end if;
  if v_lead.status='converted' then raise exception 'Converted leads are immutable operational records' using errcode='22023'; end if;
  if v_actor_role='member' and p_actor_member_id not in (v_lead.owner_workspace_member_id,v_lead.created_by_member_id) then
    raise exception 'Desk member cannot update this lead' using errcode='42501';
  end if;

  v_status := v_lead.status;
  v_priority := v_lead.priority;
  v_score := v_lead.score;
  v_next_follow_up_at := v_lead.next_follow_up_at;
  v_destination_product := v_lead.destination_product;
  v_owner_member_id := v_lead.owner_workspace_member_id;
  v_notes := v_lead.notes;
  v_interest := v_lead.interest;

  if p_patch ? 'status' then
    v_status := p_patch->>'status';
    if v_status not in ('new','contacted','qualified','nurturing','disqualified') then
      raise exception 'Lead conversion requires the dedicated canonical conversion authority' using errcode='22023';
    end if;
  end if;
  if p_patch ? 'priority' then
    v_priority := p_patch->>'priority';
    if v_priority not in ('low','normal','high','urgent') then raise exception 'Invalid lead priority' using errcode='22023'; end if;
  end if;
  if p_patch ? 'score' then
    v_score := (p_patch->>'score')::integer;
    if v_score not between 0 and 100 then raise exception 'Lead score must be between 0 and 100' using errcode='22023'; end if;
  end if;
  if p_patch ? 'nextFollowUpAt' then
    v_next_follow_up_at := case when p_patch->'nextFollowUpAt'='null'::jsonb then null else (p_patch->>'nextFollowUpAt')::timestamptz end;
  end if;
  if p_patch ? 'destinationProduct' then
    v_destination_product := p_patch->>'destinationProduct';
    if v_destination_product not in ('z_find','z_mobility','z_jobs','z_fashion','z_studio','z_desk') then raise exception 'Invalid lead destination product' using errcode='22023'; end if;
  end if;
  if p_patch ? 'ownerMemberId' then
    v_owner_member_id := (p_patch->>'ownerMemberId')::uuid;
    if v_actor_role not in ('owner','admin') and v_owner_member_id<>p_actor_member_id then
      raise exception 'Desk member cannot reassign a lead' using errcode='42501';
    end if;
    if not exists (
      select 1 from desk.workspace_members wm
      join zos.memberships m on m.id=wm.membership_id and m.status='active'
      where wm.workspace_id=p_workspace_id and wm.id=v_owner_member_id and wm.status='active'
    ) then raise exception 'Lead owner must be an active member of the same Desk workspace' using errcode='42501'; end if;
  end if;
  if p_patch ? 'notes' then v_notes := case when p_patch->'notes'='null'::jsonb then null else p_patch->>'notes' end; end if;
  if p_patch ? 'interest' then v_interest := case when p_patch->'interest'='null'::jsonb then null else p_patch->>'interest' end; end if;

  update desk.leads set
    status=v_status,priority=v_priority,score=v_score,next_follow_up_at=v_next_follow_up_at,
    destination_product=v_destination_product,owner_workspace_member_id=v_owner_member_id,
    notes=v_notes,interest=v_interest,updated_at=now()
  where id=p_lead_id and workspace_id=p_workspace_id returning * into v_lead;

  insert into desk.lead_activities(workspace_id,lead_id,actor_workspace_member_id,action,detail)
  values(p_workspace_id,p_lead_id,p_actor_member_id,'updated',p_patch);
  return to_jsonb(v_lead);
end;
$$;

create or replace function public.zdesk_convert_lead(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_lead_id uuid,
  p_person_id uuid,
  p_organisation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_lead desk.leads%rowtype;
begin
  if v_actor_role not in ('owner','admin') then
    raise exception 'Desk owner or admin lead conversion authority required' using errcode='42501';
  end if;
  if p_person_id is null and p_organisation_id is null then
    raise exception 'Lead conversion requires an existing canonical person or organisation' using errcode='22023';
  end if;
  if p_person_id is not null and not exists(select 1 from zos.persons where id=p_person_id) then
    raise exception 'Canonical ZOS person not found' using errcode='22023';
  end if;
  if p_organisation_id is not null and not exists(select 1 from zos.organisations where id=p_organisation_id) then
    raise exception 'Canonical ZOS organisation not found' using errcode='22023';
  end if;

  select * into v_lead from desk.leads where id=p_lead_id and workspace_id=p_workspace_id for update;
  if not found then raise exception 'Desk lead not found' using errcode='22023'; end if;
  if v_lead.status='converted' then raise exception 'Desk lead is already converted' using errcode='22023'; end if;

  update desk.leads set
    canonical_person_id=p_person_id,
    canonical_organisation_id=p_organisation_id,
    status='converted',converted_at=now(),converted_by_member_id=p_actor_member_id,updated_at=now()
  where id=p_lead_id and workspace_id=p_workspace_id returning * into v_lead;

  insert into desk.lead_activities(workspace_id,lead_id,actor_workspace_member_id,action,detail)
  values(p_workspace_id,p_lead_id,p_actor_member_id,'converted',jsonb_build_object('personId',p_person_id,'organisationId',p_organisation_id));
  return to_jsonb(v_lead);
end;
$$;

revoke all on function public.zdesk_create_lead(uuid,uuid,text,text,text,text,text,text,text,uuid,text,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.zdesk_update_lead(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.zdesk_convert_lead(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.zdesk_create_lead(uuid,uuid,text,text,text,text,text,text,text,uuid,text,text,timestamptz,text) to service_role;
grant execute on function public.zdesk_update_lead(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.zdesk_convert_lead(uuid,uuid,uuid,uuid,uuid) to service_role;

comment on table desk.leads is 'Z Desk pre-canonical lead pipeline. Conversion links to existing zos.persons/zos.organisations; it never creates parallel identity authority.';
comment on function public.zdesk_convert_lead(uuid,uuid,uuid,uuid,uuid) is 'Links a qualified Desk lead to existing canonical ZOS identity. Owner/admin only; no person or organisation is created here.';
