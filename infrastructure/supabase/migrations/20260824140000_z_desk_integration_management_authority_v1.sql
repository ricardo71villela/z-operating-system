-- Z Desk — integration management authority v1
-- Workspace-level provider connections are managed only by owner/admin authority.

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
  v_actor_role text := desk.server_actor_role(p_workspace_id, p_workspace_member_id);
begin
  if p_provider not in ('gmail','microsoft','whatsapp','google_calendar','microsoft_calendar') then
    raise exception 'Unsupported Desk integration provider' using errcode = '22023';
  end if;

  if p_external_account_id is null or char_length(trim(p_external_account_id)) = 0 then
    raise exception 'External account id is required' using errcode = '22023';
  end if;

  if v_actor_role not in ('owner','admin') then
    raise exception 'Desk owner or admin integration authority required' using errcode = '42501';
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

  insert into desk.integrations(workspace_id, provider, external_account_id, status)
  values(p_workspace_id, p_provider, trim(p_external_account_id), 'active')
  returning id into v_integration_id;

  return v_integration_id;
end;
$$;

revoke all on function public.zdesk_register_integration(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.zdesk_register_integration(uuid,uuid,text,text)
  to service_role;

comment on function public.zdesk_register_integration(uuid,uuid,text,text) is
  'Server-only owner/admin integration registration. Prevents provider-account takeover and ordinary-member workspace integration mutation.';
