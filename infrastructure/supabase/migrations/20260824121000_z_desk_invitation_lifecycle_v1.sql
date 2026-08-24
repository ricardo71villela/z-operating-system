-- Z Desk — invitation lifecycle v1
-- Adds explicit revoke/reissue controls without weakening canonical identity authority.

create or replace function public.zdesk_revoke_invitation(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_invitation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_invitation desk.workspace_invitations%rowtype;
begin
  if v_actor_role not in('owner','admin') then raise exception 'Desk owner or admin invitation authority required' using errcode='42501'; end if;
  select * into v_invitation from desk.workspace_invitations
  where workspace_id=p_workspace_id and id=p_invitation_id for update;
  if not found then raise exception 'Desk invitation not found' using errcode='22023'; end if;
  if v_invitation.status='accepted' then raise exception 'Accepted invitation cannot be revoked' using errcode='42501'; end if;
  if v_actor_role='admin' and v_invitation.role<>'member' then raise exception 'Desk admins may manage member invitations only' using errcode='42501'; end if;
  update desk.workspace_invitations set status='revoked'
  where id=p_invitation_id and workspace_id=p_workspace_id;
  return jsonb_build_object('invitationId',p_invitation_id,'status','revoked');
end;
$$;

create or replace function public.zdesk_reissue_invitation(
  p_workspace_id uuid,
  p_actor_member_id uuid,
  p_invitation_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_role text := desk.server_actor_role(p_workspace_id,p_actor_member_id);
  v_invitation desk.workspace_invitations%rowtype;
begin
  if v_actor_role not in('owner','admin') then raise exception 'Desk owner or admin invitation authority required' using errcode='42501'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid invitation token hash' using errcode='22023'; end if;
  if p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '30 days' then
    raise exception 'Invitation expiry must be within the next 30 days' using errcode='22023';
  end if;
  select * into v_invitation from desk.workspace_invitations
  where workspace_id=p_workspace_id and id=p_invitation_id for update;
  if not found then raise exception 'Desk invitation not found' using errcode='22023'; end if;
  if v_invitation.status='accepted' then raise exception 'Accepted invitation cannot be reissued' using errcode='42501'; end if;
  if v_actor_role='admin' and v_invitation.role<>'member' then raise exception 'Desk admins may manage member invitations only' using errcode='42501'; end if;
  if exists(
    select 1 from desk.workspace_invitations wi
    where wi.workspace_id=p_workspace_id and wi.id<>p_invitation_id and wi.status='pending'
      and lower(trim(wi.invited_email))=lower(trim(v_invitation.invited_email))
  ) then raise exception 'Another pending Desk invitation already exists for this email' using errcode='23505'; end if;

  update desk.workspace_invitations
  set status='pending',token_hash=p_token_hash,expires_at=p_expires_at,accepted_at=null,accepted_membership_id=null
  where id=p_invitation_id and workspace_id=p_workspace_id;
  return jsonb_build_object(
    'invitationId',p_invitation_id,'email',v_invitation.invited_email,'role',v_invitation.role,'status','pending','expiresAt',p_expires_at
  );
end;
$$;

revoke all on function public.zdesk_revoke_invitation(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.zdesk_reissue_invitation(uuid,uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.zdesk_revoke_invitation(uuid,uuid,uuid) to service_role;
grant execute on function public.zdesk_reissue_invitation(uuid,uuid,uuid,text,timestamptz) to service_role;
