import { createHash } from 'node:crypto';

const WRITER_SOURCE_PREFIX = 'stripe:web';
const COMMERCIAL_TRIGGER_TYPES = new Set([
  'checkout.session.completed',
  'checkout.session.expired',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);
const SUPPORT_ONLY_TRIGGER_TYPES = new Set([
  'customer.subscription.trial_will_end',
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class StripeWebReconciliationError extends Error {
  constructor(code, { retryable = false } = {}) {
    super(code);
    this.name = 'StripeWebReconciliationError';
    this.code = code;
    this.retryable = retryable;
  }
}

function fail(code, options) {
  throw new StripeWebReconciliationError(code, options);
}

function requiredDependencies(deps) {
  for (const key of [
    'stripeClient',
    'identityClient',
    'writerClient',
    'preflightClient',
  ]) {
    if (!deps?.[key] || typeof deps[key] !== 'object') {
      fail(`STRIPE_WEB_RECONCILIATION_DEPENDENCY_INVALID:${key}`);
    }
  }
  if (typeof deps.resolvePlan !== 'function') {
    fail('STRIPE_WEB_RECONCILIATION_DEPENDENCY_INVALID:resolvePlan');
  }
  if (typeof deps.buildWriterArgs !== 'function') {
    fail('STRIPE_WEB_RECONCILIATION_DEPENDENCY_INVALID:buildWriterArgs');
  }
}

function assertTrigger(trigger, config) {
  if (trigger?.verification !== 'verified_stripe_webhook_trigger') {
    fail('STRIPE_WEB_RECONCILIATION_TRIGGER_UNVERIFIED');
  }
  if (!/^evt_[A-Za-z0-9]+$/.test(trigger.eventId ?? '')) {
    fail('STRIPE_WEB_RECONCILIATION_EVENT_ID_INVALID');
  }
  if (!Number.isSafeInteger(trigger.createdMs) || trigger.createdMs <= 0) {
    fail('STRIPE_WEB_RECONCILIATION_EVENT_TIME_INVALID');
  }
  if (trigger.billingEnvironment !== config?.environment) {
    fail('STRIPE_WEB_RECONCILIATION_ENVIRONMENT_MISMATCH');
  }
  if (!trigger.dataObject || typeof trigger.dataObject !== 'object') {
    fail('STRIPE_WEB_RECONCILIATION_TRIGGER_DATA_INVALID');
  }
}

function sourceSubscriptionRef(subscriptionId) {
  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId ?? '')) {
    fail('STRIPE_WEB_RECONCILIATION_SUBSCRIPTION_ID_INVALID');
  }
  return `${WRITER_SOURCE_PREFIX}:subscription:${subscriptionId}`;
}

function sourcePriceRef(priceId) {
  if (!/^price_[A-Za-z0-9]+$/.test(priceId ?? '')) {
    fail('STRIPE_WEB_RECONCILIATION_PRICE_ID_INVALID');
  }
  return `${WRITER_SOURCE_PREFIX}:price:${priceId}`;
}

function currentStateEffectiveAtMs(subscription) {
  const candidates = subscription.status === 'canceled'
    ? [
        subscription.canceledAtMs,
        subscription.endedAtMs,
        subscription.currentPeriodStartMs,
        subscription.trialStartMs,
        subscription.createdMs,
      ]
    : subscription.status === 'incomplete_expired'
      ? [
          subscription.endedAtMs,
          subscription.currentPeriodStartMs,
          subscription.trialStartMs,
          subscription.createdMs,
        ]
      : subscription.status === 'trialing'
        ? [subscription.trialStartMs, subscription.createdMs]
        : [
            subscription.currentPeriodStartMs,
            subscription.trialStartMs,
            subscription.createdMs,
          ];

  const value = candidates.find(
    (candidate) => Number.isSafeInteger(candidate) && candidate > 0,
  );
  if (!value) {
    fail('STRIPE_WEB_RECONCILIATION_CURRENT_STATE_TIME_INVALID');
  }
  return value;
}

function currentStateFingerprint(subscription, identity) {
  const authority = JSON.stringify({
    subscriptionId: subscription.id,
    customerId: subscription.customerId,
    personId: identity.personId,
    checkoutIntentId: identity.checkoutIntentId,
    planCode: identity.planCode,
    billingEnvironment: identity.billingEnvironment,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    priceId: subscription.priceId,
    currency: subscription.currency,
    recurringInterval: subscription.recurringInterval,
    recurringIntervalCount: subscription.recurringIntervalCount,
    createdMs: subscription.createdMs,
    canceledAtMs: subscription.canceledAtMs,
    endedAtMs: subscription.endedAtMs,
    currentPeriodStartMs: subscription.currentPeriodStartMs,
    currentPeriodEndMs: subscription.currentPeriodEndMs,
    trialStartMs: subscription.trialStartMs,
    trialEndMs: subscription.trialEndMs,
  });
  return createHash('sha256').update(authority).digest('hex').slice(0, 32);
}

function sourceEventRef(eventId, subscription, identity) {
  return `${WRITER_SOURCE_PREFIX}:event:${eventId}:snapshot:${currentStateFingerprint(subscription, identity)}`;
}

function checkoutSessionIdFromTrigger(trigger) {
  const id = String(trigger.dataObject?.id ?? '');
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) {
    fail('STRIPE_WEB_RECONCILIATION_SESSION_TRIGGER_INVALID');
  }
  return id;
}

