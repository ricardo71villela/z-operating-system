-- Z Studio paid AI runtime v1 — disposable PostgreSQL verification only.

-- No commercial quota numbers may be silently seeded by the schema migration.
do $$
begin
  if exists (select 1 from studio.ai_plan_limits) then
    raise exception 'AI plan limits were unexpectedly seeded by migration';
  end if;

  if to_regclass('studio.ai_reservations') is null
     or to_regclass('studio.ai_plan_limits') is null then
    raise exception 'Paid AI runtime relation is missing';
  end if;

  if not (
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'studio' and c.relname = 'ai_reservations'
  ) then
    raise exception 'RLS is not enabled on studio.ai_reservations';
  end if;

  if not (
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'studio' and c.relname = 'ai_plan_limits'
  ) then
    raise exception 'RLS is not enabled on studio.ai_plan_limits';
  end if;

  if has_table_privilege('authenticated', 'studio.ai_plan_limits', 'SELECT')
     or has_table_privilege('authenticated', 'studio.ai_reservations', 'SELECT')
     or has_table_privilege('authenticated', 'studio.ai_reservations', 'INSERT')
     or has_table_privilege('authenticated', 'studio.ai_reservations', 'DELETE') then
    raise exception 'authenticated unexpectedly has direct paid-AI table access';
  end if;

  if has_function_privilege('anon', 'public.zstudio_reserve_ai_usage(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.zstudio_finalize_ai_usage(uuid,text,integer,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.zstudio_release_ai_reservation(uuid)', 'EXECUTE') then
    raise exception 'anon unexpectedly has paid-AI RPC execution';
  end if;

  if not has_function_privilege('authenticated', 'public.zstudio_reserve_ai_usage(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.zstudio_finalize_ai_usage(uuid,text,integer,integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.zstudio_release_ai_reservation(uuid)', 'EXECUTE') then
    raise exception 'authenticated is missing paid-AI RPC execution';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'studio'
      and table_name in ('ai_usage', 'ai_reservations')
      and column_name in ('prompt', 'prompt_text', 'system_prompt', 'user_prompt', 'content', 'request_body')
  ) then
    raise exception 'Prompt/content storage leaked into AI metering schema';
  end if;
end;
$$;

-- Create one Studio-only authenticated user and canonical identity.
insert into auth.users (id, email)
values (
  '44444444-4444-4444-8444-444444444444',
  'paid-ai@example.test'
);

set role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', false);
select public.zstudio_ensure_account();
reset role;

-- Create an active paid monthly subscription with the established ai_access entitlement.
insert into studio.subscriptions (
  id,
  person_id,
  plan_code,
  status,
  billing_source,
  current_period_start,
  current_period_end
)
select
  '44444444-aaaa-4aaa-8aaa-444444444444',
  p.id,
  'monthly',
  'active',
  'manual',
  now() - interval '1 hour',
  now() + interval '29 days'
from zos.persons p
where p.auth_user_id = '44444444-4444-4444-8444-444444444444';

insert into studio.entitlements (
  id,
  person_id,
  subscription_id,
  entitlement_code,
  status,
  source,
  starts_at,
  expires_at
)
select
  '44444444-bbbb-4bbb-8bbb-444444444444',
  p.id,
  '44444444-aaaa-4aaa-8aaa-444444444444',
  'ai_access',
  'active',
  'subscription',
  now() - interval '1 hour',
  now() + interval '29 days'
from zos.persons p
where p.auth_user_id = '44444444-4444-4444-8444-444444444444';

-- Explicit test-only quota authority. Production values are deliberately not encoded here.
insert into studio.ai_plan_limits (
  plan_code,
  trial_usage_limit,
  period_usage_limit
) values (
  'monthly', 1, 2
);

set role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', false);

-- First request reserves and finalizes exactly one append-only usage event.
select public.zstudio_reserve_ai_usage('44444444-0000-4000-8000-000000000001');
select public.zstudio_finalize_ai_usage(
  '44444444-0000-4000-8000-000000000001',
  'anthropic/claude-3-haiku',
  12,
  4
);

-- Finalization is idempotent and must not duplicate usage.
select public.zstudio_finalize_ai_usage(
  '44444444-0000-4000-8000-000000000001',
  'anthropic/claude-3-haiku',
  12,
  4
);

-- A failed provider attempt can release its operational reservation.
select public.zstudio_reserve_ai_usage('44444444-0000-4000-8000-000000000002');
select public.zstudio_release_ai_reservation('44444444-0000-4000-8000-000000000002');

