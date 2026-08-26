import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileGooglePlayRtdn } from '../lib/google-play-rtdn-reconciliation.js';

const ref = `google:play:purchase:${'a'.repeat(64)}`;
const productRef = 'google:play:product:zstudio.access:base_plan:monthly';
const person = '11111111-1111-4111-8111-111111111111';
function subscription(overrides = {}) {
  return {
    billingEnvironment: 'production',
    sourceSubscriptionRef: ref,
    sourceProductRef: productRef,
    externalAccountId: person,
    planCode: 'monthly',
    trialing: false,
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
    latestSuccessfulOrderId: 'GPA.123',
    ...overrides,
  };
}
function trigger(overrides = {}) {
  return { messageId: '1234', kind: 'subscription', notificationType: 2, eventTimeMs: 1800000000000, purchaseToken: 'opaque-token', ...overrides };
}
function clients({ current = subscription(), identity = { personId: person, intentId: '22222222-2222-4222-8222-222222222222', existingSubscription: false, trialReserved: false }, processed = false } = {}) {
  const calls = [];
  return {
    calls,
    currentStateClient: {
      getSubscription: async (token) => { calls.push(['getSubscription', token]); return current; },
      getOrder: async (id) => { calls.push(['getOrder', id]); return { id }; },
      acknowledgeSubscription: async (token) => { calls.push(['ack', token]); return { acknowledged: true }; },
    },
    rtdnAuthorityClient: {
      isProcessed: async (id) => { calls.push(['isProcessed', id]); return processed; },
      resolveIdentity: async (args) => { calls.push(['resolveIdentity', args]); return identity; },
      recordPendingRefundReview: async (args) => { calls.push(['recordRefundReview', args]); return { result: 'recorded' }; },
      markProcessed: async (args) => { calls.push(['markProcessed', args]); return { result: 'processed' }; },
    },
    purchaseAuthorityClient: {
      reconcileIntent: async (args) => { calls.push(['reconcileIntent', args]); return { result: 'purchase_seen' }; },
      failIntent: async (args) => { calls.push(['failIntent', args]); return { result: 'failed' }; },
      claimConsumedTrial: async (args) => { calls.push(['claimTrial', args]); return { result: 'claimed' }; },
      applyPause: async (args) => { calls.push(['pause', args]); return { result: 'applied' }; },
      completeIntent: async (args) => { calls.push(['complete', args]); return { result: 'completed' }; },
    },
    writerClient: {
      applyVerifiedCommercialEvent: async (args) => { calls.push(['writer', args]); return { result: 'applied' }; },
    },
  };
}
const normalizeCommercial = () => ({ mode: 'commercial', historicalTrialConsumed: false, writerArgs: { safe: true }, commercialEvent: { effectiveAtMs: 1800000000000 } });

test('duplicate RTDN stops before Google provider API call', async () => {
  const c = clients({ processed: true });
  const result = await reconcileGooglePlayRtdn({ trigger: trigger(), ...c, normalizeState: normalizeCommercial, requiresOrder: () => false });
  assert.equal(result.result, 'duplicate');
  assert.deepEqual(c.calls, [['isProcessed', '1234']]);
});

test('commercial RTDN uses fresh state, writer, acknowledge, complete, then marks processed', async () => {
  const c = clients();
  const result = await reconcileGooglePlayRtdn({ trigger: trigger(), ...c, normalizeState: normalizeCommercial, requiresOrder: () => false });
  assert.equal(result.result, 'processed');
  const names = c.calls.map(([name]) => name);
  assert.deepEqual(names, ['isProcessed','getSubscription','resolveIdentity','reconcileIntent','writer','ack','complete','markProcessed']);
  assert.ok(names.indexOf('writer') < names.indexOf('ack'));
  assert.ok(names.indexOf('ack') < names.indexOf('complete'));
  assert.ok(names.indexOf('complete') < names.indexOf('markProcessed'));
});

test('pending and canceled-pending never call commercial writer', async () => {
  let c = clients({ current: subscription({ subscriptionState: 'SUBSCRIPTION_STATE_PENDING', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING', latestSuccessfulOrderId: null }) });
  let result = await reconcileGooglePlayRtdn({ trigger: trigger(), ...c, normalizeState: normalizeCommercial, requiresOrder: () => false });
  assert.equal(result.result, 'pending');
  assert.equal(c.calls.some(([name]) => name === 'writer'), false);
  assert.equal(c.calls.at(-1)[0], 'markProcessed');

  c = clients({ current: subscription({ subscriptionState: 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING', latestSuccessfulOrderId: null }) });
  result = await reconcileGooglePlayRtdn({ trigger: trigger({ notificationType: 20 }), ...c, normalizeState: normalizeCommercial, requiresOrder: () => false });
  assert.equal(result.result, 'purchase_canceled');
  assert.equal(c.calls.some(([name]) => name === 'failIntent'), true);
  assert.equal(c.calls.some(([name]) => name === 'writer'), false);
});

test('historical production trial is claimed before terminal writer and requires exact intent', async () => {
  const c = clients({ current: subscription({ trialing: true, subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }) });
  const normalize = () => ({ mode: 'commercial', historicalTrialConsumed: true, writerArgs: { terminal: true }, commercialEvent: { effectiveAtMs: 1800000000000 } });
  await reconcileGooglePlayRtdn({ trigger: trigger({ notificationType: 13 }), ...c, normalizeState: normalize, requiresOrder: () => false });
  const names = c.calls.map(([name]) => name);
  assert.ok(names.indexOf('claimTrial') < names.indexOf('writer'));

  const noIntent = clients({
    current: subscription({ trialing: true, subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }),
    identity: { personId: person, intentId: null, existingSubscription: true, trialReserved: false },
  });
  await assert.rejects(
    () => reconcileGooglePlayRtdn({ trigger: trigger({ notificationType: 13 }), ...noIntent, normalizeState: normalize, requiresOrder: () => false }),
    /GOOGLE_PLAY_RTDN_TRIAL_INTENT_REQUIRED/,
  );
});

test('test/one-time RTDN is ignored while pending refund review is support-queued before message ack', async () => {
  let c = clients();
  let result = await reconcileGooglePlayRtdn({ trigger: trigger({ kind: 'test', purchaseToken: null, notificationType: null }), ...c, normalizeState: normalizeCommercial, requiresOrder: () => false });
  assert.equal(result.result, 'ignored');
  assert.deepEqual(c.calls.map(([name]) => name), ['isProcessed','markProcessed']);

  c = clients();
  result = await reconcileGooglePlayRtdn({
    trigger: trigger({
      kind: 'pending_refund_review',
      purchaseToken: null,
      notificationType: null,
      pendingRefundToken: 'review-token',
      orderId: 'GPA.review',
      refundReason: 7,
      obfuscatedAccountId: person,
    }),
    ...c,
    normalizeState: normalizeCommercial,
    requiresOrder: () => false,
  });
  assert.equal(result.result, 'support_queued');
  assert.deepEqual(c.calls.map(([name]) => name), ['isProcessed','recordRefundReview','markProcessed']);
});
