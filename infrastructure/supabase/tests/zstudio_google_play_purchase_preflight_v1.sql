-- Z Studio Google Play purchase preflight authority v1
-- Disposable PostgreSQL verification only. Entire fixture is rolled back.

begin;

-- ============================================================
-- 1. Canonical production user A
-- ============================================================
insert into auth.users (id, email)
values ('77777777-7777-4777-8777-777777777777', 'google-preflight-a@example.test');

set role authenticated;
select set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777', false);
select public.zstudio_ensure_account();
reset role;

do $$
declare v_person uuid;
begin
  select p.id into strict v_person from zos.persons p
  where p.auth_user_id = '77777777-7777-4777-8777-777777777777';
  perform set_config('zstudio.test.google_preflight_person_a', v_person::text, false);
end;
$$;

-- ============================================================
-- 2. Production prepare reserves one global trial
-- ============================================================
set role service_role;
do $$
declare
  v_person uuid := current_setting('zstudio.test.google_preflight_person_a')::uuid;
  v_first jsonb;
  v_second jsonb;
begin
  v_first := public.zstudio_prepare_google_play_purchase(v_person, 'monthly', 'production');
  if v_first ->> 'result' <> 'prepared'
     or (v_first ->> 'trial_eligible')::boolean is not true then
    raise exception 'Google Play production preflight did not reserve trial';
  end if;

  perform set_config('zstudio.test.google_preflight_intent_a', v_first ->> 'intent_id', false);

  v_second := public.zstudio_prepare_google_play_purchase(v_person, 'monthly', 'production');
  if v_second ->> 'result' <> 'existing'
     or v_second ->> 'intent_id' <> v_first ->> 'intent_id' then
    raise exception 'Google Play preflight is not idempotent';
  end if;
end;
$$;
reset role;

do $$
declare
  v_person uuid := current_setting('zstudio.test.google_preflight_person_a')::uuid;
  v_intent uuid := current_setting('zstudio.test.google_preflight_intent_a')::uuid;
begin
  if not exists (
    select 1 from studio.production_trial_authority t
    where t.person_id = v_person
      and t.state = 'reserved'
      and t.reserved_billing_source = 'google_play'
      and t.reservation_ref = v_intent::text
  ) then
    raise exception 'Google Play preflight did not bind global trial reservation';
  end if;
end;
$$;

-- ============================================================
-- 3. Exact verified trial purchase binds then claims atomically
-- ============================================================
set role service_role;
do $$
declare
  v_person uuid := current_setting('zstudio.test.google_preflight_person_a')::uuid;
  v_intent uuid := current_setting('zstudio.test.google_preflight_intent_a')::uuid;
  v_ref text := 'google:play:purchase:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  v_bound jsonb;
  v_written jsonb;
  v_closed jsonb;
begin
  v_bound := public.zstudio_bind_google_play_purchase_intent(
    v_intent, v_person, 'production', 'monthly', v_ref, true
  );
  if v_bound ->> 'result' <> 'bound' then
    raise exception 'Verified Google trial purchase did not bind intent';
  end if;

  v_written := public.zstudio_apply_verified_commercial_event(
    v_person,
    'google_play',
    'production',
    'google:play:event:trial-a:snapshot:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    v_ref,
    'google:play:product:zstudio.access:base_plan:monthly',
    'trial_started',
    'monthly',
    'trialing',
    now() - interval '1 minute',
    now() + interval '3 days',
    null,
    null,
    false,
    now()
  );
  if v_written ->> 'result' <> 'applied' then
    raise exception 'Verified Google trial commercial event was not applied';
  end if;

  v_closed := public.zstudio_complete_google_play_purchase_intent(
    v_intent, v_person, 'production', v_ref
  );
  if v_closed ->> 'result' <> 'completed' then
    raise exception 'Google trial purchase intent was not completed';
  end if;
end;
$$;
reset role;

do $$
declare
  v_person uuid := current_setting('zstudio.test.google_preflight_person_a')::uuid;
  v_ref text := 'google:play:purchase:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
