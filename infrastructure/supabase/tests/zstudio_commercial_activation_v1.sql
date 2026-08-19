-- Z Studio commercial activation authority v1
-- Disposable PostgreSQL verification only.
--
-- This test never targets production data.
-- The enclosing transaction is rolled back after verification.

begin;


-- ============================================================
-- 1. Structural + privilege authority
-- ============================================================

do $$
declare
  v_apply_oid oid;
  v_access_oid oid;
begin
  if to_regclass('studio.billing_events') is null then
    raise exception 'studio.billing_events is missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'studio'
      and table_name = 'subscriptions'
      and column_name = 'store_event_high_water_at'
  ) then
    raise exception 'store_event_high_water_at is missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'studio'
      and table_name = 'subscriptions'
      and column_name = 'billing_environment'
  ) then
    raise exception 'billing_environment is missing';
  end if;

  if not (
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'studio'
      and c.relname = 'billing_events'
  ) then
    raise exception 'RLS is not enabled on studio.billing_events';
  end if;

  if has_table_privilege(
       'authenticated',
       'studio.billing_events',
       'SELECT'
     )
     or has_table_privilege(
       'authenticated',
       'studio.billing_events',
       'INSERT'
     )
     or has_table_privilege(
       'authenticated',
       'studio.billing_events',
       'UPDATE'
     )
     or has_table_privilege(
       'authenticated',
       'studio.billing_events',
       'DELETE'
     ) then
    raise exception
      'authenticated unexpectedly has direct billing_events access';
  end if;

  if not has_table_privilege(
       'service_role',
       'studio.billing_events',
       'SELECT'
     )
     or not has_table_privilege(
       'service_role',
       'studio.billing_events',
       'INSERT'
     ) then
    raise exception
      'service_role is missing billing_events append privileges';
  end if;

  if has_table_privilege(
       'service_role',
       'studio.billing_events',
       'UPDATE'
     )
     or has_table_privilege(
       'service_role',
       'studio.billing_events',
       'DELETE'
     ) then
    raise exception
      'billing event ledger is not append-only for service_role';
  end if;

  select p.oid
    into v_apply_oid
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname =
      'zstudio_apply_verified_commercial_event';

  if v_apply_oid is null then
    raise exception
      'commercial apply function is missing';
  end if;

  if has_function_privilege(
       'anon',
       v_apply_oid,
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       v_apply_oid,
       'EXECUTE'
     ) then
    raise exception
      'browser role can execute commercial apply authority';
  end if;

  if not has_function_privilege(
       'service_role',
       v_apply_oid,
       'EXECUTE'
     ) then
    raise exception
      'service_role cannot execute commercial apply authority';
  end if;

  select p.oid
    into v_access_oid
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'zstudio_current_access_state';

  if v_access_oid is null then
    raise exception
      'current access state function is missing';
  end if;

  if has_function_privilege(
       'anon',
       v_access_oid,
       'EXECUTE'
     ) then
    raise exception
      'anon can execute current access state';
  end if;

  if not has_function_privilege(
       'authenticated',
       v_access_oid,
       'EXECUTE'
     ) then
    raise exception
      'authenticated cannot execute current access state';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'studio'
      and table_name = 'billing_events'
      and column_name in (
        'receipt',
        'receipt_data',
        'purchase_token',
        'signed_transaction',
        'signed_payload',
        'raw_payload'
      )
  ) then
    raise exception
      'raw store credential/payload storage leaked into billing ledger';
  end if;
end;
$$;


-- ============================================================
-- 2. Existing AI quota authority must remain untouched
-- ============================================================

