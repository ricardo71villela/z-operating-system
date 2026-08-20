import { createHash } from 'node:crypto';
import { buildVerifiedCommercialWriterArgs } from './commercial-event-adapter.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERIFIED_SUBSCRIPTION = 'verified_google_play_subscription_current_state';
const VERIFIED_ORDER = 'verified_google_play_order_current_state';

export class GooglePlayCommercialStateError extends Error {
  constructor(code) {
    super(code);
    this.name = 'GooglePlayCommercialStateError';
    this.code = code;
  }
}

function fail(code) {
  throw new GooglePlayCommercialStateError(code);
}

function requiredMs(value, code) {
  if (!Number.isFinite(value) || value <= 0) fail(code);
  return value;
}

function optionalMs(value, code) {
  if (value == null) return null;
  return requiredMs(value, code);
}

function maxMs(...values) {
  const present = values.filter((value) => Number.isFinite(value) && value > 0);
  if (present.length === 0) fail('GOOGLE_PLAY_EFFECTIVE_AT_UNAVAILABLE');
  return Math.max(...present);
}

function verifySubscription(snapshot, personId) {
  if (
    !snapshot
    || snapshot.verification !== VERIFIED_SUBSCRIPTION
    || snapshot.rawProviderPayloadIncluded !== false
  ) {
    fail('GOOGLE_PLAY_VERIFIED_CURRENT_STATE_REQUIRED');
  }
  if (!UUID_RE.test(personId)) fail('GOOGLE_PLAY_PERSON_ID_INVALID');
  if (snapshot.externalAccountId !== personId.toLowerCase()) {
    fail('GOOGLE_PLAY_PERSON_ID_MISMATCH');
  }
  if (!/^google:play:purchase:[0-9a-f]{64}$/.test(snapshot.sourceSubscriptionRef)) {
    fail('GOOGLE_PLAY_SUBSCRIPTION_REF_INVALID');
  }
  if (!/^google:play:product:zstudio\.access:base_plan:(weekly|monthly|annual)$/.test(snapshot.sourceProductRef)) {
    fail('GOOGLE_PLAY_PRODUCT_REF_INVALID');
  }
  if (!['weekly', 'monthly', 'annual'].includes(snapshot.planCode)) {
    fail('GOOGLE_PLAY_PLAN_INVALID');
  }
  if (snapshot.sourceProductRef !== `google:play:product:zstudio.access:base_plan:${snapshot.planCode}`) {
    fail('GOOGLE_PLAY_PLAN_PRODUCT_MISMATCH');
  }
  return personId.toLowerCase();
}

function verifyOrder(order, subscription) {
  if (
    !order
    || order.verification !== VERIFIED_ORDER
    || order.rawProviderPayloadIncluded !== false
  ) {
    fail('GOOGLE_PLAY_VERIFIED_ORDER_REQUIRED');
  }
  if (order.orderId !== subscription.latestSuccessfulOrderId) {
    fail('GOOGLE_PLAY_ORDER_SUBSCRIPTION_MISMATCH');
  }
  if (order.servicePeriodEndMs <= order.servicePeriodStartMs) {
    fail('GOOGLE_PLAY_ORDER_PERIOD_INVALID');
  }
  return order;
}

export function googlePlayCurrentStateRequiresOrder(subscription) {
  if (!subscription || subscription.verification !== VERIFIED_SUBSCRIPTION) {
    fail('GOOGLE_PLAY_VERIFIED_CURRENT_STATE_REQUIRED');
  }
  switch (subscription.subscriptionState) {
    case 'SUBSCRIPTION_STATE_PENDING':
    case 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED':
      return false;
    case 'SUBSCRIPTION_STATE_EXPIRED':
      return !subscription.trialing && subscription.latestSuccessfulOrderId != null;
    default:
      return !subscription.trialing;
  }
}

