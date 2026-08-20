import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWebCheckoutPreflightClient,
  WebCheckoutPreflightRpcError,
} from '../lib/web-checkout-preflight-client.js';

const PERSON = '11111111-1111-4111-8111-111111111111';
const BINDING = '22222222-2222-4222-8222-222222222222';
const INTENT = '33333333-3333-4333-8333-333333333333';

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return payload == null ? '' : JSON.stringify(payload);
    },
  };
}

const config = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseSecretKey: 'sb_secret_test',
};

test('prepare calls only the server-authority RPC with apikey secret and exact args', async () => {
  const calls = [];
  const client = createWebCheckoutPreflightClient(config, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response(200, {
        result: 'prepared',
        intent_id: INTENT,
        binding_id: BINDING,
        source_customer_ref: null,
        plan_code: 'monthly',
        billing_environment: 'sandbox',
        trial_eligible: true,
        source_checkout_session_ref: null,
        intent_expires_at: '2026-08-20T18:30:00.000Z',
        provider_expires_at: null,
      });
    },
  });

  const out = await client.prepareWebCheckout({
    personId: PERSON,
    planCode: 'monthly',
    billingEnvironment: 'sandbox',
  });

  assert.equal(out.intentId, INTENT);
  assert.equal(out.bindingId, BINDING);
  assert.equal(out.trialEligible, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /zstudio_prepare_web_checkout$/);
  assert.equal(calls[0].options.headers.apikey, 'sb_secret_test');
  assert.equal('Authorization' in calls[0].options.headers, false);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_person_id: PERSON,
    p_plan_code: 'monthly',
    p_billing_environment: 'sandbox',
  });
});

test('bind customer and session use exact server-side correlation ids', async () => {
  const calls = [];
  const client = createWebCheckoutPreflightClient(config, {
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      if (url.endsWith('zstudio_bind_web_stripe_customer')) {
        return response(200, {
          result: 'bound',
          binding_id: BINDING,
          source_customer_ref: 'cus_abc123',
        });
      }
      return response(200, {
        result: 'bound',
        intent_id: INTENT,
        source_checkout_session_ref: 'cs_test_abc123',
        provider_expires_at: '2026-08-20T18:31:00.000Z',
        state: 'session_created',
      });
    },
  });

  const customer = await client.bindStripeCustomer({
    bindingId: BINDING,
    personId: PERSON,
    billingEnvironment: 'sandbox',
    sourceCustomerRef: 'cus_abc123',
  });
  assert.equal(customer.sourceCustomerRef, 'cus_abc123');

  const session = await client.bindCheckoutSession({
    intentId: INTENT,
    personId: PERSON,
    billingEnvironment: 'sandbox',
    sourceCheckoutSessionRef: 'cs_test_abc123',
    providerExpiresAt: '2026-08-20T18:31:00.000Z',
  });
  assert.equal(session.state, 'session_created');
  assert.match(calls[0].url, /zstudio_bind_web_stripe_customer$/);
  assert.match(calls[1].url, /zstudio_bind_web_checkout_session$/);
  assert.equal(calls[1].body.p_source_checkout_session_ref, 'cs_test_abc123');
});

test('close intent is restricted to controlled terminal states', async () => {
  const client = createWebCheckoutPreflightClient(config, {
    fetchImpl: async () => response(200, {
      result: 'closed',
      intent_id: INTENT,
      state: 'failed',
    }),
  });
  const closed = await client.closeCheckoutIntent({
    intentId: INTENT,
    personId: PERSON,
    billingEnvironment: 'production',
    finalState: 'failed',
  });
  assert.equal(closed.state, 'failed');
  await assert.rejects(
    () => client.closeCheckoutIntent({
      intentId: INTENT,
      personId: PERSON,
      billingEnvironment: 'production',
      finalState: 'reserved',
    }),
    /WEB_PREFLIGHT_CLOSE_STATE_INVALID/,
  );
});

test('database conflicts are surfaced without leaking browser authority', async () => {
  const client = createWebCheckoutPreflightClient(config, {
    fetchImpl: async () => response(400, {
      code: '23514',
      message: 'WEB_CHECKOUT_EXISTING_SUBSCRIPTION_BLOCKS',
    }),
  });
  await assert.rejects(
    () => client.prepareWebCheckout({
      personId: PERSON,
      planCode: 'weekly',
      billingEnvironment: 'production',
    }),
    (error) => {
      assert.equal(error instanceof WebCheckoutPreflightRpcError, true);
      assert.equal(error.databaseCode, 'WEB_CHECKOUT_EXISTING_SUBSCRIPTION_BLOCKS');
      assert.equal(error.postgresCode, '23514');
      assert.equal(error.retryable, false);
      return true;
    },
  );
});

test('transport failure is explicitly retryable', async () => {
  const client = createWebCheckoutPreflightClient(config, {
    fetchImpl: async () => { throw new TypeError('network'); },
  });
  await assert.rejects(
    () => client.prepareWebCheckout({
      personId: PERSON,
      planCode: 'annual',
      billingEnvironment: 'sandbox',
    }),
    (error) => {
      assert.equal(error instanceof WebCheckoutPreflightRpcError, true);
      assert.equal(error.retryable, true);
      return true;
    },
  );
});