do $$
begin
  if (
    select count(*)
    from studio.ai_plan_limits
  ) <> 3 then
    raise exception
      'Expected exactly three AI plan quota authorities';
  end if;

  if not exists (
       select 1
       from studio.ai_plan_limits
       where plan_code = 'weekly'
         and trial_usage_limit = 10
         and period_usage_limit = 50
     )
     or not exists (
       select 1
       from studio.ai_plan_limits
       where plan_code = 'monthly'
         and trial_usage_limit = 10
         and period_usage_limit = 250
     )
     or not exists (
       select 1
       from studio.ai_plan_limits
       where plan_code = 'annual'
         and trial_usage_limit = 10
         and period_usage_limit = 250
     ) then
    raise exception
      'Commercial activation changed approved AI quota authority';
  end if;
end;
$$;


-- ============================================================
-- 3. Disposable authenticated identities
-- ============================================================

insert into auth.users (id, email)
values
(
  '55111111-1111-4111-8111-111111111111',
  'commercial-a@example.test'
),
(
  '55222222-2222-4222-8222-222222222222',
  'commercial-b@example.test'
),
(
  '55333333-3333-4333-8333-333333333333',
  'commercial-c@example.test'
),
(
  '55444444-4444-4444-8444-444444444444',
  'commercial-d@example.test'
);

set role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '55111111-1111-4111-8111-111111111111',
  false
);
select public.zstudio_ensure_account();

select set_config(
  'request.jwt.claim.sub',
  '55222222-2222-4222-8222-222222222222',
  false
);
select public.zstudio_ensure_account();

select set_config(
  'request.jwt.claim.sub',
  '55333333-3333-4333-8333-333333333333',
  false
);
select public.zstudio_ensure_account();

select set_config(
  'request.jwt.claim.sub',
  '55444444-4444-4444-8444-444444444444',
  false
);
select public.zstudio_ensure_account();

reset role;

create temporary table zstudio_commercial_test_people (
  label text primary key,
  person_id uuid not null
);

insert into zstudio_commercial_test_people (
  label,
  person_id
)
select
  'a',
  p.id
from zos.persons p
where p.auth_user_id =
  '55111111-1111-4111-8111-111111111111';

insert into zstudio_commercial_test_people (
  label,
  person_id
)
select
  'b',
  p.id
from zos.persons p
where p.auth_user_id =
  '55222222-2222-4222-8222-222222222222';

insert into zstudio_commercial_test_people (
  label,
  person_id
)
select
  'c',
  p.id
from zos.persons p
where p.auth_user_id =
  '55333333-3333-4333-8333-333333333333';

insert into zstudio_commercial_test_people (
  label,
  person_id
)
select
  'd',
  p.id
from zos.persons p
where p.auth_user_id =
  '55444444-4444-4444-8444-444444444444';

do $$
begin
  if (
    select count(*)
    from zstudio_commercial_test_people
  ) <> 4 then
    raise exception
      'Disposable canonical Studio identities were not created';
  end if;
end;
$$;


-- ============================================================
-- 4. User A — trial activation
-- ============================================================

do $$
declare
  v_person uuid;
  v_result jsonb;
begin
  select person_id
    into v_person
  from zstudio_commercial_test_people
  where label = 'a';

  v_result :=
    public.zstudio_apply_verified_commercial_event(
      v_person,
      'apple_app_store',
      'sandbox',
      'apple-event-a-trial',
      'apple-sub-a',
      'com.zstudio.weekly',
      'trial_started',
      'weekly',
      'trialing',
      now() - interval '1 hour',
      now() + interval '71 hours',
      null,
      null,
      false,
      now() - interval '1 hour'
    );

  if v_result ->> 'result' <> 'applied' then
    raise exception
      'Initial trial event was not applied';
  end if;
end;
$$;

do $$
declare
  v_person uuid;
