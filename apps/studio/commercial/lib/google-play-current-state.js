import { createHash } from 'node:crypto';
import {
  GOOGLE_PLAY_PACKAGE_NAME,
  GOOGLE_PLAY_PRODUCT_ID,
  resolveGooglePlayBasePlan,
} from './store-products.js';

const API_ROOT = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const STATES = new Set([
  'SUBSCRIPTION_STATE_PENDING',
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_PAUSED',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  'SUBSCRIPTION_STATE_ON_HOLD',
  'SUBSCRIPTION_STATE_CANCELED',
  'SUBSCRIPTION_STATE_EXPIRED',
  'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED',
]);
const ACK_STATES = new Set([
  'ACKNOWLEDGEMENT_STATE_PENDING',
  'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class GooglePlayCurrentStateError extends Error {
  constructor(code, { retryable = false, httpStatusCode = null, cause = null } = {}) {
    super(code);
    this.name = 'GooglePlayCurrentStateError';
    this.code = code;
    this.retryable = retryable;
    this.httpStatusCode = httpStatusCode;
    if (cause) this.cause = cause;
  }
}

function fail(code, options) {
  throw new GooglePlayCurrentStateError(code, options);
}

function parseTime(value, code, { required = true } = {}) {
  if (value == null && !required) return null;
  if (typeof value !== 'string' || !value.trim()) fail(code);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms <= 0) fail(code);
  return ms;
}

function opaqueToken(value) {
  const token = String(value ?? '');
  if (!token || token.length > 4096 || /[\u0000-\u001f\u007f\s]/.test(token)) {
    fail('GOOGLE_PLAY_PURCHASE_TOKEN_INVALID');
  }
  return token;
}

function requiredString(value, code, max = 1024) {
  const result = String(value ?? '').trim();
  if (!result || result.length > max) fail(code);
  return result;
}

