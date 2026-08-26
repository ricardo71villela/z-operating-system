-- ============================================================
-- Z Studio — commercial activation authority v1
-- ============================================================
--
-- Provider-neutral, server-only authority for applying already verified
-- Apple / Google / web commercial state to Z Studio.
--
-- Invariants:
--   * browser roles never write subscriptions / entitlements
--   * a store subscription can never be rebound to another ZOS person
--   * one verified event is idempotent
--   * conflicting duplicate events fail closed
--   * stale events cannot regress newer commercial authority
--   * subscription + studio_access + ai_access change atomically
--   * raw receipts / purchase tokens / signed store payloads are not stored
--   * Paid AI quota authority remains unchanged
-- ============================================================


-- ------------------------------------------------------------
-- 1. Extend subscription store authority
-- ------------------------------------------------------------

alter table studio.subscriptions
  add column source_product_ref text,
  add column billing_environment text not null default 'production',
  add column store_event_high_water_at timestamptz,
  add column last_store_event_at timestamptz,
  add column last_store_event_ref text,
  add column last_store_event_type text;

alter table studio.subscriptions
  add constraint subscriptions_billing_environment_check
  check (billing_environment in ('sandbox', 'production'));

drop index if exists studio.uq_studio_subscriptions_source_ref;

create unique index uq_studio_subscriptions_source_authority
on studio.subscriptions (
  billing_source,
  billing_environment,
  source_subscription_ref
)
where source_subscription_ref is not null;

comment on column studio.subscriptions.source_product_ref is
'Verified provider product identifier for the current subscription snapshot.';

comment on column studio.subscriptions.billing_environment is
'Commercial provider environment: sandbox or production. Environment separation remains a deployment/runtime responsibility; this column provides domain identity and auditability.';

comment on column studio.subscriptions.store_event_high_water_at is
'Monotonic ordering high-water mark for verified provider events. It never moves backwards, including when a retroactive revocation is applied.';

comment on column studio.subscriptions.last_store_event_at is
'Effective timestamp of the latest verified provider event actually applied to this subscription.';

comment on column studio.subscriptions.last_store_event_ref is
'Provider event identifier of the latest verified event applied to this subscription.';

comment on column studio.subscriptions.last_store_event_type is
'Provider-neutral normalized type of the latest verified event applied to this subscription.';


-- ------------------------------------------------------------
-- 2. Prevent duplicate subscription-derived entitlements
-- ------------------------------------------------------------

create unique index uq_studio_entitlements_subscription_code
on studio.entitlements (
  subscription_id,
  entitlement_code
)
where subscription_id is not null;


-- ------------------------------------------------------------
-- 3. Append-only normalized billing event ledger
-- ------------------------------------------------------------

create table studio.billing_events (
  id uuid primary key default gen_random_uuid(),

  billing_source text not null
    check (
      billing_source in (
        'manual',
        'web',
        'apple_app_store',
        'google_play'
      )
    ),

  billing_environment text not null
    check (
      billing_environment in (
        'sandbox',
        'production'
      )
    ),

  source_event_ref text not null,
  source_subscription_ref text not null,
  source_product_ref text not null,

  person_id uuid not null
    references zos.persons(id)
    on delete restrict,

  subscription_id uuid not null
    references studio.subscriptions(id)
    on delete restrict,

  event_type text not null
    check (
      event_type in (
        'trial_started',
        'activated',
        'renewed',
        'grace_started',
        'past_due',
        'recovered',
        'renewal_disabled',
        'expired',
        'revoked',
        'restored'
      )
    ),

  target_plan_code text not null
    check (
      target_plan_code in (
        'weekly',
        'monthly',
        'annual'
      )
    ),

  target_status text not null
    check (
      target_status in (
        'trialing',
        'active',
        'grace',
        'past_due',
        'cancelled',
        'expired',
        'revoked'
      )
    ),

  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null,

  effective_at timestamptz not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz not null default now(),

  processing_status text not null
    check (
      processing_status in (
        'applied',
        'ignored_stale'
      )
    ),

  created_at timestamptz not null default now(),

  check (
    trial_ends_at is null
    or trial_started_at is null
    or trial_ends_at > trial_started_at
  ),

  check (
    current_period_end is null
    or current_period_start is null
    or current_period_end > current_period_start
  )
);

