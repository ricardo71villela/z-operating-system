-- ============================================================
-- Z Studio — Google Play purchase preflight authority v1
-- ============================================================
--
-- Server-only preparation/correlation for Google Play subscription purchases.
-- The Google account may decide whether trial-3d is eligible inside Play, but
-- ZOS remains authoritative for the one lifetime production trial across Web,
-- Apple and Google Play.
-- ============================================================

create table studio.google_play_purchase_intents (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references zos.persons(id) on delete restrict,
  plan_code text not null check (plan_code in ('weekly', 'monthly', 'annual')),
  billing_environment text not null check (billing_environment in ('sandbox', 'production')),
  state text not null check (state in ('prepared', 'purchase_seen', 'completed', 'expired', 'failed')),
  trial_reserved boolean not null,
  source_subscription_ref text,
  intent_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  closed_at timestamptz,
  check (intent_expires_at > created_at),
  check (
    source_subscription_ref is null
    or source_subscription_ref ~ '^google:play:purchase:[0-9a-f]{64}$'
  ),
  check (state <> 'purchase_seen' or source_subscription_ref is not null),
  check (completed_at is null or state = 'completed'),
  check (state in ('prepared', 'purchase_seen') or closed_at is not null)
);

create unique index uq_studio_google_play_purchase_open_person_environment
on studio.google_play_purchase_intents (person_id, billing_environment)
where state in ('prepared', 'purchase_seen');

create unique index uq_studio_google_play_purchase_source_subscription
on studio.google_play_purchase_intents (billing_environment, source_subscription_ref)
where source_subscription_ref is not null;

alter table studio.google_play_purchase_intents enable row level security;
revoke all on studio.google_play_purchase_intents
from public, anon, authenticated, service_role;

comment on table studio.google_play_purchase_intents is
'Server-only Google Play purchase preparation and hashed purchase-token correlation. Raw purchase tokens are never stored.';


-- ------------------------------------------------------------
-- 1. Prepare purchase + reserve global production trial
-- ------------------------------------------------------------

