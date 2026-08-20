-- Z Studio Google Play reconciliation hardening v1
-- Disposable PostgreSQL verification only. Entire fixture is rolled back.

begin;

-- ============================================================
-- 1. Historical production trial can be consumed without access
-- ============================================================
insert into auth.users (id, email)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'google-reconcile-historical@example.test');

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
select public.zstudio_ensure_account();
reset role;

do $$
declare
  v_person uuid;
begin
  select p.id into strict v_person
  from zos.persons p
  where p.auth_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  perform set_config('zstudio.test.google_reconcile_person', v_person::text, false);
end;
$$;

set role service_role;
do $$
declare
  v_person uuid := current_setting('zstudio.test.google_reconcile_person')::uuid;
  v_prepare jsonb;
  v_intent uuid;
  v_ref text := 'google:play:purchase:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
  v_reconciled jsonb;
  v_claim jsonb;
begin
  v_prepare := public.zstudio_prepare_google_play_purchase(v_person, 'weekly', 'production');
  v_intent := (v_prepare ->> 'intent_id')::uuid;
  perform set_config('zstudio.test.google_reconcile_intent', v_intent::text, false);

  if (v_prepare ->> 'trial_eligible')::boolean is not true then
    raise exception 'Historical trial fixture did not reserve production trial';
  end if;

  v_reconciled := public.zstudio_reconcile_google_play_purchase_intent(
    v_intent,
    v_person,
    'production',
    'weekly',
    v_ref,
    true
  );
  if v_reconciled ->> 'result' <> 'purchase_seen' then
    raise exception 'Historical trial purchase was not correlated';
  end if;

  v_claim := public.zstudio_claim_verified_google_play_trial_consumption(
    v_intent,
    v_person,
    v_ref,
    'production',
    timestamptz '2026-08-20 20:00:00+00'
  );
  if v_claim ->> 'result' <> 'claimed' then
    raise exception 'Historical Google trial was not claimed';
  end if;
end;
$$;
reset role;

-- Claim alone must never grant or create commercial subscription authority.
do $$
declare
  v_person uuid := current_setting('zstudio.test.google_reconcile_person')::uuid;
begin
  if exists (select 1 from studio.subscriptions s where s.person_id = v_person) then
    raise exception 'Historical trial claim created a subscription';
  end if;
  if exists (select 1 from studio.entitlements e where e.person_id = v_person and e.subscription_id is not null) then
    raise exception 'Historical trial claim created entitlements';
  end if;
  if exists (select 1 from studio.billing_events e where e.person_id = v_person) then
    raise exception 'Historical trial claim created billing events';
  end if;
  if not exists (
    select 1 from studio.production_trial_authority t
    where t.person_id = v_person
      and t.state = 'claimed'
      and t.claimed_billing_source = 'google_play'
      and t.claimed_source_subscription_ref =
        'google:play:purchase:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
      and t.claimed_at = timestamptz '2026-08-20 20:00:00+00'
  ) then
    raise exception 'Historical Google trial claim authority is incorrect';
  end if;
end;
$$;

-- Current provider state is terminal, so write only expired commercial state.
set role service_role;
do $$
declare
  v_person uuid := current_setting('zstudio.test.google_reconcile_person')::uuid;
  v_intent uuid := current_setting('zstudio.test.google_reconcile_intent')::uuid;
  v_ref text := 'google:play:purchase:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
  v_written jsonb;
  v_closed jsonb;
  v_retry jsonb;
  v_duplicate_claim jsonb;