function snapshotFingerprint(subscription, order, mode, event) {
  const canonical = {
    sourceSubscriptionRef: subscription.sourceSubscriptionRef,
    sourceProductRef: subscription.sourceProductRef,
    planCode: subscription.planCode,
    subscriptionState: subscription.subscriptionState,
    acknowledgementState: subscription.acknowledgementState,
    autoRenewEnabled: subscription.autoRenewEnabled,
    startAtMs: subscription.startAtMs,
    expiryAtMs: subscription.expiryAtMs,
    latestSuccessfulOrderId: subscription.latestSuccessfulOrderId,
    offerId: subscription.offerId,
    trialing: subscription.trialing,
    cancellationReason: subscription.cancellationReason,
    cancelAtMs: subscription.cancelAtMs,
    autoResumeAtMs: subscription.autoResumeAtMs,
    linkedPurchaseTokenFingerprint: subscription.linkedPurchaseTokenFingerprint,
    order: order == null ? null : {
      orderId: order.orderId,
      createAtMs: order.createAtMs,
      lastEventAtMs: order.lastEventAtMs,
      processedAtMs: order.processedAtMs,
      cancellationAtMs: order.cancellationAtMs,
      refundAtMs: order.refundAtMs,
      servicePeriodStartMs: order.servicePeriodStartMs,
      servicePeriodEndMs: order.servicePeriodEndMs,
    },
    mode,
    event: event == null ? null : {
      eventType: event.eventType,
      status: event.status,
      trialStartedAtMs: event.trialStartedAtMs,
      trialEndsAtMs: event.trialEndsAtMs,
      currentPeriodStartMs: event.currentPeriodStartMs,
      currentPeriodEndMs: event.currentPeriodEndMs,
      cancelAtPeriodEnd: event.cancelAtPeriodEnd,
      effectiveAtMs: event.effectiveAtMs,
    },
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function paidPeriod(subscription, order) {
  verifyOrder(order, subscription);
  const start = requiredMs(order.servicePeriodStartMs, 'GOOGLE_PLAY_PERIOD_START_INVALID');
  const end = requiredMs(subscription.expiryAtMs, 'GOOGLE_PLAY_PERIOD_END_INVALID');
  if (end <= start) fail('GOOGLE_PLAY_PERIOD_INVALID');
  return { start, end };
}

function activePaidEvent(subscription, order) {
  const period = paidPeriod(subscription, order);
  const firstPaidPeriod = subscription.startAtMs === period.start;
  const eventType = subscription.autoRenewEnabled
    ? (firstPaidPeriod ? 'activated' : 'renewed')
    : 'renewal_disabled';
  return {
    eventType,
    status: 'active',
    trialStartedAtMs: null,
    trialEndsAtMs: null,
    currentPeriodStartMs: period.start,
    currentPeriodEndMs: period.end,
    cancelAtPeriodEnd: !subscription.autoRenewEnabled,
    effectiveAtMs: maxMs(order.lastEventAtMs, order.processedAtMs, period.start),
  };
}

function canceledPaidEvent(subscription, order, nowMs) {
  const period = paidPeriod(subscription, order);
  if (period.end <= nowMs) {
    return {
      eventType: 'expired',
      status: 'expired',
      trialStartedAtMs: null,
      trialEndsAtMs: null,
      currentPeriodStartMs: null,
      currentPeriodEndMs: null,
      cancelAtPeriodEnd: false,
      effectiveAtMs: maxMs(period.end, subscription.cancelAtMs, order.cancellationAtMs, order.lastEventAtMs),
    };
  }
  return {
    eventType: 'renewal_disabled',
    status: 'active',
    trialStartedAtMs: null,
    trialEndsAtMs: null,
    currentPeriodStartMs: period.start,
    currentPeriodEndMs: period.end,
    cancelAtPeriodEnd: true,
    effectiveAtMs: maxMs(subscription.cancelAtMs, order.cancellationAtMs, order.lastEventAtMs, period.start),
  };
}

function trialEvent(subscription, nowMs) {
  const start = requiredMs(subscription.startAtMs, 'GOOGLE_PLAY_TRIAL_START_INVALID');
  const end = requiredMs(subscription.expiryAtMs, 'GOOGLE_PLAY_TRIAL_END_INVALID');
  if (end <= start) fail('GOOGLE_PLAY_TRIAL_PERIOD_INVALID');
  if (subscription.subscriptionState === 'SUBSCRIPTION_STATE_EXPIRED' || end <= nowMs) {
    return {
      eventType: 'expired',
      status: 'expired',
      trialStartedAtMs: null,
      trialEndsAtMs: null,
      currentPeriodStartMs: null,
      currentPeriodEndMs: null,
      cancelAtPeriodEnd: false,
      effectiveAtMs: maxMs(end, subscription.cancelAtMs),
    };
  }
  return {
    eventType: 'trial_started',
    status: 'trialing',
    trialStartedAtMs: start,
    trialEndsAtMs: end,
    currentPeriodStartMs: null,
    currentPeriodEndMs: null,
    cancelAtPeriodEnd: !subscription.autoRenewEnabled,
    effectiveAtMs: maxMs(subscription.cancelAtMs, start),
  };
}

function graceEvent(subscription, order) {
  const period = paidPeriod(subscription, order);
  return {
    eventType: subscription.autoRenewEnabled ? 'grace_started' : 'renewal_disabled',
    status: 'grace',
    trialStartedAtMs: null,
    trialEndsAtMs: null,
    currentPeriodStartMs: period.start,
    currentPeriodEndMs: period.end,
    cancelAtPeriodEnd: !subscription.autoRenewEnabled,
    effectiveAtMs: maxMs(order.servicePeriodEndMs, order.lastEventAtMs, order.cancellationAtMs),
  };
}

function terminalPaidEvent(subscription, order) {
  const effectiveAtMs = maxMs(
    subscription.expiryAtMs,
    order?.refundAtMs,
    order?.cancellationAtMs,
    order?.lastEventAtMs,
  );
  return {
    eventType: 'expired',
    status: 'expired',
    trialStartedAtMs: null,
    trialEndsAtMs: null,
    currentPeriodStartMs: null,
    currentPeriodEndMs: null,
    cancelAtPeriodEnd: false,
    effectiveAtMs,
  };
}

export function normalizeGooglePlayCommercialState({
  personId,
  subscription,
  order = null,
  nowMs = Date.now(),
}) {
  const person = verifySubscription(subscription, personId);
  requiredMs(nowMs, 'GOOGLE_PLAY_CURRENT_TIME_INVALID');

  if (googlePlayCurrentStateRequiresOrder(subscription)) {
    verifyOrder(order, subscription);
  } else if (order != null) {
    verifyOrder(order, subscription);
  }

  if (subscription.subscriptionState === 'SUBSCRIPTION_STATE_PENDING') {
    const fingerprint = snapshotFingerprint(subscription, order, 'pending', null);
    return Object.freeze({
      mode: 'pending',
      personId: person,
      planCode: subscription.planCode,
      sourceSubscriptionRef: subscription.sourceSubscriptionRef,
      sourceProductRef: subscription.sourceProductRef,
      sourceEventRef: `google:play:event:current-state:snapshot:${fingerprint}`,
      historicalTrialConsumed: false,
      writerArgs: null,
    });
  }

  if (subscription.subscriptionState === 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED') {
    const fingerprint = snapshotFingerprint(subscription, order, 'purchase_canceled', null);
    return Object.freeze({
      mode: 'purchase_canceled',
      personId: person,
      planCode: subscription.planCode,
      sourceSubscriptionRef: subscription.sourceSubscriptionRef,
      sourceProductRef: subscription.sourceProductRef,
      sourceEventRef: `google:play:event:current-state:snapshot:${fingerprint}`,
      historicalTrialConsumed: false,
      writerArgs: null,
    });
  }

  if (subscription.subscriptionState === 'SUBSCRIPTION_STATE_PAUSED') {
    const event = {
      eventType: 'pause_started',
      status: 'paused',
      trialStartedAtMs: null,
      trialEndsAtMs: null,
      currentPeriodStartMs: null,
      currentPeriodEndMs: null,
      cancelAtPeriodEnd: false,
      effectiveAtMs: maxMs(subscription.expiryAtMs, order?.lastEventAtMs, order?.servicePeriodEndMs),
    };
    const fingerprint = snapshotFingerprint(subscription, order, 'pause', event);
    return Object.freeze({
      mode: 'pause',
      personId: person,
      planCode: subscription.planCode,
      sourceSubscriptionRef: subscription.sourceSubscriptionRef,
      sourceProductRef: subscription.sourceProductRef,
      sourceEventRef: `google:play:event:current-state:snapshot:${fingerprint}`,
      historicalTrialConsumed: false,
      pause: Object.freeze({ ...event }),
      writerArgs: null,
    });
  }

  let event;
  let historicalTrialConsumed = false;

  if (subscription.trialing) {
    event = trialEvent(subscription, nowMs);
    historicalTrialConsumed = event.status === 'expired';
  } else {
    switch (subscription.subscriptionState) {
      case 'SUBSCRIPTION_STATE_ACTIVE':
        if (subscription.expiryAtMs <= nowMs) {
          fail('GOOGLE_PLAY_ACTIVE_STATE_EXPIRED');
        }
        event = activePaidEvent(subscription, order);
        break;
      case 'SUBSCRIPTION_STATE_CANCELED':
        event = canceledPaidEvent(subscription, order, nowMs);
        break;
      case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
        if (subscription.expiryAtMs <= nowMs) fail('GOOGLE_PLAY_GRACE_STATE_EXPIRED');
        event = graceEvent(subscription, order);
        break;
      case 'SUBSCRIPTION_STATE_ON_HOLD':
        event = {
          eventType: 'past_due',
          status: 'past_due',
          trialStartedAtMs: null,
          trialEndsAtMs: null,
          currentPeriodStartMs: null,
          currentPeriodEndMs: null,
          cancelAtPeriodEnd: false,
          effectiveAtMs: maxMs(subscription.expiryAtMs, order?.servicePeriodEndMs, order?.lastEventAtMs),
        };
        break;
      case 'SUBSCRIPTION_STATE_EXPIRED':
        event = terminalPaidEvent(subscription, order);
        break;
      default:
        fail('GOOGLE_PLAY_COMMERCIAL_STATE_UNSUPPORTED');
    }
  }

  const fingerprint = snapshotFingerprint(subscription, order, 'commercial', event);
  const commercialEvent = Object.freeze({
    personId: person,
    billingSource: 'google_play',
    billingEnvironment: subscription.billingEnvironment,
    sourceEventRef: `google:play:event:current-state:snapshot:${fingerprint}`,
    sourceSubscriptionRef: subscription.sourceSubscriptionRef,
    sourceProductRef: subscription.sourceProductRef,
    eventType: event.eventType,
    planCode: subscription.planCode,
    status: event.status,
    trialStartedAtMs: optionalMs(event.trialStartedAtMs, 'GOOGLE_PLAY_TRIAL_START_INVALID'),
    trialEndsAtMs: optionalMs(event.trialEndsAtMs, 'GOOGLE_PLAY_TRIAL_END_INVALID'),
    currentPeriodStartMs: optionalMs(event.currentPeriodStartMs, 'GOOGLE_PLAY_PERIOD_START_INVALID'),
    currentPeriodEndMs: optionalMs(event.currentPeriodEndMs, 'GOOGLE_PLAY_PERIOD_END_INVALID'),
    cancelAtPeriodEnd: event.cancelAtPeriodEnd,
    effectiveAtMs: requiredMs(event.effectiveAtMs, 'GOOGLE_PLAY_EFFECTIVE_AT_INVALID'),
  });

  return Object.freeze({
    mode: 'commercial',
    personId: person,
    planCode: subscription.planCode,
    sourceSubscriptionRef: subscription.sourceSubscriptionRef,
    sourceProductRef: subscription.sourceProductRef,
    sourceEventRef: commercialEvent.sourceEventRef,
    historicalTrialConsumed,
    commercialEvent,
    writerArgs: buildVerifiedCommercialWriterArgs(commercialEvent),
  });
}
