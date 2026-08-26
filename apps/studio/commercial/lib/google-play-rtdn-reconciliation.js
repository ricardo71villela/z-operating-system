import {
  googlePlayCurrentStateRequiresOrder,
  normalizeGooglePlayCommercialState,
} from './google-play-commercial-state.js';

export class GooglePlayRtdnReconciliationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'GooglePlayRtdnReconciliationError';
    this.code = code;
  }
}
function fail(code) { throw new GooglePlayRtdnReconciliationError(code); }

const IGNORED_KINDS = new Set(['one_time_ignored', 'test']);

export async function reconcileGooglePlayRtdn({
  trigger,
  currentStateClient,
  rtdnAuthorityClient,
  purchaseAuthorityClient,
  writerClient,
  normalizeState = normalizeGooglePlayCommercialState,
  requiresOrder = googlePlayCurrentStateRequiresOrder,
  now = () => Date.now(),
}) {
  if (!trigger || typeof trigger !== 'object' || !trigger.messageId || !trigger.kind) {
    fail('GOOGLE_PLAY_RTDN_TRIGGER_INVALID');
  }
  for (const client of [currentStateClient, rtdnAuthorityClient, purchaseAuthorityClient, writerClient]) {
    if (!client || typeof client !== 'object') fail('GOOGLE_PLAY_RTDN_DEPENDENCY_INVALID');
  }

  if (await rtdnAuthorityClient.isProcessed(trigger.messageId)) {
    return Object.freeze({ result: 'duplicate', kind: trigger.kind });
  }

  if (IGNORED_KINDS.has(trigger.kind)) {
    await rtdnAuthorityClient.markProcessed({
      messageId: trigger.messageId,
      notificationKind: trigger.kind,
      notificationType: trigger.notificationType ?? null,
      eventTimeMs: trigger.eventTimeMs,
      sourceSubscriptionRef: null,
    });
    return Object.freeze({ result: 'ignored', kind: trigger.kind });
  }

  if (trigger.kind === 'pending_refund_review') {
    if (typeof rtdnAuthorityClient.recordPendingRefundReview !== 'function') {
      fail('GOOGLE_PLAY_RTDN_REFUND_REVIEW_AUTHORITY_REQUIRED');
    }
    await rtdnAuthorityClient.recordPendingRefundReview({
      messageId: trigger.messageId,
      pendingRefundToken: trigger.pendingRefundToken,
      orderId: trigger.orderId,
      refundReason: trigger.refundReason,
      obfuscatedAccountId: trigger.obfuscatedAccountId,
      eventTimeMs: trigger.eventTimeMs,
    });
    await rtdnAuthorityClient.markProcessed({
      messageId: trigger.messageId,
      notificationKind: trigger.kind,
      notificationType: null,
      eventTimeMs: trigger.eventTimeMs,
      sourceSubscriptionRef: null,
    });
    return Object.freeze({ result: 'support_queued', kind: trigger.kind });
  }

  if (!['subscription','voided_subscription'].includes(trigger.kind) || !trigger.purchaseToken) {
    fail('GOOGLE_PLAY_RTDN_TRIGGER_UNSUPPORTED');
  }

  const subscription = await currentStateClient.getSubscription(trigger.purchaseToken);
  const identity = await rtdnAuthorityClient.resolveIdentity({
    billingEnvironment: subscription.billingEnvironment,
    sourceSubscriptionRef: subscription.sourceSubscriptionRef,
    externalAccountId: subscription.externalAccountId,
    planCode: subscription.planCode,
    providerTrialing: subscription.trialing,
  });

  if (identity.intentId != null) {
    await purchaseAuthorityClient.reconcileIntent({
      intentId: identity.intentId,
      personId: identity.personId,
      billingEnvironment: subscription.billingEnvironment,
      planCode: subscription.planCode,
      sourceSubscriptionRef: subscription.sourceSubscriptionRef,
      providerTrialing: subscription.trialing,
    });
  }

  if (subscription.subscriptionState === 'SUBSCRIPTION_STATE_PENDING') {
    if (identity.intentId == null) fail('GOOGLE_PLAY_RTDN_PENDING_INTENT_REQUIRED');
    await rtdnAuthorityClient.markProcessed({
      messageId: trigger.messageId,
      notificationKind: trigger.kind,
      notificationType: trigger.notificationType ?? null,
      eventTimeMs: trigger.eventTimeMs,
      sourceSubscriptionRef: subscription.sourceSubscriptionRef,
    });
    return Object.freeze({ result: 'pending', personId: identity.personId, planCode: subscription.planCode });
  }

  if (subscription.subscriptionState === 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED') {
    if (identity.intentId != null) {
      await purchaseAuthorityClient.failIntent({
        intentId: identity.intentId,
        personId: identity.personId,
        billingEnvironment: subscription.billingEnvironment,
        sourceSubscriptionRef: subscription.sourceSubscriptionRef,
      });
    }
    await rtdnAuthorityClient.markProcessed({
      messageId: trigger.messageId,
      notificationKind: trigger.kind,
      notificationType: trigger.notificationType ?? null,
      eventTimeMs: trigger.eventTimeMs,
      sourceSubscriptionRef: subscription.sourceSubscriptionRef,
    });
    return Object.freeze({ result: 'purchase_canceled', personId: identity.personId, planCode: subscription.planCode });
  }

  let order = null;
  if (requiresOrder(subscription)) {
    if (!subscription.latestSuccessfulOrderId) fail('GOOGLE_PLAY_RTDN_ORDER_ID_REQUIRED');
    order = await currentStateClient.getOrder(subscription.latestSuccessfulOrderId);
  }

  // Current Z Studio purchases always set obfuscatedExternalAccountId. For an
  // already-bound legacy provider chain, the exact hashed subscription binding
  // is stronger authority than a missing optional Google field; inject only the
  // DB-resolved canonical id for normalization, never for a new chain.
  const normalizedSubscription = subscription.externalAccountId == null && identity.existingSubscription
    ? Object.freeze({ ...subscription, externalAccountId: identity.personId })
    : subscription;

  const normalized = normalizeState({
    personId: identity.personId,
    subscription: normalizedSubscription,
    order,
    nowMs: now(),
  });
  if (!['commercial','pause'].includes(normalized.mode)) fail('GOOGLE_PLAY_RTDN_CURRENT_STATE_UNSUPPORTED');

  if (normalized.historicalTrialConsumed && subscription.billingEnvironment === 'production') {
    if (identity.intentId == null) fail('GOOGLE_PLAY_RTDN_TRIAL_INTENT_REQUIRED');
    await purchaseAuthorityClient.claimConsumedTrial({
      intentId: identity.intentId,
      personId: identity.personId,
      sourceSubscriptionRef: subscription.sourceSubscriptionRef,
      billingEnvironment: subscription.billingEnvironment,
      claimedAtMs: normalized.commercialEvent.effectiveAtMs,
    });
  }

  let written;
  if (normalized.mode === 'pause') {
    written = await purchaseAuthorityClient.applyPause({
      personId: identity.personId,
      billingEnvironment: subscription.billingEnvironment,
      sourceEventRef: normalized.sourceEventRef,
      sourceSubscriptionRef: subscription.sourceSubscriptionRef,
      sourceProductRef: subscription.sourceProductRef,
      planCode: subscription.planCode,
      effectiveAtMs: normalized.pause.effectiveAtMs,
    });
  } else {
    written = await writerClient.applyVerifiedCommercialEvent(normalized.writerArgs);
  }

  let acknowledged = subscription.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
  if (!acknowledged) {
    await currentStateClient.acknowledgeSubscription(trigger.purchaseToken);
    acknowledged = true;
  }

  if (identity.intentId != null) {
    await purchaseAuthorityClient.completeIntent({
      intentId: identity.intentId,
      personId: identity.personId,
      billingEnvironment: subscription.billingEnvironment,
      sourceSubscriptionRef: subscription.sourceSubscriptionRef,
    });
  }

  await rtdnAuthorityClient.markProcessed({
    messageId: trigger.messageId,
    notificationKind: trigger.kind,
    notificationType: trigger.notificationType ?? null,
    eventTimeMs: trigger.eventTimeMs,
    sourceSubscriptionRef: subscription.sourceSubscriptionRef,
  });

  return Object.freeze({
    result: 'processed',
    kind: trigger.kind,
    personId: identity.personId,
    planCode: subscription.planCode,
    commercialResult: written.result,
    acknowledged,
  });
}
