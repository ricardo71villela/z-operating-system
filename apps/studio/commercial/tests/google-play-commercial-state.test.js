import test from 'node:test';
import assert from 'node:assert/strict';
import {
  googlePlayCurrentStateRequiresOrder,
  normalizeGooglePlayCommercialState,
} from '../lib/google-play-commercial-state.js';

const personId = '11111111-1111-4111-8111-111111111111';
const nowMs = Date.parse('2026-08-21T00:00:00Z');

function subscription(overrides = {}) {
  return {
    verification: 'verified_google_play_subscription_current_state',
    billingEnvironment: 'sandbox',
    packageName: 'com.zoperatingsystem.zstudio',
    sourceSubscriptionRef: `google:play:purchase:${'a'.repeat(64)}`,
    purchaseTokenFingerprint: 'a'.repeat(64),
    productId: 'zstudio.access',
    basePlanId: 'monthly',
    planCode: 'monthly',
    sourceProductRef: 'google:play:product:zstudio.access:base_plan:monthly',
    offerId: null,
    trialing: false,
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
    autoRenewEnabled: true,
    startAtMs: Date.parse('2026-08-20T10:00:00Z'),
    expiryAtMs: Date.parse('2026-09-20T10:00:00Z'),
    latestSuccessfulOrderId: 'GPA.123',
    externalAccountId: personId,
    linkedPurchaseTokenFingerprint: null,
    cancellationReason: null,
    cancelAtMs: null,
    autoResumeAtMs: null,
    rawProviderPayloadIncluded: false,
    ...overrides,
  };
}

function order(overrides = {}) {
  return {
    verification: 'verified_google_play_order_current_state',
    orderId: 'GPA.123',
    createAtMs: Date.parse('2026-08-20T09:59:00Z'),
    lastEventAtMs: Date.parse('2026-08-20T10:00:05Z'),
    processedAtMs: Date.parse('2026-08-20T10:00:05Z'),
    cancellationAtMs: null,
    refundAtMs: null,
    servicePeriodStartMs: Date.parse('2026-08-20T10:00:00Z'),
    servicePeriodEndMs: Date.parse('2026-09-20T10:00:00Z'),
    rawProviderPayloadIncluded: false,
    ...overrides,
  };
}

test('PENDING binds purchase intent but produces no writer authority and requires no order', () => {
  const s = subscription({
    subscriptionState: 'SUBSCRIPTION_STATE_PENDING',
    startAtMs: null,
    expiryAtMs: null,
    latestSuccessfulOrderId: null,
  });
  assert.equal(googlePlayCurrentStateRequiresOrder(s), false);
  const result = normalizeGooglePlayCommercialState({ personId, subscription: s, nowMs });
  assert.equal(result.mode, 'pending');
  assert.equal(result.writerArgs, null);
  assert.match(result.sourceEventRef, /^google:play:event:current-state:snapshot:[0-9a-f]{64}$/);
});

test('pending purchase cancellation is terminal for the intent but does not write subscription state', () => {
  const s = subscription({
    subscriptionState: 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED',
    startAtMs: null,
    expiryAtMs: null,
    latestSuccessfulOrderId: null,
    linkedPurchaseTokenFingerprint: 'b'.repeat(64),
  });
  const result = normalizeGooglePlayCommercialState({ personId, subscription: s, nowMs });
  assert.equal(result.mode, 'purchase_canceled');
  assert.equal(result.writerArgs, null);
  assert.equal(JSON.stringify(result).includes('purchaseToken'), false);
});

test('active free trial maps to trial_started and historical expired trial maps to safe expired + consumption claim', () => {
  const trial = subscription({
    trialing: true,
    offerId: 'trial-3d',
    startAtMs: Date.parse('2026-08-20T00:00:00Z'),
    expiryAtMs: Date.parse('2026-08-23T00:00:00Z'),
    latestSuccessfulOrderId: null,
  });
  let result = normalizeGooglePlayCommercialState({ personId, subscription: trial, nowMs });
  assert.equal(result.mode, 'commercial');
  assert.equal(result.historicalTrialConsumed, false);
  assert.equal(result.commercialEvent.eventType, 'trial_started');
  assert.equal(result.commercialEvent.status, 'trialing');
  assert.equal(result.writerArgs.p_trial_ends_at, '2026-08-23T00:00:00.000Z');

  const expired = subscription({
    trialing: true,
    offerId: 'trial-3d',
    subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED',
    startAtMs: Date.parse('2026-08-17T00:00:00Z'),
    expiryAtMs: Date.parse('2026-08-20T00:00:00Z'),
    latestSuccessfulOrderId: null,
    autoRenewEnabled: false,
  });
  result = normalizeGooglePlayCommercialState({ personId, subscription: expired, nowMs });
  assert.equal(result.historicalTrialConsumed, true);
  assert.equal(result.commercialEvent.eventType, 'expired');
  assert.equal(result.commercialEvent.status, 'expired');
  assert.equal(result.writerArgs.p_trial_started_at, null);
  assert.equal(result.writerArgs.p_current_period_start, null);
});

test('paid active maps first period to activated and later period to renewed', () => {
  let result = normalizeGooglePlayCommercialState({
    personId,
    subscription: subscription(),
    order: order(),
    nowMs,
  });
  assert.equal(result.commercialEvent.eventType, 'activated');
  assert.equal(result.commercialEvent.status, 'active');
  assert.equal(result.writerArgs.p_current_period_start, '2026-08-20T10:00:00.000Z');

  result = normalizeGooglePlayCommercialState({
    personId,
    subscription: subscription({ startAtMs: Date.parse('2026-07-20T10:00:00Z') }),
    order: order(),
    nowMs,
  });
  assert.equal(result.commercialEvent.eventType, 'renewed');
});

