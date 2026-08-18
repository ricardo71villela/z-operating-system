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
