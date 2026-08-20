-- ============================================================
-- Z Studio — Web terminal-trial consumption authority v1
-- ============================================================
--
-- Forward-only server authority for the out-of-order Web webhook case where
-- fresh Stripe current state is already terminal but proves that a trial was
-- created. This claims the lifetime production trial without granting access.
-- Entitlement state remains exclusively controlled by the existing verified
-- commercial writer.
--
-- Invariants:
--   * service-role only; browser roles never execute this RPC
--   * sandbox never mutates lifetime production trial authority
--   * the exact provider-bound checkout intent and stable Stripe Customer must
--     still resolve to the canonical ZOS person
--   * an expired reservation may still be claimed when it is the same exact
--     reservation; webhook delivery latency cannot resurrect trial eligibility
--   * a claimed trial is permanent and provider-subscription bound
--   * this RPC never mutates subscriptions, entitlements or billing events
-- ============================================================

create function public.zstudio_claim_verified_web_trial_consumption(
  p_checkout_intent_id uuid,
  p_person_id uuid,
  p_source_customer_ref text,
  p_source_subscription_ref text,
  p_billing_environment text,
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
  v_customer_ref text := trim(coalesce(p_source_customer_ref, ''));
  v_subscription_ref text := trim(coalesce(p_source_subscription_ref, ''));
  v_intent studio.web_checkout_intents%rowtype;
  v_binding studio.billing_customer_bindings%rowtype;
  v_trial studio.production_trial_authority%rowtype;
begin
  if p_checkout_intent_id is null or p_person_id is null then
    raise exception 'WEB_TRIAL_CONSUMPTION_IDENTITY_REQUIRED'
      using errcode = '22004';
  end if;

  if v_environment not in ('sandbox', 'production') then
    raise exception 'WEB_TRIAL_CONSUMPTION_ENVIRONMENT_INVALID'
      using errcode = '22023';
  end if;

  if v_customer_ref !~ '^cus_[A-Za-z0-9]+$' then
    raise exception 'WEB_TRIAL_CONSUMPTION_CUSTOMER_REF_INVALID'
      using errcode = '22023';
  end if;

  if v_subscription_ref !~ '^stripe:web:subscription:sub_[A-Za-z0-9]+$' then
    raise exception 'WEB_TRIAL_CONSUMPTION_SUBSCRIPTION_REF_INVALID'
      using errcode = '22023';
  end if;

  if p_effective_at is null then
    raise exception 'WEB_TRIAL_CONSUMPTION_EFFECTIVE_AT_REQUIRED'
      using errcode = '22004';
  end if;

  -- Sandbox can exercise the same runtime path repeatedly without consuming
  -- the one lifetime production trial authority.
  if v_environment = 'sandbox' then
    return jsonb_build_object(
      'result', 'sandbox_ignored',
      'checkout_intent_id', p_checkout_intent_id,
      'person_id', p_person_id,
      'source_subscription_ref', v_subscription_ref
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'zstudio:production-trial:' || p_person_id::text,
      0
    )
  );

  select i.*
    into v_intent
  from studio.web_checkout_intents i
  where i.id = p_checkout_intent_id
    and i.person_id = p_person_id
    and i.billing_environment = 'production'
  for update;

  if not found then
    raise exception 'WEB_TRIAL_CONSUMPTION_INTENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_intent.state not in ('session_created', 'completed') then
    raise exception 'WEB_TRIAL_CONSUMPTION_INTENT_STATE_INVALID'
      using errcode = '55000';
  end if;

  if not v_intent.trial_reserved then
    raise exception 'WEB_TRIAL_CONSUMPTION_NOT_RESERVED'
      using errcode = '23514';
  end if;

  if v_intent.source_checkout_session_ref is null
     or trim(v_intent.source_checkout_session_ref) = '' then
    raise exception 'WEB_TRIAL_CONSUMPTION_SESSION_NOT_BOUND'
      using errcode = '55000';
  end if;

  select b.*
    into v_binding
  from studio.billing_customer_bindings b
  where b.id = v_intent.billing_customer_binding_id;

  if not found then
    raise exception 'WEB_TRIAL_CONSUMPTION_CUSTOMER_BINDING_NOT_FOUND'
      using errcode = '23503';
  end if;

  if v_binding.person_id <> p_person_id
     or v_binding.billing_source <> 'web'
     or v_binding.billing_provider <> 'stripe'
     or v_binding.billing_environment <> 'production'
     or v_binding.source_customer_ref is null
     or trim(v_binding.source_customer_ref) = ''
     or v_binding.source_customer_ref <> v_customer_ref then
    raise exception 'WEB_TRIAL_CONSUMPTION_CUSTOMER_BINDING_CONFLICT'
      using errcode = '23514';
  end if;

  select t.*
    into v_trial
  from studio.production_trial_authority t
  where t.person_id = p_person_id
  for update;

  if not found then
    raise exception 'WEB_TRIAL_CONSUMPTION_AUTHORITY_MISSING'
      using errcode = '23514';
  end if;

  if v_trial.state = 'claimed' then
    if v_trial.claimed_billing_source = 'web'
       and v_trial.claimed_source_subscription_ref = v_subscription_ref then
      return jsonb_build_object(
        'result', 'duplicate',
        'checkout_intent_id', v_intent.id,
        'person_id', p_person_id,
        'source_subscription_ref', v_subscription_ref
      );
    end if;

    raise exception 'WEB_TRIAL_CONSUMPTION_ALREADY_CLAIMED'
      using errcode = '23514';
  end if;

  -- Do not use reservation expiry as permission to forget a trial that Stripe
  -- has already proven existed. The exact reservation identity remains the
  -- authority; a different/replaced reservation fails closed.
  if v_trial.reserved_billing_source <> 'web'
     or v_trial.reservation_ref <> v_intent.id::text then
    raise exception 'WEB_TRIAL_CONSUMPTION_RESERVATION_CONFLICT'
      using errcode = '23514';
  end if;

  update studio.production_trial_authority t
  set
    state = 'claimed',
    claimed_billing_source = 'web',
    claimed_source_subscription_ref = v_subscription_ref,
    claimed_at = p_effective_at,
    updated_at = now()
  where t.person_id = p_person_id
  returning * into v_trial;

  return jsonb_build_object(
    'result', 'claimed',
    'checkout_intent_id', v_intent.id,
    'person_id', p_person_id,
    'source_subscription_ref', v_trial.claimed_source_subscription_ref,
    'claimed_at', v_trial.claimed_at
  );
end;
$$;

comment on function
public.zstudio_claim_verified_web_trial_consumption(uuid, uuid, text, text, text, timestamptz)
is
'Service-role authority for claiming a verified Stripe Web trial that was already consumed when current provider state is terminal. It never grants entitlement and prevents webhook ordering from reopening lifetime trial eligibility.';

revoke all
on function
public.zstudio_claim_verified_web_trial_consumption(uuid, uuid, text, text, text, timestamptz)
from public, anon, authenticated, service_role;

grant execute
on function
public.zstudio_claim_verified_web_trial_consumption(uuid, uuid, text, text, text, timestamptz)
to service_role;