begin
  select person_id
    into v_person
  from zstudio_commercial_test_people
  where label = 'a';

  if (
    select count(*)
    from studio.subscriptions s
    where s.person_id = v_person
  ) <> 1 then
    raise exception
      'Trial did not create exactly one subscription';
  end if;

  if (
    select count(*)
    from studio.entitlements e
    where e.person_id = v_person
      and e.subscription_id is not null
  ) <> 2 then
    raise exception
      'Trial did not create exactly two subscription entitlements';
  end if;

  if not exists (
    select 1
    from studio.entitlements e
    where e.person_id = v_person
      and e.entitlement_code = 'studio_access'
      and e.status = 'active'
  ) then
    raise exception
      'Trial studio_access entitlement missing';
  end if;

  if not exists (
    select 1
    from studio.entitlements e
    where e.person_id = v_person
      and e.entitlement_code = 'ai_access'
      and e.status = 'active'
  ) then
    raise exception
      'Trial ai_access entitlement missing';
  end if;

  if not exists (
    select 1
    from studio.subscriptions s
    where s.person_id = v_person
      and s.plan_code = 'weekly'
      and s.status = 'trialing'
      and s.billing_source = 'apple_app_store'
      and s.billing_environment = 'sandbox'
      and s.store_event_high_water_at =
          now() - interval '1 hour'
  ) then
    raise exception
      'Trial subscription snapshot/high-water authority incorrect';
  end if;
end;
$$;


-- ============================================================
-- 5. Current-access self scope during trial
-- ============================================================

do $$
declare
  v_state jsonb;
begin
  perform set_config(
    'request.jwt.claim.sub',
    '55111111-1111-4111-8111-111111111111',
    false
  );

  v_state := public.zstudio_current_access_state();

  if (v_state ->> 'studio_access')::boolean is not true
     or (v_state ->> 'ai_access')::boolean is not true
     or v_state ->> 'plan_code' <> 'weekly'
     or v_state ->> 'subscription_status' <> 'trialing' then
    raise exception
      'Authenticated trial current-access state is incorrect';
  end if;
end;
$$;


-- ============================================================
-- 6. Exact duplicate event is idempotent
-- ============================================================

do $$
declare
  v_person uuid;
  v_result jsonb;
begin
  select person_id
    into v_person
  from zstudio_commercial_test_people
  where label = 'a';

  v_result :=
    public.zstudio_apply_verified_commercial_event(
      v_person,
      'apple_app_store',
      'sandbox',
      'apple-event-a-trial',
      'apple-sub-a',
      'com.zstudio.weekly',
      'trial_started',
      'weekly',
      'trialing',
      now() - interval '1 hour',
      now() + interval '71 hours',
      null,
      null,
      false,
      now() - interval '1 hour'
    );

  if v_result ->> 'result' <> 'duplicate' then
    raise exception
      'Exact provider event duplicate was not idempotent';
  end if;

  if (
    select count(*)
    from studio.billing_events e
    where e.source_event_ref = 'apple-event-a-trial'
  ) <> 1 then
    raise exception
      'Duplicate provider event duplicated ledger authority';
  end if;
end;
$$;


-- ============================================================
-- 7. Conflicting duplicate fails closed
-- ============================================================

do $$
declare
  v_person uuid;
begin
  select person_id
    into v_person
  from zstudio_commercial_test_people
  where label = 'a';

  begin
    perform public.zstudio_apply_verified_commercial_event(
      v_person,
      'apple_app_store',
      'sandbox',
      'apple-event-a-trial',
      'apple-sub-a',
      'com.zstudio.monthly',
      'trial_started',
      'monthly',
      'trialing',
      now() - interval '1 hour',
      now() + interval '71 hours',
      null,
      null,
      false,
      now() - interval '1 hour'
    );

    raise exception
      'TEST_CONFLICTING_DUPLICATE_ACCEPTED';

  exception
    when others then
      if sqlerrm = 'TEST_CONFLICTING_DUPLICATE_ACCEPTED' then
        raise;
      end if;

      if sqlerrm <> 'COMMERCIAL_EVENT_CONFLICT' then
        raise;
      end if;
  end;
end;
$$;


-- ============================================================
-- 8. Subscription cannot be rebound to another person
-- ============================================================

do $$
declare
  v_person_b uuid;
