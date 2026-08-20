-- ============================================================
-- Z Studio — Web checkout session reconciliation identity v1
-- ============================================================
--
-- Server-only read authority used by Stripe Checkout Session webhook/current-
-- state reconciliation, including sessions that expire before a Subscription
-- exists. It does not create, update or close commercial state.
--
-- Invariants:
--   * Stripe metadata alone is never canonical ZOS identity authority
--   * the Checkout Session must already be bound by privileged server flow
--   * the stable Stripe Customer binding must match exactly
--   * provider-bound terminal states remain resolvable for idempotent webhook
--     redelivery, while unbound reserved intents are never accepted
--   * browser roles never execute this RPC
-- ============================================================

create function public.zstudio_resolve_web_checkout_session_reconciliation(
  p_source_checkout_session_ref text,
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
  v_session_ref text :=
    trim(coalesce(p_source_checkout_session_ref, ''));
  v_customer_ref text :=
    trim(coalesce(p_source_customer_ref, ''));

  v_intent studio.web_checkout_intents%rowtype;
  v_binding studio.billing_customer_bindings%rowtype;
begin
  if v_environment not in ('sandbox', 'production') then
    raise exception 'WEB_SESSION_RECONCILIATION_ENVIRONMENT_INVALID'
      using errcode = '22023';
  end if;

  if v_session_ref = '' then
    raise exception 'WEB_SESSION_RECONCILIATION_SESSION_REF_REQUIRED'
      using errcode = '22004';
  end if;

  if v_customer_ref = '' then
    raise exception 'WEB_SESSION_RECONCILIATION_CUSTOMER_REF_REQUIRED'
      using errcode = '22004';
  end if;

  select i.*
    into v_intent
  from studio.web_checkout_intents i
  where i.billing_environment = v_environment
    and i.source_checkout_session_ref = v_session_ref;

  if not found then
    raise exception 'WEB_SESSION_RECONCILIATION_INTENT_NOT_FOUND'
      using errcode = '23503';
  end if;

  if v_intent.state = 'reserved' then
    raise exception 'WEB_SESSION_RECONCILIATION_INTENT_STATE_INVALID'
      using errcode = '55000';
  end if;

  if v_intent.source_checkout_session_ref is null
     or trim(v_intent.source_checkout_session_ref) = '' then
    raise exception 'WEB_SESSION_RECONCILIATION_SESSION_NOT_BOUND'
      using errcode = '55000';
  end if;

  select b.*
    into v_binding
  from studio.billing_customer_bindings b
  where b.id = v_intent.billing_customer_binding_id;

  if not found then
    raise exception 'WEB_SESSION_RECONCILIATION_CUSTOMER_BINDING_NOT_FOUND'
      using errcode = '23503';
  end if;

  if v_binding.person_id <> v_intent.person_id
     or v_binding.billing_source <> 'web'
     or v_binding.billing_provider <> 'stripe'
     or v_binding.billing_environment <> v_environment then
    raise exception 'WEB_SESSION_RECONCILIATION_CUSTOMER_BINDING_CONFLICT'
      using errcode = '23514';
  end if;

  if v_binding.source_customer_ref is null
     or trim(v_binding.source_customer_ref) = '' then
    raise exception 'WEB_SESSION_RECONCILIATION_CUSTOMER_NOT_BOUND'
      using errcode = '55000';
  end if;

  if v_binding.source_customer_ref <> v_customer_ref then
    raise exception 'WEB_SESSION_RECONCILIATION_CUSTOMER_MISMATCH'
      using errcode = '23514';
  end if;

  return jsonb_build_object(
    'result', 'resolved',
    'person_id', v_intent.person_id,
    'checkout_intent_id', v_intent.id,
    'plan_code', v_intent.plan_code,
    'billing_environment', v_environment,
    'source_customer_ref', v_customer_ref,
    'source_checkout_session_ref', v_intent.source_checkout_session_ref,
    'intent_state', v_intent.state,
    'trial_reserved', v_intent.trial_reserved,
    'provider_expires_at', v_intent.provider_expires_at
  );
end;
$$;

comment on function
public.zstudio_resolve_web_checkout_session_reconciliation(text, text, text)
is
'Server-only read authority that resolves a provider-bound Stripe Checkout Session and stable Stripe Customer back to the canonical Z Studio checkout intent and ZOS person, including idempotent terminal-state redelivery before any Subscription exists.';

revoke all
on function
public.zstudio_resolve_web_checkout_session_reconciliation(text, text, text)
from public, anon, authenticated, service_role;

grant execute
on function
public.zstudio_resolve_web_checkout_session_reconciliation(text, text, text)
to service_role;
