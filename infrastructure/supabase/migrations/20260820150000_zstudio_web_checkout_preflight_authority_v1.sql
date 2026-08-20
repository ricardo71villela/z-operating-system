-- ============================================================
-- Z Studio — Web checkout preflight authority v1
-- ============================================================
--
-- Forward-only source migration. This migration is intentionally provider-
-- specific only at the Web/Stripe customer + checkout boundary; entitlement
-- state remains provider-neutral through the existing commercial writer.
--
-- Invariants:
--   * one lifetime production trial per canonical ZOS person
--   * sandbox activity never consumes production trial authority
--   * one stable Stripe Customer binding per ZOS person/environment
--   * one open Web checkout intent per ZOS person/environment
--   * browser roles never read/write preflight authority directly
--   * provider ids are bound only by privileged server RPCs
--   * verified production trial_started events atomically claim trial authority
-- ============================================================


-- ------------------------------------------------------------
-- 1. Lifetime production trial authority
-- ------------------------------------------------------------

create table studio.production_trial_authority (
  person_id uuid primary key
    references zos.persons(id)
    on delete restrict,

  state text not null
    check (state in ('reserved', 'claimed')),

  reserved_billing_source text
    check (
      reserved_billing_source is null
      or reserved_billing_source in (
        'manual',
        'web',
        'apple_app_store',
        'google_play'
      )
    ),
  reservation_ref text,
  reservation_expires_at timestamptz,

  claimed_billing_source text
    check (
      claimed_billing_source is null
      or claimed_billing_source in (
        'manual',
        'web',
        'apple_app_store',
        'google_play'
      )
    ),
  claimed_source_subscription_ref text,
  claimed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    state <> 'reserved'
    or (
      reserved_billing_source is not null
      and reservation_ref is not null
      and length(trim(reservation_ref)) > 0
      and reservation_expires_at is not null
      and claimed_billing_source is null
      and claimed_source_subscription_ref is null
      and claimed_at is null
    )
  ),

  check (
    state <> 'claimed'
    or (
      claimed_billing_source is not null
      and claimed_source_subscription_ref is not null
      and length(trim(claimed_source_subscription_ref)) > 0
      and claimed_at is not null
    )
  )
);

alter table studio.production_trial_authority enable row level security;

revoke all on studio.production_trial_authority
from public, anon, authenticated, service_role;

comment on table studio.production_trial_authority is
'Lifetime production-trial authority for one canonical ZOS person. Reserved state is temporary; claimed state is permanent commercial history. Sandbox never uses this table.';


-- ------------------------------------------------------------
-- 2. Stable Web provider customer binding
-- ------------------------------------------------------------

create table studio.billing_customer_bindings (
  id uuid primary key default gen_random_uuid(),

  person_id uuid not null
    references zos.persons(id)
    on delete restrict,

  billing_source text not null default 'web'
    check (billing_source = 'web'),

  billing_provider text not null default 'stripe'
    check (billing_provider = 'stripe'),

  billing_environment text not null
    check (billing_environment in ('sandbox', 'production')),

  source_customer_ref text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    source_customer_ref is null
    or length(trim(source_customer_ref)) > 0
  )
);

create unique index uq_studio_billing_customer_binding_person
on studio.billing_customer_bindings (
  person_id,
  billing_source,
  billing_provider,
  billing_environment
);

create unique index uq_studio_billing_customer_binding_provider_ref
on studio.billing_customer_bindings (
  billing_provider,
  billing_environment,
  source_customer_ref
)
where source_customer_ref is not null;

alter table studio.billing_customer_bindings enable row level security;

revoke all on studio.billing_customer_bindings
from public, anon, authenticated, service_role;

comment on table studio.billing_customer_bindings is
'Server-only stable binding between a canonical ZOS person and one Stripe Customer per Web billing environment.';


-- ------------------------------------------------------------
-- 3. Short-lived Web checkout intent authority
-- ------------------------------------------------------------

