-- ============================================================
-- Z Studio — Web subscription reconciliation identity v1
-- ============================================================
--
-- Server-only read authority used by Stripe webhook/current-state
-- reconciliation. It does not create, update or close commercial state.
--
-- Invariants:
--   * webhook metadata alone is never canonical ZOS identity authority
--   * the checkout intent must already be provider-bound
--   * the stable Stripe Customer binding must match exactly
--   * an already-known Web subscription can never move to another person/plan
--   * browser roles never execute this RPC
-- ============================================================

create function public.zstudio_resolve_web_subscription_reconciliation(
  p_checkout_intent_id uuid,
  p_source_subscription_ref text,
  p_source_customer_ref text,
  p_billing_environment text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_environment text :=
    lower(trim(coalesce(p_billing_environment, '')));
  v_subscription_ref text :=
    trim(coalesce(p_source_subscription_ref, ''));
  v_customer_ref text :=
    trim(coalesce(p_source_customer_ref, ''));

  v_intent studio.web_checkout_intents%rowtype;
  v_binding studio.billing_customer_bindings%rowtype;
  v_subscription studio.subscriptions%rowtype;
begin
  if p_checkout_intent_id is null then
    raise exception 'WEB_RECONCILIATION_INTENT_REQUIRED'
      using errcode = '22004';
  end if;

  if v_environment not in ('sandbox', 'production') then
    raise exception 'WEB_RECONCILIATION_ENVIRONMENT_INVALID'
      using errcode = '22023';
  end if;

  if v_subscription_ref = '' then
    raise exception 'WEB_RECONCILIATION_SUBSCRIPTION_REF_REQUIRED'
      using errcode = '22004';
  end if;

  if v_customer_ref = '' then
    raise exception 'WEB_RECONCILIATION_CUSTOMER_REF_REQUIRED'
      using errcode = '22004';
  end if;

  select i.*
    into v_intent
  from studio.web_checkout_intents i
  where i.id = p_checkout_intent_id;

  if not found then
    raise exception 'WEB_RECONCILIATION_INTENT_NOT_FOUND'
      using errcode = '23503';
  end if;

  if v_intent.billing_environment <> v_environment then
    raise exception 'WEB_RECONCILIATION_ENVIRONMENT_MISMATCH'
      using errcode = '23514';
  end if;

  if v_intent.state not in ('session_created', 'completed') then
    raise exception 'WEB_RECONCILIATION_INTENT_STATE_INVALID'
      using errcode = '55000';
  end if;

  if v_intent.source_checkout_session_ref is null
     or trim(v_intent.source_checkout_session_ref) = '' then
    raise exception 'WEB_RECONCILIATION_SESSION_NOT_BOUND'
      using errcode = '55000';
  end if;

  select b.*
    into v_binding
  from studio.billing_customer_bindings b
  where b.id = v_intent.billing_customer_binding_id;

  if not found then
    raise exception 'WEB_RECONCILIATION_CUSTOMER_BINDING_NOT_FOUND'
      using errcode = '23503';
  end if;

  if v_binding.person_id <> v_intent.person_id
     or v_binding.billing_source <> 'web'
     or v_binding.billing_provider <> 'stripe'
     or v_binding.billing_environment <> v_environment then
    raise exception 'WEB_RECONCILIATION_CUSTOMER_BINDING_CONFLICT'
      using errcode = '23514';
  end if;

  if v_binding.source_customer_ref is null
     or trim(v_binding.source_customer_ref) = '' then
    raise exception 'WEB_RECONCILIATION_CUSTOMER_NOT_BOUND'
      using errcode = '55000';
  end if;

  if v_binding.source_customer_ref <> v_customer_ref then
    raise exception 'WEB_RECONCILIATION_CUSTOMER_MISMATCH'
      using errcode = '23514';
  end if;

  select s.*
    into v_subscription
  from studio.subscriptions s
  where s.billing_source = 'web'
    and s.billing_environment = v_environment
    and s.source_subscription_ref = v_subscription_ref;

  if found then
    if v_subscription.person_id <> v_intent.person_id then
      raise exception 'WEB_RECONCILIATION_SUBSCRIPTION_IDENTITY_CONFLICT'
        using errcode = '23514';
    end if;

    if v_subscription.plan_code <> v_intent.plan_code then
      raise exception 'WEB_RECONCILIATION_SUBSCRIPTION_PLAN_CONFLICT'
        using errcode = '23514';
    end if;

    if v_subscription.source_customer_ref is not null
       and trim(v_subscription.source_customer_ref) <> ''
       and v_subscription.source_customer_ref <> v_customer_ref then
      raise exception 'WEB_RECONCILIATION_SUBSCRIPTION_CUSTOMER_CONFLICT'
        using errcode = '23514';
    end if;
  end if;

  return jsonb_build_object(
    'result', 'resolved',
    'person_id', v_intent.person_id,
    'checkout_intent_id', v_intent.id,
    'plan_code', v_intent.plan_code,
    'billing_environment', v_environment,
    'source_customer_ref', v_customer_ref,
    'source_checkout_session_ref', v_intent.source_checkout_session_ref,
    'source_subscription_ref', v_subscription_ref,
    'trial_reserved', v_intent.trial_reserved,
    'subscription_already_known', found
  );
end;
$$;

comment on function
public.zstudio_resolve_web_subscription_reconciliation(uuid, text, text, text)
is
'Server-only read authority that resolves a Stripe Web subscription trigger back to the provider-bound Z Studio checkout intent, stable customer binding and canonical ZOS person before current-state commercial reconciliation.';

revoke all
on function
public.zstudio_resolve_web_subscription_reconciliation(uuid, text, text, text)
from public, anon, authenticated, service_role;

grant execute
on function
public.zstudio_resolve_web_subscription_reconciliation(uuid, text, text, text)
to service_role;