begin
  select person_id
    into v_person_b
  from zstudio_commercial_test_people
  where label = 'b';

  begin
    perform public.zstudio_apply_verified_commercial_event(
      v_person_b,
      'apple_app_store',
      'sandbox',
      'apple-event-a-hijack',
      'apple-sub-a',
      'com.zstudio.weekly',
      'activated',
      'weekly',
      'active',
      null,
      null,
      now(),
      now() + interval '7 days',
      false,
      now()
    );

    raise exception
      'TEST_SUBSCRIPTION_REBIND_ACCEPTED';

  exception
    when others then
      if sqlerrm = 'TEST_SUBSCRIPTION_REBIND_ACCEPTED' then
        raise;
      end if;

      if sqlerrm <>
         'COMMERCIAL_SUBSCRIPTION_IDENTITY_CONFLICT' then
        raise;
      end if;
  end;
end;
$$;


-- ============================================================
-- 9. User A — trial -> active
-- ============================================================

do $$
declare
  v_person uuid;
  v_subscription_before uuid;
  v_subscription_after uuid;
begin
  select person_id
    into v_person
  from zstudio_commercial_test_people
  where label = 'a';

  select s.id
    into v_subscription_before
  from studio.subscriptions s
  where s.person_id = v_person
    and s.source_subscription_ref = 'apple-sub-a';

  perform public.zstudio_apply_verified_commercial_event(
    v_person,
    'apple_app_store',
    'sandbox',
    'apple-event-a-active',
    'apple-sub-a',
    'com.zstudio.weekly',
    'activated',
    'weekly',
    'active',
    null,
    null,
    now(),
    now() + interval '7 days',
    false,
    now()
  );

  select s.id
    into v_subscription_after
  from studio.subscriptions s
  where s.person_id = v_person
    and s.source_subscription_ref = 'apple-sub-a';

  if v_subscription_before <> v_subscription_after then
    raise exception
      'Activation duplicated the existing subscription';
  end if;

  if (
    select count(*)
    from studio.entitlements e
    where e.subscription_id = v_subscription_after
  ) <> 2 then
    raise exception
      'Activation duplicated subscription entitlements';
  end if;
end;
$$;


-- ============================================================
-- 10. Stale event recorded but cannot regress state
-- ============================================================

do $$
declare
  v_person uuid;
  v_result jsonb;
begin
  select person_id
    into v_person
  from zstudio_commercial_test_people
  where label = 'a';

  v_result :=
    public.zstudio_apply_verified_commercial_event(
      v_person,
      'apple_app_store',
      'sandbox',
      'apple-event-a-stale',
      'apple-sub-a',
      'com.zstudio.weekly',
      'restored',
      'weekly',
      'trialing',
      now() - interval '2 hours',
      now() + interval '70 hours',
      null,
      null,
      false,
      now() - interval '2 hours'
    );

  if v_result ->> 'result' <> 'ignored_stale' then
    raise exception
      'Older provider event was not ignored as stale';
  end if;

  if not exists (
    select 1
    from studio.billing_events e
    where e.source_event_ref = 'apple-event-a-stale'
      and e.processing_status = 'ignored_stale'
  ) then
    raise exception
      'Ignored stale event was not recorded in ledger';
  end if;

  if not exists (
    select 1
    from studio.subscriptions s
    where s.person_id = v_person
      and s.status = 'active'
      and s.store_event_high_water_at = now()
  ) then
    raise exception
      'Stale event regressed active subscription authority';
  end if;
end;
$$;


-- ============================================================
-- 11. Retroactive revocation applies without lowering high-water
-- ============================================================

do $$
declare
  v_person uuid;
