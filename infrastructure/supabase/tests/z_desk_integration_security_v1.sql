\set ON_ERROR_STOP on
begin;

insert into auth.users(id, email)
values
  ('d3111111-1111-4111-8111-111111111111', 'desk-oauth-a@example.test'),
  ('d3222222-2222-4222-8222-222222222222', 'desk-oauth-b@example.test')
on conflict (id) do nothing;

create temp table _oauth_a as
select public.zdesk_bootstrap_workspace(
  'd3111111-1111-4111-8111-111111111111', 'desk-oauth-a@example.test', 'Desk OAuth A', null
) as payload;
create temp table _oauth_b as
select public.zdesk_bootstrap_workspace(
  'd3222222-2222-4222-8222-222222222222', 'desk-oauth-b@example.test', 'Desk OAuth B', null
) as payload;

insert into desk.oauth_states(token_hash, workspace_id, person_id, provider, purpose, expires_at)
select
  repeat('a', 64),
  (payload->>'workspaceId')::uuid,
  (select p.id from zos.persons p where p.auth_user_id='d3111111-1111-4111-8111-111111111111'),
  'gmail',
  'email_connect',
  now() + interval '10 minutes'
from _oauth_a;

create temp table _consumed_state as
select * from public.zdesk_consume_oauth_state(repeat('a',64), 'gmail', 'email_connect');

do $$
begin
  if (select count(*) from _consumed_state) <> 1 then
    raise exception 'OAuth state did not consume exactly once';
  end if;
  if (select workspace_id from _consumed_state) <> ((select payload from _oauth_a)->>'workspaceId')::uuid then
    raise exception 'OAuth state resolved wrong workspace';
  end if;
  begin
    perform * from public.zdesk_consume_oauth_state(repeat('a',64), 'gmail', 'email_connect');
    raise exception 'OAuth state replay unexpectedly succeeded';
  exception when invalid_authorization_specification then null; end;
end;
$$;

create temp table _integration_a as
select public.zdesk_register_integration(
  ((select payload from _oauth_a)->>'workspaceId')::uuid,
  ((select payload from _oauth_a)->>'workspaceMemberId')::uuid,
  'gmail',
  'shared@example.test'
) as id;

do $$
declare
  same_id uuid;
begin
  select public.zdesk_register_integration(
    ((select payload from _oauth_a)->>'workspaceId')::uuid,
    ((select payload from _oauth_a)->>'workspaceMemberId')::uuid,
    'gmail',
    'SHARED@example.test'
  ) into same_id;
  if same_id <> (select id from _integration_a) then
    raise exception 'same-workspace reconnect did not preserve integration authority';
  end if;

  begin
    perform public.zdesk_register_integration(
      ((select payload from _oauth_b)->>'workspaceId')::uuid,
      ((select payload from _oauth_b)->>'workspaceMemberId')::uuid,
      'gmail',
      'shared@example.test'
    );
    raise exception 'cross-workspace provider takeover unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end;
$$;

insert into desk.integration_credentials(integration_id, encrypted_payload, iv, auth_tag, key_version)
values ((select id from _integration_a), 'ciphertext-only', 'iv-only', 'tag-only', 1);

do $$
begin
  if has_table_privilege('authenticated', 'desk.integration_credentials', 'SELECT') then
    raise exception 'authenticated can read encrypted provider credentials';
  end if;
  if has_table_privilege('authenticated', 'desk.oauth_states', 'SELECT') then
    raise exception 'authenticated can read OAuth state authority';
  end if;
  if has_function_privilege('authenticated', 'public.zdesk_consume_oauth_state(text,text,text)', 'EXECUTE') then
    raise exception 'authenticated can consume server-only OAuth state';
  end if;
  if has_function_privilege('authenticated', 'public.zdesk_register_integration(uuid,uuid,text,text)', 'EXECUTE') then
    raise exception 'authenticated can invoke server-only integration registration';
  end if;
  if not has_function_privilege('service_role', 'public.zdesk_consume_oauth_state(text,text,text)', 'EXECUTE') then
    raise exception 'service_role lacks OAuth state consume authority';
  end if;
  if not has_function_privilege('service_role', 'public.zdesk_register_integration(uuid,uuid,text,text)', 'EXECUTE') then
    raise exception 'service_role lacks integration registration authority';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='desk' and table_name='integration_credentials'
      and column_name in ('access_token','refresh_token','oauth_tokens')
  ) then
    raise exception 'plaintext provider credential column exists';
  end if;
end;
$$;

select 'Z_DESK_INTEGRATION_SECURITY_V1=PASS' as result;
rollback;