create unique index uq_studio_billing_events_source_event
on studio.billing_events (
  billing_source,
  billing_environment,
  source_event_ref
);

create index idx_studio_billing_events_subscription_effective
on studio.billing_events (
  subscription_id,
  effective_at desc
);

alter table studio.billing_events enable row level security;

revoke all on studio.billing_events
from public, anon, authenticated;

grant select, insert
on studio.billing_events
to service_role;

comment on table studio.billing_events is
'Append-only ledger of normalized Z Studio commercial events after provider verification. Raw receipts, purchase tokens and signed provider payloads must not be stored here.';


-- ------------------------------------------------------------
-- 4. Server-only atomic commercial event application
-- ------------------------------------------------------------
--
-- Public schema is intentional: the server runtime can call this through the
-- normal Supabase RPC boundary without exposing the private studio schema.
-- Execution remains service_role-only.
-- ------------------------------------------------------------

create function public.zstudio_apply_verified_commercial_event(
  p_person_id uuid,
  p_billing_source text,
  p_billing_environment text,
  p_source_event_ref text,
  p_source_subscription_ref text,
  p_source_product_ref text,
  p_event_type text,
  p_plan_code text,
  p_status text,
  p_trial_started_at timestamptz,
  p_trial_ends_at timestamptz,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_effective_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_billing_source text;
  v_billing_environment text;
  v_source_event_ref text;
  v_source_subscription_ref text;
  v_source_product_ref text;
  v_event_type text;
  v_plan_code text;
  v_status text;

  v_existing_event studio.billing_events%rowtype;
  v_subscription studio.subscriptions%rowtype;

  v_subscription_created boolean := false;
  v_same_snapshot boolean := false;

  v_entitlement_status text;
  v_access_start timestamptz;
  v_access_end timestamptz;
begin
  if p_person_id is null then
    raise exception 'COMMERCIAL_PERSON_REQUIRED'
      using errcode = '22004';
  end if;

  if not exists (
    select 1
    from zos.persons p
    where p.id = p_person_id
  ) then
    raise exception 'COMMERCIAL_PERSON_NOT_FOUND'
      using errcode = '23503';
  end if;

  v_billing_source :=
    lower(trim(coalesce(p_billing_source, '')));

  v_billing_environment :=
    lower(trim(coalesce(p_billing_environment, '')));

  v_source_event_ref :=
    trim(coalesce(p_source_event_ref, ''));

  v_source_subscription_ref :=
    trim(coalesce(p_source_subscription_ref, ''));

  v_source_product_ref :=
    trim(coalesce(p_source_product_ref, ''));

  v_event_type :=
    lower(trim(coalesce(p_event_type, '')));

  v_plan_code :=
    lower(trim(coalesce(p_plan_code, '')));

  v_status :=
    lower(trim(coalesce(p_status, '')));

  if v_billing_source not in (
    'manual',
    'web',
    'apple_app_store',
    'google_play'
  ) then
    raise exception 'COMMERCIAL_BILLING_SOURCE_INVALID'
      using errcode = '22023';
  end if;

  if v_billing_environment not in (
    'sandbox',
    'production'
  ) then
    raise exception 'COMMERCIAL_BILLING_ENVIRONMENT_INVALID'
      using errcode = '22023';
  end if;

  if v_source_event_ref = '' then
    raise exception 'COMMERCIAL_EVENT_REF_REQUIRED'
      using errcode = '22004';
  end if;

  if v_source_subscription_ref = '' then
    raise exception 'COMMERCIAL_SUBSCRIPTION_REF_REQUIRED'
      using errcode = '22004';
  end if;

  if v_source_product_ref = '' then
    raise exception 'COMMERCIAL_PRODUCT_REF_REQUIRED'
      using errcode = '22004';
  end if;

  if v_event_type not in (
    'trial_started',
    'activated',
    'renewed',
    'grace_started',
    'past_due',
    'recovered',
    'renewal_disabled',
    'expired',
    'revoked',
    'restored'
  ) then
    raise exception 'COMMERCIAL_EVENT_TYPE_INVALID'
      using errcode = '22023';
  end if;

  if v_plan_code not in (
    'weekly',
    'monthly',
    'annual'
  ) then
    raise exception 'COMMERCIAL_PLAN_INVALID'
      using errcode = '22023';
  end if;

  if v_status not in (
    'trialing',
    'active',
    'grace',
    'past_due',
    'cancelled',
    'expired',
    'revoked'
  ) then
    raise exception 'COMMERCIAL_STATUS_INVALID'
      using errcode = '22023';
  end if;

  if p_effective_at is null then
    raise exception 'COMMERCIAL_EFFECTIVE_AT_REQUIRED'
      using errcode = '22004';
  end if;

  if p_cancel_at_period_end is null then
    raise exception 'COMMERCIAL_CANCEL_STATE_REQUIRED'
      using errcode = '22004';
  end if;

  if v_status = 'trialing' then
    if p_trial_started_at is null
       or p_trial_ends_at is null
       or p_trial_ends_at <= p_trial_started_at then
      raise exception 'COMMERCIAL_TRIAL_WINDOW_INVALID'
        using errcode = '22023';
    end if;
  end if;

  if v_status in ('active', 'grace') then
    if p_current_period_start is null
       or p_current_period_end is null
       or p_current_period_end <= p_current_period_start then
      raise exception 'COMMERCIAL_PERIOD_WINDOW_INVALID'
        using errcode = '22023';
    end if;
  end if;

  if v_event_type = 'trial_started'
     and v_status <> 'trialing' then
    raise exception 'COMMERCIAL_TRIAL_EVENT_STATUS_INVALID'
      using errcode = '22023';
  end if;

  if v_event_type in (
       'activated',
       'renewed',
       'recovered'
     )
     and v_status <> 'active' then
    raise exception 'COMMERCIAL_ACTIVE_EVENT_STATUS_INVALID'
      using errcode = '22023';
  end if;

  if v_event_type = 'grace_started'
     and v_status <> 'grace' then
    raise exception 'COMMERCIAL_GRACE_EVENT_STATUS_INVALID'
      using errcode = '22023';
  end if;

  if v_event_type = 'past_due'
     and v_status <> 'past_due' then
    raise exception 'COMMERCIAL_PAST_DUE_EVENT_STATUS_INVALID'
      using errcode = '22023';
  end if;

  if v_event_type = 'renewal_disabled' then
    if v_status not in ('active', 'grace')
       or not p_cancel_at_period_end then
      raise exception 'COMMERCIAL_RENEWAL_DISABLED_STATE_INVALID'
        using errcode = '22023';
    end if;
  end if;

  if v_event_type = 'expired'
     and v_status <> 'expired' then
    raise exception 'COMMERCIAL_EXPIRED_EVENT_STATUS_INVALID'
      using errcode = '22023';
  end if;

  if v_event_type = 'revoked'
     and v_status <> 'revoked' then
    raise exception 'COMMERCIAL_REVOKED_EVENT_STATUS_INVALID'
      using errcode = '22023';
  end if;

  -- Serialize the provider event id first. This protects conflicting concurrent
  -- deliveries that reuse the same provider event identifier.
  perform pg_advisory_xact_lock(
    hashtextextended(
      v_billing_source
      || ':'
      || v_billing_environment
      || ':event:'
      || v_source_event_ref,
      0
    )
  );

  select e.*
    into v_existing_event
  from studio.billing_events e
  where e.billing_source = v_billing_source
    and e.billing_environment = v_billing_environment
    and e.source_event_ref = v_source_event_ref;

  if found then
    if v_existing_event.person_id = p_person_id
       and v_existing_event.source_subscription_ref = v_source_subscription_ref
       and v_existing_event.source_product_ref = v_source_product_ref
       and v_existing_event.event_type = v_event_type
       and v_existing_event.target_plan_code = v_plan_code
       and v_existing_event.target_status = v_status
       and v_existing_event.trial_started_at
             is not distinct from p_trial_started_at
       and v_existing_event.trial_ends_at
             is not distinct from p_trial_ends_at
       and v_existing_event.current_period_start
             is not distinct from p_current_period_start
       and v_existing_event.current_period_end
             is not distinct from p_current_period_end
       and v_existing_event.cancel_at_period_end
             = p_cancel_at_period_end
       and v_existing_event.effective_at
             = p_effective_at then

      return jsonb_build_object(
        'result', 'duplicate',
        'subscription_id', v_existing_event.subscription_id,
        'processing_status', v_existing_event.processing_status
      );
    end if;

    raise exception 'COMMERCIAL_EVENT_CONFLICT'
      using errcode = '23505';
  end if;

  -- Serialize all state transitions for one exact provider subscription.
  perform pg_advisory_xact_lock(
    hashtextextended(
      v_billing_source
      || ':'
      || v_billing_environment
      || ':subscription:'
      || v_source_subscription_ref,
      0
    )
  );

  select s.*
    into v_subscription
  from studio.subscriptions s
  where s.billing_source = v_billing_source
    and s.billing_environment = v_billing_environment
    and s.source_subscription_ref = v_source_subscription_ref
  for update;

  if found then
    if v_subscription.person_id <> p_person_id then
      raise exception 'COMMERCIAL_SUBSCRIPTION_IDENTITY_CONFLICT'
        using errcode = '23514';
    end if;

    -- A verified provider revocation is terminal for this exact provider
    -- subscription chain. Exact duplicate events were already resolved above;
    -- additional revocation authority may be recorded, but no later active,
    -- trial, grace, recovery or restore event may resurrect the same chain.
    if v_subscription.status = 'revoked'
       and v_event_type <> 'revoked' then
      raise exception 'COMMERCIAL_SUBSCRIPTION_REVOKED'
        using errcode = '23514';
    end if;
  else
    insert into studio.subscriptions (
      person_id,
      plan_code,
      status,
      billing_source,
      source_subscription_ref,
      source_product_ref,
      billing_environment,
      trial_started_at,
      trial_ends_at,
      current_period_start,
      current_period_end,
      cancel_at_period_end
    )
    values (
      p_person_id,
      v_plan_code,
      v_status,
      v_billing_source,
      v_source_subscription_ref,
      v_source_product_ref,
      v_billing_environment,
      p_trial_started_at,
      p_trial_ends_at,
      p_current_period_start,
      p_current_period_end,
      p_cancel_at_period_end
    )
    returning *
      into v_subscription;

    v_subscription_created := true;
  end if;

  -- Revocation is terminal provider authority and is allowed to override an
  -- older effective timestamp. Other stale events are recorded but cannot
  -- regress the current subscription or entitlements.
  if not v_subscription_created
     and v_event_type <> 'revoked'
     and v_subscription.store_event_high_water_at is not null
     and p_effective_at < v_subscription.store_event_high_water_at then

    insert into studio.billing_events (
      billing_source,
      billing_environment,
      source_event_ref,
      source_subscription_ref,
      source_product_ref,
      person_id,
      subscription_id,
      event_type,
      target_plan_code,
      target_status,
      trial_started_at,
      trial_ends_at,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      effective_at,
      processing_status
    )
    values (
      v_billing_source,
      v_billing_environment,
      v_source_event_ref,
      v_source_subscription_ref,
      v_source_product_ref,
      p_person_id,
      v_subscription.id,
      v_event_type,
      v_plan_code,
      v_status,
      p_trial_started_at,
      p_trial_ends_at,
      p_current_period_start,
      p_current_period_end,
      p_cancel_at_period_end,
      p_effective_at,
      'ignored_stale'
    );

    return jsonb_build_object(
      'result', 'ignored_stale',
      'subscription_id', v_subscription.id,
      'subscription_status', v_subscription.status,
      'plan_code', v_subscription.plan_code
    );
  end if;

  -- Two different provider events with the same effective timestamp may be
  -- harmless only if they describe the exact same current snapshot.
  if not v_subscription_created
     and v_event_type <> 'revoked'
     and v_subscription.store_event_high_water_at = p_effective_at
     and v_subscription.last_store_event_ref
           is distinct from v_source_event_ref then

    v_same_snapshot :=
      v_subscription.plan_code = v_plan_code
      and v_subscription.status = v_status
      and v_subscription.source_product_ref = v_source_product_ref
      and v_subscription.cancel_at_period_end = p_cancel_at_period_end
      and (
        (
          v_status = 'trialing'
          and v_subscription.trial_started_at
                is not distinct from p_trial_started_at
          and v_subscription.trial_ends_at
                is not distinct from p_trial_ends_at
        )
        or
        (
          v_status in ('active', 'grace')
          and v_subscription.current_period_start
                is not distinct from p_current_period_start
          and v_subscription.current_period_end
                is not distinct from p_current_period_end
        )
        or
        v_status in (
          'past_due',
          'cancelled',
          'expired',
          'revoked'
        )
      );

    if not v_same_snapshot then
      raise exception 'COMMERCIAL_EVENT_ORDER_CONFLICT'
        using errcode = '23514';
    end if;

    insert into studio.billing_events (
      billing_source,
      billing_environment,
      source_event_ref,
      source_subscription_ref,
      source_product_ref,
      person_id,
      subscription_id,
      event_type,
      target_plan_code,
      target_status,
      trial_started_at,
      trial_ends_at,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      effective_at,
      processing_status
    )
    values (
      v_billing_source,
      v_billing_environment,
      v_source_event_ref,
      v_source_subscription_ref,
      v_source_product_ref,
      p_person_id,
      v_subscription.id,
      v_event_type,
      v_plan_code,
      v_status,
      p_trial_started_at,
      p_trial_ends_at,
      p_current_period_start,
      p_current_period_end,
      p_cancel_at_period_end,
      p_effective_at,
      'applied'
    );

    return jsonb_build_object(
      'result', 'applied_same_state',
      'subscription_id', v_subscription.id,
      'subscription_status', v_subscription.status,
      'plan_code', v_subscription.plan_code
    );
  end if;

  update studio.subscriptions s
  set
    plan_code = v_plan_code,
    status = v_status,
    source_product_ref = v_source_product_ref,
    trial_started_at =
      coalesce(p_trial_started_at, s.trial_started_at),
    trial_ends_at =
      coalesce(p_trial_ends_at, s.trial_ends_at),
    current_period_start =
      coalesce(p_current_period_start, s.current_period_start),
    current_period_end =
      coalesce(p_current_period_end, s.current_period_end),
    cancel_at_period_end = p_cancel_at_period_end,
    store_event_high_water_at = case
      when s.store_event_high_water_at is null
        then p_effective_at
      else greatest(
        s.store_event_high_water_at,
        p_effective_at
      )
    end,
    last_store_event_at = p_effective_at,
    last_store_event_ref = v_source_event_ref,
    last_store_event_type = v_event_type,
    updated_at = now()
  where s.id = v_subscription.id
  returning *
    into v_subscription;

  v_entitlement_status :=
    case
      when v_status in ('trialing', 'active') then 'active'
      when v_status = 'grace' then 'grace'
      when v_status = 'revoked' then 'revoked'
      else 'expired'
    end;

  if v_status = 'trialing' then
    v_access_start := p_trial_started_at;
    v_access_end := p_trial_ends_at;
  elsif v_status in ('active', 'grace') then
    v_access_start := p_current_period_start;
    v_access_end := p_current_period_end;
  else
    v_access_start := p_effective_at;
    v_access_end := null;
  end if;

  insert into studio.entitlements (
    person_id,
    subscription_id,
    entitlement_code,
    status,
    source,
    starts_at,
    expires_at
  )
  values (
    p_person_id,
    v_subscription.id,
    'studio_access',
    v_entitlement_status,
    'subscription',
    v_access_start,
    v_access_end
  )
  on conflict (
    subscription_id,
    entitlement_code
  )
  where subscription_id is not null
  do update
  set
    person_id = excluded.person_id,
    status = excluded.status,
    source = excluded.source,
    starts_at = excluded.starts_at,
    expires_at = excluded.expires_at,
    updated_at = now();

  insert into studio.entitlements (
    person_id,
    subscription_id,
    entitlement_code,
    status,
    source,
    starts_at,
    expires_at
  )
  values (
    p_person_id,
    v_subscription.id,
    'ai_access',
    v_entitlement_status,
    'subscription',
    v_access_start,
    v_access_end
  )
  on conflict (
    subscription_id,
    entitlement_code
  )
  where subscription_id is not null
  do update
  set
    person_id = excluded.person_id,
    status = excluded.status,
    source = excluded.source,
    starts_at = excluded.starts_at,
    expires_at = excluded.expires_at,
    updated_at = now();

  insert into studio.billing_events (
    billing_source,
    billing_environment,
    source_event_ref,
    source_subscription_ref,
    source_product_ref,
    person_id,
    subscription_id,
    event_type,
    target_plan_code,
    target_status,
    trial_started_at,
    trial_ends_at,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    effective_at,
    processing_status
  )
  values (
    v_billing_source,
    v_billing_environment,
    v_source_event_ref,
    v_source_subscription_ref,
    v_source_product_ref,
    p_person_id,
    v_subscription.id,
    v_event_type,
    v_plan_code,
    v_status,
    p_trial_started_at,
    p_trial_ends_at,
    p_current_period_start,
    p_current_period_end,
    p_cancel_at_period_end,
    p_effective_at,
    'applied'
  );

  return jsonb_build_object(
    'result', 'applied',
    'subscription_id', v_subscription.id,
    'subscription_status', v_subscription.status,
    'plan_code', v_subscription.plan_code,
    'studio_access_status', v_entitlement_status,
    'ai_access_status', v_entitlement_status
  );
end;
$$;

comment on function public.zstudio_apply_verified_commercial_event(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  boolean,
  timestamptz
) is
'Atomically applies one already verified provider-neutral Z Studio commercial event. Server-only; never accepts browser authority or raw store receipts.';

revoke all
on function public.zstudio_apply_verified_commercial_event(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  boolean,
  timestamptz
)
from public, anon, authenticated, service_role;

grant execute
on function public.zstudio_apply_verified_commercial_event(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  boolean,
  timestamptz
)
to service_role;


-- ------------------------------------------------------------
-- 5. Self-scoped current commercial access read boundary
-- ------------------------------------------------------------

create function public.zstudio_current_access_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_person_id uuid;
  v_subscription studio.subscriptions%rowtype;
  v_has_subscription boolean := false;
  v_subscription_access_valid boolean := false;
  v_studio_access boolean := false;
  v_ai_access boolean := false;
begin
  if v_auth_user_id is null then
    raise exception 'authentication required'
      using errcode = '28000';
  end if;

  select p.id
    into v_person_id
  from zos.persons p
  where p.auth_user_id = v_auth_user_id;

  if v_person_id is null then
    return jsonb_build_object(
      'studio_access', false,
      'ai_access', false,
      'plan_code', null,
      'subscription_status', null,
      'trial_ends_at', null,
      'current_period_end', null,
      'cancel_at_period_end', false
    );
  end if;

  select s.*
    into v_subscription
  from studio.subscriptions s
  where s.person_id = v_person_id
  -- Keep product-state selection aligned with the existing Paid AI
  -- authority: active > trialing > grace, then furthest valid period end,
  -- then newest subscription. This prevents UI / quota authority drift when
  -- one canonical person has more than one valid provider subscription.
  order by
    case
      when s.status = 'active'
       and s.current_period_start is not null
       and s.current_period_start <= now()
       and s.current_period_end is not null
       and s.current_period_end > now()
        then 1
      when s.status = 'trialing'
       and s.trial_started_at is not null
       and s.trial_started_at <= now()
       and s.trial_ends_at is not null
       and s.trial_ends_at > now()
        then 2
      when s.status = 'grace'
       and s.current_period_start is not null
       and s.current_period_start <= now()
       and s.current_period_end is not null
       and s.current_period_end > now()
        then 3
      else 4
    end,
    coalesce(
      s.current_period_end,
      s.trial_ends_at
    ) desc nulls last,
    s.created_at desc
  limit 1;

  v_has_subscription := found;

  -- Standalone manual/promotion grants are independent of subscriptions.
  -- They may augment access, but subscription B must never provide the
  -- entitlement displayed for selected subscription A.
  select exists (
    select 1
    from studio.entitlements e
    where e.person_id = v_person_id
      and e.subscription_id is null
      and e.entitlement_code = 'studio_access'
      and e.status in ('active', 'grace')
      and e.starts_at <= now()
      and (e.expires_at is null or e.expires_at > now())
  )
    into v_studio_access;

  select exists (
    select 1
    from studio.entitlements e
    where e.person_id = v_person_id
      and e.subscription_id is null
      and e.entitlement_code = 'ai_access'
      and e.status in ('active', 'grace')
      and e.starts_at <= now()
      and (e.expires_at is null or e.expires_at > now())
  )
    into v_ai_access;

  if not v_has_subscription then
    return jsonb_build_object(
      'studio_access', coalesce(v_studio_access, false),
      'ai_access', coalesce(v_ai_access, false),
      'plan_code', null,
      'subscription_status', null,
      'trial_ends_at', null,
      'current_period_end', null,
      'cancel_at_period_end', false
    );
  end if;

  v_subscription_access_valid :=
    (
      v_subscription.status = 'trialing'
      and v_subscription.trial_started_at is not null
      and v_subscription.trial_started_at <= now()
      and v_subscription.trial_ends_at is not null
      and v_subscription.trial_ends_at > now()
    )
    or
    (
      v_subscription.status in ('active', 'grace')
      and v_subscription.current_period_start is not null
      and v_subscription.current_period_start <= now()
      and v_subscription.current_period_end is not null
      and v_subscription.current_period_end > now()
    );

  if v_subscription_access_valid then
    select
      v_studio_access
      or exists (
        select 1
        from studio.entitlements e
        where e.person_id = v_person_id
          and e.subscription_id = v_subscription.id
          and e.entitlement_code = 'studio_access'
          and e.status in ('active', 'grace')
          and e.starts_at <= now()
          and (e.expires_at is null or e.expires_at > now())
      )
      into v_studio_access;

    select
      v_ai_access
      or exists (
        select 1
        from studio.entitlements e
        where e.person_id = v_person_id
          and e.subscription_id = v_subscription.id
          and e.entitlement_code = 'ai_access'
          and e.status in ('active', 'grace')
          and e.starts_at <= now()
          and (e.expires_at is null or e.expires_at > now())
      )
      into v_ai_access;
  end if;

  return jsonb_build_object(
    'studio_access', coalesce(v_studio_access, false),
    'ai_access', coalesce(v_ai_access, false),
    'plan_code', v_subscription.plan_code,
    'subscription_status', v_subscription.status,
    'trial_ends_at', v_subscription.trial_ends_at,
    'current_period_end', v_subscription.current_period_end,
    'cancel_at_period_end', v_subscription.cancel_at_period_end
  );
end;
$$;

comment on function public.zstudio_current_access_state() is
'Returns only the authenticated caller safe current Z Studio commercial access state. Provider customer, subscription and event identifiers are never exposed.';

revoke all
on function public.zstudio_current_access_state()
from public, anon, authenticated, service_role;

grant execute
on function public.zstudio_current_access_state()
to authenticated;
