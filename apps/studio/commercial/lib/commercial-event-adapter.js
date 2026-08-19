const BILLING_SOURCES = new Set([
  'manual',
  'web',
  'apple_app_store',
  'google_play',
]);

const BILLING_ENVIRONMENTS = new Set([
  'sandbox',
  'production',
]);

const PLAN_CODES = new Set([
  'weekly',
  'monthly',
  'annual',
]);

const STATUSES = new Set([
  'trialing',
  'active',
  'grace',
  'past_due',
  'cancelled',
  'expired',
  'revoked',
]);

const EVENT_TYPES = new Set([
  'trial_started',
  'activated',
  'renewed',
  'grace_started',
  'past_due',
  'recovered',
  'renewal_disabled',
  'expired',
  'revoked',
  'restored',
]);

const APPLE_ACTIVE_EVENT_HINTS = new Set([
  'activated',
  'renewed',
  'recovered',
  'restored',
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requiredString(value, code) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function requiredEnum(value, allowed, code) {
  const normalized = requiredString(value, code).toLowerCase();
  if (!allowed.has(normalized)) throw new Error(code);
  return normalized;
}

function requiredUuid(value, code) {
  const normalized = requiredString(value, code).toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new Error(code);
  return normalized;
}

function requiredBoolean(value, code) {
  if (typeof value !== 'boolean') throw new Error(code);
  return value;
}

function requiredEpochMilliseconds(value, code) {
  if (!Number.isFinite(value) || value < 0) throw new Error(code);
  return value;
}

function optionalEpochMilliseconds(value, code) {
  if (value === undefined || value === null) return null;
  return requiredEpochMilliseconds(value, code);
}

function isoFromMilliseconds(value, code) {
  if (value === null) return null;
  try {
    return new Date(requiredEpochMilliseconds(value, code)).toISOString();
  } catch {
    throw new Error(code);
  }
}

function exactDecimalString(value, code) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error(code);
  }
  return value;
}

function validateCommercialWindows(event) {
  const status = event.status;

  if (status === 'trialing') {
    if (
      event.trialStartedAtMs === null
      || event.trialEndsAtMs === null
      || event.trialEndsAtMs <= event.trialStartedAtMs
      || event.currentPeriodStartMs !== null
      || event.currentPeriodEndMs !== null
    ) {
      throw new Error('COMMERCIAL_ADAPTER_TRIAL_WINDOW_INVALID');
    }
    return;
  }

  if (status === 'active' || status === 'grace') {
    if (
      event.currentPeriodStartMs === null
      || event.currentPeriodEndMs === null
      || event.currentPeriodEndMs <= event.currentPeriodStartMs
      || event.trialStartedAtMs !== null
      || event.trialEndsAtMs !== null
    ) {
      throw new Error('COMMERCIAL_ADAPTER_PERIOD_WINDOW_INVALID');
    }
    return;
  }

  if (
    event.trialStartedAtMs !== null
    || event.trialEndsAtMs !== null
    || event.currentPeriodStartMs !== null
    || event.currentPeriodEndMs !== null
  ) {
    throw new Error('COMMERCIAL_ADAPTER_TERMINAL_WINDOW_INVALID');
  }
}

function validateEventStatusContract(event) {
  switch (event.eventType) {
    case 'trial_started':
      if (event.status !== 'trialing') {
        throw new Error('COMMERCIAL_ADAPTER_EVENT_STATUS_INVALID');
      }
      return;
    case 'activated':
    case 'renewed':
    case 'recovered':
      if (event.status !== 'active') {
        throw new Error('COMMERCIAL_ADAPTER_EVENT_STATUS_INVALID');
      }
      return;
    case 'grace_started':
      if (event.status !== 'grace') {
        throw new Error('COMMERCIAL_ADAPTER_EVENT_STATUS_INVALID');
      }
      return;
    case 'past_due':
      if (event.status !== 'past_due') {
        throw new Error('COMMERCIAL_ADAPTER_EVENT_STATUS_INVALID');
      }
      return;
    case 'renewal_disabled':
      if (
        !['active', 'grace'].includes(event.status)
        || event.cancelAtPeriodEnd !== true
      ) {
        throw new Error('COMMERCIAL_ADAPTER_EVENT_STATUS_INVALID');
      }
      return;
    case 'expired':
      if (event.status !== 'expired') {
        throw new Error('COMMERCIAL_ADAPTER_EVENT_STATUS_INVALID');
      }
      return;
    case 'revoked':
      if (event.status !== 'revoked') {
        throw new Error('COMMERCIAL_ADAPTER_EVENT_STATUS_INVALID');
      }
      return;
    case 'restored':
      return;
    default:
      throw new Error('COMMERCIAL_ADAPTER_EVENT_TYPE_INVALID');
  }
}