create function public.zstudio_prepare_google_play_purchase(
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
  v_open_intent studio.google_play_purchase_intents%rowtype;
  v_trial studio.production_trial_authority%rowtype;
  v_google_reservation studio.google_play_purchase_intents%rowtype;
  v_web_reservation studio.web_checkout_intents%rowtype;
  v_intent_id uuid;
  v_expires_at timestamptz;
  v_trial_eligible boolean := true;
begin
  if p_person_id is null then
    raise exception 'GOOGLE_PLAY_PURCHASE_PERSON_REQUIRED' using errcode = '22004';
  end if;
  if not exists (select 1 from zos.persons p where p.id = p_person_id) then
    raise exception 'GOOGLE_PLAY_PURCHASE_PERSON_NOT_FOUND' using errcode = '23503';
  end if;
  if v_plan_code not in ('weekly', 'monthly', 'annual') then
    raise exception 'GOOGLE_PLAY_PURCHASE_PLAN_INVALID' using errcode = '22023';
  end if;
  if v_environment not in ('sandbox', 'production') then
    raise exception 'GOOGLE_PLAY_PURCHASE_ENVIRONMENT_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'zstudio:google-play-purchase:' || p_person_id::text || ':' || v_environment,
      0
    )
  );

  if exists (
    select 1
    from studio.subscriptions s
    where s.person_id = p_person_id
      and s.billing_environment = v_environment
      and s.status in ('trialing', 'active', 'grace', 'past_due', 'paused')
  ) then
    raise exception 'GOOGLE_PLAY_PURCHASE_EXISTING_SUBSCRIPTION_BLOCKS'
      using errcode = '23514';
  end if;

  select i.* into v_open_intent
  from studio.google_play_purchase_intents i
  where i.person_id = p_person_id
    and i.billing_environment = v_environment
    and i.state in ('prepared', 'purchase_seen')
  for update;

  if found then
    if v_open_intent.state = 'purchase_seen' then
      raise exception 'GOOGLE_PLAY_PURCHASE_RECONCILIATION_REQUIRED'
        using errcode = '55000';
    end if;

    if v_open_intent.intent_expires_at > now() then
      if v_open_intent.plan_code <> v_plan_code then
        raise exception 'GOOGLE_PLAY_PURCHASE_ALREADY_IN_PROGRESS'
          using errcode = '55000';
      end if;
      return jsonb_build_object(
        'result', 'existing',
        'intent_id', v_open_intent.id,
        'plan_code', v_open_intent.plan_code,
        'billing_environment', v_open_intent.billing_environment,
        'trial_eligible', v_open_intent.trial_reserved,
        'intent_expires_at', v_open_intent.intent_expires_at
      );
    end if;

    update studio.google_play_purchase_intents i
    set state = 'expired', closed_at = now(), updated_at = now()
    where i.id = v_open_intent.id;

    if v_environment = 'production' and v_open_intent.trial_reserved then
      delete from studio.production_trial_authority t
      where t.person_id = p_person_id
        and t.state = 'reserved'
        and t.reserved_billing_source = 'google_play'
        and t.reservation_ref = v_open_intent.id::text
        and t.reservation_expires_at <= now();
    end if;
  end if;

  if v_environment = 'production' then
    perform pg_advisory_xact_lock(
      hashtextextended('zstudio:production-trial:' || p_person_id::text, 0)
    );

    select t.* into v_trial
    from studio.production_trial_authority t
    where t.person_id = p_person_id
    for update;

    if found then
      if v_trial.state = 'claimed' then
        v_trial_eligible := false;
      elsif v_trial.reservation_expires_at > now() then
        raise exception 'GOOGLE_PLAY_TRIAL_RESERVED_ELSEWHERE'
          using errcode = '55000';
      elsif v_trial.reserved_billing_source = 'web' then
        select i.* into v_web_reservation
        from studio.web_checkout_intents i
        where i.id::text = v_trial.reservation_ref
          and i.person_id = p_person_id
          and i.billing_environment = 'production';

        if found and v_web_reservation.state = 'session_created' then
          raise exception 'GOOGLE_PLAY_TRIAL_RECONCILIATION_REQUIRED'
            using errcode = '55000';
        end if;
        delete from studio.production_trial_authority t
        where t.person_id = p_person_id and t.state = 'reserved';
      elsif v_trial.reserved_billing_source = 'google_play' then
        select i.* into v_google_reservation
        from studio.google_play_purchase_intents i
        where i.id::text = v_trial.reservation_ref
          and i.person_id = p_person_id
          and i.billing_environment = 'production';

        if found and v_google_reservation.state = 'purchase_seen' then
          raise exception 'GOOGLE_PLAY_PURCHASE_RECONCILIATION_REQUIRED'
            using errcode = '55000';
        end if;
        delete from studio.production_trial_authority t
        where t.person_id = p_person_id and t.state = 'reserved';
      else
        delete from studio.production_trial_authority t
        where t.person_id = p_person_id and t.state = 'reserved';
      end if;
    end if;
  end if;

  v_intent_id := gen_random_uuid();
  v_expires_at := now() + interval '30 minutes';

  insert into studio.google_play_purchase_intents (
    id, person_id, plan_code, billing_environment, state,
    trial_reserved, intent_expires_at
  ) values (
    v_intent_id, p_person_id, v_plan_code, v_environment, 'prepared',
    v_trial_eligible, v_expires_at
  );

  if v_environment = 'production' and v_trial_eligible then
    insert into studio.production_trial_authority (
      person_id, state, reserved_billing_source,
      reservation_ref, reservation_expires_at
    ) values (
      p_person_id, 'reserved', 'google_play', v_intent_id::text, v_expires_at
    );
  end if;

  return jsonb_build_object(
    'result', 'prepared',
    'intent_id', v_intent_id,
    'plan_code', v_plan_code,
    'billing_environment', v_environment,
    'trial_eligible', v_trial_eligible,
    'intent_expires_at', v_expires_at
  );
end;
$$;

revoke all on function public.zstudio_prepare_google_play_purchase(uuid,text,text)
from public, anon, authenticated, service_role;
grant execute on function public.zstudio_prepare_google_play_purchase(uuid,text,text)
to service_role;


-- ------------------------------------------------------------
-- 2. Bind verified current-state purchase to exact prepared intent
-- ------------------------------------------------------------

