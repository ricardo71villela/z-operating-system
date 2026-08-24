\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email)
values ('d6666666-6666-4666-8666-666666666666','desk-ai@example.test')
on conflict(id) do nothing;

create temp table _desk_ai as
select public.zdesk_bootstrap_workspace(
  'd6666666-6666-4666-8666-666666666666',
  'desk-ai@example.test',
  'Desk AI',
  null
) as payload;

do $$
declare
  v_workspace_id uuid := ((select payload from _desk_ai)->>'workspaceId')::uuid;
  v_member_id uuid := ((select payload from _desk_ai)->>'workspaceMemberId')::uuid;
  v_contact_id uuid;
  v_thread_id uuid;
  v_message_id uuid;
begin
  if (select ai_triage_enabled from desk.workspaces where id=v_workspace_id) then
    raise exception 'Desk AI triage must default disabled';
  end if;

  update desk.workspaces
  set ai_triage_enabled=true,
      ai_triage_enabled_at=now(),
      ai_triage_enabled_by_member_id=v_member_id
  where id=v_workspace_id;

  insert into desk.contacts(workspace_id,email) values(v_workspace_id,'ai-sender@example.test') returning id into v_contact_id;
  insert into desk.threads(workspace_id,contact_id,email_thread_id) values(v_workspace_id,v_contact_id,'ai-thread') returning id into v_thread_id;
  insert into desk.messages(workspace_id,thread_id,channel,direction,body)
  values(v_workspace_id,v_thread_id,'email','inbound','Can we meet tomorrow at 10?') returning id into v_message_id;

  insert into desk.ai_triage_audit(workspace_id,message_id,model,outcome,input_chars,output_chars)
  values(v_workspace_id,v_message_id,'test/model','completed',30,50);

  if (select count(*) from desk.ai_triage_audit where workspace_id=v_workspace_id) <> 1 then
    raise exception 'Desk AI audit row not retained';
  end if;

  update desk.workspaces
  set ai_triage_enabled=false,
      ai_triage_enabled_at=null,
      ai_triage_enabled_by_member_id=null
  where id=v_workspace_id;
end; $$;

do $$
begin
  if has_table_privilege('authenticated','desk.ai_triage_audit','SELECT') then
    raise exception 'authenticated can directly read server-only AI audit';
  end if;
  if not has_table_privilege('service_role','desk.ai_triage_audit','SELECT') then
    raise exception 'service_role lacks AI audit authority';
  end if;
end; $$;

select 'Z_DESK_AI_TRIAGE_V1=PASS' as result;
rollback;
