import {
  NotificationTypeV2,
  Subtype,
} from '@apple/app-store-server-library';
import { APPLE_APP_ID } from './store-products.js';
import { verifyAppleNotificationV2 } from './apple-notifications.js';
import { reconcileAppleCurrentSubscription } from './apple-server-api.js';
import { applyAppleCurrentStateCommercialEvent } from './commercial-writer-client.js';

function assertSame(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`APPLE_NOTIFICATION_RECONCILIATION_${label}_MISMATCH`);
  }
}

function verifiedNotificationTrigger(notification, config) {
  if (
    !notification
    || notification.verification !== 'verified_notification'
    || notification.reconciliationRequired !== true
    || notification.rawJwsIncluded !== false
  ) {
    throw new Error('APPLE_VERIFIED_NOTIFICATION_REQUIRED');
  }

  assertSame(
    'BILLING_SOURCE',
    notification.billingSource,
    'apple_app_store',
  );
  assertSame(
    'ENVIRONMENT',
    notification.billingEnvironment,
    config.environment,
  );
  assertSame(
    'SOURCE_EVENT_REF',
    notification.sourceEventRef,
    `notification:${notification.notificationUUID}`,
  );
  assertSame(
    'EFFECTIVE_AT',
    notification.effectiveAtMs,
    notification.signedDate,
  );

  return notification;
}

function deviceEvidenceFromNotification(notification) {
  return Object.freeze({
    verification: 'verified',
    transactionId: notification.transactionId,
    originalTransactionId: notification.originalTransactionId,
    productId: notification.productId,
    appAccountToken: notification.personId,
    bundleId: APPLE_APP_ID,
    environment: notification.billingEnvironment,
  });
}

function eventTypeHintForNotification(notification, currentState) {
  if (
    notification.notificationType === NotificationTypeV2.DID_RENEW
    && notification.subtype === Subtype.BILLING_RECOVERY
    && currentState.normalizedStatus === 'active'
  ) {
    return 'recovered';
  }

  if (
    notification.notificationType === NotificationTypeV2.REFUND_REVERSED
    && ['active', 'trialing'].includes(currentState.normalizedStatus)
  ) {
    return 'restored';
  }

  return null;
}

function notificationScopedCurrentState(notification, currentState) {
  if (
    !currentState
    || currentState.verification !== 'verified_current_state'
    || currentState.rawJwsIncluded !== false
  ) {
    throw new Error('APPLE_NOTIFICATION_CURRENT_STATE_REQUIRED');
  }

  assertSame(
    'PERSON_ID',
    currentState.personId,
    notification.personId,
  );
  assertSame(
    'ORIGINAL_TRANSACTION_ID',
    currentState.originalTransactionId,
    notification.originalTransactionId,
  );
  assertSame(
    'SOURCE_SUBSCRIPTION_REF',
    currentState.sourceSubscriptionRef,
    notification.originalTransactionId,
  );
  assertSame(
    'BILLING_SOURCE_CURRENT',
    currentState.billingSource,
    'apple_app_store',
  );
  assertSame(
    'ENVIRONMENT_CURRENT',
    currentState.billingEnvironment,
    notification.billingEnvironment,
  );

  return Object.freeze({
    ...currentState,
    sourceEventRef: notification.sourceEventRef,
    effectiveAtMs: notification.effectiveAtMs,
  });
}

export async function reconcileAppleNotificationToCommercialState(
  signedPayload,
  config,
  {
    verifier,
    appleClient,
    writerClient,
    fetchImpl,
    timeoutMs,
    verifyNotification = verifyAppleNotificationV2,
    reconcileCurrent = reconcileAppleCurrentSubscription,
    applyCommercialEvent = applyAppleCurrentStateCommercialEvent,
  } = {},
) {
  const notification = await verifyNotification(
    signedPayload,
    config,
    { verifier },
  );

  if (
    notification?.verification === 'verified_notification_test'
    && notification.reconciliationRequired === false
    && notification.rawJwsIncluded === false
  ) {
    return Object.freeze({
      verification: 'verified_notification_test',
      notificationUUID: notification.notificationUUID,
      notificationType: notification.notificationType,
      subtype: notification.subtype,
      sourceEventRef: notification.sourceEventRef,
      effectiveAtMs: notification.signedDate,
      writerExecuted: false,
      rawJwsIncluded: false,
    });
  }

  const trigger = verifiedNotificationTrigger(notification, config);
  const currentState = await reconcileCurrent(
    deviceEvidenceFromNotification(trigger),
    config,
    {
      client: appleClient,
      verifier,
    },
  );
  const writerSnapshot = notificationScopedCurrentState(
    trigger,
    currentState,
  );
  const eventTypeHint = eventTypeHintForNotification(
    trigger,
    writerSnapshot,
  );

  const writerResult = await applyCommercialEvent(
    writerSnapshot,
    config,
    {
      client: writerClient,
      eventTypeHint,
      fetchImpl,
      timeoutMs,
    },
  );

  return Object.freeze({
    verification: 'verified_notification_reconciled',
    notificationUUID: trigger.notificationUUID,
    notificationType: trigger.notificationType,
    subtype: trigger.subtype,
    sourceEventRef: trigger.sourceEventRef,
    effectiveAtMs: trigger.effectiveAtMs,
    personId: writerSnapshot.personId,
    originalTransactionId: writerSnapshot.originalTransactionId,
    transactionId: writerSnapshot.transactionId,
    productId: writerSnapshot.currentProductId,
    planCode: writerSnapshot.planCode,
    normalizedStatus: writerSnapshot.normalizedStatus,
    cancelAtPeriodEnd: writerSnapshot.cancelAtPeriodEnd,
    semanticEventHint: eventTypeHint,
    commercialResult: writerResult.result,
    subscriptionId: writerResult.subscriptionId,
    subscriptionStatus: writerResult.subscriptionStatus,
    studioAccessStatus: writerResult.studioAccessStatus,
    aiAccessStatus: writerResult.aiAccessStatus,
    writerExecuted: true,
    rawJwsIncluded: false,
  });
}