function subscriptionIdFromTrigger(trigger) {
  const object = trigger.dataObject;
  if (trigger.eventType.startsWith('customer.subscription.')) {
    const id = String(object?.id ?? '');
    if (!/^sub_[A-Za-z0-9]+$/.test(id)) {
      fail('STRIPE_WEB_RECONCILIATION_SUBSCRIPTION_TRIGGER_INVALID');
    }
    return id;
  }

  if (trigger.eventType.startsWith('invoice.')) {
    const parent = object?.parent;
    if (
      parent?.type !== 'subscription_details'
      || !/^sub_[A-Za-z0-9]+$/.test(
        String(parent?.subscription_details?.subscription ?? ''),
      )
    ) {
      fail('STRIPE_WEB_RECONCILIATION_INVOICE_SUBSCRIPTION_INVALID');
    }
    return parent.subscription_details.subscription;
  }

  fail('STRIPE_WEB_RECONCILIATION_SUBSCRIPTION_TRIGGER_INVALID');
}

function requireMetadata(metadata, key) {
  const value = String(metadata?.[key] ?? '').trim();
  if (!value) fail(`STRIPE_WEB_RECONCILIATION_METADATA_MISSING:${key}`);
  return value;
}

function validateCanonicalSubscription(subscription, identity, config, resolvePlan) {
  if (subscription.customerId !== identity.sourceCustomerRef) {
    fail('STRIPE_WEB_RECONCILIATION_CUSTOMER_MISMATCH');
  }
  if (identity.billingEnvironment !== config.environment) {
    fail('STRIPE_WEB_RECONCILIATION_IDENTITY_ENVIRONMENT_MISMATCH');
  }

  const metadataIntent = requireMetadata(
    subscription.metadata,
    'zstudio_checkout_intent_id',
  );
  const metadataPerson = requireMetadata(subscription.metadata, 'zos_person_id');
  const metadataPlan = requireMetadata(subscription.metadata, 'plan_code');
  const metadataEnvironment = requireMetadata(
    subscription.metadata,
    'billing_environment',
  );

  if (!UUID_RE.test(metadataIntent) || metadataIntent !== identity.checkoutIntentId) {
    fail('STRIPE_WEB_RECONCILIATION_METADATA_INTENT_MISMATCH');
  }
  if (!UUID_RE.test(metadataPerson) || metadataPerson !== identity.personId) {
    fail('STRIPE_WEB_RECONCILIATION_METADATA_PERSON_MISMATCH');
  }
  if (metadataPlan !== identity.planCode) {
    fail('STRIPE_WEB_RECONCILIATION_METADATA_PLAN_MISMATCH');
  }
  if (metadataEnvironment !== identity.billingEnvironment) {
    fail('STRIPE_WEB_RECONCILIATION_METADATA_ENVIRONMENT_MISMATCH');
  }
  const expectedPrice = config.priceByPlan?.[identity.planCode];
  if (subscription.priceId !== expectedPrice) {
    fail('STRIPE_WEB_RECONCILIATION_PRICE_MISMATCH');
  }

  const plan = resolvePlan(identity.planCode);
  if (subscription.currency !== String(plan.currency ?? '').toLowerCase()) {
    fail('STRIPE_WEB_RECONCILIATION_CURRENCY_MISMATCH');
  }
  const expectedInterval = {
    weekly: 'week',
    monthly: 'month',
    annual: 'year',
  }[identity.planCode];
  if (
    subscription.recurringInterval !== expectedInterval
    || subscription.recurringIntervalCount !== 1
  ) {
    fail('STRIPE_WEB_RECONCILIATION_CADENCE_MISMATCH');
  }

  const hasTrial = subscription.trialStartMs != null;
  if (hasTrial !== identity.trialReserved) {
    fail('STRIPE_WEB_RECONCILIATION_TRIAL_AUTHORITY_MISMATCH');
  }
  return plan;
}

