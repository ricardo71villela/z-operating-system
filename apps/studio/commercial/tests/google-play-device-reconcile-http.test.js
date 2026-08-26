import test from 'node:test';
import assert from 'node:assert/strict';
import { createGooglePlayDeviceReconcileHttpHandler } from '../lib/google-play-device-reconcile-http.js';
import { GooglePlayAuthorityRpcError } from '../lib/google-play-authority-client.js';
import { GooglePlayCurrentStateError } from '../lib/google-play-current-state.js';

const personId = '11111111-1111-4111-8111-111111111111';
const intentId = '22222222-2222-4222-8222-222222222222';
const subRef = `google:play:purchase:${'a'.repeat(64)}`;
const productRef = 'google:play:product:zstudio.access:base_plan:monthly';
const eventRef = `google:play:event:current-state:snapshot:${'b'.repeat(64)}`;
const nowMs = Date.parse('2026-08-21T00:00:00Z');

function res() {
  return {
    status: null,
    headers: null,
    payload: null,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(data = '') { this.payload = data ? JSON.parse(data) : null; },
  };
}

function req(body, headers = {}) {
  return {
    method: 'POST',
    headers: {
      authorization: 'Bearer user-token',
      origin: 'capacitor://localhost',
      ...headers,
    },
    body,
  };
}

function subscription(overrides = {}) {
  return {
    verification: 'verified_google_play_subscription_current_state',
    billingEnvironment: 'sandbox',
    sourceSubscriptionRef: subRef,
    sourceProductRef: productRef,
    planCode: 'monthly',
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
    externalAccountId: personId,
    trialing: false,
    latestSuccessfulOrderId: 'GPA.123',
    expiryAtMs: Date.parse('2026-09-20T10:00:00Z'),
    rawProviderPayloadIncluded: false,
    ...overrides,
  };
}

function normalized(overrides = {}) {
  return {
    mode: 'commercial',
    sourceEventRef: eventRef,
    historicalTrialConsumed: false,
    writerArgs: { p_test: 'writer' },
    commercialEvent: {
      status: 'active',
      cancelAtPeriodEnd: false,
      trialEndsAtMs: null,
      currentPeriodEndMs: Date.parse('2026-09-20T10:00:00Z'),
      effectiveAtMs: Date.parse('2026-08-20T10:00:05Z'),
    },
    ...overrides,
  };
}