test('canceled paid subscription keeps access until expiry, then becomes expired', () => {
  const canceled = subscription({
    subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
    autoRenewEnabled: false,
    cancellationReason: 'user',
    cancelAtMs: Date.parse('2026-08-20T20:00:00Z'),
  });
  let result = normalizeGooglePlayCommercialState({ personId, subscription: canceled, order: order(), nowMs });
  assert.equal(result.commercialEvent.eventType, 'renewal_disabled');
  assert.equal(result.commercialEvent.status, 'active');
  assert.equal(result.commercialEvent.cancelAtPeriodEnd, true);

  result = normalizeGooglePlayCommercialState({
    personId,
    subscription: { ...canceled, expiryAtMs: Date.parse('2026-08-20T23:00:00Z') },
    order: order({ servicePeriodEndMs: Date.parse('2026-08-20T23:00:00Z') }),
    nowMs,
  });
  assert.equal(result.commercialEvent.eventType, 'expired');
  assert.equal(result.commercialEvent.status, 'expired');
});

test('grace remains access-bearing, on-hold becomes past_due and pause uses dedicated authority', () => {
  let result = normalizeGooglePlayCommercialState({
    personId,
    subscription: subscription({ subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' }),
    order: order(),
    nowMs,
  });
  assert.equal(result.commercialEvent.eventType, 'grace_started');
  assert.equal(result.commercialEvent.status, 'grace');

  result = normalizeGooglePlayCommercialState({
    personId,
    subscription: subscription({
      subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD',
      expiryAtMs: Date.parse('2026-08-20T20:00:00Z'),
      autoRenewEnabled: true,
    }),
    order: order({ servicePeriodEndMs: Date.parse('2026-08-20T20:00:00Z') }),
    nowMs,
  });
  assert.equal(result.commercialEvent.eventType, 'past_due');
  assert.equal(result.commercialEvent.status, 'past_due');
  assert.equal(result.writerArgs.p_current_period_end, null);

  result = normalizeGooglePlayCommercialState({
    personId,
    subscription: subscription({
      subscriptionState: 'SUBSCRIPTION_STATE_PAUSED',
      expiryAtMs: Date.parse('2026-08-20T20:00:00Z'),
      autoRenewEnabled: false,
      autoResumeAtMs: Date.parse('2026-09-01T00:00:00Z'),
    }),
    order: order({ servicePeriodEndMs: Date.parse('2026-08-20T20:00:00Z') }),
    nowMs,
  });
  assert.equal(result.mode, 'pause');
  assert.equal(result.pause.status, 'paused');
  assert.equal(result.writerArgs, null);
});

test('expired paid state has no stale access window and uses stable provider event times', () => {
  const result = normalizeGooglePlayCommercialState({
    personId,
    subscription: subscription({
      subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED',
      expiryAtMs: Date.parse('2026-08-20T20:00:00Z'),
      autoRenewEnabled: false,
    }),
    order: order({
      cancellationAtMs: Date.parse('2026-08-20T21:00:00Z'),
      lastEventAtMs: Date.parse('2026-08-20T21:00:00Z'),
      servicePeriodEndMs: Date.parse('2026-08-20T20:00:00Z'),
    }),
    nowMs,
  });
  assert.equal(result.commercialEvent.status, 'expired');
  assert.equal(result.commercialEvent.effectiveAtMs, Date.parse('2026-08-20T21:00:00Z'));
  assert.equal(result.writerArgs.p_current_period_start, null);
});

test('snapshot source ref is deterministic and changes when fresh current state changes', () => {
  const a = normalizeGooglePlayCommercialState({ personId, subscription: subscription(), order: order(), nowMs });
  const b = normalizeGooglePlayCommercialState({ personId, subscription: subscription(), order: order(), nowMs });
  const c = normalizeGooglePlayCommercialState({
    personId,
    subscription: subscription({ autoRenewEnabled: false }),
    order: order(),
    nowMs,
  });
  assert.equal(a.sourceEventRef, b.sourceEventRef);
  assert.notEqual(a.sourceEventRef, c.sourceEventRef);
});

test('fails closed on person/order mismatch and expired ACTIVE state', () => {
  assert.throws(
    () => normalizeGooglePlayCommercialState({ personId: '22222222-2222-4222-8222-222222222222', subscription: subscription(), order: order(), nowMs }),
    /GOOGLE_PLAY_PERSON_ID_MISMATCH/,
  );
  assert.throws(
    () => normalizeGooglePlayCommercialState({ personId, subscription: subscription(), order: order({ orderId: 'GPA.WRONG' }), nowMs }),
    /GOOGLE_PLAY_ORDER_SUBSCRIPTION_MISMATCH/,
  );
  assert.throws(
    () => normalizeGooglePlayCommercialState({
      personId,
      subscription: subscription({ expiryAtMs: Date.parse('2026-08-20T23:00:00Z') }),
      order: order({ servicePeriodEndMs: Date.parse('2026-08-20T23:00:00Z') }),
      nowMs,
    }),
    /GOOGLE_PLAY_ACTIVE_STATE_EXPIRED/,
  );
});
