import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWebCheckoutHttpHandler,
  WebCheckoutAuthBoundaryError,
  validateWebSupabaseBearerAndResolvePerson,
} from '../lib/web-checkout-http.js';
import { WebCheckoutPreflightRpcError } from '../lib/web-checkout-preflight-client.js';
import { StripeWebApiError } from '../lib/stripe-web-api.js';

const PERSON = '11111111-1111-4111-8111-111111111111';
const BINDING = '22222222-2222-4222-8222-222222222222';
const INTENT = '33333333-3333-4333-8333-333333333333';
const SESSION_EXPIRY = '2026-08-20T18:31:00.000Z';

function mockRes() {
  return {
    status: null,
    headers: null,
    body: null,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body = '') {
      this.body = body ? JSON.parse(body) : null;
    },
  };
}

function request(body = { plan_code: 'monthly' }, extra = {}) {
  return {
    method: 'POST',
    headers: {
      origin: 'https://zstudio.space',
      authorization: 'Bearer user-token',
      ...extra.headers,
    },
    body,
    ...extra,
  };
}

const config = {
  environment: 'sandbox',
  supabaseUrl: 'https://example.supabase.co',
  supabasePublishableKey: 'sb_publishable_test',
  supabaseSecretKey: 'sb_secret_test',
  priceByPlan: {
    weekly: 'price_weekly123',
    monthly: 'price_monthly123',
    annual: 'price_annual123',
  },
};

function planResolver(planCode) {
  return {
    planCode,
    trialDays: 3,
  };
}

function prepared(overrides = {}) {
  return {
    result: 'prepared',
    intentId: INTENT,
    bindingId: BINDING,
    sourceCustomerRef: null,
    planCode: 'monthly',
    billingEnvironment: 'sandbox',
    trialEligible: true,
    sourceCheckoutSessionRef: null,
    intentExpiresAt: '2026-08-20T18:30:00.000Z',
    providerExpiresAt: null,
    ...overrides,
  };
}

test('auth boundary validates Bearer token with publishable key then resolves canonical person', async () => {
  const calls = [];
  const person = await validateWebSupabaseBearerAndResolvePerson(
    config,
    'user-token',
    {
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        if (url.endsWith('/auth/v1/user')) {
          return { ok: true, status: 200 };
        }
        return {
          ok: true,
          status: 200,
          async json() { return PERSON; },
        };
      },
    },
  );
  assert.equal(person, PERSON);
  assert.equal(calls[0].options.headers.apikey, 'sb_publishable_test');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer user-token');
  assert.equal(calls[1].options.body, '{}');
  assert.match(calls[1].url, /zstudio_ensure_account$/);
});

test('checkout creates/binds customer, creates/binds Session, and returns only safe redirect data', async () => {
  const events = [];
  const preflightClient = {
    async prepareWebCheckout(args) {
      events.push(['prepare', args]);
      return prepared();
    },
    async bindStripeCustomer(args) {
      events.push(['bindCustomer', args]);
      return { result: 'bound', sourceCustomerRef: 'cus_abc123' };
    },
    async bindCheckoutSession(args) {
      events.push(['bindSession', args]);
      return { result: 'bound' };
    },
    async closeCheckoutIntent(args) {
      events.push(['close', args]);
      return { result: 'closed' };
    },
  };
  const stripeClient = {
    async createCustomer(args) {
      events.push(['createCustomer', args]);
      return { id: 'cus_abc123' };
    },
    async createCheckoutSession(args) {
      events.push(['createSession', args]);
      return {
        id: 'cs_test_abc123',
        url: 'https://checkout.stripe.com/c/pay/abc',
        expiresAt: SESSION_EXPIRY,
      };
    },
    async retrieveCheckoutSession() {
      throw new Error('not expected');
    },
  };

  const handler = createWebCheckoutHttpHandler({
    loadConfig: () => config,
    resolvePerson: async () => PERSON,
    createPreflightClient: () => preflightClient,
    createStripeClient: () => stripeClient,
    resolvePlan: planResolver,
  });
  const res = mockRes();
  await handler(request(), res);

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.checkout_url, 'https://checkout.stripe.com/c/pay/abc');
  assert.equal(res.body.intent_id, INTENT);
  assert.equal(res.body.plan_code, 'monthly');
  assert.equal(res.body.trial_eligible, true);
  assert.equal('customer_id' in res.body, false);
  assert.equal('checkout_session_id' in res.body, false);
  assert.deepEqual(events.map(([name]) => name), [
    'prepare',
    'createCustomer',
    'bindCustomer',
    'createSession',
    'bindSession',
  ]);
  assert.equal(events[3][1].priceId, 'price_monthly123');
  assert.equal(events[3][1].trialDays, 3);
});

