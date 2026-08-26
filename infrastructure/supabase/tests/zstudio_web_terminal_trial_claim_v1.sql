-- Z Studio Web terminal-trial claim authority v1
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
  v_claim_oid oid;
begin
  select to_regprocedure(
    'public.zstudio_claim_verified_web_trial_consumption(uuid,uuid,text,text,text,timestamptz)'
  )::oid
  into v_claim_oid;

  if v_claim_oid is null then
    raise exception
      'Web terminal-trial claim authority is missing';
  end if;

  if has_function_privilege(
       'anon',
       v_claim_oid,
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       v_claim_oid,
       'EXECUTE'
     ) then
    raise exception
      'Browser role can execute Web terminal-trial claim authority';
  end if;

  if not has_function_privilege(
       'service_role',
       v_claim_oid,
       'EXECUTE'
     ) then
    raise exception
      'service_role cannot execute Web terminal-trial claim authority';
  end if;
end;
$$;


-- ============================================================
-- 2. Disposable canonical Studio identity
-- ============================================================

insert into auth.users (id, email)
values (
  '55555555-5555-4555-8555-555555555555',
  'web-terminal-trial@example.test'
);

set role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '55555555-5555-4555-8555-555555555555',
  false
);

select public.zstudio_ensure_account();

reset role;


-- ============================================================
-- 3. Exact expired Web reservation + Stripe bindings fixture
-- ============================================================

do $$
declare
  v_person uuid;
begin
  select p.id
    into strict v_person
  from zos.persons p
  where p.auth_user_id =
    '55555555-5555-4555-8555-555555555555';

  perform set_config(
    'zstudio.test.web_terminal_trial_person_id',
    v_person::text,
    false
  );

  insert into studio.billing_customer_bindings (
    id,
    person_id,
    billing_source,
    billing_provider,
    billing_environment,
    source_customer_ref,
    created_at,
    updated_at
  )
  values (
    '66555555-5555-4555-8555-555555555555',
    v_person,
    'web',
    'stripe',
    'production',
    'cus_TerminalTrialAuthorityTest',
    now() - interval '2 hours',
    now() - interval '2 hours'
  );

  insert into studio.web_checkout_intents (
    id,
    person_id,
    plan_code,
    billing_environment,
    billing_customer_binding_id,
    state,
    trial_reserved,
    source_checkout_session_ref,
    intent_expires_at,
    provider_expires_at,
    created_at,
    updated_at
  )
  values (
    '77555555-5555-4555-8555-555555555555',
    v_person,
    'weekly',
    'production',
    '66555555-5555-4555-8555-555555555555',
    'session_created',
    true,
    'cs_test_TerminalTrialAuthorityTest',
    now() - interval '90 minutes',
    now() - interval '75 minutes',
    now() - interval '2 hours',
    now() - interval '2 hours'
  );

  insert into studio.production_trial_authority (
    person_id,
    state,
    reserved_billing_source,
    reservation_ref,
    reservation_expires_at,
    created_at,
    updated_at
  )
  values (
    v_person,
    'reserved',
    'web',
    '77555555-5555-4555-8555-555555555555',
    now() - interval '90 minutes',
    now() - interval '2 hours',
    now() - interval '2 hours'
  );
end;
$$;


-- ============================================================
-- 4. Wrong Stripe Customer fails closed before claim
-- ============================================================

set role service_role;

do $$
declare
  v_person uuid :=
    current_setting(
      'zstudio.test.web_terminal_trial_person_id'
    )::uuid;
begin
  begin
    perform public.zstudio_claim_verified_web_trial_consumption(
      '77555555-5555-4555-8555-555555555555',
      v_person,
      'cus_WrongTerminalTrialBinding',
      'stripe:web:subscription:sub_TerminalTrialAuthorityTest',
      'production',
      timestamptz '2026-08-20 20:00:00+00'
    );

    raise exception
      'TEST_WEB_TERMINAL_TRIAL_CUSTOMER_MISMATCH_ACCEPTED';

  exception
    when others then
      if sqlerrm =
         'TEST_WEB_TERMINAL_TRIAL_CUSTOMER_MISMATCH_ACCEPTED' then
        raise;
      end if;

      if sqlerrm <>
         'WEB_TRIAL_CONSUMPTION_CUSTOMER_BINDING_CONFLICT' then
        raise;
      end if;
  end;
end;
$$;

reset role;

do $$
declare
  v_person uuid :=
    current_setting(
      'zstudio.test.web_terminal_trial_person_id'
    )::uuid;
begin
  if not exists (
    select 1
    from studio.production_trial_authority t
    where t.person_id = v_person
      and t.state = 'reserved'
      and t.claimed_billing_source is null
      and t.claimed_source_subscription_ref is null
      and t.claimed_at is null
  ) then
    raise exception
      'Customer mismatch mutated production trial authority';
  end if;
end;
$$;


-- ============================================================
-- 5. Exact expired reservation can still be claimed safely
-- ============================================================

set role service_role;

do $$
declare
  v_person uuid :=
    current_setting(
      'zstudio.test.web_terminal_trial_person_id'
    )::uuid;
  v_result jsonb;
begin
  v_result :=
    public.zstudio_claim_verified_web_trial_consumption(
      '77555555-5555-4555-8555-555555555555',
      v_person,
      'cus_TerminalTrialAuthorityTest',
      'stripe:web:subscription:sub_TerminalTrialAuthorityTest',
      'production',
      timestamptz '2026-08-20 20:00:00+00'
    );

  if v_result ->> 'result' <> 'claimed' then
    raise exception
      'Expired exact Web trial reservation was not claimed';
  end if;
