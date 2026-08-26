-- ============================================================
-- Z Studio — Google Play pause authority v1
-- ============================================================
--
-- Narrow server-only authority for Google Play SUBSCRIPTION_STATE_PAUSED.
-- The shared commercial writer remains authoritative for every other state.
-- A pause never creates a provider subscription, never grants access, and can
-- only transition an already verified Google Play subscription belonging to
-- the same canonical ZOS person.
-- ============================================================

alter table studio.subscriptions
  drop constraint if exists subscriptions_status_check;

alter table studio.subscriptions
  add constraint subscriptions_status_check
  check (
    status in (
      'trialing',
      'active',
      'grace',
      'past_due',
      'paused',
      'cancelled',
      'expired',
      'revoked'
    )
  );

alter table studio.billing_events
  drop constraint if exists billing_events_event_type_check;

alter table studio.billing_events
  add constraint billing_events_event_type_check
  check (
    event_type in (
      'trial_started',
      'activated',
      'renewed',
      'grace_started',
      'past_due',
      'pause_started',
      'recovered',
      'renewal_disabled',
      'expired',
      'revoked',
      'restored'
    )
  );

alter table studio.billing_events
  drop constraint if exists billing_events_target_status_check;

alter table studio.billing_events
  add constraint billing_events_target_status_check
  check (
    target_status in (
      'trialing',
      'active',
      'grace',
      'past_due',
      'paused',
      'cancelled',
      'expired',
      'revoked'
    )
  );

