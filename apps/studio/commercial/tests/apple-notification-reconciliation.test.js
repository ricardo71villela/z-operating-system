import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NotificationTypeV2,
  Subtype,
} from '@apple/app-store-server-library';
import {
  reconcileAppleNotificationToCommercialState,
} from '../lib/apple-notification-reconciliation.js';

const personId = 'a1111111-b222-c333-d444-e55555555555';
const otherPersonId = 'b1111111-b222-c333-d444-e55555555555';
const notificationUUID = '11111111-2222-4333-8444-555555555555';
const originalTransactionId = '2000000000000000';
const transactionId = '2000000000000005';
const productId =
  'com.zoperatingsystem.zstudio.subscription.monthly';

const config = Object.freeze({
  environment: 'sandbox',
  bundleId: 'com.zoperatingsystem.zstudio',
  appAppleId: null,
  issuerId: 'test-issuer',
  keyId: 'test-key',
  privateKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
  supabaseUrl: 'https://example.supabase.co',
  supabaseServiceRole: 'test-only-not-a-real-secret',
});

function verifiedNotification(overrides = {}) {
  return {
    verification: 'verified_notification',
    notificationUUID,
    notificationType: NotificationTypeV2.DID_RENEW,
    subtype: Subtype.BILLING_RECOVERY,
    version: '2.0',
    signedDate: 1789761900000,
    sourceEventRef: `notification:${notificationUUID}`,
    billingSource: 'apple_app_store',
    billingEnvironment: 'sandbox',
    personId,
    transactionId,
    originalTransactionId,
    productId,
    planCode: 'monthly',
    autoRenewProductId: productId,
    autoRenewStatus: 1,
    transactionSignedDate: 1789761800000,
    renewalSignedDate: 1789761850000,
    effectiveAtMs: 1789761900000,
    reconciliationRequired: true,
    rawJwsIncluded: false,
    ...overrides,
  };
}

function currentState(overrides = {}) {
  return {
    verification: 'verified_current_state',
    billingSource: 'apple_app_store',
    billingEnvironment: 'sandbox',
    sourceEventRef: `app:${'a'.repeat(64)}`,
    sourceSubscriptionRef: originalTransactionId,
    sourceProductRef: productId,
    personId,
    planCode: 'monthly',
    normalizedStatus: 'active',
    appleStatus: 1,
    appleRevokedEquivalent: false,
    cancelAtPeriodEnd: false,
    subscriptionGroupIdentifier: '12345678',
    effectiveAtMs: 1789761880000,
    trialStartedAtMs: null,
    trialEndsAtMs: null,
    currentPeriodStartMs: 1789761600000,
    currentPeriodEndMs: 1792440000000,
    transactionId,
    originalTransactionId,
    currentProductId: productId,
    autoRenewProductId: productId,
    rawJwsIncluded: false,
    ...overrides,
  };
}

function writerClient(captured, result = {}) {
  return {
    async applyVerifiedCommercialEvent(args) {
      captured.push(args);
      return {
        result: 'applied',
        subscriptionId: 'c1111111-b222-c333-d444-e55555555555',
        subscriptionStatus: args.p_status,
        planCode: args.p_plan_code,
        studioAccessStatus: 'active',
        aiAccessStatus: 'active',
        processingStatus: 'processed',
        ...result,
      };
    },
  };
}

function dependencies({
  notification = verifiedNotification(),
  current = currentState(),
  captured = [],
  reconcileCalls = [],
  writer = writerClient(captured),
} = {}) {
  return {
    captured,
    reconcileCalls,
    options: {
      async verifyNotification(value) {
        assert.equal(value, 'outer-notification-jws');
        return notification;
      },
      async reconcileCurrent(evidence) {
        reconcileCalls.push(evidence);
        return current;
      },
      writerClient: writer,
    },
  };
}

test('billing recovery reconciles fresh Apple state then writes recovered using notification idempotency and time', async () => {
  const state = dependencies();
  const result = await reconcileAppleNotificationToCommercialState(
    'outer-notification-jws',
    config,
    state.options,
  );

  assert.equal(state.reconcileCalls.length, 1);
  assert.deepEqual(state.reconcileCalls[0], {
    verification: 'verified',
    transactionId,
    originalTransactionId,
    productId,
    appAccountToken: personId,
    bundleId: config.bundleId,
    environment: 'sandbox',
  });

  assert.equal(state.captured.length, 1);
  const args = state.captured[0];
  assert.equal(args.p_source_event_ref, `notification:${notificationUUID}`);
  assert.equal(args.p_effective_at, new Date(1789761900000).toISOString());
  assert.equal(args.p_event_type, 'recovered');
  assert.equal(args.p_status, 'active');
  assert.equal(args.p_person_id, personId);

  assert.equal(result.verification, 'verified_notification_reconciled');
  assert.equal(result.semanticEventHint, 'recovered');
  assert.equal(result.commercialResult, 'applied');
  assert.equal(result.writerExecuted, true);
  assert.equal(result.rawJwsIncluded, false);
});

test('refund reversed maps to restored only when fresh state still has access', async () => {
  const state = dependencies({
    notification: verifiedNotification({
      notificationType: NotificationTypeV2.REFUND_REVERSED,
      subtype: null,
    }),
  });

  const result = await reconcileAppleNotificationToCommercialState(
    'outer-notification-jws',
    config,
    state.options,
  );

  assert.equal(state.captured[0].p_event_type, 'restored');
  assert.equal(state.captured[0].p_status, 'active');
  assert.equal(result.semanticEventHint, 'restored');
});