end;
$$;

reset role;

do $$
declare
  v_person uuid :=
    current_setting(
      'zstudio.test.web_terminal_trial_person_id'
    )::uuid;
begin
  if not exists (
    select 1
    from studio.production_trial_authority t
    where t.person_id = v_person
      and t.state = 'claimed'
      and t.claimed_billing_source = 'web'
      and t.claimed_source_subscription_ref =
          'stripe:web:subscription:sub_TerminalTrialAuthorityTest'
      and t.claimed_at =
          timestamptz '2026-08-20 20:00:00+00'
  ) then
    raise exception
      'Claimed Web production-trial authority is incorrect';
  end if;

  if (
    select count(*)
    from studio.subscriptions s
    where s.person_id = v_person
  ) <> 0 then
    raise exception
      'Terminal-trial claim unexpectedly created a subscription';
  end if;

  if (
    select count(*)
    from studio.entitlements e
    where e.person_id = v_person
      and e.subscription_id is not null
  ) <> 0 then
    raise exception
      'Terminal-trial claim unexpectedly granted subscription entitlements';
  end if;

  if (
    select count(*)
    from studio.billing_events e
    where e.person_id = v_person
  ) <> 0 then
    raise exception
      'Terminal-trial claim unexpectedly appended a billing event';
  end if;
end;
$$;


-- ============================================================
-- 6. Access remains denied until the commercial writer acts
-- ============================================================

set role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '55555555-5555-4555-8555-555555555555',
  false
);

do $$
declare
  v_state jsonb;
begin
  v_state := public.zstudio_current_access_state();

  if coalesce(
       (v_state ->> 'studio_access')::boolean,
       false
     )
     or coalesce(
       (v_state ->> 'ai_access')::boolean,
       false
     ) then
    raise exception
      'Terminal-trial claim granted access without commercial writer';
  end if;
end;
$$;

reset role;


-- ============================================================
-- 7. Exact duplicate is idempotent
-- ============================================================

set role service_role;

do $$
declare
  v_person uuid :=
    current_setting(
      'zstudio.test.web_terminal_trial_person_id'
    )::uuid;
  v_result jsonb;
begin
  v_result :=
    public.zstudio_claim_verified_web_trial_consumption(
      '77555555-5555-4555-8555-555555555555',
      v_person,
      'cus_TerminalTrialAuthorityTest',
      'stripe:web:subscription:sub_TerminalTrialAuthorityTest',
      'production',
      timestamptz '2026-08-20 20:00:00+00'
    );

  if v_result ->> 'result' <> 'duplicate' then
    raise exception
      'Exact terminal-trial claim duplicate was not idempotent';
  end if;
end;
$$;

reset role;


-- ============================================================
-- 8. A different subscription cannot steal claimed authority
-- ============================================================

set role service_role;

do $$
declare
  v_person uuid :=
    current_setting(
      'zstudio.test.web_terminal_trial_person_id'
    )::uuid;
begin
  begin
    perform public.zstudio_claim_verified_web_trial_consumption(
      '77555555-5555-4555-8555-555555555555',
      v_person,
      'cus_TerminalTrialAuthorityTest',
      'stripe:web:subscription:sub_DifferentTerminalTrial',
      'production',
      timestamptz '2026-08-20 20:05:00+00'
    );

    raise exception
      'TEST_WEB_TERMINAL_TRIAL_REBIND_ACCEPTED';

  exception
    when others then
      if sqlerrm =
         'TEST_WEB_TERMINAL_TRIAL_REBIND_ACCEPTED' then
        raise;
      end if;

      if sqlerrm <>
         'WEB_TRIAL_CONSUMPTION_ALREADY_CLAIMED' then
        raise;
      end if;
  end;
end;
$$;

reset role;


-- ============================================================
-- 9. Sandbox path never mutates lifetime production authority
-- ============================================================

set role service_role;

do $$
declare
  v_person uuid :=
    current_setting(
      'zstudio.test.web_terminal_trial_person_id'
    )::uuid;
  v_result jsonb;
begin
  v_result :=
    public.zstudio_claim_verified_web_trial_consumption(
      '88555555-5555-4555-8555-555555555555',
      v_person,
      'cus_SandboxIgnoredTrial',
      'stripe:web:subscription:sub_SandboxIgnoredTrial',
      'sandbox',
      timestamptz '2026-08-20 21:00:00+00'
    );

  if v_result ->> 'result' <> 'sandbox_ignored' then
    raise exception
      'Sandbox terminal-trial claim was not ignored';
  end if;
end;
$$;

reset role;

do $$
declare
  v_person uuid :=
    current_setting(
      'zstudio.test.web_terminal_trial_person_id'
    )::uuid;
begin
  if not exists (
    select 1
    from studio.production_trial_authority t
    where t.person_id = v_person
      and t.state = 'claimed'
      and t.claimed_source_subscription_ref =
          'stripe:web:subscription:sub_TerminalTrialAuthorityTest'
      and t.claimed_at =
          timestamptz '2026-08-20 20:00:00+00'
  ) then
    raise exception
      'Sandbox path mutated production trial authority';
  end if;
end;
$$;


select
  'ZSTUDIO_WEB_TERMINAL_TRIAL_POSTGRES_AUTHORITY=PASS';

rollback;