export function buildVerifiedCommercialWriterArgs(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('COMMERCIAL_ADAPTER_EVENT_REQUIRED');
  }

  const event = Object.freeze({
    personId: requiredUuid(
      input.personId,
      'COMMERCIAL_ADAPTER_PERSON_ID_INVALID',
    ),
    billingSource: requiredEnum(
      input.billingSource,
      BILLING_SOURCES,
      'COMMERCIAL_ADAPTER_BILLING_SOURCE_INVALID',
    ),
    billingEnvironment: requiredEnum(
      input.billingEnvironment,
      BILLING_ENVIRONMENTS,
      'COMMERCIAL_ADAPTER_BILLING_ENVIRONMENT_INVALID',
    ),
    sourceEventRef: requiredString(
      input.sourceEventRef,
      'COMMERCIAL_ADAPTER_EVENT_REF_REQUIRED',
    ),
    sourceSubscriptionRef: requiredString(
      input.sourceSubscriptionRef,
      'COMMERCIAL_ADAPTER_SUBSCRIPTION_REF_REQUIRED',
    ),
    sourceProductRef: requiredString(
      input.sourceProductRef,
      'COMMERCIAL_ADAPTER_PRODUCT_REF_REQUIRED',
    ),
    eventType: requiredEnum(
      input.eventType,
      EVENT_TYPES,
      'COMMERCIAL_ADAPTER_EVENT_TYPE_INVALID',
    ),
    planCode: requiredEnum(
      input.planCode,
      PLAN_CODES,
      'COMMERCIAL_ADAPTER_PLAN_CODE_INVALID',
    ),
    status: requiredEnum(
      input.status,
      STATUSES,
      'COMMERCIAL_ADAPTER_STATUS_INVALID',
    ),
    trialStartedAtMs: optionalEpochMilliseconds(
      input.trialStartedAtMs,
      'COMMERCIAL_ADAPTER_TRIAL_START_INVALID',
    ),
    trialEndsAtMs: optionalEpochMilliseconds(
      input.trialEndsAtMs,
      'COMMERCIAL_ADAPTER_TRIAL_END_INVALID',
    ),
    currentPeriodStartMs: optionalEpochMilliseconds(
      input.currentPeriodStartMs,
      'COMMERCIAL_ADAPTER_PERIOD_START_INVALID',
    ),
    currentPeriodEndMs: optionalEpochMilliseconds(
      input.currentPeriodEndMs,
      'COMMERCIAL_ADAPTER_PERIOD_END_INVALID',
    ),
    cancelAtPeriodEnd: requiredBoolean(
      input.cancelAtPeriodEnd,
      'COMMERCIAL_ADAPTER_CANCEL_STATE_INVALID',
    ),
    effectiveAtMs: requiredEpochMilliseconds(
      input.effectiveAtMs,
      'COMMERCIAL_ADAPTER_EFFECTIVE_AT_INVALID',
    ),
  });

  validateCommercialWindows(event);
  validateEventStatusContract(event);

  return Object.freeze({
    p_person_id: event.personId,
    p_billing_source: event.billingSource,
    p_billing_environment: event.billingEnvironment,
    p_source_event_ref: event.sourceEventRef,
    p_source_subscription_ref: event.sourceSubscriptionRef,
    p_source_product_ref: event.sourceProductRef,
    p_event_type: event.eventType,
    p_plan_code: event.planCode,
    p_status: event.status,
    p_trial_started_at: isoFromMilliseconds(
      event.trialStartedAtMs,
      'COMMERCIAL_ADAPTER_TRIAL_START_INVALID',
    ),
    p_trial_ends_at: isoFromMilliseconds(
      event.trialEndsAtMs,
      'COMMERCIAL_ADAPTER_TRIAL_END_INVALID',
    ),
    p_current_period_start: isoFromMilliseconds(
      event.currentPeriodStartMs,
      'COMMERCIAL_ADAPTER_PERIOD_START_INVALID',
    ),
    p_current_period_end: isoFromMilliseconds(
      event.currentPeriodEndMs,
      'COMMERCIAL_ADAPTER_PERIOD_END_INVALID',
    ),
    p_cancel_at_period_end: event.cancelAtPeriodEnd,
    p_effective_at: isoFromMilliseconds(
      event.effectiveAtMs,
      'COMMERCIAL_ADAPTER_EFFECTIVE_AT_INVALID',
    ),
  });
}