begin
  if not exists (
    select 1 from studio.production_trial_authority t
    where t.person_id = v_person
      and t.state = 'claimed'
      and t.claimed_billing_source = 'google_play'
      and t.claimed_source_subscription_ref = v_ref
  ) then
    raise exception 'Google trial was not permanently claimed';
  end if;

  if not exists (
    select 1 from studio.subscriptions s
    where s.person_id = v_person
      and s.billing_source = 'google_play'
      and s.status = 'trialing'
  ) then
    raise exception 'Google trial subscription authority is missing';
  end if;
end;
$$;

-- ============================================================
-- 4. Production Google trial without preflight is impossible
-- ============================================================
insert into auth.users (id, email)
values ('88888888-8888-4888-8888-888888888888', 'google-preflight-b@example.test');

set role authenticated;
select set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888888888', false);
select public.zstudio_ensure_account();
reset role;

do $$
declare v_person uuid;
begin
  select p.id into strict v_person from zos.persons p
  where p.auth_user_id = '88888888-8888-4888-8888-888888888888';
  perform set_config('zstudio.test.google_preflight_person_b', v_person::text, false);
end;
$$;

set role service_role;
do $$
declare
  v_person uuid := current_setting('zstudio.test.google_preflight_person_b')::uuid;
begin
  begin
    perform public.zstudio_apply_verified_commercial_event(
      v_person,
      'google_play',
      'production',
      'google:play:event:unprepared:snapshot:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'google:play:purchase:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'google:play:product:zstudio.access:base_plan:weekly',
      'trial_started',
      'weekly',
      'trialing',
      now(),
      now() + interval '3 days',
      null,
      null,
      false,
      now()
    );
    raise exception 'TEST_UNPREPARED_GOOGLE_TRIAL_ACCEPTED';
  exception when others then
    if sqlerrm = 'TEST_UNPREPARED_GOOGLE_TRIAL_ACCEPTED' then raise; end if;
    if sqlerrm <> 'GOOGLE_PLAY_TRIAL_PREFLIGHT_REQUIRED' then raise; end if;
  end;
end;
$$;
reset role;

-- ============================================================
-- 5. Paid purchase after a reserved offer releases unused trial
-- ============================================================
insert into auth.users (id, email)
values ('99999999-9999-4999-8999-999999999999', 'google-preflight-c@example.test');

set role authenticated;
select set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', false);
select public.zstudio_ensure_account();
reset role;

do $$
declare v_person uuid;
begin
  select p.id into strict v_person from zos.persons p
  where p.auth_user_id = '99999999-9999-4999-8999-999999999999';
  perform set_config('zstudio.test.google_preflight_person_c', v_person::text, false);
end;
$$;

set role service_role;
do $$
declare
  v_person uuid := current_setting('zstudio.test.google_preflight_person_c')::uuid;
  v_prepare jsonb;
  v_intent uuid;
  v_ref text := 'google:play:purchase:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
begin
  v_prepare := public.zstudio_prepare_google_play_purchase(v_person, 'annual', 'production');
  v_intent := (v_prepare ->> 'intent_id')::uuid;

  perform public.zstudio_bind_google_play_purchase_intent(
    v_intent, v_person, 'production', 'annual', v_ref, false
  );

  perform public.zstudio_apply_verified_commercial_event(
    v_person,
    'google_play',
    'production',
    'google:play:event:paid-c:snapshot:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    v_ref,
    'google:play:product:zstudio.access:base_plan:annual',
    'activated',
    'annual',
    'active',
    null,
    null,
    now(),
    now() + interval '1 year',
    false,
    now()
  );

  perform public.zstudio_complete_google_play_purchase_intent(
    v_intent, v_person, 'production', v_ref
  );
end;
$$;
reset role;

do $$
declare
  v_person uuid := current_setting('zstudio.test.google_preflight_person_c')::uuid;
begin
  if exists (
    select 1 from studio.production_trial_authority t
    where t.person_id = v_person and t.state = 'reserved'
  ) then
    raise exception 'Successful paid Google purchase retained unused trial reservation';
  end if;
end;
$$;

select 'ZSTUDIO_GOOGLE_PLAY_PURCHASE_PREFLIGHT_POSTGRES_AUTHORITY=PASS';
rollback;