function optionalUuid(value) {
  if (value == null || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (!UUID_RE.test(normalized)) fail('GOOGLE_PLAY_EXTERNAL_ACCOUNT_ID_INVALID');
  return normalized;
}

function assertEnvironment(payload, environment) {
  const isTest = payload?.testPurchase != null;
  if (environment === 'sandbox' && !isTest) fail('GOOGLE_PLAY_ENVIRONMENT_MISMATCH');
  if (environment === 'production' && isTest) fail('GOOGLE_PLAY_ENVIRONMENT_MISMATCH');
}

function normalizeSubscription(payload, config, purchaseToken) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    fail('GOOGLE_PLAY_SUBSCRIPTION_RESPONSE_INVALID');
  }
  assertEnvironment(payload, config.environment);
  if (!STATES.has(payload.subscriptionState)) fail('GOOGLE_PLAY_SUBSCRIPTION_STATE_INVALID');
  if (!ACK_STATES.has(payload.acknowledgementState)) fail('GOOGLE_PLAY_ACKNOWLEDGEMENT_STATE_INVALID');
  if (!Array.isArray(payload.lineItems) || payload.lineItems.length !== 1) {
    fail('GOOGLE_PLAY_LINE_ITEMS_UNSUPPORTED');
  }
  const line = payload.lineItems[0];
  if (!line || typeof line !== 'object') fail('GOOGLE_PLAY_LINE_ITEM_INVALID');
  if (line.productId !== GOOGLE_PLAY_PRODUCT_ID) fail('GOOGLE_PLAY_PRODUCT_ID_MISMATCH');
  if (!line.autoRenewingPlan || typeof line.autoRenewingPlan !== 'object' || line.prepaidPlan != null) {
    fail('GOOGLE_PLAY_PLAN_TYPE_UNSUPPORTED');
  }
  if (typeof line.autoRenewingPlan.autoRenewEnabled !== 'boolean') {
    fail('GOOGLE_PLAY_AUTO_RENEW_STATE_INVALID');
  }
  if (!line.offerDetails || typeof line.offerDetails !== 'object') {
    fail('GOOGLE_PLAY_OFFER_DETAILS_REQUIRED');
  }
  const plan = resolveGooglePlayBasePlan(
    line.productId,
    requiredString(line.offerDetails.basePlanId, 'GOOGLE_PLAY_BASE_PLAN_REQUIRED', 128),
  );
  const offerId = line.offerDetails.offerId == null
    ? null
    : requiredString(line.offerDetails.offerId, 'GOOGLE_PLAY_OFFER_ID_INVALID', 128);
  if (offerId !== null && offerId !== plan.offerId) fail('GOOGLE_PLAY_OFFER_ID_UNAUTHORIZED');

  const expiryAtMs = parseTime(line.expiryTime, 'GOOGLE_PLAY_EXPIRY_TIME_INVALID', {
    required: payload.subscriptionState !== 'SUBSCRIPTION_STATE_PENDING',
  });
  const startAtMs = parseTime(payload.startTime, 'GOOGLE_PLAY_START_TIME_INVALID', {
    required: payload.subscriptionState !== 'SUBSCRIPTION_STATE_PENDING',
  });
  const latestSuccessfulOrderId = line.latestSuccessfulOrderId == null
    ? null
    : requiredString(line.latestSuccessfulOrderId, 'GOOGLE_PLAY_ORDER_ID_INVALID', 256);
  const trialing = line.offerPhase?.freeTrial != null;
  if (trialing && offerId !== plan.offerId) fail('GOOGLE_PLAY_TRIAL_OFFER_MISMATCH');

  const externalAccountId = optionalUuid(
    payload.externalAccountIdentifiers?.obfuscatedExternalAccountId,
  );
  const linkedTokenFingerprint = payload.linkedPurchaseToken == null
    ? null
    : createHash('sha256').update(opaqueToken(payload.linkedPurchaseToken)).digest('hex');
  const tokenHash = createHash('sha256').update(purchaseToken).digest('hex');

  let cancellationReason = null;
  let cancelAtMs = null;
  const canceled = payload.canceledStateContext;
  if (canceled != null) {
    if (!canceled || typeof canceled !== 'object' || Array.isArray(canceled)) {
      fail('GOOGLE_PLAY_CANCELED_STATE_CONTEXT_INVALID');
    }
    if (canceled.userInitiatedCancellation != null) {
      cancellationReason = 'user';
      cancelAtMs = parseTime(
        canceled.userInitiatedCancellation?.cancelTime,
        'GOOGLE_PLAY_CANCEL_TIME_INVALID',
      );
    } else if (canceled.systemInitiatedCancellation != null) {
      cancellationReason = 'system';
    } else if (canceled.developerInitiatedCancellation != null) {
      cancellationReason = 'developer';
    } else if (canceled.replacementCancellation != null) {
      cancellationReason = 'replacement';
    } else {
      fail('GOOGLE_PLAY_CANCELLATION_REASON_INVALID');
    }
  }

  let autoResumeAtMs = null;
  if (payload.subscriptionState === 'SUBSCRIPTION_STATE_PAUSED') {
    autoResumeAtMs = parseTime(
      payload.pausedStateContext?.autoResumeTime,
      'GOOGLE_PLAY_AUTO_RESUME_TIME_REQUIRED',
    );
  }

  return Object.freeze({
    verification: 'verified_google_play_subscription_current_state',
    billingEnvironment: config.environment,
    packageName: config.packageName,
    sourceSubscriptionRef: `google:play:purchase:${tokenHash}`,
    purchaseTokenFingerprint: tokenHash,
    productId: line.productId,
    basePlanId: plan.basePlanId,
    planCode: plan.planCode,
    sourceProductRef: `google:play:product:${line.productId}:base_plan:${plan.basePlanId}`,
    offerId,
    trialing,
    subscriptionState: payload.subscriptionState,
    acknowledgementState: payload.acknowledgementState,
    autoRenewEnabled: line.autoRenewingPlan.autoRenewEnabled,
    startAtMs,
    expiryAtMs,
    latestSuccessfulOrderId,
    externalAccountId,
    linkedPurchaseTokenFingerprint: linkedTokenFingerprint,
    cancellationReason,
    cancelAtMs,
    autoResumeAtMs,
    rawProviderPayloadIncluded: false,
  });
}