-- Released capacity can be reserved again and finalized.
select public.zstudio_reserve_ai_usage('44444444-0000-4000-8000-000000000003');
select public.zstudio_finalize_ai_usage(
  '44444444-0000-4000-8000-000000000003',
  'anthropic/claude-3-haiku',
  8,
  3
);

-- Two finalized units exhaust the explicit test limit of two.
do $$
begin
  begin
    perform public.zstudio_reserve_ai_usage('44444444-0000-4000-8000-000000000004');
    raise exception 'quota overflow was unexpectedly accepted';
  exception
    when others then
      if sqlerrm <> 'AI_QUOTA_EXCEEDED' then
        raise;
      end if;
  end;
end;
$$;

reset role;

-- Verify final state and append-only authority.
do $$
begin
  if (
    select count(*)
    from studio.ai_usage u
    join zos.persons p on p.id = u.person_id
    where p.auth_user_id = '44444444-4444-4444-8444-444444444444'
  ) <> 2 then
    raise exception 'Expected exactly two finalized AI usage events';
  end if;

  if exists (
    select 1
    from studio.ai_reservations r
    join zos.persons p on p.id = r.person_id
    where p.auth_user_id = '44444444-4444-4444-8444-444444444444'
  ) then
    raise exception 'Finalized/released reservations were not cleared';
  end if;

  if has_table_privilege('service_role', 'studio.ai_usage', 'UPDATE')
     or has_table_privilege('service_role', 'studio.ai_usage', 'DELETE') then
    raise exception 'studio.ai_usage lost append-only service_role boundary';
  end if;
end;
$$;

-- Annual billing must still use a monthly AI quota window.
--
-- The annual subscription began 40 days ago, so the current AI window must be
-- exactly the second anniversary month:
--   current_period_start + 1 month
--   current_period_start + 2 months
--
-- Usage recorded in the first annual-billing month must NOT consume the
-- current month's AI capacity.
insert into auth.users (id, email)
values (
  '66666666-6666-4666-8666-666666666666',
  'annual-monthly-quota@example.test'
);

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '66666666-6666-4666-8666-666666666666',
  false
);
select public.zstudio_ensure_account();
reset role;

insert into studio.subscriptions (
  id,
  person_id,
  plan_code,
  status,
  billing_source,
  current_period_start,
  current_period_end
)
select
  '66666666-aaaa-4aaa-8aaa-666666666666',
  p.id,
  'annual',
  'active',
  'manual',
  date_trunc('second', now() - interval '40 days'),
  date_trunc('second', now() + interval '325 days')
from zos.persons p
where p.auth_user_id = '66666666-6666-4666-8666-666666666666';

insert into studio.entitlements (
  id,
  person_id,
  subscription_id,
  entitlement_code,
  status,
  source,
  starts_at,
  expires_at
)
select
  '66666666-bbbb-4bbb-8bbb-666666666666',
  p.id,
  '66666666-aaaa-4aaa-8aaa-666666666666',
  'ai_access',
  'active',
  'subscription',
  now() - interval '40 days',
  now() + interval '325 days'
from zos.persons p
where p.auth_user_id = '66666666-6666-4666-8666-666666666666';

insert into studio.ai_plan_limits (
  plan_code,
  trial_usage_limit,
  period_usage_limit
) values (
  'annual', 1, 2
);

-- Simulate one finalized usage unit in the PREVIOUS annual-billing month.
-- It is intentionally inside the annual billing period but outside the
-- current monthly AI quota period.
insert into studio.ai_usage (
  person_id,
  subscription_id,
  entitlement_id,
  request_id,
  usage_units,
  model,
  input_tokens,
  output_tokens,
  created_at
)
select
  p.id,
  s.id,
  e.id,
  '66666666-0000-4000-8000-000000000001',
  1,
  'test/previous-month',
  1,
  1,
  s.current_period_start + interval '5 days'
from zos.persons p
join studio.subscriptions s
  on s.person_id = p.id
join studio.entitlements e
  on e.subscription_id = s.id
 and e.person_id = p.id
where p.auth_user_id = '66666666-6666-4666-8666-666666666666'
  and s.id = '66666666-aaaa-4aaa-8aaa-666666666666';

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '66666666-6666-4666-8666-666666666666',
  false
);

-- Previous-month usage must not consume the current monthly allowance.
do $$
declare
  v_result jsonb;
begin
  select public.zstudio_reserve_ai_usage(
    '66666666-0000-4000-8000-000000000011'
  )
  into v_result;

  if (v_result ->> 'plan_code') <> 'annual' then
    raise exception 'Annual quota reservation returned wrong plan';
  end if;

  if (v_result ->> 'used_units')::integer <> 0 then
    raise exception
      'Previous annual-billing-month usage leaked into current AI quota month';
  end if;

  if (v_result ->> 'remaining_units')::integer <> 1 then
    raise exception
      'Annual monthly AI quota did not reserve against the expected limit';
  end if;