function appleEventType(snapshot, eventTypeHint) {
  const status = snapshot.normalizedStatus;

  if (eventTypeHint !== undefined && eventTypeHint !== null) {
    const hint = requiredEnum(
      eventTypeHint,
      EVENT_TYPES,
      'APPLE_COMMERCIAL_EVENT_HINT_INVALID',
    );

    if (status === 'trialing' && hint === 'restored') {
      return hint;
    }
    if (status === 'active' && APPLE_ACTIVE_EVENT_HINTS.has(hint)) {
      return hint;
    }
    throw new Error('APPLE_COMMERCIAL_EVENT_HINT_INVALID');
  }

  switch (status) {
    case 'trialing':
      return 'trial_started';
    case 'active':
      if (snapshot.cancelAtPeriodEnd) return 'renewal_disabled';
      return snapshot.transactionId === snapshot.originalTransactionId
        ? 'activated'
        : 'renewed';
    case 'grace':
      return snapshot.cancelAtPeriodEnd
        ? 'renewal_disabled'
        : 'grace_started';
    case 'past_due':
      return 'past_due';
    case 'expired':
      return 'expired';
    default:
      throw new Error('APPLE_COMMERCIAL_STATUS_UNSUPPORTED');
  }
}

export function adaptAppleCurrentStateToCommercialEvent(
  snapshot,
  { eventTypeHint } = {},
) {
  if (
    !snapshot
    || snapshot.verification !== 'verified_current_state'
    || snapshot.rawJwsIncluded !== false
  ) {
    throw new Error('APPLE_VERIFIED_CURRENT_STATE_REQUIRED');
  }
  if (snapshot.billingSource !== 'apple_app_store') {
    throw new Error('APPLE_COMMERCIAL_BILLING_SOURCE_INVALID');
  }
  if (!BILLING_ENVIRONMENTS.has(snapshot.billingEnvironment)) {
    throw new Error('APPLE_COMMERCIAL_BILLING_ENVIRONMENT_INVALID');
  }

  const transactionId = exactDecimalString(
    snapshot.transactionId,
    'APPLE_COMMERCIAL_TRANSACTION_ID_INVALID',
  );
  const originalTransactionId = exactDecimalString(
    snapshot.originalTransactionId,
    'APPLE_COMMERCIAL_ORIGINAL_TRANSACTION_ID_INVALID',
  );

  if (snapshot.sourceSubscriptionRef !== originalTransactionId) {
    throw new Error('APPLE_COMMERCIAL_SUBSCRIPTION_REF_MISMATCH');
  }
  if (snapshot.sourceProductRef !== snapshot.currentProductId) {
    throw new Error('APPLE_COMMERCIAL_PRODUCT_REF_MISMATCH');
  }
  if (
    snapshot.appleRevokedEquivalent === true
    && snapshot.normalizedStatus !== 'expired'
  ) {
    throw new Error('APPLE_COMMERCIAL_REVOCATION_MAPPING_INVALID');
  }
  if (snapshot.normalizedStatus === 'revoked') {
    throw new Error('APPLE_COMMERCIAL_TERMINAL_REVOKED_FORBIDDEN');
  }

  const eventType = appleEventType(
    {
      ...snapshot,
      transactionId,
      originalTransactionId,
    },
    eventTypeHint,
  );

  return Object.freeze({
    personId: snapshot.personId,
    billingSource: snapshot.billingSource,
    billingEnvironment: snapshot.billingEnvironment,
    sourceEventRef: snapshot.sourceEventRef,
    sourceSubscriptionRef: originalTransactionId,
    sourceProductRef: snapshot.currentProductId,
    eventType,
    planCode: snapshot.planCode,
    status: snapshot.normalizedStatus,
    trialStartedAtMs: snapshot.trialStartedAtMs,
    trialEndsAtMs: snapshot.trialEndsAtMs,
    currentPeriodStartMs: snapshot.currentPeriodStartMs,
    currentPeriodEndMs: snapshot.currentPeriodEndMs,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    effectiveAtMs: snapshot.effectiveAtMs,
  });
}

export function buildAppleCurrentStateWriterArgs(
  snapshot,
  options = {},
) {
  return buildVerifiedCommercialWriterArgs(
    adaptAppleCurrentStateToCommercialEvent(snapshot, options),
  );
}