function normalizeCommercialEvent(trigger, subscription, identity) {
  const common = {
    billingSource: 'web',
    billingEnvironment: identity.billingEnvironment,
    personId: identity.personId,
    planCode: identity.planCode,
    sourceEventRef: sourceEventRef(trigger.eventId, subscription, identity),
    sourceSubscriptionRef: sourceSubscriptionRef(subscription.id),
    sourceProductRef: sourcePriceRef(subscription.priceId),
    effectiveAtMs: currentStateEffectiveAtMs(subscription),
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    trialStartedAtMs: null,
    trialEndsAtMs: null,
    currentPeriodStartMs: null,
    currentPeriodEndMs: null,
  };

  switch (subscription.status) {
    case 'trialing':
      return {
        ...common,
        eventType: 'trial_started',
        status: 'trialing',
        trialStartedAtMs: subscription.trialStartMs,
        trialEndsAtMs: subscription.trialEndMs,
      };

    case 'active':
      return {
        ...common,
        eventType: subscription.cancelAtPeriodEnd
          ? 'renewal_disabled'
          : trigger.eventType === 'invoice.paid'
            ? 'renewed'
            : 'activated',
        status: 'active',
        currentPeriodStartMs: subscription.currentPeriodStartMs,
        currentPeriodEndMs: subscription.currentPeriodEndMs,
      };

    case 'past_due':
      return {
        ...common,
        eventType: 'past_due',
        status: 'past_due',
        currentPeriodStartMs: subscription.currentPeriodStartMs,
        currentPeriodEndMs: subscription.currentPeriodEndMs,
      };

    case 'canceled':
    case 'incomplete_expired':
      return {
        ...common,
        eventType: 'expired',
        status: 'expired',
        cancelAtPeriodEnd: false,
        trialStartedAtMs: subscription.trialStartMs,
        trialEndsAtMs: subscription.trialEndMs,
        currentPeriodStartMs: subscription.currentPeriodStartMs,
        currentPeriodEndMs: subscription.currentPeriodEndMs,
      };

    default:
      fail(`STRIPE_WEB_RECONCILIATION_STATUS_UNMAPPED:${subscription.status}`);
  }
}

function validateSessionIdentity(session, identity, config) {
  if (session.id !== identity.sourceCheckoutSessionRef) {
    fail('STRIPE_WEB_RECONCILIATION_SESSION_REF_MISMATCH');
  }
  if (session.customerId !== identity.sourceCustomerRef) {
    fail('STRIPE_WEB_RECONCILIATION_SESSION_CUSTOMER_MISMATCH');
  }
  if (session.clientReferenceId !== identity.checkoutIntentId) {
    fail('STRIPE_WEB_RECONCILIATION_SESSION_INTENT_MISMATCH');
  }
  if (identity.billingEnvironment !== config.environment) {
    fail('STRIPE_WEB_RECONCILIATION_SESSION_ENVIRONMENT_MISMATCH');
  }

  const metadataIntent = requireMetadata(
    session.metadata,
    'zstudio_checkout_intent_id',
  );
  const metadataPerson = requireMetadata(session.metadata, 'zos_person_id');
  const metadataPlan = requireMetadata(session.metadata, 'plan_code');
  const metadataEnvironment = requireMetadata(
    session.metadata,
    'billing_environment',
  );
  if (metadataIntent !== identity.checkoutIntentId) {
    fail('STRIPE_WEB_RECONCILIATION_SESSION_METADATA_INTENT_MISMATCH');
  }
  if (metadataPerson !== identity.personId) {
    fail('STRIPE_WEB_RECONCILIATION_SESSION_METADATA_PERSON_MISMATCH');
  }
  if (metadataPlan !== identity.planCode) {
    fail('STRIPE_WEB_RECONCILIATION_SESSION_METADATA_PLAN_MISMATCH');
  }
  if (metadataEnvironment !== identity.billingEnvironment) {
    fail('STRIPE_WEB_RECONCILIATION_SESSION_METADATA_ENVIRONMENT_MISMATCH');
  }
}

