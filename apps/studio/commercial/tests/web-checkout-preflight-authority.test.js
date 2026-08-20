import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL(
    '../../../../infrastructure/supabase/migrations/20260820150000_zstudio_web_checkout_preflight_authority_v1.sql',
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

test('creates the three server-only Web preflight authority tables', () => {
  expectAll(
    'create table studio.production_trial_authority',
    'create table studio.billing_customer_bindings',
    'create table studio.web_checkout_intents',
    'alter table studio.production_trial_authority enable row level security;',
    'alter table studio.billing_customer_bindings enable row level security;',
    'alter table studio.web_checkout_intents enable row level security;',
    'revoke all on studio.production_trial_authority\nfrom public, anon, authenticated, service_role;',
    'revoke all on studio.billing_customer_bindings\nfrom public, anon, authenticated, service_role;',
    'revoke all on studio.web_checkout_intents\nfrom public, anon, authenticated, service_role;',
  );
});

test('pins stable Stripe customer identity and one open checkout per person/environment', () => {
  expectAll(
    "billing_source text not null default 'web'",
    "billing_provider text not null default 'stripe'",
    'create unique index uq_studio_billing_customer_binding_person',
    'person_id,\n  billing_source,\n  billing_provider,\n  billing_environment',
    'create unique index uq_studio_billing_customer_binding_provider_ref',
    'create unique index uq_studio_web_checkout_open_person_environment',
    "where state in ('reserved', 'session_created');",
    'create unique index uq_studio_web_checkout_provider_session',
  );
});

test('prepare RPC blocks concurrent commercial chains including recoverable past_due', () => {
  expectAll(
    'create function public.zstudio_prepare_web_checkout(',
    "s.status in (\n        'trialing',\n        'active',\n        'grace',\n        'past_due'",
    "raise exception 'WEB_CHECKOUT_EXISTING_SUBSCRIPTION_BLOCKS'",
    "raise exception 'WEB_CHECKOUT_ALREADY_IN_PROGRESS'",
    "raise exception 'WEB_CHECKOUT_RECONCILIATION_REQUIRED'",
    "v_intent_expires_at := now() + interval '30 minutes';",
  );
});

test('production trial authority is lifetime-per-person while sandbox stays isolated', () => {
  expectAll(
    'person_id uuid primary key\n    references zos.persons(id)',
    "state text not null\n    check (state in ('reserved', 'claimed'))",
    "if v_environment = 'production' then",
    "v_trial.state = 'claimed'",
    'v_trial_eligible := false;',
    "reserved_billing_source = 'web'",
    "reservation_ref = v_intent_id::text",
  );

  assert.equal(
    migration.includes("billing_environment = 'sandbox'\n      and t.state = 'reserved'"),
    false,
    'sandbox checkout must not mutate the lifetime production trial table',
  );
});

test('an abandoned pre-session reservation can release trial but a provider session requires reconciliation', () => {
  expectAll(
    "v_open_intent.state = 'reserved'\n       and v_open_intent.intent_expires_at <= now()",
    "state = 'expired'",
    'delete from studio.production_trial_authority t',
    "v_open_intent.state = 'session_created'\n          and v_open_intent.provider_expires_at <= now()",
    "raise exception 'WEB_CHECKOUT_RECONCILIATION_REQUIRED'",
  );
});

test('customer and Checkout Session provider refs bind through idempotent service-role RPCs', () => {
  expectAll(
    'create function public.zstudio_bind_web_stripe_customer(',
    "return jsonb_build_object(\n        'result', 'duplicate',\n        'binding_id'",
    "raise exception 'WEB_CUSTOMER_BINDING_CONFLICT'",
    "raise exception 'WEB_CUSTOMER_IDENTITY_CONFLICT'",
    'create function public.zstudio_bind_web_checkout_session(',
    "raise exception 'WEB_CHECKOUT_SESSION_CONFLICT'",
    "raise exception 'WEB_CHECKOUT_SESSION_IDENTITY_CONFLICT'",
    "raise exception 'WEB_CHECKOUT_CUSTOMER_NOT_BOUND'",
    'grant execute\non function public.zstudio_bind_web_stripe_customer(uuid, uuid, text, text)\nto service_role;',
    'grant execute\non function public.zstudio_bind_web_checkout_session(uuid, uuid, text, text, timestamptz)\nto service_role;',
  );
});

test('checkout close only releases an unclaimed production trial for verified failure/expiry', () => {
  expectAll(
    'create function public.zstudio_close_web_checkout_intent(',
    "v_final_state not in ('completed', 'expired', 'failed')",
    "v_final_state = 'completed'\n     and v_intent.state <> 'session_created'",
    "v_final_state in ('expired', 'failed')",
    "t.state = 'reserved'",
    "t.reserved_billing_source = 'web'",
    't.reservation_ref = v_intent.id::text;',
  );
});

test('verified production trial_started is claimed atomically inside the commercial writer transaction', () => {
  expectAll(
    'create function studio.zstudio_claim_production_trial_on_billing_event()',
    "new.billing_environment <> 'production'\n     or new.event_type <> 'trial_started'",
    "raise exception 'COMMERCIAL_TRIAL_RESERVATION_REQUIRED'",
    "raise exception 'COMMERCIAL_TRIAL_ALREADY_CLAIMED'",
    "raise exception 'COMMERCIAL_TRIAL_RESERVATION_INVALID'",
    "raise exception 'COMMERCIAL_TRIAL_RESERVATION_CONFLICT'",
    "v_trial.claimed_billing_source = new.billing_source\n       and v_trial.claimed_source_subscription_ref = new.source_subscription_ref",
    "state = 'claimed'",
    'create trigger zstudio_claim_production_trial_before_billing_event',
    'before insert on studio.billing_events',
  );
});

test('all public Web preflight RPCs are service_role-only security definer boundaries', () => {
  const names = [
    'zstudio_prepare_web_checkout',
    'zstudio_bind_web_stripe_customer',
    'zstudio_bind_web_checkout_session',
    'zstudio_close_web_checkout_intent',
  ];

  for (const name of names) {
    assert.ok(migration.includes(`create function public.${name}(`));
  }

  assert.ok(
    (migration.match(/security definer/g) || []).length >= 5,
    'four public RPCs plus the internal trial trigger must be SECURITY DEFINER',
  );
  assert.ok(
    (migration.match(/set search_path = pg_catalog/g) || []).length >= 5,
    'all privileged functions must pin pg_catalog search_path',
  );
  assert.ok(
    (migration.match(/from public, anon, authenticated, service_role;/g) || []).length >= 8,
    'tables and functions must revoke broad/direct access before narrow grants',
  );
});

test('source contains no card/payment-method storage authority', () => {
  for (const forbidden of [
    'card_number',
    'card_cvc',
    'payment_method_details',
    'raw_webhook_payload',
    'stripe_secret_key',
    'webhook_signing_secret',
  ]) {
    assert.equal(
      migration.toLowerCase().includes(forbidden),
      false,
      `migration must not persist or embed ${forbidden}`,
    );
  }
});
