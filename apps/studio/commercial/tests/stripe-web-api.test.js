import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStripeWebApi,
  STRIPE_API_VERSION,
  StripeWebApiError,
} from '../lib/stripe-web-api.js';

const PERSON = '11111111-1111-4111-8111-111111111111';
const BINDING = '22222222-2222-4222-8222-222222222222';
const INTENT = '33333333-3333-4333-8333-333333333333';
const NOW = Date.parse('2026-08-20T18:00:00.000Z');

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    },
  };
}

const config = {
  environment: 'sandbox',
  stripeSecretKey: 'sk_test_example',
  successUrl: 'https://zstudio.space/billing/success',
  cancelUrl: 'https://zstudio.space/billing/cancel',
};

test('pins the current Stripe API version on every request', async () => {
  const calls = [];
  const api = createStripeWebApi(config, {
    nowMs: () => NOW,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response(200, { id: 'cus_abc123', livemode: false });
    },
  });
  await api.createCustomer({ personId: PERSON, bindingId: BINDING });
  assert.equal(STRIPE_API_VERSION, '2026-07-29.dahlia');
  assert.equal(calls[0].options.headers['Stripe-Version'], STRIPE_API_VERSION);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer sk_test_example');
  assert.equal(
    calls[0].options.headers['Idempotency-Key'],
    `zstudio:web:customer:sandbox:${BINDING}`,
  );
});

test('customer creation stores only canonical correlation metadata', async () => {
  let captured;
  const api = createStripeWebApi(config, {
    fetchImpl: async (_url, options) => {
      captured = new URLSearchParams(options.body);
      return response(200, { id: 'cus_abc123', livemode: false });
    },
  });
  const customer = await api.createCustomer({ personId: PERSON, bindingId: BINDING });
  assert.equal(customer.id, 'cus_abc123');
  assert.equal(captured.get('metadata[zos_person_id]'), PERSON);
  assert.equal(captured.get('metadata[zstudio_binding_id]'), BINDING);
  assert.equal(captured.get('metadata[billing_source]'), 'web');
  assert.equal(captured.get('email'), null);
});

test('trial Checkout is subscription mode, exact Price, payment-method-required and deterministic', async () => {
  let call;
  const expiresAt = Math.floor(NOW / 1000) + (31 * 60);
  const api = createStripeWebApi(config, {
    nowMs: () => NOW,
    fetchImpl: async (url, options) => {
      call = { url, options, body: new URLSearchParams(options.body) };
      return response(200, {
        id: 'cs_test_abc123',
        livemode: false,
        url: 'https://checkout.stripe.com/c/pay/test',
        customer: 'cus_abc123',
        client_reference_id: INTENT,
        status: 'open',
        expires_at: expiresAt,
      });
    },
  });

  const session = await api.createCheckoutSession({
    personId: PERSON,
    intentId: INTENT,
    planCode: 'monthly',
    priceId: 'price_monthly123',
    customerId: 'cus_abc123',
    trialEligible: true,
    trialDays: 3,
  });

  assert.match(call.url, /\/checkout\/sessions$/);
  assert.equal(call.options.headers['Idempotency-Key'], `zstudio:web:checkout:sandbox:${INTENT}`);
  assert.equal(call.body.get('mode'), 'subscription');
  assert.equal(call.body.get('customer'), 'cus_abc123');
  assert.equal(call.body.get('client_reference_id'), INTENT);
  assert.equal(call.body.get('line_items[0][price]'), 'price_monthly123');
  assert.equal(call.body.get('line_items[0][quantity]'), '1');
  assert.equal(call.body.get('payment_method_collection'), 'always');
  assert.equal(call.body.get('subscription_data[trial_period_days]'), '3');
  assert.equal(
    call.body.get('subscription_data[trial_settings][end_behavior][missing_payment_method]'),
    'cancel',
  );
  assert.equal(Number(call.body.get('expires_at')), expiresAt);
  assert.equal(session.expiresAt, new Date(expiresAt * 1000).toISOString());
});

test('non-trial Checkout omits all trial parameters', async () => {
  let body;
  const expiresAt = Math.floor(NOW / 1000) + (31 * 60);
  const api = createStripeWebApi(config, {
    nowMs: () => NOW,
    fetchImpl: async (_url, options) => {
      body = new URLSearchParams(options.body);
      return response(200, {
        id: 'cs_test_noTrial123',
        livemode: false,
        url: 'https://checkout.stripe.com/c/pay/no-trial',
        customer: 'cus_abc123',
        client_reference_id: INTENT,
        status: 'open',
        expires_at: expiresAt,
      });
    },
  });
  await api.createCheckoutSession({
    personId: PERSON,
    intentId: INTENT,
    planCode: 'annual',
    priceId: 'price_annual123',
    customerId: 'cus_abc123',
    trialEligible: false,
    trialDays: 3,
  });
  assert.equal(body.has('subscription_data[trial_period_days]'), false);
  assert.equal(
    body.has('subscription_data[trial_settings][end_behavior][missing_payment_method]'),
    false,
  );
});

test('retrieve supports idempotent recovery and rejects wrong livemode or retryable provider failures', async () => {
  const expiresAt = Math.floor(NOW / 1000) + (31 * 60);
  const okApi = createStripeWebApi(config, {
    fetchImpl: async (url, options) => {
      assert.match(url, /\/checkout\/sessions\/cs_test_existing123$/);
      assert.equal(options.method, 'GET');
      assert.equal(options.body, undefined);
      return response(200, {
        id: 'cs_test_existing123',
        livemode: false,
        url: 'https://checkout.stripe.com/c/pay/existing',
        customer: 'cus_abc123',
        client_reference_id: INTENT,
        status: 'open',
        expires_at: expiresAt,
      });
    },
  });
  const recovered = await okApi.retrieveCheckoutSession('cs_test_existing123');
  assert.equal(recovered.clientReferenceId, INTENT);

  const wrongMode = createStripeWebApi(config, {
    fetchImpl: async () => response(200, {
      id: 'cus_wrong123',
      livemode: true,
    }),
  });
  await assert.rejects(
    () => wrongMode.createCustomer({ personId: PERSON, bindingId: BINDING }),
    (error) => error instanceof StripeWebApiError && error.code === 'STRIPE_WEB_MODE_MISMATCH',
  );

  const unavailable = createStripeWebApi(config, {
    fetchImpl: async () => response(503, { error: { type: 'api_error' } }),
  });
  await assert.rejects(
    () => unavailable.createCustomer({ personId: PERSON, bindingId: BINDING }),
    (error) => error instanceof StripeWebApiError && error.retryable === true,
  );
});
