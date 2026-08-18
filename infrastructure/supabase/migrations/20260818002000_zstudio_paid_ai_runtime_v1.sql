-- ============================================================
-- Z Studio — paid AI runtime authority v1
-- ============================================================
-- Adds server-controlled plan quota configuration plus short-lived atomic
-- reservations. Successful provider calls are finalized into append-only
-- studio.ai_usage; failed calls release their reservation.
--
-- Approved launch quota authority is seeded server-side:
--   trial:   10 AI units total during the introductory trial
--   weekly:  50 AI units per weekly billing period
--   monthly: 250 AI units per monthly billing period
--   annual:  250 AI units per monthly AI quota window while billing remains annual
-- Missing/removed plan configuration still fails closed with
-- AI_QUOTA_NOT_CONFIGURED. There is no free or unlimited fallback.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Server-controlled quota authority
-- ------------------------------------------------------------

create table studio.ai_plan_limits (
  plan_code text primary key check (plan_code in ('weekly', 'monthly', 'annual')),
  trial_usage_limit integer not null check (trial_usage_limit > 0),
  period_usage_limit integer not null check (period_usage_limit > 0),
  updated_at timestamptz not null default now()
);

comment on table studio.ai_plan_limits is
'Server-controlled Z Studio AI quota authority. Approved launch limits: trial 10 total units; weekly 50 per week; monthly 250 per month; annual 250 per monthly AI quota window. No permanent free or unlimited plan exists.';

alter table studio.ai_plan_limits enable row level security;

revoke all on studio.ai_plan_limits
from public, anon, authenticated;

grant select, insert, update, delete
on studio.ai_plan_limits
to service_role;

-- Approved Z Studio launch quota authority.
-- Trial duration itself remains subscription authority
-- (trial_started_at -> trial_ends_at); this table governs AI units.
insert into studio.ai_plan_limits (
  plan_code,
  trial_usage_limit,
  period_usage_limit
) values
  ('weekly',  10,  50),
  ('monthly', 10, 250),
  ('annual',  10, 250);


-- ------------------------------------------------------------
-- 2. Short-lived usage reservations
-- ------------------------------------------------------------