begin
  select person_id
    into v_person
  from zstudio_commercial_test_people
  where label = 'a';

  perform public.zstudio_apply_verified_commercial_event(
    v_person,
    'apple_app_store',
    'sandbox',
    'apple-event-a-revoked',
    'apple-sub-a',
    'com.zstudio.weekly',
    'revoked',
    'weekly',
    'revoked',
    null,
    null,
    null,
    null,
    false,
    now() - interval '30 minutes'
  );

  if not exists (
    select 1
    from studio.subscriptions s
    where s.person_id = v_person
      and s.status = 'revoked'
      and s.last_store_event_at =
          now() - interval '30 minutes'
      and s.store_event_high_water_at = now()
  ) then
    raise exception
      'Retroactive revocation/high-water authority is incorrect';
  end if;

  if (
    select count(*)
    from studio.entitlements e
    where e.person_id = v_person
      and e.subscription_id is not null
      and e.status = 'revoked'
  ) <> 2 then
    raise exception
      'Retroactive revocation did not revoke both entitlements';
  end if;
end;
$$;


-- ============================================================
-- 12. User B — commercial lifecycle
-- ============================================================

do $$
declare
  v_person uuid;
begin
  select person_id
    into v_person
  from zstudio_commercial_test_people
  where label = 'b';

  perform public.zstudio_apply_verified_commercial_event(
    v_person,
    'google_play',
    'sandbox',
    'google-event-b-active',
    'google-sub-b',
    'zstudio.monthly',
    'activated',
    'monthly',
    'active',
    null,
    null,
    now() - interval '2 hours',
    now() + interval '28 days',
    false,
    now() - interval '2 hours'
  );

  perform public.zstudio_apply_verified_commercial_event(
    v_person,
    'google_play',
    'sandbox',
    'google-event-b-cancel-renewal',
    'google-sub-b',
    'zstudio.monthly',
    'renewal_disabled',
    'monthly',
    'active',
    null,
    null,
    now() - interval '2 hours',
    now() + interval '28 days',
    true,
    now() - interval '90 minutes'
  );

  if not exists (
    select 1
    from studio.subscriptions s
    where s.person_id = v_person
      and s.status = 'active'
      and s.cancel_at_period_end
  ) then
    raise exception
      'renewal_disabled incorrectly removed active access';
  end if;

  perform public.zstudio_apply_verified_commercial_event(
    v_person,
    'google_play',
    'sandbox',
    'google-event-b-grace',
    'google-sub-b',
    'zstudio.monthly',
    'grace_started',
    'monthly',
    'grace',
    null,
    null,
    now() - interval '2 hours',
    now() + interval '28 days',
    true,
    now() - interval '60 minutes'
  );

  if (
    select count(*)
    from studio.entitlements e
    where e.person_id = v_person
      and e.status = 'grace'
  ) <> 2 then
    raise exception
      'Grace did not preserve both entitlements';
  end if;

  perform public.zstudio_apply_verified_commercial_event(
    v_person,
    'google_play',
    'sandbox',
    'google-event-b-past-due',
    'google-sub-b',
    'zstudio.monthly',
    'past_due',
    'monthly',
    'past_due',
    null,
    null,
    null,
    null,
    false,
    now() - interval '30 minutes'
  );

  if (
    select count(*)
    from studio.entitlements e
    where e.person_id = v_person
      and e.status = 'expired'
  ) <> 2 then
    raise exception
      'past_due did not remove both subscription entitlements';
  end if;

  perform public.zstudio_apply_verified_commercial_event(
    v_person,
    'google_play',
    'sandbox',
    'google-event-b-recovered',
    'google-sub-b',
    'zstudio.monthly',
    'recovered',
    'monthly',
    'active',
    null,
    null,
    now() - interval '20 minutes',
    now() + interval '30 days',
    false,
    now() - interval '20 minutes'
  );

  if (
    select count(*)
    from studio.entitlements e
    where e.person_id = v_person
      and e.status = 'active'
  ) <> 2 then
    raise exception
      'Recovery did not restore both entitlements';
  end if;

  perform public.zstudio_apply_verified_commercial_event(
    v_person,
    'google_play',
    'sandbox',
    'google-event-b-expired',
    'google-sub-b',
    'zstudio.monthly',
    'expired',
    'monthly',
    'expired',
    null,
    null,
    null,
    null,
    false,
    now() - interval '10 minutes'
  );

  if (
    select count(*)
    from studio.entitlements e
    where e.person_id = v_person
      and e.status = 'expired'
  ) <> 2 then
    raise exception
      'Expired subscription retained commercial access';
  end if;
