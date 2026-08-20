import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL(
    '../../../../infrastructure/supabase/migrations/20260820210500_zstudio_web_checkout_session_reconciliation_identity_v1.sql',
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

test('creates one stable server-only Checkout Session reconciliation resolver', () => {
  expectAll(
    'create function public.zstudio_resolve_web_checkout_session_reconciliation(',
    'p_source_checkout_session_ref text,',
    'p_source_customer_ref text,',
    'p_billing_environment text',
    'returns jsonb',
    'language plpgsql',
    'stable',
    'security definer',
    'set search_path = pg_catalog',
  );
});

test('resolves exact bound Session and Stripe Customer back to canonical intent person', () => {
  expectAll(
    'from studio.web_checkout_intents i',
    'i.billing_environment = v_environment',
    'i.source_checkout_session_ref = v_session_ref',
    'from studio.billing_customer_bindings b',
    'b.id = v_intent.billing_customer_binding_id',
    "v_binding.billing_source <> 'web'",
    "v_binding.billing_provider <> 'stripe'",
    'v_binding.person_id <> v_intent.person_id',
    'v_binding.source_customer_ref <> v_customer_ref',
  );
});

test('rejects unbound reserved intents but preserves provider-bound terminal identity for redelivery', () => {
  expectAll(
    "if v_intent.state = 'reserved' then",
    "raise exception 'WEB_SESSION_RECONCILIATION_INTENT_STATE_INVALID'",
    "raise exception 'WEB_SESSION_RECONCILIATION_SESSION_NOT_BOUND'",
  );

  for (const forbiddenStateRestriction of [
    "state in ('session_created', 'completed')",
    "state = 'session_created'",
    "state = 'completed'",
  ]) {
    assert.equal(
      migration.includes(forbiddenStateRestriction),
      false,
      'terminal provider-bound intents must remain resolvable for idempotent redelivery',
    );
  }
});

test('returns normalized correlation only and no provider payload authority', () => {
  expectAll(
    "'person_id', v_intent.person_id",
    "'checkout_intent_id', v_intent.id",
    "'plan_code', v_intent.plan_code",
    "'billing_environment', v_environment",
    "'source_customer_ref', v_customer_ref",
    "'source_checkout_session_ref', v_intent.source_checkout_session_ref",
    "'intent_state', v_intent.state",
    "'trial_reserved', v_intent.trial_reserved",
    "'provider_expires_at', v_intent.provider_expires_at",
  );

  for (const forbidden of [
    'raw_webhook_payload',
    'stripe_secret_key',
    'webhook_signing_secret',
    'payment_method_details',
    'card_number',
    'card_cvc',
  ]) {
    assert.equal(migration.toLowerCase().includes(forbidden), false);
  }
});

test('is service_role-only and read-only at the SQL source boundary', () => {
  expectAll(
    'revoke all\non function\npublic.zstudio_resolve_web_checkout_session_reconciliation(text, text, text)\nfrom public, anon, authenticated, service_role;',
    'grant execute\non function\npublic.zstudio_resolve_web_checkout_session_reconciliation(text, text, text)\nto service_role;',
  );

  const body = migration
    .split('as $$')[1]
    .split('$$;')[0]
    .toLowerCase();

  for (const mutation of ['insert into', 'update ', 'delete from']) {
    assert.equal(
      body.includes(mutation),
      false,
      `resolver body must not contain ${mutation}`,
    );
  }
});