end;
$$;

reset role;

-- The persisted reservation itself is the quota-window authority.
do $$
begin
  if not exists (
    select 1
    from studio.ai_reservations r
    join studio.subscriptions s
      on s.id = r.subscription_id
    where r.request_id = '66666666-0000-4000-8000-000000000011'
      and r.period_start = (
        (
          s.current_period_start at time zone 'UTC'
        ) + interval '1 month'
      ) at time zone 'UTC'
      and r.period_end = (
        (
          s.current_period_start at time zone 'UTC'
        ) + interval '2 months'
      ) at time zone 'UTC'
  ) then
    raise exception
      'Annual AI quota window is not monthly and anniversary-anchored';
  end if;
end;
$$;

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '66666666-6666-4666-8666-666666666666',
  false
);

-- First current-month unit.
select public.zstudio_finalize_ai_usage(
  '66666666-0000-4000-8000-000000000011',
  'test/current-month',
  1,
  1
);

-- Second current-month unit consumes the remainder of this monthly window.
select public.zstudio_reserve_ai_usage(
  '66666666-0000-4000-8000-000000000012'
);
select public.zstudio_finalize_ai_usage(
  '66666666-0000-4000-8000-000000000012',
  'test/current-month',
  1,
  1
);

-- Third unit in the SAME anniversary month must be rejected.
do $$
begin
  begin
    perform public.zstudio_reserve_ai_usage(
      '66666666-0000-4000-8000-000000000013'
    );
    raise exception
      'Annual monthly AI quota overflow was unexpectedly accepted';
  exception
    when others then
      if sqlerrm <> 'AI_QUOTA_EXCEEDED' then
        raise;
      end if;
  end;
end;
$$;

reset role;

-- Prove that annual billing persisted while quota accounting was monthly.
do $$
begin
  if (
    select count(*)
    from studio.ai_usage u
    where u.subscription_id =
      '66666666-aaaa-4aaa-8aaa-666666666666'
  ) <> 3 then
    raise exception
      'Expected one previous-month plus two current-month annual usage events';
  end if;

  if (
    select count(*)
    from studio.ai_usage u
    join studio.subscriptions s
      on s.id = u.subscription_id
    where s.id = '66666666-aaaa-4aaa-8aaa-666666666666'
      and u.created_at >= (
        (
          s.current_period_start at time zone 'UTC'
        ) + interval '1 month'
      ) at time zone 'UTC'
      and u.created_at < (
        (
          s.current_period_start at time zone 'UTC'
        ) + interval '2 months'
      ) at time zone 'UTC'
  ) <> 2 then
    raise exception
      'Annual current AI quota month did not contain exactly two finalized units';
  end if;
end;
$$;

-- A paid entitlement without an explicit quota configuration must fail closed.
insert into auth.users (id, email)
values (
  '55555555-5555-4555-8555-555555555555',
  'quota-missing@example.test'
);

set role authenticated;
select set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', false);
select public.zstudio_ensure_account();
reset role;

insert into studio.subscriptions (
  id,
  person_id,
  plan_code,
  status,
  billing_source,
  current_period_start,
  current_period_end
)
select
  '55555555-aaaa-4aaa-8aaa-555555555555',
  p.id,
  'weekly',
  'active',
  'manual',
  now() - interval '1 hour',
  now() + interval '6 days'
from zos.persons p
where p.auth_user_id = '55555555-5555-4555-8555-555555555555';

insert into studio.entitlements (
  id,
  person_id,
  subscription_id,
  entitlement_code,
  status,
  source,
  starts_at,
  expires_at
)
select
  '55555555-bbbb-4bbb-8bbb-555555555555',
  p.id,
  '55555555-aaaa-4aaa-8aaa-555555555555',
  'ai_access',
  'active',
  'subscription',
  now() - interval '1 hour',
  now() + interval '6 days'
from zos.persons p
where p.auth_user_id = '55555555-5555-4555-8555-555555555555';

set role authenticated;
select set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', false);

do $$
begin
  begin
    perform public.zstudio_reserve_ai_usage('55555555-0000-4000-8000-000000000001');
    raise exception 'missing quota configuration unexpectedly allowed AI usage';
  exception
    when others then
      if sqlerrm <> 'AI_QUOTA_NOT_CONFIGURED' then
        raise;
      end if;
  end;
end;
$$;

reset role;
