import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL(
    '../../../../infrastructure/supabase/migrations/20260820220000_zstudio_web_terminal_trial_claim_authority_v1.sql',
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

test('creates one service-role terminal-trial consumption authority', () => {
  expectAll(
    'create function public.zstudio_claim_verified_web_trial_consumption(',
    'p_checkout_intent_id uuid,',
    'p_person_id uuid,',
    'p_source_customer_ref text,',
    'p_source_subscription_ref text,',
    'p_billing_environment text,',
    'p_effective_at timestamptz',
    'returns jsonb',
    'language plpgsql',
    'volatile',
    'security definer',
    'set search_path = pg_catalog',
  );
});

test('binds the claim to exact canonical person, checkout intent and Stripe customer', () => {
  expectAll(
    'from studio.web_checkout_intents i',
    'i.id = p_checkout_intent_id',
    'i.person_id = p_person_id',
    "i.billing_environment = 'production'",
    "v_intent.state not in ('session_created', 'completed')",
    'not v_intent.trial_reserved',
    'v_intent.source_checkout_session_ref is null',
    'from studio.billing_customer_bindings b',
    'b.id = v_intent.billing_customer_binding_id',
    "v_binding.billing_source <> 'web'",
    "v_binding.billing_provider <> 'stripe'",
    'v_binding.source_customer_ref <> v_customer_ref',
  );
});

test('keeps sandbox isolated and makes same production provider claim duplicate-safe', () => {
  expectAll(
    "if v_environment = 'sandbox' then",
    "'result', 'sandbox_ignored'",
    "if v_trial.state = 'claimed' then",
    "v_trial.claimed_billing_source = 'web'",
    'v_trial.claimed_source_subscription_ref = v_subscription_ref',
    "'result', 'duplicate'",
  );
});

test('claims the exact reservation even after delivery latency without granting access', () => {
  expectAll(
    "v_trial.reserved_billing_source <> 'web'",
    'v_trial.reservation_ref <> v_intent.id::text',
    "state = 'claimed'",
    "claimed_billing_source = 'web'",
    'claimed_source_subscription_ref = v_subscription_ref',
    'claimed_at = p_effective_at',
  );

  const body = migration
    .split('as $$')[1]
    .split('$$;')[0]
    .toLowerCase();

  for (const forbidden of [
    'studio.subscriptions',
    'studio.entitlements',
    'studio.billing_events',
    'zstudio_apply_verified_commercial_event',
  ]) {
    assert.equal(
      body.includes(forbidden),
      false,
      `trial claim RPC must not mutate or invoke ${forbidden}`,
    );
  }
});

test('is fail-closed, server-only and does not accept raw provider payload authority', () => {
  expectAll(
    "v_customer_ref !~ '^cus_[A-Za-z0-9]+$'",
    "v_subscription_ref !~ '^stripe:web:subscription:sub_[A-Za-z0-9]+$'",
    "raise exception 'WEB_TRIAL_CONSUMPTION_AUTHORITY_MISSING'",
    "raise exception 'WEB_TRIAL_CONSUMPTION_ALREADY_CLAIMED'",
    "raise exception 'WEB_TRIAL_CONSUMPTION_RESERVATION_CONFLICT'",
    'revoke all\non function\npublic.zstudio_claim_verified_web_trial_consumption(uuid, uuid, text, text, text, timestamptz)\nfrom public, anon, authenticated, service_role;',
    'grant execute\non function\npublic.zstudio_claim_verified_web_trial_consumption(uuid, uuid, text, text, text, timestamptz)\nto service_role;',
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