test('existing bound Session is retrieved and reused rather than duplicated', async () => {
  const events = [];
  const preflightClient = {
    async prepareWebCheckout() {
      return prepared({
        result: 'existing',
        sourceCustomerRef: 'cus_abc123',
        sourceCheckoutSessionRef: 'cs_test_existing123',
        providerExpiresAt: SESSION_EXPIRY,
      });
    },
  };
  const stripeClient = {
    async retrieveCheckoutSession(id) {
      events.push(['retrieve', id]);
      return {
        id,
        url: 'https://checkout.stripe.com/c/pay/existing',
        customer: 'cus_abc123',
        clientReferenceId: INTENT,
        status: 'open',
        expiresAt: SESSION_EXPIRY,
      };
    },
    async createCustomer() { throw new Error('must not create customer'); },
    async createCheckoutSession() { throw new Error('must not create session'); },
  };
  const handler = createWebCheckoutHttpHandler({
    loadConfig: () => config,
    resolvePerson: async () => PERSON,
    createPreflightClient: () => preflightClient,
    createStripeClient: () => stripeClient,
    resolvePlan: planResolver,
  });
  const res = mockRes();
  await handler(request(), res);
  assert.equal(res.status, 200);
  assert.equal(res.body.checkout_url, 'https://checkout.stripe.com/c/pay/existing');
  assert.deepEqual(events, [['retrieve', 'cs_test_existing123']]);
});

test('browser can send only normalized plan_code and never provider Price/customer authority', async () => {
  const handler = createWebCheckoutHttpHandler({
    loadConfig: () => config,
    resolvePerson: async () => PERSON,
    createPreflightClient: () => ({ prepareWebCheckout: async () => prepared() }),
    createStripeClient: () => ({}),
    resolvePlan: planResolver,
  });
  const res = mockRes();
  await handler(request({ plan_code: 'monthly', price_id: 'price_attacker' }), res);
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'WEB_CHECKOUT_REQUEST_INVALID');
});

test('commercial preflight conflicts are returned as 409 and no Stripe call is made', async () => {
  let stripeCalls = 0;
  const handler = createWebCheckoutHttpHandler({
    loadConfig: () => config,
    resolvePerson: async () => PERSON,
    createPreflightClient: () => ({
      async prepareWebCheckout() {
        throw new WebCheckoutPreflightRpcError('WEB_PREFLIGHT_RPC_FAILED', {
          databaseCode: 'WEB_CHECKOUT_EXISTING_SUBSCRIPTION_BLOCKS',
        });
      },
    }),
    createStripeClient: () => ({
      async createCustomer() { stripeCalls += 1; },
    }),
    resolvePlan: planResolver,
  });
  const res = mockRes();
  await handler(request(), res);
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'WEB_CHECKOUT_CONFLICT');
  assert.equal(stripeCalls, 0);
});

test('definitive Stripe creation failure closes reservation, retryable transport uncertainty does not', async () => {
  for (const retryable of [false, true]) {
    const closes = [];
    const preflightClient = {
      async prepareWebCheckout() { return prepared(); },
      async closeCheckoutIntent(args) { closes.push(args); },
    };
    const handler = createWebCheckoutHttpHandler({
      loadConfig: () => config,
      resolvePerson: async () => PERSON,
      createPreflightClient: () => preflightClient,
      createStripeClient: () => ({
        async createCustomer() {
          throw new StripeWebApiError('STRIPE_WEB_API_FAILED', {
            httpStatus: retryable ? 503 : 400,
            retryable,
          });
        },
      }),
      resolvePlan: planResolver,
    });
    const res = mockRes();
    await handler(request(), res);
    assert.equal(res.status, retryable ? 503 : 502);
    assert.equal(closes.length, retryable ? 0 : 1);
    if (!retryable) assert.equal(closes[0].finalState, 'failed');
  }
});

test('after provider Session creation, bind failure never releases the intent', async () => {
  const closes = [];
  const preflightClient = {
    async prepareWebCheckout() {
      return prepared({ sourceCustomerRef: 'cus_abc123' });
    },
    async bindCheckoutSession() {
      throw new WebCheckoutPreflightRpcError('WEB_PREFLIGHT_RPC_TRANSPORT_FAILED', {
        retryable: true,
      });
    },
    async closeCheckoutIntent(args) { closes.push(args); },
  };
  const stripeClient = {
    async createCheckoutSession() {
      return {
        id: 'cs_test_abc123',
        url: 'https://checkout.stripe.com/c/pay/abc',
        expiresAt: SESSION_EXPIRY,
      };
    },
  };
  const handler = createWebCheckoutHttpHandler({
    loadConfig: () => config,
    resolvePerson: async () => PERSON,
    createPreflightClient: () => preflightClient,
    createStripeClient: () => stripeClient,
    resolvePlan: planResolver,
  });
  const res = mockRes();
  await handler(request(), res);
  assert.equal(res.status, 503);
  assert.equal(res.body.code, 'WEB_CHECKOUT_SESSION_BIND_UNAVAILABLE');
  assert.equal(closes.length, 0);
});

test('invalid user token remains 401 and allowed-origin policy excludes native capacitor origin', async () => {
  const handler = createWebCheckoutHttpHandler({
    loadConfig: () => config,
    resolvePerson: async () => {
      throw new WebCheckoutAuthBoundaryError('WEB_AUTH_INVALID', { invalid: true });
    },
    createPreflightClient: () => ({}),
    createStripeClient: () => ({}),
    resolvePlan: planResolver,
  });
  const authRes = mockRes();
  await handler(request(), authRes);
  assert.equal(authRes.status, 401);
  assert.equal(authRes.body.code, 'AUTH_INVALID');

  const originRes = mockRes();
  await handler(request(undefined, { headers: { origin: 'capacitor://localhost' } }), originRes);
  assert.equal(originRes.status, 403);
  assert.equal(originRes.body.code, 'ORIGIN_DENIED');
});
