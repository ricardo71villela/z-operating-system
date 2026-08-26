import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStripeWebCurrentStateClient,
  StripeWebCurrentStateError,
} from '../lib/stripe-web-current-state.js';

const INTENT = '33333333-3333-4333-8333-333333333333';
const config = { environment: 'sandbox', stripeSecretKey: 'sk_test_example' };

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(payload); },
  };
}

function subscription(overrides = {}) {
  return {
    id: 'sub_abc123',
    object: 'subscription',
    customer: 'cus_abc123',
    livemode: false,
    status: 'active',
    created: 1787000000,
    canceled_at: null,
    ended_at: null,
    cancel_at_period_end: false,
    metadata: {
      zos_person_id: '11111111-1111-4111-8111-111111111111',
      zstudio_checkout_intent_id: INTENT,
      plan_code: 'monthly',
      billing_environment: 'sandbox',
    },
    trial_start: null,
    trial_end: null,
    items: { data: [{
      subscription: 'sub_abc123',
      quantity: 1,
      current_period_start: 1787260000,
      current_period_end: 1789938400,
      price: {
        id: 'price_monthly123',
        currency: 'eur',
        recurring: { interval: 'month', interval_count: 1 },
      },
    }] },
    ...overrides,
  };
}

test('retrieves fresh subscription and reads current period from SubscriptionItem', async () => {
  let call;
  const client = createStripeWebCurrentStateClient(config, {
    fetchImpl: async (url, options) => {
      call = { url, options };
      return response(200, subscription());
    },
  });
  const state = await client.retrieveSubscription('sub_abc123');
  assert.match(call.url, /\/subscriptions\/sub_abc123$/);
  assert.equal(call.options.method, 'GET');
  assert.equal(call.options.headers['Stripe-Version'], client.apiVersion);
  assert.equal(state.createdMs, 1787000000000);
  assert.equal(state.currentPeriodStartMs, 1787260000000);
  assert.equal(state.currentPeriodEndMs, 1789938400000);
  assert.equal(state.priceId, 'price_monthly123');
  assert.equal(state.rawPayloadIncluded, false);
});

test('does not trust removed top-level current_period fields', async () => {
  const payload = subscription({
    current_period_start: 1787260000,
    current_period_end: 1789938400,
    items: { data: [{
      subscription: 'sub_abc123',
      quantity: 1,
      price: {
        id: 'price_monthly123',
        currency: 'eur',
        recurring: { interval: 'month', interval_count: 1 },
      },
    }] },
  });
  const client = createStripeWebCurrentStateClient(config, {
    fetchImpl: async () => response(200, payload),
  });
  await assert.rejects(
    () => client.retrieveSubscription('sub_abc123'),
    /STRIPE_WEB_CURRENT_STATE_ACTIVE_PERIOD_REQUIRED/,
  );
});

test('normalizes completed Checkout Session without requiring hosted URL', async () => {
  const client = createStripeWebCurrentStateClient(config, {
    fetchImpl: async () => response(200, {
      id: 'cs_test_abc123',
      object: 'checkout.session',
      customer: 'cus_abc123',
      client_reference_id: INTENT,
      subscription: 'sub_abc123',
      livemode: false,
      mode: 'subscription',
      status: 'complete',
      expires_at: 1787265000,
      metadata: { plan_code: 'monthly' },
    }),
  });
  const state = await client.retrieveCheckoutSession('cs_test_abc123');
  assert.equal(state.status, 'complete');
  assert.equal(state.subscriptionId, 'sub_abc123');
  assert.equal(state.rawPayloadIncluded, false);
});

test('normalizes historical trial window on terminal state and rejects multi-item plans', async () => {
  const terminal = subscription({
    status: 'canceled',
    canceled_at: 1787600000,
    ended_at: 1787600000,
    trial_start: 1787260000,
    trial_end: 1787519200,
    items: { data: [{
      subscription: 'sub_abc123', quantity: 1,
      price: { id: 'price_monthly123', currency: 'eur', recurring: { interval: 'month', interval_count: 1 } },
    }] },
  });
  const client = createStripeWebCurrentStateClient(config, {
    fetchImpl: async () => response(200, terminal),
  });
  const state = await client.retrieveSubscription('sub_abc123');
  assert.equal(state.canceledAtMs, 1787600000000);
  assert.equal(state.endedAtMs, 1787600000000);
  assert.equal(state.trialStartMs, 1787260000000);
  assert.equal(state.trialEndMs, 1787519200000);

  const bad = createStripeWebCurrentStateClient(config, {
    fetchImpl: async () => response(200, subscription({
      items: { data: [subscription().items.data[0], subscription().items.data[0]] },
    })),
  });
  await assert.rejects(
    () => bad.retrieveSubscription('sub_abc123'),
    /STRIPE_WEB_CURRENT_STATE_SUBSCRIPTION_ITEMS_INVALID/,
  );
});

test('marks provider 503 as retryable', async () => {
  const client = createStripeWebCurrentStateClient(config, {
    fetchImpl: async () => response(503, { error: { type: 'api_error' } }),
  });
  await assert.rejects(
    () => client.retrieveSubscription('sub_abc123'),
    (error) => error instanceof StripeWebCurrentStateError
      && error.retryable === true
      && error.httpStatusCode === 503,
  );
});