function normalizeOrder(payload, expectedOrderId) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    fail('GOOGLE_PLAY_ORDER_RESPONSE_INVALID');
  }
  const orderId = requiredString(payload.orderId, 'GOOGLE_PLAY_ORDER_ID_INVALID', 256);
  if (orderId !== expectedOrderId) fail('GOOGLE_PLAY_ORDER_ID_MISMATCH');
  const createAtMs = parseTime(payload.createTime, 'GOOGLE_PLAY_ORDER_CREATE_TIME_INVALID');
  const lastEventAtMs = parseTime(payload.lastEventTime, 'GOOGLE_PLAY_ORDER_LAST_EVENT_TIME_INVALID');
  if (lastEventAtMs < createAtMs) fail('GOOGLE_PLAY_ORDER_EVENT_TIME_INVALID');

  const subscription = payload.subscriptionDetails;
  if (!subscription || typeof subscription !== 'object') {
    fail('GOOGLE_PLAY_ORDER_SUBSCRIPTION_DETAILS_REQUIRED');
  }
  const servicePeriodStartMs = parseTime(
    subscription.servicePeriodStartTime,
    'GOOGLE_PLAY_ORDER_PERIOD_START_INVALID',
  );
  const servicePeriodEndMs = parseTime(
    subscription.servicePeriodEndTime,
    'GOOGLE_PLAY_ORDER_PERIOD_END_INVALID',
  );
  if (servicePeriodEndMs <= servicePeriodStartMs) fail('GOOGLE_PLAY_ORDER_PERIOD_INVALID');

  const processedAtMs = parseTime(
    payload.orderHistory?.processedEvent?.eventTime,
    'GOOGLE_PLAY_ORDER_PROCESSED_TIME_INVALID',
    { required: false },
  );
  const cancellationAtMs = parseTime(
    payload.orderHistory?.cancellationEvent?.eventTime,
    'GOOGLE_PLAY_ORDER_CANCELLATION_TIME_INVALID',
    { required: false },
  );
  const refundAtMs = parseTime(
    payload.orderHistory?.refundEvent?.eventTime,
    'GOOGLE_PLAY_ORDER_REFUND_TIME_INVALID',
    { required: false },
  );

  return Object.freeze({
    verification: 'verified_google_play_order_current_state',
    orderId,
    createAtMs,
    lastEventAtMs,
    processedAtMs,
    cancellationAtMs,
    refundAtMs,
    servicePeriodStartMs,
    servicePeriodEndMs,
    rawProviderPayloadIncluded: false,
  });
}

function retryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function createGooglePlayCurrentStateClient(
  config,
  { authClient, fetchImpl = fetch } = {},
) {
  if (!config || config.packageName !== GOOGLE_PLAY_PACKAGE_NAME) {
    fail('GOOGLE_PLAY_CURRENT_STATE_CONFIG_INVALID');
  }
  if (!authClient || typeof authClient.getAccessToken !== 'function') {
    fail('GOOGLE_PLAY_AUTH_CLIENT_REQUIRED');
  }

  async function request(method, path, body = undefined, { expectEmpty = false } = {}) {
    const accessToken = await authClient.getAccessToken();
    let response;
    try {
      response = await fetchImpl(`${API_ROOT}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (cause) {
      fail('GOOGLE_PLAY_API_NETWORK_FAILED', { retryable: true, cause });
    }
    if (!response?.ok) {
      const status = Number(response?.status ?? 0) || null;
      fail('GOOGLE_PLAY_API_REQUEST_FAILED', {
        retryable: status == null || retryableStatus(status),
        httpStatusCode: status,
      });
    }
    if (expectEmpty || response.status === 204) return null;
    try {
      return await response.json();
    } catch (cause) {
      fail('GOOGLE_PLAY_API_RESPONSE_INVALID', { cause });
    }
  }

  return Object.freeze({
    async getSubscription(purchaseToken) {
      const token = opaqueToken(purchaseToken);
      const payload = await request(
        'GET',
        `/applications/${encodeURIComponent(config.packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`,
      );
      return normalizeSubscription(payload, config, token);
    },

    async getOrder(orderId) {
      const id = requiredString(orderId, 'GOOGLE_PLAY_ORDER_ID_INVALID', 256);
      const payload = await request(
        'GET',
        `/applications/${encodeURIComponent(config.packageName)}/orders/${encodeURIComponent(id)}`,
      );
      return normalizeOrder(payload, id);
    },

    async acknowledgeSubscription(purchaseToken) {
      const token = opaqueToken(purchaseToken);
      await request(
        'POST',
        `/applications/${encodeURIComponent(config.packageName)}/purchases/subscriptions/${encodeURIComponent(GOOGLE_PLAY_PRODUCT_ID)}/tokens/${encodeURIComponent(token)}:acknowledge`,
        {},
        { expectEmpty: true },
      );
      return Object.freeze({ acknowledged: true });
    },
  });
}

export { normalizeSubscription as normalizeGooglePlaySubscription };
export { normalizeOrder as normalizeGooglePlayOrder };
