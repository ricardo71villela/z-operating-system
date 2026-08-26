import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWebReconciliationClient,
  WebReconciliationRpcError,
} from '../lib/web-reconciliation-client.js';

const PERSON = '11111111-1111-4111-8111-111111111111';
const INTENT = '33333333-3333-4333-8333-333333333333';
const config = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseSecretKey: 'sb_secret_test',
};

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(payload); },
  };
}

test('resolves subscription identity through service-role RPC with namespaced ref', async () => {
  let call;
  const client = createWebReconciliationClient(config, {
    fetchImpl: async (url, options) => {
      call = { url, options, body: JSON.parse(options.body) };
      return response(200, {
        result: 'resolved', person_id: PERSON, checkout_intent_id: INTENT,
        plan_code: 'monthly', billing_environment: 'sandbox',
        source_customer_ref: 'cus_abc123',
        source_checkout_session_ref: 'cs_test_abc123',
        source_subscription_ref: 'stripe:web:subscription:sub_abc123',
        trial_reserved: true, subscription_already_known: false,
      });
    },
  });
  const result = await client.resolveSubscription({
    checkoutIntentId: INTENT,
    sourceSubscriptionRef: 'stripe:web:subscription:sub_abc123',
    sourceCustomerRef: 'cus_abc123',
    billingEnvironment: 'sandbox',
  });
  assert.match(call.url, /zstudio_resolve_web_subscription_reconciliation$/);
  assert.equal(call.options.headers.Authorization, 'Bearer sb_secret_test');
  assert.equal(call.body.p_checkout_intent_id, INTENT);
  assert.equal(result.personId, PERSON);
  assert.equal(result.trialReserved, true);
});

test('resolves provider-bound Checkout Session identity', async () => {
  const client = createWebReconciliationClient(config, {
    fetchImpl: async () => response(200, {
      result: 'resolved', person_id: PERSON, checkout_intent_id: INTENT,
      plan_code: 'weekly', billing_environment: 'production',
      source_customer_ref: 'cus_abc123', source_checkout_session_ref: 'cs_live_abc123',
      intent_state: 'completed', trial_reserved: false, provider_expires_at: null,
    }),
  });
  const result = await client.resolveCheckoutSession({
    sourceCheckoutSessionRef: 'cs_live_abc123',
    sourceCustomerRef: 'cus_abc123',
    billingEnvironment: 'production',
  });
  assert.equal(result.intentState, 'completed');
  assert.equal(result.planCode, 'weekly');
});

test('claims verified trial consumption with exact provider subscription authority', async () => {
  let body;
  const client = createWebReconciliationClient(config, {
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return response(200, {
        result: 'claimed', person_id: PERSON, checkout_intent_id: INTENT,
        source_subscription_ref: 'stripe:web:subscription:sub_abc123',
      });
    },
  });
  const result = await client.claimVerifiedTrialConsumption({
    checkoutIntentId: INTENT,
    personId: PERSON,
    sourceCustomerRef: 'cus_abc123',
    sourceSubscriptionRef: 'stripe:web:subscription:sub_abc123',
    billingEnvironment: 'production',
    effectiveAtMs: 1787260000000,
  });
  assert.equal(body.p_effective_at, '2026-08-20T21:06:40.000Z');
  assert.equal(result.result, 'claimed');
});

test('marks transient Supabase failure retryable', async () => {
  const client = createWebReconciliationClient(config, {
    fetchImpl: async () => response(503, { message: 'unavailable' }),
  });
  await assert.rejects(
    () => client.resolveCheckoutSession({
      sourceCheckoutSessionRef: 'cs_test_abc123',
      sourceCustomerRef: 'cus_abc123',
      billingEnvironment: 'sandbox',
    }),
    (error) => error instanceof WebReconciliationRpcError
      && error.retryable === true,
  );
});