function makeHandler({
  sub = subscription(),
  normalizedState = normalized(),
  steps = [],
  getOrderError = null,
  ackError = null,
  authorityOverrides = {},
  writerError = null,
} = {}) {
  const currentState = {
    async getSubscription(token) {
      steps.push(`subscription:${token}`);
      return sub;
    },
    async getOrder(id) {
      steps.push(`order:${id}`);
      if (getOrderError) throw getOrderError;
      return { orderId: id };
    },
    async acknowledgeSubscription(token) {
      steps.push(`ack:${token}`);
      if (ackError) throw ackError;
      return { acknowledged: true };
    },
  };
  const authority = {
    async reconcileIntent(args) { steps.push('intent:reconcile'); return { result: 'purchase_seen', ...args }; },
    async claimConsumedTrial() { steps.push('trial:claim'); return { result: 'claimed' }; },
    async applyPause() { steps.push('writer:pause'); return { result: 'applied', subscriptionStatus: 'paused', planCode: 'monthly', studioAccessStatus: 'expired', aiAccessStatus: 'expired' }; },
    async completeIntent() { steps.push('intent:complete'); return { result: 'completed' }; },
    async failIntent() { steps.push('intent:fail'); return { result: 'failed' }; },
    ...authorityOverrides,
  };
  const writer = {
    async applyVerifiedCommercialEvent() {
      steps.push('writer:commercial');
      if (writerError) throw writerError;
      return { result: 'applied', subscriptionStatus: normalizedState.commercialEvent?.status ?? 'active', planCode: 'monthly', studioAccessStatus: 'active', aiAccessStatus: 'active' };
    },
  };
  return createGooglePlayDeviceReconcileHttpHandler({
    loadConfig: () => ({ environment: 'sandbox' }),
    resolvePerson: async () => personId,
    createCurrentStateClient: () => currentState,
    createAuthorityClient: () => authority,
    createWriterClient: () => writer,
    requiresOrder: (value) => !value.trialing && !['SUBSCRIPTION_STATE_PENDING', 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED'].includes(value.subscriptionState),
    normalizeState: () => normalizedState,
    now: () => nowMs,
  });
}

test('successful paid reconcile is writer -> acknowledge -> complete and never echoes purchase token', async () => {
  const steps = [];
  const response = res();
  await makeHandler({ steps })(req({ purchase_intent_id: intentId, purchase_token: 'raw-purchase-token' }), response);
  assert.equal(response.status, 200);
  assert.deepEqual(steps, [
    'subscription:raw-purchase-token',
    'intent:reconcile',
    'order:GPA.123',
    'writer:commercial',
    'ack:raw-purchase-token',
    'intent:complete',
  ]);
  assert.equal(response.payload.acknowledged, true);
  assert.equal(JSON.stringify(response.payload).includes('raw-purchase-token'), false);
  assert.equal('source_subscription_ref' in response.payload, false);
});

test('acknowledgement failure happens after writer and leaves intent uncompleted for retry', async () => {
  const steps = [];
  const response = res();
  await makeHandler({
    steps,
    ackError: new GooglePlayCurrentStateError('GOOGLE_PLAY_API_REQUEST_FAILED', { retryable: true, httpStatusCode: 503 }),
  })(req({ purchase_intent_id: intentId, purchase_token: 'retry-token' }), response);
  assert.equal(response.status, 503);
  assert.deepEqual(steps, [
    'subscription:retry-token',
    'intent:reconcile',
    'order:GPA.123',
    'writer:commercial',
    'ack:retry-token',
  ]);
  assert.equal(steps.includes('intent:complete'), false);
});

test('PENDING current state binds intent but performs no order, writer, acknowledgement or completion', async () => {
  const steps = [];
  const response = res();
  await makeHandler({
    steps,
    sub: subscription({
      subscriptionState: 'SUBSCRIPTION_STATE_PENDING',
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
      latestSuccessfulOrderId: null,
      expiryAtMs: null,
    }),
  })(req({ purchase_intent_id: intentId, purchase_token: 'pending-token' }), response);
  assert.equal(response.status, 202);
  assert.deepEqual(steps, ['subscription:pending-token', 'intent:reconcile']);
  assert.equal(response.payload.purchase_state, 'pending');
});

test('PENDING_PURCHASE_CANCELED closes failed intent and never writes/acknowledges', async () => {
  const steps = [];
  const response = res();
  await makeHandler({
    steps,
    sub: subscription({
      subscriptionState: 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED',
      latestSuccessfulOrderId: null,
      expiryAtMs: null,
    }),
  })(req({ purchase_intent_id: intentId, purchase_token: 'canceled-pending-token' }), response);
  assert.equal(response.status, 200);
  assert.deepEqual(steps, [
    'subscription:canceled-pending-token',
    'intent:reconcile',
    'intent:fail',
  ]);
  assert.equal(response.payload.purchase_state, 'canceled');
});

test('historical terminal trial claims consumption before expired writer, then acknowledges and completes', async () => {
  const steps = [];
  const response = res();
  await makeHandler({
    steps,
    sub: subscription({ trialing: true, subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED', latestSuccessfulOrderId: null }),
    normalizedState: normalized({
      historicalTrialConsumed: true,
      commercialEvent: {
        status: 'expired',
        cancelAtPeriodEnd: false,
        trialEndsAtMs: null,
        currentPeriodEndMs: null,
        effectiveAtMs: Date.parse('2026-08-20T20:00:00Z'),
      },
    }),
  })(req({ purchase_intent_id: intentId, purchase_token: 'historical-trial-token' }), response);
  assert.equal(response.status, 200);
  assert.deepEqual(steps, [
    'subscription:historical-trial-token',
    'intent:reconcile',
    'trial:claim',
    'writer:commercial',
    'ack:historical-trial-token',
    'intent:complete',
  ]);
  assert.equal(response.payload.subscription_status, 'expired');
});

test('already acknowledged retry skips acknowledge but repeats idempotent writer and complete', async () => {
  const steps = [];
  const response = res();
  await makeHandler({
    steps,
    sub: subscription({ acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }),
  })(req({ purchase_intent_id: intentId, purchase_token: 'already-acked-token' }), response);
  assert.equal(response.status, 200);
  assert.deepEqual(steps, [
    'subscription:already-acked-token',
    'intent:reconcile',
    'order:GPA.123',
    'writer:commercial',
    'intent:complete',
  ]);
  assert.equal(response.payload.acknowledged, true);
});

test('identity mismatch stops before purchase intent or writer authority', async () => {
  const steps = [];
  const response = res();
  await makeHandler({
    steps,
    sub: subscription({ externalAccountId: '33333333-3333-4333-8333-333333333333' }),
  })(req({ purchase_intent_id: intentId, purchase_token: 'foreign-token' }), response);
  assert.equal(response.status, 403);
  assert.deepEqual(steps, ['subscription:foreign-token']);
});

test('database intent conflict is 409 while provider outage is retryable 503', async () => {
  let response = res();
  await makeHandler({
    authorityOverrides: {
      async reconcileIntent() {
        throw new GooglePlayAuthorityRpcError('failed', { databaseCode: 'GOOGLE_PLAY_RECONCILE_INTENT_PLAN_CONFLICT' });
      },
    },
  })(req({ purchase_intent_id: intentId, purchase_token: 'conflict-token' }), response);
  assert.equal(response.status, 409);

  response = res();
  await createGooglePlayDeviceReconcileHttpHandler({
    loadConfig: () => ({ environment: 'sandbox' }),
    resolvePerson: async () => personId,
    createCurrentStateClient: () => ({
      async getSubscription() { throw new GooglePlayCurrentStateError('down', { retryable: true, httpStatusCode: 503 }); },
    }),
    createAuthorityClient: () => ({}),
    createWriterClient: () => ({}),
  })(req({ purchase_intent_id: intentId, purchase_token: 'provider-down-token' }), response);
  assert.equal(response.status, 503);
  assert.equal(response.headers['Retry-After'], '5');
});

test('rejects extra body authority and disallowed origin before provider calls', async () => {
  let response = res();
  await makeHandler()(req({ purchase_intent_id: intentId, purchase_token: 'x', plan_code: 'annual' }), response);
  assert.equal(response.status, 400);

  response = res();
  await makeHandler()(req(
    { purchase_intent_id: intentId, purchase_token: 'x' },
    { origin: 'https://evil.example' },
  ), response);
  assert.equal(response.status, 403);
});