create table studio.web_checkout_intents (
  id uuid primary key default gen_random_uuid(),

  person_id uuid not null
    references zos.persons(id)
    on delete restrict,

  plan_code text not null
    check (plan_code in ('weekly', 'monthly', 'annual')),

  billing_environment text not null
    check (billing_environment in ('sandbox', 'production')),

  billing_customer_binding_id uuid not null
    references studio.billing_customer_bindings(id)
    on delete restrict,

  state text not null
    check (
      state in (
        'reserved',
        'session_created',
        'completed',
        'expired',
        'failed'
      )
    ),

  trial_reserved boolean not null,

  source_checkout_session_ref text,
  intent_expires_at timestamptz not null,
  provider_expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  closed_at timestamptz,

  check (intent_expires_at > created_at),

  check (
    state <> 'session_created'
    or (
      source_checkout_session_ref is not null
      and length(trim(source_checkout_session_ref)) > 0
      and provider_expires_at is not null
    )
  ),

  check (
    source_checkout_session_ref is null
    or length(trim(source_checkout_session_ref)) > 0
  ),

  check (
    completed_at is null
    or state = 'completed'
  ),

  check (
    state in ('reserved', 'session_created')
    or closed_at is not null
  )
);

create unique index uq_studio_web_checkout_open_person_environment
on studio.web_checkout_intents (
  person_id,
  billing_environment
)
where state in ('reserved', 'session_created');

create unique index uq_studio_web_checkout_provider_session
on studio.web_checkout_intents (
  billing_environment,
  source_checkout_session_ref
)
where source_checkout_session_ref is not null;

create index idx_studio_web_checkout_person_created
on studio.web_checkout_intents (
  person_id,
  created_at desc
);

alter table studio.web_checkout_intents enable row level security;

revoke all on studio.web_checkout_intents
from public, anon, authenticated, service_role;

comment on table studio.web_checkout_intents is
'Server-only short-lived authority for serializing Web Checkout creation, trial reservation and Stripe Session correlation.';


-- ------------------------------------------------------------
-- 4. Prepare one Web Checkout atomically
-- ------------------------------------------------------------