create function public.zstudio_bind_google_play_purchase_intent(
  p_intent_id uuid,
  p_person_id uuid,
  p_billing_environment text,
  p_plan_code text,
  p_source_subscription_ref text,
  p_provider_trialing boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_environment text := lower(trim(coalesce(p_billing_environment, '')));
  v_plan_code text := lower(trim(coalesce(p_plan_code, '')));
  v_subscription_ref text := trim(coalesce(p_source_subscription_ref, ''));
  v_intent studio.google_play_purchase_intents%rowtype;
  v_trial studio.production_trial_authority%rowtype;
begin
  if p_intent_id is null or p_person_id is null then
    raise exception 'GOOGLE_PLAY_PURCHASE_INTENT_IDENTITY_REQUIRED' using errcode = '22004';
  end if;
  if v_environment not in ('sandbox', 'production') then
    raise exception 'GOOGLE_PLAY_PURCHASE_ENVIRONMENT_INVALID' using errcode = '22023';
  end if;
  if v_plan_code not in ('weekly', 'monthly', 'annual') then
    raise exception 'GOOGLE_PLAY_PURCHASE_PLAN_INVALID' using errcode = '22023';
  end if;
  if v_subscription_ref !~ '^google:play:purchase:[0-9a-f]{64}$' then
    raise exception 'GOOGLE_PLAY_PURCHASE_SUBSCRIPTION_REF_INVALID' using errcode = '22023';
  end if;
  if p_provider_trialing is null then
    raise exception 'GOOGLE_PLAY_PURCHASE_TRIAL_STATE_REQUIRED' using errcode = '22004';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('zstudio:google-play-purchase-intent:' || p_intent_id::text, 0)
  );

  select i.* into v_intent
  from studio.google_play_purchase_intents i
  where i.id = p_intent_id
  for update;

  if not found then
    raise exception 'GOOGLE_PLAY_PURCHASE_INTENT_NOT_FOUND' using errcode = '23503';
  end if;
  if v_intent.person_id <> p_person_id
     or v_intent.billing_environment <> v_environment then
    raise exception 'GOOGLE_PLAY_PURCHASE_INTENT_IDENTITY_CONFLICT' using errcode = '23514';
  end if;
  if v_intent.plan_code <> v_plan_code then
    raise exception 'GOOGLE_PLAY_PURCHASE_INTENT_PLAN_CONFLICT' using errcode = '23514';
  end if;
  if v_intent.state not in ('prepared', 'purchase_seen') then
    raise exception 'GOOGLE_PLAY_PURCHASE_INTENT_CLOSED' using errcode = '55000';
  end if;
  if v_intent.source_subscription_ref is not null
     and v_intent.source_subscription_ref <> v_subscription_ref then
    raise exception 'GOOGLE_PLAY_PURCHASE_INTENT_SUBSCRIPTION_CONFLICT' using errcode = '23514';
  end if;

  if v_environment = 'production' and p_provider_trialing then
    if not v_intent.trial_reserved then
      raise exception 'GOOGLE_PLAY_TRIAL_NOT_AUTHORIZED' using errcode = '23514';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended('zstudio:production-trial:' || p_person_id::text, 0)
    );

    select t.* into v_trial
    from studio.production_trial_authority t
    where t.person_id = p_person_id
    for update;

    if not found then
      raise exception 'GOOGLE_PLAY_TRIAL_PREFLIGHT_REQUIRED' using errcode = '23514';
    end if;

    if v_trial.state = 'claimed' then
      if v_trial.claimed_billing_source <> 'google_play'
         or v_trial.claimed_source_subscription_ref <> v_subscription_ref then
        raise exception 'COMMERCIAL_TRIAL_ALREADY_CLAIMED' using errcode = '23514';
      end if;
    elsif v_trial.reserved_billing_source <> 'google_play'
          or v_trial.reservation_ref <> p_intent_id::text then
      raise exception 'GOOGLE_PLAY_TRIAL_RESERVATION_CONFLICT' using errcode = '23514';
    end if;
  end if;

  update studio.google_play_purchase_intents i
  set
    state = 'purchase_seen',
    source_subscription_ref = v_subscription_ref,
    updated_at = now()
  where i.id = p_intent_id
  returning * into v_intent;

  return jsonb_build_object(
    'result', case when v_intent.source_subscription_ref = v_subscription_ref then 'bound' else 'existing' end,
    'intent_id', v_intent.id,
    'plan_code', v_intent.plan_code,
    'trial_reserved', v_intent.trial_reserved,
    'source_subscription_ref', v_intent.source_subscription_ref
  );
end;
$$;

revoke all on function public.zstudio_bind_google_play_purchase_intent(uuid,uuid,text,text,text,boolean)
from public, anon, authenticated, service_role;
grant execute on function public.zstudio_bind_google_play_purchase_intent(uuid,uuid,text,text,text,boolean)
to service_role;


-- ------------------------------------------------------------
-- 3. Complete exact intent only after commercial writer succeeds
-- ------------------------------------------------------------