create function public.zstudio_apply_verified_google_play_pause_event(
  p_person_id uuid,
  p_billing_environment text,
  p_source_event_ref text,
  p_source_subscription_ref text,
  p_source_product_ref text,
  p_plan_code text,
  p_effective_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_environment text := lower(trim(coalesce(p_billing_environment, '')));
  v_event_ref text := trim(coalesce(p_source_event_ref, ''));
  v_subscription_ref text := trim(coalesce(p_source_subscription_ref, ''));
  v_product_ref text := trim(coalesce(p_source_product_ref, ''));
  v_plan_code text := lower(trim(coalesce(p_plan_code, '')));
  v_expected_product_ref text;
  v_existing_event studio.billing_events%rowtype;
  v_subscription studio.subscriptions%rowtype;
  v_processing_status text := 'applied';
begin
  if p_person_id is null then
    raise exception 'GOOGLE_PLAY_PAUSE_PERSON_REQUIRED'
      using errcode = '22004';
  end if;

  if v_environment not in ('sandbox', 'production') then
    raise exception 'GOOGLE_PLAY_PAUSE_ENVIRONMENT_INVALID'
      using errcode = '22023';
  end if;

  if v_plan_code not in ('weekly', 'monthly', 'annual') then
    raise exception 'GOOGLE_PLAY_PAUSE_PLAN_INVALID'
      using errcode = '22023';
  end if;

  if v_event_ref !~ '^google:play:event:[A-Za-z0-9._:-]+:snapshot:[0-9a-f]{64}$' then
    raise exception 'GOOGLE_PLAY_PAUSE_EVENT_REF_INVALID'
      using errcode = '22023';
  end if;

  if v_subscription_ref !~ '^google:play:purchase:[0-9a-f]{64}$' then
    raise exception 'GOOGLE_PLAY_PAUSE_SUBSCRIPTION_REF_INVALID'
      using errcode = '22023';
  end if;

  v_expected_product_ref :=
    'google:play:product:zstudio.access:base_plan:' || v_plan_code;

  if v_product_ref <> v_expected_product_ref then
    raise exception 'GOOGLE_PLAY_PAUSE_PRODUCT_REF_INVALID'
      using errcode = '22023';
  end if;

  if p_effective_at is null then
    raise exception 'GOOGLE_PLAY_PAUSE_EFFECTIVE_AT_REQUIRED'
      using errcode = '22004';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'google_play:' || v_environment || ':event:' || v_event_ref,
      0
    )
  );

  select e.*
    into v_existing_event
  from studio.billing_events e
  where e.billing_source = 'google_play'
    and e.billing_environment = v_environment
    and e.source_event_ref = v_event_ref;

  if found then
    if v_existing_event.person_id = p_person_id
       and v_existing_event.source_subscription_ref = v_subscription_ref
       and v_existing_event.source_product_ref = v_product_ref
       and v_existing_event.event_type = 'pause_started'
       and v_existing_event.target_plan_code = v_plan_code
       and v_existing_event.target_status = 'paused'
       and v_existing_event.trial_started_at is null
       and v_existing_event.trial_ends_at is null
       and v_existing_event.current_period_start is null
       and v_existing_event.current_period_end is null
       and v_existing_event.cancel_at_period_end = false
       and v_existing_event.effective_at = p_effective_at then
      return jsonb_build_object(
        'result', 'duplicate',
        'subscription_id', v_existing_event.subscription_id,
        'processing_status', v_existing_event.processing_status
      );
    end if;

    raise exception 'GOOGLE_PLAY_PAUSE_EVENT_CONFLICT'
      using errcode = '23505';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'google_play:' || v_environment || ':subscription:' || v_subscription_ref,
      0
    )
  );

  select s.*
    into v_subscription
  from studio.subscriptions s
  where s.billing_source = 'google_play'
    and s.billing_environment = v_environment
    and s.source_subscription_ref = v_subscription_ref
  for update;

  if not found then
    raise exception 'GOOGLE_PLAY_PAUSE_SUBSCRIPTION_NOT_FOUND'
      using errcode = '23503';
  end if;

  if v_subscription.person_id <> p_person_id then
    raise exception 'GOOGLE_PLAY_PAUSE_IDENTITY_CONFLICT'
      using errcode = '23514';
  end if;

  if v_subscription.plan_code <> v_plan_code
     or v_subscription.source_product_ref <> v_product_ref then
    raise exception 'GOOGLE_PLAY_PAUSE_SUBSCRIPTION_AUTHORITY_CONFLICT'
      using errcode = '23514';
  end if;

  if v_subscription.status = 'revoked' then
    raise exception 'COMMERCIAL_SUBSCRIPTION_REVOKED'
      using errcode = '23514';
  end if;

  if v_subscription.store_event_high_water_at is not null
     and p_effective_at < v_subscription.store_event_high_water_at then
    v_processing_status := 'ignored_stale';
  elsif v_subscription.store_event_high_water_at = p_effective_at then
    if v_subscription.status <> 'paused'
       or v_subscription.last_store_event_ref is distinct from v_event_ref then
      raise exception 'COMMERCIAL_EVENT_ORDER_CONFLICT'
        using errcode = '23514';
    end if;
  else
    update studio.subscriptions s
    set
      status = 'paused',
      cancel_at_period_end = false,
      store_event_high_water_at = case
        when s.store_event_high_water_at is null then p_effective_at
        else greatest(s.store_event_high_water_at, p_effective_at)
      end,
      last_store_event_at = p_effective_at,
      last_store_event_ref = v_event_ref,
      last_store_event_type = 'pause_started',
      updated_at = now()
    where s.id = v_subscription.id
    returning * into v_subscription;

    insert into studio.entitlements (
      person_id,
      subscription_id,
      entitlement_code,
      status,
      source,
      starts_at,
      expires_at
    )
    values
      (
        p_person_id,
        v_subscription.id,
        'studio_access',
        'expired',
        'subscription',
        p_effective_at,
        null
      ),
      (
        p_person_id,
        v_subscription.id,
        'ai_access',
        'expired',
        'subscription',
        p_effective_at,
        null
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
    'google_play',
    v_environment,
    v_event_ref,
    v_subscription_ref,
    v_product_ref,
    p_person_id,
    v_subscription.id,
    'pause_started',
    v_plan_code,
    'paused',
    null,
    null,
    null,
    null,
    false,
    p_effective_at,
    v_processing_status
  );

  return jsonb_build_object(
    'result', case
      when v_processing_status = 'ignored_stale' then 'ignored_stale'
      when v_subscription.status = 'paused' then 'applied'
      else 'applied_same_state'
    end,
    'subscription_id', v_subscription.id,
    'subscription_status', v_subscription.status,
    'plan_code', v_subscription.plan_code,
    'studio_access_status', case
      when v_processing_status = 'ignored_stale' then null
      else 'expired'
    end,
    'ai_access_status', case
      when v_processing_status = 'ignored_stale' then null
      else 'expired'
    end
  );
end;
$$;

comment on function public.zstudio_apply_verified_google_play_pause_event(
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) is
'Applies verified Google Play paused current-state to an existing provider-bound Z Studio subscription. Service-role only; never accepts or stores a raw purchase token.';

revoke all
on function public.zstudio_apply_verified_google_play_pause_event(
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz
)
from public, anon, authenticated, service_role;

grant execute
on function public.zstudio_apply_verified_google_play_pause_event(
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz
)
to service_role;