create function public.zstudio_prepare_web_checkout(
  p_person_id uuid,
  p_plan_code text,
  p_billing_environment text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_plan_code text := lower(trim(coalesce(p_plan_code, '')));
  v_environment text := lower(trim(coalesce(p_billing_environment, '')));

  v_open_intent studio.web_checkout_intents%rowtype;
  v_binding studio.billing_customer_bindings%rowtype;
  v_trial studio.production_trial_authority%rowtype;

  v_intent_id uuid;
  v_intent_expires_at timestamptz;
  v_trial_eligible boolean;
begin
  if p_person_id is null then
    raise exception 'WEB_CHECKOUT_PERSON_REQUIRED'
      using errcode = '22004';
  end if;

  if not exists (
    select 1
    from zos.persons p
    where p.id = p_person_id
  ) then
    raise exception 'WEB_CHECKOUT_PERSON_NOT_FOUND'
      using errcode = '23503';
  end if;

  if v_plan_code not in ('weekly', 'monthly', 'annual') then
    raise exception 'WEB_CHECKOUT_PLAN_INVALID'
      using errcode = '22023';
  end if;

  if v_environment not in ('sandbox', 'production') then
    raise exception 'WEB_CHECKOUT_ENVIRONMENT_INVALID'
      using errcode = '22023';
  end if;

  -- Serialize all Web Checkout preparation for this person/environment.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'zstudio:web-checkout:'
      || p_person_id::text
      || ':'
      || v_environment,
      0
    )
  );

  -- Never create a second billing chain while an existing one may still
  -- recover or still carries commercial authority in the same environment.
  if exists (
    select 1
    from studio.subscriptions s
    where s.person_id = p_person_id
      and s.billing_environment = v_environment
      and s.status in (
        'trialing',
        'active',
        'grace',
        'past_due'
      )
  ) then
    raise exception 'WEB_CHECKOUT_EXISTING_SUBSCRIPTION_BLOCKS'
      using errcode = '23514';
  end if;

  select i.*
    into v_open_intent
  from studio.web_checkout_intents i
  where i.person_id = p_person_id
    and i.billing_environment = v_environment
    and i.state in ('reserved', 'session_created')
  for update;

  if found then
    -- A reservation with no provider Session can be expired locally because no
    -- external purchase object exists yet. Once a Stripe Session exists, its
    -- current provider state must be reconciled before releasing the intent.
    if v_open_intent.state = 'reserved'
       and v_open_intent.intent_expires_at <= now() then

      update studio.web_checkout_intents i
      set
        state = 'expired',
        closed_at = now(),
        updated_at = now()
      where i.id = v_open_intent.id;

      if v_environment = 'production'
         and v_open_intent.trial_reserved then
        delete from studio.production_trial_authority t
        where t.person_id = p_person_id
          and t.state = 'reserved'
          and t.reserved_billing_source = 'web'
          and t.reservation_ref = v_open_intent.id::text;
      end if;

    elsif v_open_intent.state = 'session_created'
          and v_open_intent.provider_expires_at <= now() then
      raise exception 'WEB_CHECKOUT_RECONCILIATION_REQUIRED'
        using errcode = '55000';

    else
      if v_open_intent.plan_code <> v_plan_code then
        raise exception 'WEB_CHECKOUT_ALREADY_IN_PROGRESS'
          using errcode = '55000';
      end if;

      select b.*
        into v_binding
      from studio.billing_customer_bindings b
      where b.id = v_open_intent.billing_customer_binding_id;

      return jsonb_build_object(
        'result', 'existing',
        'intent_id', v_open_intent.id,
        'binding_id', v_binding.id,
        'source_customer_ref', v_binding.source_customer_ref,
        'plan_code', v_open_intent.plan_code,
        'billing_environment', v_open_intent.billing_environment,
        'trial_eligible', v_open_intent.trial_reserved,
        'source_checkout_session_ref', v_open_intent.source_checkout_session_ref,
        'intent_expires_at', v_open_intent.intent_expires_at,
        'provider_expires_at', v_open_intent.provider_expires_at
      );
    end if;
  end if;

  -- Create or reuse the stable Web/Stripe customer binding. The Stripe Customer
  -- itself is created outside Postgres with an idempotency key derived from the
  -- returned binding UUID, then bound through the dedicated RPC below.
  insert into studio.billing_customer_bindings (
    person_id,
    billing_source,
    billing_provider,
    billing_environment
  )
  values (
    p_person_id,
    'web',
    'stripe',
    v_environment
  )
  on conflict (
    person_id,
    billing_source,
    billing_provider,
    billing_environment
  )
  do nothing;

  select b.*
    into strict v_binding
  from studio.billing_customer_bindings b
  where b.person_id = p_person_id
    and b.billing_source = 'web'
    and b.billing_provider = 'stripe'
    and b.billing_environment = v_environment
  for update;

  v_trial_eligible := true;

  if v_environment = 'production' then
    -- The same lock is also used by the billing-event claim trigger so Web
    -- reservation and Apple/Google/Web trial claims cannot race each other.
    perform pg_advisory_xact_lock(
      hashtextextended(
        'zstudio:production-trial:' || p_person_id::text,
        0
      )
    );

    select t.*
      into v_trial
    from studio.production_trial_authority t
    where t.person_id = p_person_id
    for update;

    if found then
      if v_trial.state = 'claimed' then
        v_trial_eligible := false;

      elsif v_trial.reservation_expires_at <= now() then
        -- Do not silently steal an expired-looking Web reservation if a Stripe
        -- Session exists and still needs provider reconciliation.
        if v_trial.reserved_billing_source = 'web'
           and exists (
             select 1
             from studio.web_checkout_intents i
             where i.id::text = v_trial.reservation_ref
               and i.person_id = p_person_id
               and i.billing_environment = 'production'
               and i.state = 'session_created'
           ) then
          raise exception 'WEB_CHECKOUT_RECONCILIATION_REQUIRED'
            using errcode = '55000';
        end if;

        delete from studio.production_trial_authority t
        where t.person_id = p_person_id
          and t.state = 'reserved';

        v_trial_eligible := true;

      else
        raise exception 'WEB_CHECKOUT_TRIAL_RESERVED_ELSEWHERE'
          using errcode = '55000';
      end if;
    end if;
  end if;

  v_intent_id := gen_random_uuid();
  v_intent_expires_at := now() + interval '30 minutes';

  insert into studio.web_checkout_intents (
    id,
    person_id,
    plan_code,
    billing_environment,
    billing_customer_binding_id,
    state,
    trial_reserved,
    intent_expires_at
  )
  values (
    v_intent_id,
    p_person_id,
    v_plan_code,
    v_environment,
    v_binding.id,
    'reserved',
    v_trial_eligible,
    v_intent_expires_at
  );

  if v_environment = 'production'
     and v_trial_eligible then
    insert into studio.production_trial_authority (
      person_id,
      state,
      reserved_billing_source,
      reservation_ref,
      reservation_expires_at
    )
    values (
      p_person_id,
      'reserved',
      'web',
      v_intent_id::text,
      v_intent_expires_at
    );
  end if;

  return jsonb_build_object(
    'result', 'prepared',
    'intent_id', v_intent_id,
    'binding_id', v_binding.id,
    'source_customer_ref', v_binding.source_customer_ref,
    'plan_code', v_plan_code,
    'billing_environment', v_environment,
    'trial_eligible', v_trial_eligible,
    'source_checkout_session_ref', null,
    'intent_expires_at', v_intent_expires_at,
    'provider_expires_at', null
  );