end;
$$;


-- ============================================================
-- 13. Event/status matrix rejects inconsistent authority
-- ============================================================

do $$
declare
  v_person uuid;
begin
  select person_id
    into v_person
  from zstudio_commercial_test_people
  where label = 'b';

  begin
    perform public.zstudio_apply_verified_commercial_event(
      v_person,
      'google_play',
      'sandbox',
      'google-event-invalid-matrix',
      'google-sub-invalid',
      'zstudio.monthly',
      'renewed',
      'monthly',
      'revoked',
      null,
      null,
      null,
      null,
      false,
      now()
    );

    raise exception
      'TEST_INVALID_EVENT_STATUS_ACCEPTED';

  exception
    when others then
      if sqlerrm = 'TEST_INVALID_EVENT_STATUS_ACCEPTED' then
        raise;
      end if;

      if sqlerrm <> 'COMMERCIAL_ACTIVE_EVENT_STATUS_INVALID' then
        raise;
      end if;
  end;

  if exists (
    select 1
    from studio.subscriptions s
    where s.source_subscription_ref = 'google-sub-invalid'
  ) then
    raise exception
      'Invalid event/status matrix partially mutated subscription state';
  end if;
end;
$$;


-- ============================================================
-- 14. Entitlement uniqueness is enforced structurally
-- ============================================================

do $$
declare
  v_person uuid;
  v_subscription uuid;
begin
  select person_id
    into v_person
  from zstudio_commercial_test_people
  where label = 'b';

  select s.id
    into v_subscription
  from studio.subscriptions s
  where s.person_id = v_person
    and s.source_subscription_ref = 'google-sub-b';

  begin
    insert into studio.entitlements (
      person_id,
      subscription_id,
      entitlement_code,
      status,
      source,
      starts_at
    )
    values (
      v_person,
      v_subscription,
      'studio_access',
      'active',
      'subscription',
      now()
    );

    raise exception
      'TEST_DUPLICATE_ENTITLEMENT_ACCEPTED';

  exception
    when unique_violation then
      null;

    when others then
      if sqlerrm = 'TEST_DUPLICATE_ENTITLEMENT_ACCEPTED' then
        raise;
      end if;

      raise;
  end;
end;
$$;


-- ============================================================
-- 15. User C — multi-subscription UI / Paid AI convergence
-- ============================================================

do $$
declare
  v_person uuid;
begin
  select person_id
    into v_person
  from zstudio_commercial_test_people
  where label = 'c';

  perform public.zstudio_apply_verified_commercial_event(
    v_person,
    'apple_app_store',
    'sandbox',
    'apple-event-c-weekly',
    'apple-sub-c-weekly',
    'com.zstudio.weekly',
    'activated',
    'weekly',
    'active',
    null,
    null,
    now() - interval '2 hours',
    now() + interval '5 days',
    false,
    now() - interval '2 hours'
  );

  perform public.zstudio_apply_verified_commercial_event(
    v_person,
    'google_play',
    'sandbox',
    'google-event-c-monthly',
    'google-sub-c-monthly',
    'zstudio.monthly',
    'activated',
    'monthly',
    'active',
    null,
    null,
    now() - interval '1 hour',
    now() + interval '20 days',
    false,
    now() - interval '1 hour'
  );
end;
$$;

do $$
declare
  v_state jsonb;
  v_reservation jsonb;