begin
  v_written := public.zstudio_apply_verified_commercial_event(
    v_person,
    'google_play',
    'production',
    'google:play:event:current-state:snapshot:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    v_ref,
    'google:play:product:zstudio.access:base_plan:weekly',
    'expired',
    'weekly',
    'expired',
    null,
    null,
    null,
    null,
    false,
    timestamptz '2026-08-20 20:00:00+00'
  );
  if v_written ->> 'result' <> 'applied' then
    raise exception 'Historical expired Google state was not written';
  end if;

  v_closed := public.zstudio_complete_google_play_purchase_intent(
    v_intent, v_person, 'production', v_ref
  );
  if v_closed ->> 'result' <> 'completed' then
    raise exception 'Historical Google purchase intent was not completed';
  end if;

  -- Lost completion response: exact completed intent remains reconcilable.
  v_retry := public.zstudio_reconcile_google_play_purchase_intent(
    v_intent, v_person, 'production', 'weekly', v_ref, true
  );
  if v_retry ->> 'result' <> 'completed' then
    raise exception 'Completed Google intent is not retry-safe';
  end if;

  v_duplicate_claim := public.zstudio_claim_verified_google_play_trial_consumption(
    v_intent,
    v_person,
    v_ref,
    'production',
    timestamptz '2026-08-20 20:00:00+00'
  );
  if v_duplicate_claim ->> 'result' <> 'duplicate' then
    raise exception 'Historical Google trial duplicate claim is not idempotent';
  end if;
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
do $$
declare
  v_state jsonb;
begin
  v_state := public.zstudio_current_access_state();
  if coalesce((v_state ->> 'studio_access')::boolean, false)
     or coalesce((v_state ->> 'ai_access')::boolean, false)
     or v_state ->> 'subscription_status' <> 'expired' then
    raise exception 'Historical expired Google trial retained access';
  end if;
end;
$$;
reset role;

-- ============================================================
-- 2. Wrong hashed purchase ref cannot rebind a completed intent
-- ============================================================
set role service_role;
do $$
declare
  v_person uuid := current_setting('zstudio.test.google_reconcile_person')::uuid;
  v_intent uuid := current_setting('zstudio.test.google_reconcile_intent')::uuid;
begin
  begin
    perform public.zstudio_reconcile_google_play_purchase_intent(
      v_intent,
      v_person,
      'production',
      'weekly',
      'google:play:purchase:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      true
    );
    raise exception 'TEST_GOOGLE_COMPLETED_REBIND_ACCEPTED';
  exception when others then
    if sqlerrm = 'TEST_GOOGLE_COMPLETED_REBIND_ACCEPTED' then raise; end if;
    if sqlerrm <> 'GOOGLE_PLAY_RECONCILE_INTENT_SUBSCRIPTION_CONFLICT' then raise; end if;
  end;
end;
$$;
reset role;

-- ============================================================
-- 3. Provider-proven canceled pending purchase releases exact reservation
-- ============================================================
insert into auth.users (id, email)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'google-reconcile-canceled@example.test');

set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
select public.zstudio_ensure_account();
reset role;

do $$
declare v_person uuid;
begin
  select p.id into strict v_person from zos.persons p
  where p.auth_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  perform set_config('zstudio.test.google_fail_person', v_person::text, false);
end;
$$;

set role service_role;
do $$
declare
  v_person uuid := current_setting('zstudio.test.google_fail_person')::uuid;
  v_prepare jsonb;
  v_intent uuid;
  v_ref text := 'google:play:purchase:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
  v_failed jsonb;
begin
  v_prepare := public.zstudio_prepare_google_play_purchase(v_person, 'monthly', 'production');
  v_intent := (v_prepare ->> 'intent_id')::uuid;

  perform public.zstudio_reconcile_google_play_purchase_intent(
    v_intent, v_person, 'production', 'monthly', v_ref, false
  );

  v_failed := public.zstudio_fail_google_play_purchase_intent(
    v_intent, v_person, 'production', v_ref
  );
  if v_failed ->> 'result' <> 'failed' then
    raise exception 'Canceled pending Google intent was not failed';
  end if;

  if exists (
    select 1 from studio.production_trial_authority t
    where t.person_id = v_person and t.state = 'reserved'
  ) then
    raise exception 'Canceled pending Google purchase retained trial reservation';
  end if;

  if exists (select 1 from studio.subscriptions s where s.person_id = v_person) then
    raise exception 'Canceled pending Google purchase created subscription state';
  end if;
end;
$$;
reset role;

select 'ZSTUDIO_GOOGLE_PLAY_RECONCILIATION_HARDENING_POSTGRES_AUTHORITY=PASS';
rollback;