end;
$$;

comment on function public.zstudio_prepare_web_checkout(uuid, text, text) is
'Server-only Web Checkout preflight. Serializes one checkout per canonical person/environment, blocks concurrent billing chains and reserves the one lifetime production trial.';

revoke all
on function public.zstudio_prepare_web_checkout(uuid, text, text)
from public, anon, authenticated, service_role;

grant execute
on function public.zstudio_prepare_web_checkout(uuid, text, text)
to service_role;


-- ------------------------------------------------------------
-- 5. Bind the idempotently-created Stripe Customer
-- ------------------------------------------------------------

create function public.zstudio_bind_web_stripe_customer(
  p_binding_id uuid,
  p_person_id uuid,
  p_billing_environment text,
  p_source_customer_ref text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_environment text := lower(trim(coalesce(p_billing_environment, '')));
  v_source_customer_ref text := trim(coalesce(p_source_customer_ref, ''));
  v_binding studio.billing_customer_bindings%rowtype;
begin
  if p_binding_id is null or p_person_id is null then
    raise exception 'WEB_CUSTOMER_BINDING_IDENTITY_REQUIRED'
      using errcode = '22004';
  end if;

  if v_environment not in ('sandbox', 'production') then
    raise exception 'WEB_CUSTOMER_BINDING_ENVIRONMENT_INVALID'
      using errcode = '22023';
  end if;

  if v_source_customer_ref = '' then
    raise exception 'WEB_CUSTOMER_REF_REQUIRED'
      using errcode = '22004';
  end if;

  select b.*
    into v_binding
  from studio.billing_customer_bindings b
  where b.id = p_binding_id
    and b.person_id = p_person_id
    and b.billing_source = 'web'
    and b.billing_provider = 'stripe'
    and b.billing_environment = v_environment
  for update;

  if not found then
    raise exception 'WEB_CUSTOMER_BINDING_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_binding.source_customer_ref is not null then
    if v_binding.source_customer_ref = v_source_customer_ref then
      return jsonb_build_object(
        'result', 'duplicate',
        'binding_id', v_binding.id,
        'source_customer_ref', v_binding.source_customer_ref
      );
    end if;

    raise exception 'WEB_CUSTOMER_BINDING_CONFLICT'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from studio.billing_customer_bindings b
    where b.billing_provider = 'stripe'
      and b.billing_environment = v_environment
      and b.source_customer_ref = v_source_customer_ref
      and b.id <> v_binding.id
  ) then
    raise exception 'WEB_CUSTOMER_IDENTITY_CONFLICT'
      using errcode = '23514';
  end if;

  update studio.billing_customer_bindings b
  set
    source_customer_ref = v_source_customer_ref,
    updated_at = now()
  where b.id = v_binding.id
  returning *
    into v_binding;

  return jsonb_build_object(
    'result', 'bound',
    'binding_id', v_binding.id,
    'source_customer_ref', v_binding.source_customer_ref
  );