test('stale refund reversal cannot override a newer expired Apple state', async () => {
  const state = dependencies({
    notification: verifiedNotification({
      notificationType: NotificationTypeV2.REFUND_REVERSED,
      subtype: null,
    }),
    current: currentState({
      normalizedStatus: 'expired',
      appleStatus: 2,
      currentPeriodStartMs: null,
      currentPeriodEndMs: null,
    }),
  });

  const result = await reconcileAppleNotificationToCommercialState(
    'outer-notification-jws',
    config,
    state.options,
  );

  assert.equal(state.captured[0].p_event_type, 'expired');
  assert.equal(state.captured[0].p_status, 'expired');
  assert.equal(result.semanticEventHint, null);
  assert.equal(result.normalizedStatus, 'expired');
});

test('auto-renew disabled is derived from fresh current state rather than forced by notification subtype', async () => {
  const state = dependencies({
    notification: verifiedNotification({
      notificationType: NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS,
      subtype: Subtype.AUTO_RENEW_DISABLED,
    }),
    current: currentState({
      cancelAtPeriodEnd: true,
    }),
  });

  await reconcileAppleNotificationToCommercialState(
    'outer-notification-jws',
    config,
    state.options,
  );

  assert.equal(state.captured[0].p_event_type, 'renewal_disabled');
  assert.equal(state.captured[0].p_cancel_at_period_end, true);
});

test('TEST notification verifies but never reconciles or writes', async () => {
  let reconcileCount = 0;
  let writerCount = 0;

  const result = await reconcileAppleNotificationToCommercialState(
    'outer-notification-jws',
    config,
    {
      async verifyNotification() {
        return {
          verification: 'verified_notification_test',
          notificationUUID,
          notificationType: NotificationTypeV2.TEST,
          subtype: null,
          signedDate: 1789761900000,
          sourceEventRef: `notification:${notificationUUID}`,
          reconciliationRequired: false,
          rawJwsIncluded: false,
        };
      },
      async reconcileCurrent() {
        reconcileCount += 1;
      },
      writerClient: {
        async applyVerifiedCommercialEvent() {
          writerCount += 1;
        },
      },
    },
  );

  assert.equal(result.verification, 'verified_notification_test');
  assert.equal(result.writerExecuted, false);
  assert.equal(reconcileCount, 0);
  assert.equal(writerCount, 0);
});

test('fresh current state must remain bound to the notification person and subscription chain', async () => {
  for (const [patch, expected] of [
    [
      { personId: otherPersonId },
      /APPLE_NOTIFICATION_RECONCILIATION_PERSON_ID_MISMATCH/,
    ],
    [
      {
        originalTransactionId: '2000000000000099',
        sourceSubscriptionRef: '2000000000000099',
      },
      /APPLE_NOTIFICATION_RECONCILIATION_ORIGINAL_TRANSACTION_ID_MISMATCH/,
    ],
    [
      { billingEnvironment: 'production' },
      /APPLE_NOTIFICATION_RECONCILIATION_ENVIRONMENT_CURRENT_MISMATCH/,
    ],
  ]) {
    const state = dependencies({
      current: currentState(patch),
    });

    await assert.rejects(
      () => reconcileAppleNotificationToCommercialState(
        'outer-notification-jws',
        config,
        state.options,
      ),
      expected,
    );
    assert.equal(state.captured.length, 0);
  }
});

test('notification idempotency reference and effective time cannot drift before reconciliation', async () => {
  for (const [patch, expected] of [
    [
      { sourceEventRef: 'notification:wrong' },
      /APPLE_NOTIFICATION_RECONCILIATION_SOURCE_EVENT_REF_MISMATCH/,
    ],
    [
      { effectiveAtMs: 1789761900001 },
      /APPLE_NOTIFICATION_RECONCILIATION_EFFECTIVE_AT_MISMATCH/,
    ],
    [
      { billingEnvironment: 'production' },
      /APPLE_NOTIFICATION_RECONCILIATION_ENVIRONMENT_MISMATCH/,
    ],
  ]) {
    const state = dependencies({
      notification: verifiedNotification(patch),
    });

    await assert.rejects(
      () => reconcileAppleNotificationToCommercialState(
        'outer-notification-jws',
        config,
        state.options,
      ),
      expected,
    );
    assert.equal(state.reconcileCalls.length, 0);
    assert.equal(state.captured.length, 0);
  }
});

test('writer failure is propagated once and service performs no automatic retry', async () => {
  let calls = 0;
  const state = dependencies({
    writer: {
      async applyVerifiedCommercialEvent() {
        calls += 1;
        throw new Error('writer unavailable');
      },
    },
  });

  await assert.rejects(
    () => reconcileAppleNotificationToCommercialState(
      'outer-notification-jws',
      config,
      state.options,
    ),
    /writer unavailable/,
  );

  assert.equal(calls, 1);
});

test('service result contains normalized commercial state only and never raw JWS', async () => {
  const state = dependencies();
  const result = await reconcileAppleNotificationToCommercialState(
    'outer-notification-jws',
    config,
    state.options,
  );
  const serialized = JSON.stringify(result);

  assert.equal(serialized.includes('outer-notification-jws'), false);
  assert.equal('signedPayload' in result, false);
  assert.equal('signedTransactionInfo' in result, false);
  assert.equal('signedRenewalInfo' in result, false);
  assert.equal('decodedNotification' in result, false);
});