create table studio.ai_reservations (
  request_id uuid primary key,
  person_id uuid not null references zos.persons(id) on delete restrict,
  subscription_id uuid not null references studio.subscriptions(id) on delete restrict,
  entitlement_id uuid not null references studio.entitlements(id) on delete restrict,
  plan_code text not null check (plan_code in ('weekly', 'monthly', 'annual')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  usage_units integer not null default 1 check (usage_units > 0),
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  check (period_end > period_start),
  check (expires_at > reserved_at)
);

comment on table studio.ai_reservations is
'Short-lived atomic Z Studio AI quota reservations. Reservations are mutable operational state; finalized usage remains append-only in studio.ai_usage.';

create index idx_studio_ai_reservations_scope
  on studio.ai_reservations(person_id, subscription_id, period_start, period_end, expires_at);

alter table studio.ai_reservations enable row level security;

revoke all on studio.ai_reservations
from public, anon, authenticated;

grant select, insert, delete
on studio.ai_reservations
to service_role;


-- ------------------------------------------------------------
-- 3. Atomic authenticated reservation boundary
-- ------------------------------------------------------------

create function public.zstudio_reserve_ai_usage(
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_person_id uuid;
  v_subscription_id uuid;
  v_entitlement_id uuid;
  v_plan_code text;
  v_subscription_status text;
  v_billing_period_start timestamptz;
  v_billing_period_end timestamptz;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_annual_month_offset integer;
  v_limit integer;
  v_used integer := 0;
  v_reserved integer := 0;
  v_existing studio.ai_reservations%rowtype;
begin
  if v_auth_user_id is null then
    raise exception 'authentication required'
      using errcode = '28000';
  end if;

  if p_request_id is null then
    raise exception 'request id is required'
      using errcode = '22004';
  end if;

  select
    p.id,
    s.id,
    e.id,
    s.plan_code,
    s.status,
    case when s.status = 'trialing' then s.trial_started_at else s.current_period_start end,
    case when s.status = 'trialing' then s.trial_ends_at else s.current_period_end end
  into
    v_person_id,
    v_subscription_id,
    v_entitlement_id,
    v_plan_code,
    v_subscription_status,
    v_billing_period_start,
    v_billing_period_end
  from zos.persons p
  join studio.entitlements e
    on e.person_id = p.id
  join studio.subscriptions s
    on s.id = e.subscription_id
   and s.person_id = p.id
  where p.auth_user_id = v_auth_user_id
    and e.entitlement_code = 'ai_access'
    and e.status in ('active', 'grace')
    and e.starts_at <= now()
    and (e.expires_at is null or e.expires_at > now())
    and s.status in ('trialing', 'active', 'grace')
    and (
      (
        s.status = 'trialing'
        and s.trial_started_at is not null
        and s.trial_ends_at is not null
        and s.trial_started_at <= now()
        and s.trial_ends_at > now()
      )
      or
      (
        s.status in ('active', 'grace')
        and s.current_period_start is not null
        and s.current_period_end is not null
        and s.current_period_start <= now()
        and s.current_period_end > now()
      )
    )
  order by
    case s.status when 'active' then 1 when 'trialing' then 2 when 'grace' then 3 else 4 end,
    coalesce(s.current_period_end, s.trial_ends_at) desc,
    s.created_at desc
  limit 1;

  if v_person_id is null then
    raise exception 'AI_ENTITLEMENT_REQUIRED'
      using errcode = 'P0001';
  end if;

  -- Billing cadence and AI quota cadence are separate authorities.
  --
  -- trialing:
  --   one quota window for the complete trial
  --
  -- weekly/monthly:
  --   the Store billing period is also the AI quota window
  --
  -- annual:
  --   billing remains annual, but AI quota resets monthly on the
  --   subscription anniversary anchored to current_period_start.
  if v_subscription_status = 'trialing' then
    v_period_start := v_billing_period_start;
    v_period_end := v_billing_period_end;

  elsif v_plan_code = 'annual' then
    -- Calculate the current anniversary month in UTC so database/session
    -- timezone changes cannot move an AI quota boundary.
    v_annual_month_offset := greatest(
      0,
      (
        (
          extract(year from (now() at time zone 'UTC'))::integer
          - extract(
              year from (v_billing_period_start at time zone 'UTC')
            )::integer
        ) * 12
        +
        (
          extract(month from (now() at time zone 'UTC'))::integer
          - extract(
              month from (v_billing_period_start at time zone 'UTC')
            )::integer
        )
      )
    );

    v_period_start := (
      (
        v_billing_period_start at time zone 'UTC'
      ) + make_interval(months => v_annual_month_offset)
    ) at time zone 'UTC';

    -- Before the anniversary clock time on a candidate boundary day,
    -- the caller still belongs to the previous quota month.
    if v_period_start > now() then
      v_annual_month_offset := greatest(v_annual_month_offset - 1, 0);

      v_period_start := (
        (
          v_billing_period_start at time zone 'UTC'
        ) + make_interval(months => v_annual_month_offset)
      ) at time zone 'UTC';
    end if;

    v_period_end := least(
      v_billing_period_end,
      (
        (
          v_billing_period_start at time zone 'UTC'
        ) + make_interval(months => v_annual_month_offset + 1)
      ) at time zone 'UTC'
    );

  else
    v_period_start := v_billing_period_start;
    v_period_end := v_billing_period_end;
  end if;

  select
    case
      when v_subscription_status = 'trialing' then l.trial_usage_limit
      else l.period_usage_limit
    end
  into v_limit
  from studio.ai_plan_limits l
  where l.plan_code = v_plan_code;

  if v_limit is null then
    raise exception 'AI_QUOTA_NOT_CONFIGURED'
      using errcode = 'P0001';
  end if;

  -- Serialize quota accounting for this person + exact AI quota/trial window.
  perform pg_advisory_xact_lock(
    hashtextextended(
      v_person_id::text || ':' || v_period_start::text || ':' || v_period_end::text,
      0
    )
  );

  -- Expired reservations are not usage and must not consume future capacity.
  delete from studio.ai_reservations r
  where r.person_id = v_person_id
    and r.expires_at <= now();

  select r.*
    into v_existing
  from studio.ai_reservations r
  where r.request_id = p_request_id;

  if found then
    if v_existing.person_id <> v_person_id then
      raise exception 'AI_REQUEST_ID_CONFLICT'
        using errcode = '23505';
    end if;

    if v_existing.subscription_id <> v_subscription_id
       or v_existing.period_start <> v_period_start
       or v_existing.period_end <> v_period_end then
      raise exception 'AI_RESERVATION_SCOPE_CONFLICT'
        using errcode = '23514';
    end if;

    select coalesce(sum(u.usage_units), 0)::integer
      into v_used
    from studio.ai_usage u
    where u.person_id = v_person_id
      and u.subscription_id = v_subscription_id
      and u.created_at >= v_period_start
      and u.created_at < v_period_end;

    select coalesce(sum(r.usage_units), 0)::integer
      into v_reserved
    from studio.ai_reservations r
    where r.person_id = v_person_id
      and r.subscription_id = v_subscription_id
      and r.period_start = v_period_start
      and r.period_end = v_period_end
      and r.expires_at > now();

    return jsonb_build_object(
      'plan_code', v_plan_code,
      'subscription_status', v_subscription_status,
      'limit_units', v_limit,
      'used_units', v_used,
      'reserved_units', v_reserved,
      'remaining_units', greatest(v_limit - v_used - v_reserved, 0)
    );
  end if;

  if exists (
    select 1
    from studio.ai_usage u
    where u.request_id = p_request_id
  ) then
    raise exception 'AI_REQUEST_ALREADY_FINALIZED'
      using errcode = '23505';
  end if;

  select coalesce(sum(u.usage_units), 0)::integer
    into v_used
  from studio.ai_usage u
  where u.person_id = v_person_id
    and u.subscription_id = v_subscription_id
    and u.created_at >= v_period_start
    and u.created_at < v_period_end;

  select coalesce(sum(r.usage_units), 0)::integer
    into v_reserved
  from studio.ai_reservations r
  where r.person_id = v_person_id
    and r.subscription_id = v_subscription_id
    and r.period_start = v_period_start
    and r.period_end = v_period_end
    and r.expires_at > now();

  if v_used + v_reserved + 1 > v_limit then
    raise exception 'AI_QUOTA_EXCEEDED'
      using errcode = 'P0001';
  end if;

  insert into studio.ai_reservations (
    request_id,
    person_id,
    subscription_id,
    entitlement_id,
    plan_code,
    period_start,
    period_end,
    usage_units
  ) values (
    p_request_id,
    v_person_id,
    v_subscription_id,
    v_entitlement_id,
    v_plan_code,
    v_period_start,
    v_period_end,
    1
  );

  return jsonb_build_object(
    'plan_code', v_plan_code,
    'subscription_status', v_subscription_status,
    'limit_units', v_limit,
    'used_units', v_used,
    'reserved_units', v_reserved + 1,
    'remaining_units', greatest(v_limit - v_used - v_reserved - 1, 0)
  );
end;
$$;

comment on function public.zstudio_reserve_ai_usage(uuid) is
'Atomically reserves one metered AI usage unit for the authenticated Z Studio user after validating active ai_access entitlement, paid/trial plan validity and server-controlled plan quota.';


-- ------------------------------------------------------------
-- 4. Finalize successful usage into append-only authority
-- ------------------------------------------------------------

create function public.zstudio_finalize_ai_usage(
  p_request_id uuid,
  p_model text default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_person_id uuid;
  v_reservation studio.ai_reservations%rowtype;
begin
  if v_auth_user_id is null then
    raise exception 'authentication required'
      using errcode = '28000';
  end if;

  if p_request_id is null then
    raise exception 'request id is required'
      using errcode = '22004';
  end if;

  if p_input_tokens is not null and p_input_tokens < 0 then
    raise exception 'input tokens must be non-negative'
      using errcode = '22023';
  end if;

  if p_output_tokens is not null and p_output_tokens < 0 then
    raise exception 'output tokens must be non-negative'
      using errcode = '22023';
  end if;

  if p_model is not null and length(p_model) > 200 then
    raise exception 'model identifier is too long'
      using errcode = '22023';
  end if;

  select p.id
    into v_person_id
  from zos.persons p
  where p.auth_user_id = v_auth_user_id;

  if v_person_id is null then
    raise exception 'AI_IDENTITY_REQUIRED'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from studio.ai_usage u
    where u.request_id = p_request_id
      and u.person_id = v_person_id
  ) then
    return true;
  end if;

  select r.*
    into v_reservation
  from studio.ai_reservations r
  where r.request_id = p_request_id
    and r.person_id = v_person_id
  for update;

  if not found then
    raise exception 'AI_RESERVATION_REQUIRED'
      using errcode = 'P0001';
  end if;

  if v_reservation.expires_at <= now() then
    raise exception 'AI_RESERVATION_EXPIRED'
      using errcode = 'P0001';
  end if;

  insert into studio.ai_usage (
    person_id,
    subscription_id,
    entitlement_id,
    request_id,
    usage_units,
    model,
    input_tokens,
    output_tokens
  ) values (
    v_reservation.person_id,
    v_reservation.subscription_id,
    v_reservation.entitlement_id,
    v_reservation.request_id,
    v_reservation.usage_units,
    nullif(trim(p_model), ''),
    p_input_tokens,
    p_output_tokens
  );

  delete from studio.ai_reservations r
  where r.request_id = p_request_id
    and r.person_id = v_person_id;

  return true;
end;
$$;

comment on function public.zstudio_finalize_ai_usage(uuid, text, integer, integer) is
'Finalizes one authenticated caller AI reservation into append-only studio.ai_usage and removes only the corresponding operational reservation.';


-- ------------------------------------------------------------
-- 5. Release failed provider attempts
-- ------------------------------------------------------------

create function public.zstudio_release_ai_reservation(
  p_request_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_person_id uuid;
  v_deleted integer;
begin
  if v_auth_user_id is null then
    raise exception 'authentication required'
      using errcode = '28000';
  end if;

  if p_request_id is null then
    raise exception 'request id is required'
      using errcode = '22004';
  end if;

  select p.id
    into v_person_id
  from zos.persons p
  where p.auth_user_id = v_auth_user_id;

  if v_person_id is null then
    return false;
  end if;

  delete from studio.ai_reservations r
  where r.request_id = p_request_id
    and r.person_id = v_person_id;

  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

comment on function public.zstudio_release_ai_reservation(uuid) is
'Releases only the authenticated caller short-lived AI reservation after a provider attempt fails. Finalized studio.ai_usage remains append-only.';


-- ------------------------------------------------------------
-- 6. RPC execution boundary
-- ------------------------------------------------------------

revoke all on function public.zstudio_reserve_ai_usage(uuid)
from public, anon, authenticated, service_role;

revoke all on function public.zstudio_finalize_ai_usage(uuid, text, integer, integer)
from public, anon, authenticated, service_role;

revoke all on function public.zstudio_release_ai_reservation(uuid)
from public, anon, authenticated, service_role;

grant execute on function public.zstudio_reserve_ai_usage(uuid)
to authenticated;

grant execute on function public.zstudio_finalize_ai_usage(uuid, text, integer, integer)
to authenticated;

grant execute on function public.zstudio_release_ai_reservation(uuid)
to authenticated;