end;
$$;

comment on function public.zstudio_bind_web_stripe_customer(uuid, uuid, text, text) is
'Server-only idempotent binding of one Stripe Customer to one canonical ZOS Web billing identity.';

revoke all
on function public.zstudio_bind_web_stripe_customer(uuid, uuid, text, text)
from public, anon, authenticated, service_role;

grant execute
on function public.zstudio_bind_web_stripe_customer(uuid, uuid, text, text)
to service_role;


-- ------------------------------------------------------------
-- 6. Bind the idempotently-created Stripe Checkout Session
-- ------------------------------------------------------------

create function public.zstudio_bind_web_checkout_session(
  p_intent_id uuid,
  p_person_id uuid,
  p_billing_environment text,
  p_source_checkout_session_ref text,
  p_provider_expires_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_environment text := lower(trim(coalesce(p_billing_environment, '')));
  v_session_ref text := trim(coalesce(p_source_checkout_session_ref, ''));
  v_intent studio.web_checkout_intents%rowtype;
begin
  if p_intent_id is null or p_person_id is null then
    raise exception 'WEB_CHECKOUT_SESSION_IDENTITY_REQUIRED'
      using errcode = '22004';
  end if;

  if v_environment not in ('sandbox', 'production') then
    raise exception 'WEB_CHECKOUT_SESSION_ENVIRONMENT_INVALID'
      using errcode = '22023';
  end if;

  if v_session_ref = '' then
    raise exception 'WEB_CHECKOUT_SESSION_REF_REQUIRED'
      using errcode = '22004';
  end if;

  if p_provider_expires_at is null
     or p_provider_expires_at <= now() then
    raise exception 'WEB_CHECKOUT_SESSION_EXPIRY_INVALID'
      using errcode = '22023';
  end if;

  select i.*
    into v_intent
  from studio.web_checkout_intents i
  where i.id = p_intent_id
    and i.person_id = p_person_id
    and i.billing_environment = v_environment
  for update;

  if not found then
    raise exception 'WEB_CHECKOUT_INTENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_intent.source_checkout_session_ref is not null then
    if v_intent.source_checkout_session_ref = v_session_ref then
      return jsonb_build_object(
        'result', 'duplicate',
        'intent_id', v_intent.id,
        'source_checkout_session_ref', v_intent.source_checkout_session_ref,
        'state', v_intent.state
      );
    end if;

    raise exception 'WEB_CHECKOUT_SESSION_CONFLICT'
      using errcode = '23514';
  end if;

  if v_intent.state <> 'reserved' then
    raise exception 'WEB_CHECKOUT_INTENT_NOT_OPEN'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from studio.billing_customer_bindings b
    where b.id = v_intent.billing_customer_binding_id
      and b.person_id = p_person_id
      and b.billing_environment = v_environment
      and b.billing_source = 'web'
      and b.billing_provider = 'stripe'
      and b.source_customer_ref is not null
  ) then
    raise exception 'WEB_CHECKOUT_CUSTOMER_NOT_BOUND'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from studio.web_checkout_intents i
    where i.billing_environment = v_environment
      and i.source_checkout_session_ref = v_session_ref
      and i.id <> v_intent.id
  ) then
    raise exception 'WEB_CHECKOUT_SESSION_IDENTITY_CONFLICT'
      using errcode = '23514';
  end if;

  update studio.web_checkout_intents i
  set
    state = 'session_created',
    source_checkout_session_ref = v_session_ref,
    provider_expires_at = p_provider_expires_at,
    updated_at = now()
  where i.id = v_intent.id
  returning *
    into v_intent;

  return jsonb_build_object(
    'result', 'bound',
    'intent_id', v_intent.id,
    'source_checkout_session_ref', v_intent.source_checkout_session_ref,
    'provider_expires_at', v_intent.provider_expires_at,
    'state', v_intent.state
  );