async function reconcileSubscription(
  trigger,
  subscriptionId,
  config,
  deps,
  sessionIdentity = null,
) {
  const subscription = await deps.stripeClient.retrieveSubscription(subscriptionId);
  const metadataIntent = requireMetadata(
    subscription.metadata,
    'zstudio_checkout_intent_id',
  );
  if (!UUID_RE.test(metadataIntent)) {
    fail('STRIPE_WEB_RECONCILIATION_METADATA_INTENT_INVALID');
  }

  const namespacedSubscriptionRef = sourceSubscriptionRef(subscription.id);
  const identity = await deps.identityClient.resolveSubscription({
    checkoutIntentId: metadataIntent,
    sourceSubscriptionRef: namespacedSubscriptionRef,
    sourceCustomerRef: subscription.customerId,
    billingEnvironment: config.environment,
  });

  if (sessionIdentity) {
    if (
      sessionIdentity.personId !== identity.personId
      || sessionIdentity.checkoutIntentId !== identity.checkoutIntentId
      || sessionIdentity.planCode !== identity.planCode
      || sessionIdentity.sourceCustomerRef !== identity.sourceCustomerRef
      || sessionIdentity.sourceCheckoutSessionRef !== identity.sourceCheckoutSessionRef
    ) {
      fail('STRIPE_WEB_RECONCILIATION_SESSION_SUBSCRIPTION_IDENTITY_MISMATCH');
    }
  }

  validateCanonicalSubscription(subscription, identity, config, deps.resolvePlan);

  if (identity.trialReserved) {
    await deps.identityClient.claimVerifiedTrialConsumption({
      checkoutIntentId: identity.checkoutIntentId,
      personId: identity.personId,
      sourceCustomerRef: identity.sourceCustomerRef,
      sourceSubscriptionRef: namespacedSubscriptionRef,
      billingEnvironment: identity.billingEnvironment,
      effectiveAtMs: subscription.trialStartMs,
    });
  }

  const normalizedEvent = normalizeCommercialEvent(
    trigger,
    subscription,
    identity,
  );
  const writerArgs = deps.buildWriterArgs(normalizedEvent);
  const writerResult = await deps.writerClient.applyVerifiedCommercialEvent(writerArgs);

  const closeResult = await deps.preflightClient.closeCheckoutIntent({
    intentId: identity.checkoutIntentId,
    personId: identity.personId,
    billingEnvironment: identity.billingEnvironment,
    finalState: 'completed',
  });

  return Object.freeze({
    result: 'reconciled',
    eventType: trigger.eventType,
    currentStatus: subscription.status,
    personId: identity.personId,
    checkoutIntentId: identity.checkoutIntentId,
    writerResult,
    closeResult,
    rawProviderPayloadIncluded: false,
  });
}

async function reconcileCheckoutSession(trigger, config, deps) {
  const sessionId = checkoutSessionIdFromTrigger(trigger);
  const session = await deps.stripeClient.retrieveCheckoutSession(sessionId);
  const identity = await deps.identityClient.resolveCheckoutSession({
    sourceCheckoutSessionRef: session.id,
    sourceCustomerRef: session.customerId,
    billingEnvironment: config.environment,
  });
  validateSessionIdentity(session, identity, config);

  if (session.status === 'expired') {
    const closeResult = await deps.preflightClient.closeCheckoutIntent({
      intentId: identity.checkoutIntentId,
      personId: identity.personId,
      billingEnvironment: identity.billingEnvironment,
      finalState: 'expired',
    });
    return Object.freeze({
      result: 'checkout_expired',
      eventType: trigger.eventType,
      checkoutIntentId: identity.checkoutIntentId,
      closeResult,
      rawProviderPayloadIncluded: false,
    });
  }

  if (session.status !== 'complete') {
    fail('STRIPE_WEB_RECONCILIATION_SESSION_NOT_FINAL', { retryable: true });
  }
  if (!session.subscriptionId) {
    fail('STRIPE_WEB_RECONCILIATION_SESSION_SUBSCRIPTION_PENDING', {
      retryable: true,
    });
  }

  return reconcileSubscription(
    trigger,
    session.subscriptionId,
    config,
    deps,
    identity,
  );
}

export async function reconcileStripeWebTrigger(trigger, config, deps) {
  requiredDependencies(deps);
  assertTrigger(trigger, config);

  if (SUPPORT_ONLY_TRIGGER_TYPES.has(trigger.eventType)) {
    return Object.freeze({
      result: 'support_trigger_acknowledged',
      eventType: trigger.eventType,
      commercialWrite: false,
    });
  }
  if (!COMMERCIAL_TRIGGER_TYPES.has(trigger.eventType)) {
    return Object.freeze({
      result: 'ignored_event_type',
      eventType: trigger.eventType,
      commercialWrite: false,
    });
  }

  if (trigger.eventType.startsWith('checkout.session.')) {
    return reconcileCheckoutSession(trigger, config, deps);
  }

  return reconcileSubscription(
    trigger,
    subscriptionIdFromTrigger(trigger),
    config,
    deps,
  );
}

export const STRIPE_WEB_COMMERCIAL_TRIGGER_TYPES = Object.freeze(
  [...COMMERCIAL_TRIGGER_TYPES].sort(),
);
