-- Z Studio Google Play pause authority v1
-- Disposable PostgreSQL verification only. Entire fixture is rolled back.

begin;

insert into auth.users (id, email)
values (
  '66666666-6666-4666-8666-666666666666',
  'google-play-pause@example.test'
);

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '66666666-6666-4666-8666-666666666666',
  false
);
select public.zstudio_ensure_account();
reset role;

do $$
declare
  v_person uuid;
begin
  select p.id into strict v_person
  from zos.persons p
  where p.auth_user_id = '66666666-6666-4666-8666-666666666666';

  perform set_config('zstudio.test.google_pause_person_id', v_person::text, false);
end;
$$;

-- Browser execution remains impossible.
do $$
declare
  v_oid oid;
begin
  select to_regprocedure(
    'public.zstudio_apply_verified_google_play_pause_event(uuid,text,text,text,text,text,timestamptz)'
  )::oid into v_oid;

  if v_oid is null then
    raise exception 'Google Play pause RPC is missing';
  end if;

  if has_function_privilege('anon', v_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'Browser role can execute Google Play pause RPC';
  end if;

  if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception 'service_role cannot execute Google Play pause RPC';
  end if;
end;
$$;

-- Create one already verified active Google Play subscription through the
-- existing provider-neutral writer. No raw purchase token is ever stored.
set role service_role;
do $$
declare
  v_person uuid := current_setting('zstudio.test.google_pause_person_id')::uuid;
  v_result jsonb;
begin
  v_result := public.zstudio_apply_verified_commercial_event(
    v_person,
    'google_play',
    'sandbox',
    'google:play:event:fixture-active:snapshot:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'google:play:purchase:1111111111111111111111111111111111111111111111111111111111111111',
    'google:play:product:zstudio.access:base_plan:monthly',
    'activated',
    'monthly',
    'active',
    null,
    null,
    now() - interval '1 day',
    now() + interval '29 days',
    false,
    now() - interval '60 minutes'
  );

  if v_result ->> 'result' <> 'applied' then
    raise exception 'Google Play active fixture was not applied';
  end if;
end;
$$;
reset role;

-- Active fixture grants both Studio and AI access.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '66666666-6666-4666-8666-666666666666',
  false
);
do $$
declare
  v_state jsonb;
begin
  v_state := public.zstudio_current_access_state();
  if not coalesce((v_state ->> 'studio_access')::boolean, false)
     or not coalesce((v_state ->> 'ai_access')::boolean, false)
     or v_state ->> 'subscription_status' <> 'active' then
    raise exception 'Google Play active fixture did not grant expected access';
  end if;
end;
$$;
reset role;

-- Apply verified PAUSED current state.
set role service_role;
do $$
declare
  v_person uuid := current_setting('zstudio.test.google_pause_person_id')::uuid;
  v_result jsonb;
begin
  v_result := public.zstudio_apply_verified_google_play_pause_event(
    v_person,
    'sandbox',
    'google:play:event:fixture-paused:snapshot:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'google:play:purchase:1111111111111111111111111111111111111111111111111111111111111111',
    'google:play:product:zstudio.access:base_plan:monthly',
    'monthly',
    now() - interval '30 minutes'
  );

  if v_result ->> 'result' <> 'applied'
     or v_result ->> 'subscription_status' <> 'paused' then
    raise exception 'Google Play pause state was not applied';
  end if;
end;
$$;
reset role;

-- PAUSED denies subscription-derived access immediately.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '66666666-6666-4666-8666-666666666666',
  false
);
do $$
declare
  v_state jsonb;
begin
  v_state := public.zstudio_current_access_state();
  if coalesce((v_state ->> 'studio_access')::boolean, false)
     or coalesce((v_state ->> 'ai_access')::boolean, false)
     or v_state ->> 'subscription_status' <> 'paused' then
    raise exception 'Google Play paused subscription retained access';
  end if;
end;
$$;
reset role;

-- Exact redelivery is duplicate-safe.
set role service_role;
do $$
declare
  v_person uuid := current_setting('zstudio.test.google_pause_person_id')::uuid;
  v_result jsonb;
begin
  v_result := public.zstudio_apply_verified_google_play_pause_event(
    v_person,
    'sandbox',
    'google:play:event:fixture-paused:snapshot:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'google:play:purchase:1111111111111111111111111111111111111111111111111111111111111111',
    'google:play:product:zstudio.access:base_plan:monthly',
    'monthly',
    now() - interval '30 minutes'
  );

  if v_result ->> 'result' <> 'duplicate' then
    raise exception 'Google Play pause duplicate was not idempotent';
  end if;
end;
$$;

-- Older pause evidence is ledgered but cannot regress the high-water state.
do $$
declare
  v_person uuid := current_setting('zstudio.test.google_pause_person_id')::uuid;
  v_result jsonb;
begin
  v_result := public.zstudio_apply_verified_google_play_pause_event(
    v_person,
    'sandbox',
    'google:play:event:fixture-stale-pause:snapshot:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    'google:play:purchase:1111111111111111111111111111111111111111111111111111111111111111',
    'google:play:product:zstudio.access:base_plan:monthly',
    'monthly',
    now() - interval '45 minutes'
  );

  if v_result ->> 'result' <> 'ignored_stale' then
    raise exception 'Stale Google Play pause was not ignored';
  end if;
end;
$$;

-- A later recovered current state uses the existing shared writer and restores
-- access, proving paused is recoverable rather than terminal.
do $$
declare
  v_person uuid := current_setting('zstudio.test.google_pause_person_id')::uuid;
  v_result jsonb;
begin
  v_result := public.zstudio_apply_verified_commercial_event(
    v_person,
    'google_play',
    'sandbox',
    'google:play:event:fixture-recovered:snapshot:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    'google:play:purchase:1111111111111111111111111111111111111111111111111111111111111111',
    'google:play:product:zstudio.access:base_plan:monthly',
    'recovered',
    'monthly',
    'active',
    null,
    null,
    now() - interval '1 day',
    now() + interval '29 days',
    false,
    now() - interval '10 minutes'
  );

  if v_result ->> 'result' <> 'applied'
     or v_result ->> 'subscription_status' <> 'active' then
    raise exception 'Google Play recovery did not restore active state';
  end if;
end;
$$;
reset role;

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '66666666-6666-4666-8666-666666666666',
  false
);
do $$
declare
  v_state jsonb;
begin
  v_state := public.zstudio_current_access_state();
  if not coalesce((v_state ->> 'studio_access')::boolean, false)
     or not coalesce((v_state ->> 'ai_access')::boolean, false)
     or v_state ->> 'subscription_status' <> 'active' then
    raise exception 'Google Play recovery did not restore access';
  end if;
end;
$$;
reset role;

select 'ZSTUDIO_GOOGLE_PLAY_PAUSE_POSTGRES_AUTHORITY=PASS';
rollback;