end;
$$;

comment on function public.zstudio_bind_web_checkout_session(uuid, uuid, text, text, timestamptz) is
'Server-only idempotent binding of the exact Stripe Checkout Session created for one Web checkout intent.';

revoke all
on function public.zstudio_bind_web_checkout_session(uuid, uuid, text, text, timestamptz)
from public, anon, authenticated, service_role;

grant execute
on function public.zstudio_bind_web_checkout_session(uuid, uuid, text, text, timestamptz)
to service_role;


-- ------------------------------------------------------------
-- 7. Close a Web Checkout only after controlled verification
-- ------------------------------------------------------------

create function public.zstudio_close_web_checkout_intent(
  p_intent_id uuid,
  p_person_id uuid,
  p_billing_environment text,
  p_final_state text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_environment text := lower(trim(coalesce(p_billing_environment, '')));
  v_final_state text := lower(trim(coalesce(p_final_state, '')));
  v_intent studio.web_checkout_intents%rowtype;
begin
  if p_intent_id is null or p_person_id is null then
    raise exception 'WEB_CHECKOUT_CLOSE_IDENTITY_REQUIRED'
      using errcode = '22004';
  end if;

  if v_environment not in ('sandbox', 'production') then
    raise exception 'WEB_CHECKOUT_CLOSE_ENVIRONMENT_INVALID'
      using errcode = '22023';
  end if;

  if v_final_state not in ('completed', 'expired', 'failed') then
    raise exception 'WEB_CHECKOUT_CLOSE_STATE_INVALID'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'zstudio:web-checkout:'
      || p_person_id::text
      || ':'
      || v_environment,
      0
    )
  );

  if v_environment = 'production' then
    perform pg_advisory_xact_lock(
      hashtextextended(
        'zstudio:production-trial:' || p_person_id::text,
        0
      )
    );
  end if;

  select i.*
    into v_intent
  from studio.web_checkout_intents i
  where i.id = p_intent_id
    and i.person_id = p_person_id
    and i.billing_environment = v_environment
  for update;

  if not found then
    raise exception 'WEB_CHECKOUT_INTENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_intent.state in ('completed', 'expired', 'failed') then
    if v_intent.state = v_final_state then
      return jsonb_build_object(
        'result', 'duplicate',
        'intent_id', v_intent.id,
        'state', v_intent.state
      );
    end if;

    raise exception 'WEB_CHECKOUT_CLOSE_CONFLICT'
      using errcode = '23514';
  end if;

  if v_final_state = 'completed'
     and v_intent.state <> 'session_created' then
    raise exception 'WEB_CHECKOUT_COMPLETION_REQUIRES_SESSION'
      using errcode = '55000';
  end if;

  update studio.web_checkout_intents i
  set
    state = v_final_state,
    completed_at = case
      when v_final_state = 'completed' then now()
      else null
    end,
    closed_at = now(),
    updated_at = now()
  where i.id = v_intent.id
  returning *
    into v_intent;

  -- Only a verified expired/failed Checkout releases a still-reserved trial.
  -- A claimed trial is permanent and therefore cannot be deleted here.
  if v_environment = 'production'
     and v_intent.trial_reserved
     and v_final_state in ('expired', 'failed') then
    delete from studio.production_trial_authority t
    where t.person_id = p_person_id
      and t.state = 'reserved'
      and t.reserved_billing_source = 'web'
      and t.reservation_ref = v_intent.id::text;
  end if;

  return jsonb_build_object(
    'result', 'closed',
    'intent_id', v_intent.id,
    'state', v_intent.state
  );
end;
$$;

comment on function public.zstudio_close_web_checkout_intent(uuid, uuid, text, text) is
'Server-only closure of a Web checkout intent after verified completion, verified provider expiry or controlled failure. Only failed/expired reservations can release an unclaimed production trial.';