create function public.zstudio_complete_google_play_purchase_intent(
  p_intent_id uuid,
  p_person_id uuid,
  p_billing_environment text,
  p_source_subscription_ref text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_environment text := lower(trim(coalesce(p_billing_environment, '')));
  v_subscription_ref text := trim(coalesce(p_source_subscription_ref, ''));
  v_intent studio.google_play_purchase_intents%rowtype;
begin
  select i.* into v_intent
  from studio.google_play_purchase_intents i
  where i.id = p_intent_id
  for update;

  if not found then
    raise exception 'GOOGLE_PLAY_PURCHASE_INTENT_NOT_FOUND' using errcode = '23503';
  end if;
  if v_intent.person_id <> p_person_id
     or v_intent.billing_environment <> v_environment
     or v_intent.source_subscription_ref <> v_subscription_ref then
    raise exception 'GOOGLE_PLAY_PURCHASE_INTENT_COMPLETION_CONFLICT' using errcode = '23514';
  end if;

  if v_intent.state = 'completed' then
    return jsonb_build_object('result', 'duplicate', 'intent_id', v_intent.id, 'state', v_intent.state);
  end if;
  if v_intent.state <> 'purchase_seen' then
    raise exception 'GOOGLE_PLAY_PURCHASE_INTENT_COMPLETION_REQUIRES_PURCHASE'
      using errcode = '55000';
  end if;

  update studio.google_play_purchase_intents i
  set state = 'completed', completed_at = now(), closed_at = now(), updated_at = now()
  where i.id = p_intent_id
  returning * into v_intent;

  -- If the prepared trial offer was not actually used, the commercial writer
  -- leaves the lifetime authority reserved. A successful paid purchase can
  -- safely release that exact still-reserved Google intent for future channels.
  if v_environment = 'production' and v_intent.trial_reserved then
    delete from studio.production_trial_authority t
    where t.person_id = p_person_id
      and t.state = 'reserved'
      and t.reserved_billing_source = 'google_play'
      and t.reservation_ref = p_intent_id::text;
  end if;

  return jsonb_build_object('result', 'completed', 'intent_id', v_intent.id, 'state', v_intent.state);
end;
$$;

revoke all on function public.zstudio_complete_google_play_purchase_intent(uuid,uuid,text,text)
from public, anon, authenticated, service_role;
grant execute on function public.zstudio_complete_google_play_purchase_intent(uuid,uuid,text,text)
to service_role;


-- ------------------------------------------------------------
-- 4. Enforce preflight before any production Google trial writer event
-- ------------------------------------------------------------

create function studio.zstudio_require_google_play_trial_preflight()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_trial studio.production_trial_authority%rowtype;
  v_intent studio.google_play_purchase_intents%rowtype;
begin
  if new.billing_source <> 'google_play'
     or new.billing_environment <> 'production'
     or new.event_type <> 'trial_started' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('zstudio:production-trial:' || new.person_id::text, 0)
  );

  select t.* into v_trial
  from studio.production_trial_authority t
  where t.person_id = new.person_id
  for update;

  if not found then
    raise exception 'GOOGLE_PLAY_TRIAL_PREFLIGHT_REQUIRED' using errcode = '23514';
  end if;

  if v_trial.state = 'claimed' then
    if v_trial.claimed_billing_source = 'google_play'
       and v_trial.claimed_source_subscription_ref = new.source_subscription_ref then
      return new;
    end if;
    raise exception 'COMMERCIAL_TRIAL_ALREADY_CLAIMED' using errcode = '23514';
  end if;

  if v_trial.reserved_billing_source <> 'google_play' then
    raise exception 'GOOGLE_PLAY_TRIAL_RESERVATION_CONFLICT' using errcode = '23514';
  end if;

  select i.* into v_intent
  from studio.google_play_purchase_intents i
  where i.id::text = v_trial.reservation_ref
    and i.person_id = new.person_id
    and i.billing_environment = 'production'
    and i.state = 'purchase_seen'
    and i.trial_reserved
    and i.source_subscription_ref = new.source_subscription_ref;

  if not found then
    raise exception 'GOOGLE_PLAY_TRIAL_RESERVATION_INVALID' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function studio.zstudio_require_google_play_trial_preflight()
from public, anon, authenticated, service_role;

create trigger a_zstudio_require_google_play_trial_preflight
before insert on studio.billing_events
for each row
execute function studio.zstudio_require_google_play_trial_preflight();

comment on function studio.zstudio_require_google_play_trial_preflight() is
'Fail-closed production Google Play trial guard. A verified trial current-state can reach the shared commercial writer only after an exact server-side Google purchase intent reserved the global Z Studio trial.';