begin
  perform set_config(
    'request.jwt.claim.sub',
    '55333333-3333-4333-8333-333333333333',
    false
  );

  v_state := public.zstudio_current_access_state();

  if v_state ->> 'plan_code' <> 'monthly'
     or v_state ->> 'subscription_status' <> 'active'
     or (v_state ->> 'studio_access')::boolean is not true
     or (v_state ->> 'ai_access')::boolean is not true then
    raise exception
      'Current-access subscription selection diverged from authority';
  end if;

  v_reservation :=
    public.zstudio_reserve_ai_usage(
      '55333333-0000-4000-8000-000000000001'
    );

  if v_reservation ->> 'plan_code' <> 'monthly' then
    raise exception
      'Paid AI selected a different subscription from current-access UI';
  end if;

  perform public.zstudio_release_ai_reservation(
    '55333333-0000-4000-8000-000000000001'
  );
end;
$$;


-- ============================================================
-- 16. User D proves self-scoping
-- ============================================================

do $$
declare
  v_state jsonb;
begin
  perform set_config(
    'request.jwt.claim.sub',
    '55444444-4444-4444-8444-444444444444',
    false
  );

  v_state := public.zstudio_current_access_state();

  if (v_state ->> 'studio_access')::boolean
     or (v_state ->> 'ai_access')::boolean
     or v_state ->> 'plan_code' is not null
     or v_state ->> 'subscription_status' is not null then
    raise exception
      'User D inherited another users commercial state';
  end if;
end;
$$;


-- ============================================================
-- 17. No permanent free subscription plan
-- ============================================================

do $$
declare
  v_person uuid;
begin
  select person_id
    into v_person
  from zstudio_commercial_test_people
  where label = 'd';

  begin
    insert into studio.subscriptions (
      person_id,
      plan_code,
      status,
      billing_source
    )
    values (
      v_person,
      'free',
      'active',
      'manual'
    );

    raise exception
      'TEST_FREE_PLAN_ACCEPTED';

  exception
    when check_violation then
      null;

    when others then
      if sqlerrm = 'TEST_FREE_PLAN_ACCEPTED' then
        raise;
      end if;

      raise;
  end;
end;
$$;


-- ============================================================
-- 18. Revocation must be terminal for the same provider chain
--
-- If this fails on the first disposable execution, the migration
-- still lacks the explicit terminal-state guard. That is a real
-- contract failure and must be repaired before commit.
-- ============================================================

do $$
declare
  v_person uuid;
begin
  select person_id
    into v_person
  from zstudio_commercial_test_people
  where label = 'a';

  begin
    perform public.zstudio_apply_verified_commercial_event(
      v_person,
      'apple_app_store',
      'sandbox',
      'apple-event-a-after-revoke',
      'apple-sub-a',
      'com.zstudio.weekly',
      'activated',
      'weekly',
      'active',
      null,
      null,
      now() + interval '1 hour',
      now() + interval '8 days',
      false,
      now() + interval '1 hour'
    );

    raise exception
      'TEST_REVOKED_SUBSCRIPTION_RESURRECTED';

  exception
    when others then
      if sqlerrm = 'TEST_REVOKED_SUBSCRIPTION_RESURRECTED' then
        raise;
      end if;

      if sqlerrm <> 'COMMERCIAL_SUBSCRIPTION_REVOKED' then
        raise;
      end if;
  end;

  if not exists (
    select 1
    from studio.subscriptions s
    where s.person_id = v_person
      and s.source_subscription_ref = 'apple-sub-a'
      and s.status = 'revoked'
  ) then
    raise exception
      'Revoked subscription changed after terminality test';
  end if;
end;
$$;


-- ============================================================
-- 19. Final ledger/authority counts
-- ============================================================

do $$
begin
  if exists (
    select 1
    from studio.entitlements e
    where e.subscription_id is not null
    group by
      e.subscription_id,
      e.entitlement_code
    having count(*) > 1
  ) then
    raise exception
      'Duplicate subscription entitlement authority exists';
  end if;

  if exists (
    select 1
    from studio.billing_events e
    group by
      e.billing_source,
      e.billing_environment,
      e.source_event_ref
    having count(*) > 1
  ) then
    raise exception
      'Duplicate billing event authority exists';
  end if;
end;
$$;


select
  'ZSTUDIO_COMMERCIAL_ACTIVATION_V1_PASS'
    as result;

rollback;