revoke all
on function public.zstudio_close_web_checkout_intent(uuid, uuid, text, text)
from public, anon, authenticated, service_role;

grant execute
on function public.zstudio_close_web_checkout_intent(uuid, uuid, text, text)
to service_role;


-- ------------------------------------------------------------
-- 8. Claim lifetime production trial inside commercial-event transaction
-- ------------------------------------------------------------
--
-- The existing commercial writer inserts studio.billing_events in the same
-- transaction as subscription + entitlement changes. A BEFORE INSERT trigger
-- therefore extends writer semantics without changing its already-validated
-- RPC signature: any trial claim failure rolls the entire commercial event back.
-- ------------------------------------------------------------

create function studio.zstudio_claim_production_trial_on_billing_event()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_trial studio.production_trial_authority%rowtype;
  v_web_intent studio.web_checkout_intents%rowtype;
begin
  if new.billing_environment <> 'production'
     or new.event_type <> 'trial_started' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'zstudio:production-trial:' || new.person_id::text,
      0
    )
  );

  select t.*
    into v_trial
  from studio.production_trial_authority t
  where t.person_id = new.person_id
  for update;

  if not found then
    -- Web trials must originate from the preflight reservation. Native-store
    -- trials can be claimed directly after their provider state is verified.
    if new.billing_source = 'web' then
      raise exception 'COMMERCIAL_TRIAL_RESERVATION_REQUIRED'
        using errcode = '23514';
    end if;

    insert into studio.production_trial_authority (
      person_id,
      state,
      claimed_billing_source,
      claimed_source_subscription_ref,
      claimed_at
    )
    values (
      new.person_id,
      'claimed',
      new.billing_source,
      new.source_subscription_ref,
      new.effective_at
    );

    return new;
  end if;

  if v_trial.state = 'claimed' then
    -- Multiple verified provider triggers may describe the same exact
    -- subscription snapshot. They do not constitute a second trial.
    if v_trial.claimed_billing_source = new.billing_source
       and v_trial.claimed_source_subscription_ref = new.source_subscription_ref then
      return new;
    end if;

    raise exception 'COMMERCIAL_TRIAL_ALREADY_CLAIMED'
      using errcode = '23514';
  end if;

  if v_trial.reserved_billing_source = 'web' then
    select i.*
      into v_web_intent
    from studio.web_checkout_intents i
    where i.id::text = v_trial.reservation_ref
      and i.person_id = new.person_id
      and i.billing_environment = 'production';

    if new.billing_source = 'web' then
      if not found
         or v_web_intent.state <> 'session_created'
         or v_web_intent.source_checkout_session_ref is null then
        raise exception 'COMMERCIAL_TRIAL_RESERVATION_INVALID'
          using errcode = '23514';
      end if;

    elsif v_trial.reservation_expires_at > now()
          or (
            found
            and v_web_intent.state = 'session_created'
          ) then
      raise exception 'COMMERCIAL_TRIAL_RESERVATION_CONFLICT'
        using errcode = '23514';
    end if;

  elsif v_trial.reserved_billing_source <> new.billing_source
        and v_trial.reservation_expires_at > now() then
    raise exception 'COMMERCIAL_TRIAL_RESERVATION_CONFLICT'
      using errcode = '23514';
  end if;

  update studio.production_trial_authority t
  set
    state = 'claimed',
    claimed_billing_source = new.billing_source,
    claimed_source_subscription_ref = new.source_subscription_ref,
    claimed_at = new.effective_at,
    updated_at = now()
  where t.person_id = new.person_id;

  return new;
end;
$$;

revoke all
on function studio.zstudio_claim_production_trial_on_billing_event()
from public, anon, authenticated, service_role;

create trigger zstudio_claim_production_trial_before_billing_event
before insert on studio.billing_events
for each row
execute function studio.zstudio_claim_production_trial_on_billing_event();

comment on function studio.zstudio_claim_production_trial_on_billing_event() is
'Internal trigger authority that atomically claims the one lifetime production trial when the existing verified commercial writer records trial_started.';
