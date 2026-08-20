import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL(
    '../../../../infrastructure/supabase/migrations/20260820183000_zstudio_web_subscription_reconciliation_identity_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

function expectAll(...needles) {
  for (const needle of needles) {
    assert.ok(
      migration.includes(needle),
      `migration must include ${JSON.stringify(needle)}`,
    );
  }
}

test('creates one read-only server reconciliation identity RPC', () => {
  expectAll(
    'create function public.zstudio_resolve_web_subscription_reconciliation(',
    'returns jsonb',
    'language plpgsql',
    'stable',
    'security definer',
    'set search_path = pg_catalog',
    'public.zstudio_resolve_web_subscription_reconciliation(uuid, text, text, text)',
    'from public, anon, authenticated, service_role;',
    'to service_role;',
  );

  assert.equal(
    migration.includes('volatile'),
    false,
    'identity resolver must be read-only STABLE authority',
  );
});

test('requires a provider-bound checkout intent in the exact environment', () => {
  expectAll(
    "raise exception 'WEB_RECONCILIATION_INTENT_REQUIRED'",
    "raise exception 'WEB_RECONCILIATION_ENVIRONMENT_INVALID'",
    'from studio.web_checkout_intents i',
    'where i.id = p_checkout_intent_id;',
    "v_intent.state not in ('session_created', 'completed')",
    "raise exception 'WEB_RECONCILIATION_INTENT_STATE_INVALID'",
    "raise exception 'WEB_RECONCILIATION_SESSION_NOT_BOUND'",
    "raise exception 'WEB_RECONCILIATION_ENVIRONMENT_MISMATCH'",
  );
});

test('pins canonical person through the exact stable Stripe Customer binding', () => {
  expectAll(
    'from studio.billing_customer_bindings b',
    'where b.id = v_intent.billing_customer_binding_id;',
    "v_binding.billing_source <> 'web'",
    "v_binding.billing_provider <> 'stripe'",
    'v_binding.person_id <> v_intent.person_id',
    'v_binding.billing_environment <> v_environment',
    "raise exception 'WEB_RECONCILIATION_CUSTOMER_BINDING_CONFLICT'",
    "raise exception 'WEB_RECONCILIATION_CUSTOMER_NOT_BOUND'",
    'v_binding.source_customer_ref <> v_customer_ref',
    "raise exception 'WEB_RECONCILIATION_CUSTOMER_MISMATCH'",
  );
});

test('an already-known Web subscription cannot drift person, plan or customer', () => {
  expectAll(
    'from studio.subscriptions s',
    "where s.billing_source = 'web'",
    'and s.billing_environment = v_environment',
    'and s.source_subscription_ref = v_subscription_ref;',
    'v_subscription.person_id <> v_intent.person_id',
    "raise exception 'WEB_RECONCILIATION_SUBSCRIPTION_IDENTITY_CONFLICT'",
    'v_subscription.plan_code <> v_intent.plan_code',
    "raise exception 'WEB_RECONCILIATION_SUBSCRIPTION_PLAN_CONFLICT'",
    'v_subscription.source_customer_ref <> v_customer_ref',
    "raise exception 'WEB_RECONCILIATION_SUBSCRIPTION_CUSTOMER_CONFLICT'",
  );
});

test('returns normalized correlation only and introduces no DML or secret payload authority', () => {
  expectAll(
    "'result', 'resolved'",
    "'person_id', v_intent.person_id",
    "'checkout_intent_id', v_intent.id",
    "'plan_code', v_intent.plan_code",
    "'source_checkout_session_ref', v_intent.source_checkout_session_ref",
    "'source_subscription_ref', v_subscription_ref",
    "'subscription_already_known', found",
  );

  const lower = migration.toLowerCase();
  for (const forbidden of [
    'insert into ',
    'update studio.',
    'delete from ',
    'raw_webhook_payload',
    'stripe_secret_key',
    'webhook_signing_secret',
    'payment_method_details',
    'card_number',
    'card_cvc',
  ]) {
    assert.equal(
      lower.includes(forbidden),
      false,
      `migration must not contain ${forbidden}`,
    );
  }
});
