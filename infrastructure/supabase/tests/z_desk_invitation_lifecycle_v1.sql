\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email)
values('dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01','invite-owner@example.test')
on conflict(id) do nothing;

create temp table _desk_invite_lifecycle as
select public.zdesk_bootstrap_workspace(
  'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01','invite-owner@example.test','Desk Invitation Lifecycle',null
) as owner_payload;

do $$
declare
  v_workspace_id uuid := ((select owner_payload from _desk_invite_lifecycle)->>'workspaceId')::uuid;
  v_owner_id uuid := ((select owner_payload from _desk_invite_lifecycle)->>'workspaceMemberId')::uuid;
  v_created jsonb;
  v_id uuid;
  v_reissued jsonb;
begin
  v_created := public.zdesk_create_invitation(
    v_workspace_id,v_owner_id,'new-member@example.test','member',repeat('a',64),now()+interval '7 days'
  );
  v_id := (v_created->>'invitationId')::uuid;
  perform public.zdesk_revoke_invitation(v_workspace_id,v_owner_id,v_id);
  if (select status from desk.workspace_invitations where id=v_id)<>'revoked' then raise exception 'Invitation revoke failed'; end if;
  v_reissued := public.zdesk_reissue_invitation(v_workspace_id,v_owner_id,v_id,repeat('b',64),now()+interval '7 days');
  if v_reissued->>'status'<>'pending' then raise exception 'Invitation reissue failed'; end if;
  if (select token_hash from desk.workspace_invitations where id=v_id)<>repeat('b',64) then raise exception 'Invitation reissue did not rotate token hash'; end if;
end; $$;

do $$
begin
  if has_function_privilege('authenticated','public.zdesk_revoke_invitation(uuid,uuid,uuid)','EXECUTE') then
    raise exception 'authenticated can directly revoke Desk invitation';
  end if;
  if has_function_privilege('authenticated','public.zdesk_reissue_invitation(uuid,uuid,uuid,text,timestamptz)','EXECUTE') then
    raise exception 'authenticated can directly reissue Desk invitation';
  end if;
end; $$;

select 'Z_DESK_INVITATION_LIFECYCLE_V1=PASS' as result;
rollback;
