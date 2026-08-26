-- Z Desk — integration security authority v1
-- Atomic one-time OAuth state consumption and cross-workspace-safe integration registration.

create or replace function public.zdesk_consume_oauth_state(
  p_token_hash text,
  p_provider text,
  p_purpose text
)
returns table (
  workspace_id uuid,
  workspace_member_id uuid,
  person_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_state desk.oauth_states%rowtype;
  v_member_id uuid;
begin
  if p_token_hash is null or char_length(trim(p_token_hash)) < 32 then
    raise exception 'Invalid OAuth state' using errcode = '22023';
  end if;

  select *
  into v_state
  from desk.oauth_states
  where token_hash = p_token_hash
    and provider = p_provider
    and purpose = p_purpose
    and consumed_at is null
    and expires_at > clock_timestamp()
  for update;

  if not found then
    raise exception 'OAuth state is invalid, expired, or already consumed'
      using errcode = '28000';
  end if;

  select wm.id
  into v_member_id
  from desk.workspace_members wm
  join desk.workspaces w
    on w.id = wm.workspace_id
   and w.status = 'active'
  join zos.memberships m
    on m.id = wm.membership_id
   and m.status = 'active'
   and m.organisation_id = w.organisation_id
  where wm.workspace_id = v_state.workspace_id
    and wm.status = 'active'
    and m.person_id = v_state.person_id
  limit 1;

  if v_member_id is null then
    raise exception 'OAuth initiator no longer has active Desk authority'
      using errcode = '42501';
  end if;

  update desk.oauth_states
  set consumed_at = clock_timestamp()
  where token_hash = v_state.token_hash;

  workspace_id := v_state.workspace_id;
  workspace_member_id := v_member_id;
  person_id := v_state.person_id;
  return next;
end;
$$;

revoke all on function public.zdesk_consume_oauth_state(text,text,text)
  from public, anon, authenticated;
grant execute on function public.zdesk_consume_oauth_state(text,text,text)
  to service_role;

comment on function public.zdesk_consume_oauth_state(text,text,text) is
  'Server-only atomic OAuth state consumption. Rejects expired/replayed state and revalidates the initiating Person membership before returning Desk authority.';

create or replace function public.zdesk_register_integration(
  p_workspace_id uuid,
  p_workspace_member_id uuid,
  p_provider text,
  p_external_account_id text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_existing desk.integrations%rowtype;
  v_integration_id uuid;
begin
  if p_provider not in ('gmail','microsoft','whatsapp','google_calendar','microsoft_calendar') then
    raise exception 'Unsupported Desk integration provider' using errcode = '22023';
  end if;

  if p_external_account_id is null or char_length(trim(p_external_account_id)) = 0 then
    raise exception 'External account id is required' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from desk.workspace_members wm
    join desk.workspaces w on w.id = wm.workspace_id and w.status = 'active'
    where wm.id = p_workspace_member_id
      and wm.workspace_id = p_workspace_id
      and wm.status = 'active'
  ) then
    raise exception 'Active Desk workspace membership required' using errcode = '42501';
  end if;

  select *
  into v_existing
  from desk.integrations
  where provider = p_provider
    and lower(external_account_id) = lower(trim(p_external_account_id))
  for update;

  if found then
    if v_existing.workspace_id <> p_workspace_id then
      raise exception 'Provider account is already connected to another Desk workspace'
        using errcode = '42501';
    end if;

    update desk.integrations
    set external_account_id = trim(p_external_account_id),
        status = 'active',
        updated_at = clock_timestamp()
    where id = v_existing.id
    returning id into v_integration_id;

    return v_integration_id;
  end if;

  insert into desk.integrations (
    workspace_id,
    provider,
    external_account_id,
    status
  )
  values (
    p_workspace_id,
    p_provider,
    trim(p_external_account_id),
    'active'
  )
  returning id into v_integration_id;

  return v_integration_id;
end;
$$;

revoke all on function public.zdesk_register_integration(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.zdesk_register_integration(uuid,uuid,text,text)
  to service_role;

comment on function public.zdesk_register_integration(uuid,uuid,text,text) is
  'Server-only integration registration. Prevents implicit provider-account takeover across Desk workspaces.';

create index if not exists idx_desk_oauth_states_expiry
  on desk.oauth_states(expires_at)
  where consumed_at is null;

comment on table desk.integration_credentials is
  'Server-only encrypted provider credentials. Ciphertext is produced with AES-256-GCM in the Z Desk backend; no plaintext provider token is persisted here.';
