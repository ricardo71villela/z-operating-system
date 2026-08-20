import test from 'node:test';
import assert from 'node:assert/strict';
import { createGooglePlayCurrentStateClient } from '../lib/google-play-current-state.js';

const config = {
  environment: 'sandbox',
  packageName: 'com.zoperatingsystem.zstudio',
};
const authClient = { getAccessToken: async () => 'oauth-token' };

function subscription(overrides = {}) {
  return {
    kind: 'androidpublisher#subscriptionPurchaseV2',
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
    testPurchase: {},
    startTime: '2026-08-20T10:00:00Z',
    externalAccountIdentifiers: {
      obfuscatedExternalAccountId: '11111111-1111-4111-8111-111111111111',
    },
    lineItems: [{
      productId: 'zstudio.access',
      expiryTime: '2026-09-20T10:00:00Z',
      latestSuccessfulOrderId: 'GPA.1234-5678-9012-34567',
      autoRenewingPlan: { autoRenewEnabled: true },
      offerDetails: { basePlanId: 'monthly' },
      offerPhase: { basePrice: {} },
    }],
    ...overrides,
  };
}

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test('fetches subscriptionsv2 current state and emits only hashed purchase authority', async () => {
  const seen = [];
  const client = createGooglePlayCurrentStateClient(config, {
    authClient,
    fetchImpl: async (url, options) => {
      seen.push([url, options]);
      return jsonResponse(subscription({ linkedPurchaseToken: 'linked-opaque-token' }));
    },
  });
  const state = await client.getSubscription('opaque-token-ABC');
  assert.equal(state.verification, 'verified_google_play_subscription_current_state');
  assert.equal(state.planCode, 'monthly');
  assert.equal(state.productId, 'zstudio.access');
  assert.equal(state.basePlanId, 'monthly');
  assert.match(state.sourceSubscriptionRef, /^google:play:purchase:[0-9a-f]{64}$/);
  assert.equal(state.externalAccountId, '11111111-1111-4111-8111-111111111111');
  assert.equal(state.rawProviderPayloadIncluded, false);
  assert.equal(JSON.stringify(state).includes('opaque-token-ABC'), false);
  assert.equal(JSON.stringify(state).includes('linked-opaque-token'), false);
  assert.match(state.linkedPurchaseTokenFingerprint, /^[0-9a-f]{64}$/);
  assert.match(seen[0][0], /purchases\/subscriptionsv2\/tokens\/opaque-token-ABC$/);
  assert.equal(seen[0][1].headers.Authorization, 'Bearer oauth-token');
});

test('detects exact trial offer from current freeTrial offer phase', async () => {
  const payload = subscription();
  payload.lineItems[0].offerDetails.offerId = 'trial-3d';
  payload.lineItems[0].offerPhase = { freeTrial: {} };
  const client = createGooglePlayCurrentStateClient(config, {
    authClient,
    fetchImpl: async () => jsonResponse(payload),
  });
  const state = await client.getSubscription('trial-token');
  assert.equal(state.trialing, true);
  assert.equal(state.offerId, 'trial-3d');
  assert.equal(state.startAtMs, Date.parse('2026-08-20T10:00:00Z'));
  assert.equal(state.expiryAtMs, Date.parse('2026-09-20T10:00:00Z'));
});

test('fails closed on production/test mismatch, add-ons, prepaid, product or external identity mismatch', async () => {
  async function rejects(payload, cfg = config) {
    const client = createGooglePlayCurrentStateClient(cfg, { authClient, fetchImpl: async () => jsonResponse(payload) });
    await assert.rejects(() => client.getSubscription('token'));
  }
  await rejects(subscription(), { ...config, environment: 'production' });
  await rejects(subscription({ lineItems: [...subscription().lineItems, subscription().lineItems[0]] }));
  const prepaid = subscription();
  delete prepaid.lineItems[0].autoRenewingPlan;
  prepaid.lineItems[0].prepaidPlan = {};
  await rejects(prepaid);
  const wrongProduct = subscription();
  wrongProduct.lineItems[0].productId = 'other.product';
  await rejects(wrongProduct);
  const badIdentity = subscription({ externalAccountIdentifiers: { obfuscatedExternalAccountId: 'email@example.com' } });
  await rejects(badIdentity);
});

test('normalizes PAUSED with auto-resume and CANCELED as non-expired current state evidence', async () => {
  const paused = subscription({
    subscriptionState: 'SUBSCRIPTION_STATE_PAUSED',
    pausedStateContext: { autoResumeTime: '2026-09-01T10:00:00Z' },
  });
  paused.lineItems[0].autoRenewingPlan.autoRenewEnabled = false;
  let client = createGooglePlayCurrentStateClient(config, { authClient, fetchImpl: async () => jsonResponse(paused) });
  let state = await client.getSubscription('paused-token');
  assert.equal(state.subscriptionState, 'SUBSCRIPTION_STATE_PAUSED');
  assert.equal(state.autoResumeAtMs, Date.parse('2026-09-01T10:00:00Z'));

  const canceled = subscription({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED' });
  canceled.lineItems[0].autoRenewingPlan.autoRenewEnabled = false;
  client = createGooglePlayCurrentStateClient(config, { authClient, fetchImpl: async () => jsonResponse(canceled) });
  state = await client.getSubscription('cancel-token');
  assert.equal(state.subscriptionState, 'SUBSCRIPTION_STATE_CANCELED');
  assert.equal(state.expiryAtMs, Date.parse('2026-09-20T10:00:00Z'));
});

test('fetches order service period start while preserving subscription expiry as separate authority', async () => {
  const client = createGooglePlayCurrentStateClient(config, {
    authClient,
    fetchImpl: async (url) => {
      assert.match(url, /\/orders\/GPA\.123$/);
      return jsonResponse({
        orderId: 'GPA.123',
        createTime: '2026-08-20T09:59:00Z',
        lastEventTime: '2026-08-20T10:00:05Z',
        orderHistory: { processedEvent: { eventTime: '2026-08-20T10:00:05Z' } },
        subscriptionDetails: {
          servicePeriodStartTime: '2026-08-20T10:00:00Z',
          servicePeriodEndTime: '2026-09-20T10:00:00Z',
        },
      });
    },
  });
  const order = await client.getOrder('GPA.123');
  assert.equal(order.servicePeriodStartMs, Date.parse('2026-08-20T10:00:00Z'));
  assert.equal(order.createAtMs, Date.parse('2026-08-20T09:59:00Z'));
  assert.equal(order.lastEventAtMs, Date.parse('2026-08-20T10:00:05Z'));
  assert.equal(order.processedAtMs, Date.parse('2026-08-20T10:00:05Z'));
  assert.equal(order.rawProviderPayloadIncluded, false);
});

test('acknowledges only through server API and classifies provider throttling as retryable', async () => {
  let method;
  const client = createGooglePlayCurrentStateClient(config, {
    authClient,
    fetchImpl: async (url, options) => {
      method = options.method;
      assert.match(url, /purchases\/subscriptions\/zstudio\.access\/tokens\/ack-token:acknowledge$/);
      return { ok: true, status: 204, json: async () => ({}) };
    },
  });
  assert.deepEqual(await client.acknowledgeSubscription('ack-token'), { acknowledged: true });
  assert.equal(method, 'POST');

  const throttled = createGooglePlayCurrentStateClient(config, {
    authClient,
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  await assert.rejects(
    () => throttled.getSubscription('retry-token'),
    (error) => error.retryable === true && error.httpStatusCode === 503,
  );
});
