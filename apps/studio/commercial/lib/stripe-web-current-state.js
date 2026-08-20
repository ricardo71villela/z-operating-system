import { STRIPE_API_VERSION } from './stripe-web-api.js';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const DEFAULT_TIMEOUT_MS = 10_000;
const SUBSCRIPTION_STATUSES = new Set([
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
]);
const SESSION_STATUSES = new Set(['open', 'complete', 'expired']);

export class StripeWebCurrentStateError extends Error {
  constructor(code, { httpStatusCode = null, retryable = false } = {}) {
    super(code);
    this.name = 'StripeWebCurrentStateError';
    this.code = code;
    this.httpStatusCode = httpStatusCode;
    this.retryable = retryable;
  }
}

function fail(code, options) {
  throw new StripeWebCurrentStateError(code, options);
}

function assertRef(value, regex, code) {
  const normalized = String(value ?? '').trim();
  if (!regex.test(normalized)) fail(code);
  return normalized;
}

function assertEnvironment(config) {
  if (!['sandbox', 'production'].includes(config?.environment)) {
    fail('STRIPE_WEB_CURRENT_STATE_ENVIRONMENT_INVALID');
  }
  const key = String(config?.stripeSecretKey ?? '');
  const prefix = config.environment === 'production' ? 'sk_live_' : 'sk_test_';
  if (!key.startsWith(prefix) || key.length <= prefix.length) {
    fail('STRIPE_WEB_CURRENT_STATE_SECRET_INVALID');
  }
  return config.environment;
}

function assertLivemode(payload, environment) {
  if (typeof payload?.livemode !== 'boolean') {
    fail('STRIPE_WEB_CURRENT_STATE_LIVEMODE_INVALID');
  }
  if (payload.livemode !== (environment === 'production')) {
    fail('STRIPE_WEB_CURRENT_STATE_MODE_MISMATCH');
  }
}

function optionalEpochMs(value, code) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value <= 0) fail(code);
  return value * 1000;
}

function requiredEpochMs(value, code) {
  const result = optionalEpochMs(value, code);
  if (result == null) fail(code);
  return result;
}

function metadataMap(value) {
  if (value == null) return Object.freeze({});
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('STRIPE_WEB_CURRENT_STATE_METADATA_INVALID');
  }
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== 'string') {
      fail('STRIPE_WEB_CURRENT_STATE_METADATA_INVALID');
    }
    result[key] = raw;
  }
  return Object.freeze(result);
}

function normalizeSession(payload, environment) {
  if (payload?.object !== 'checkout.session') {
    fail('STRIPE_WEB_CURRENT_STATE_SESSION_OBJECT_INVALID');
  }
  assertLivemode(payload, environment);

  const id = assertRef(payload.id, /^cs_[A-Za-z0-9_]+$/, 'STRIPE_WEB_CURRENT_STATE_SESSION_ID_INVALID');
  const customerId = assertRef(payload.customer, /^cus_[A-Za-z0-9]+$/, 'STRIPE_WEB_CURRENT_STATE_CUSTOMER_ID_INVALID');
  const clientReferenceId = assertRef(
    payload.client_reference_id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    'STRIPE_WEB_CURRENT_STATE_CLIENT_REFERENCE_INVALID',
  );
  if (payload.mode !== 'subscription') {
    fail('STRIPE_WEB_CURRENT_STATE_SESSION_MODE_INVALID');
  }
  if (!SESSION_STATUSES.has(payload.status)) {
    fail('STRIPE_WEB_CURRENT_STATE_SESSION_STATUS_INVALID');
  }
  const subscriptionId = payload.subscription == null
    ? null
    : assertRef(
      payload.subscription,
      /^sub_[A-Za-z0-9]+$/,
      'STRIPE_WEB_CURRENT_STATE_SUBSCRIPTION_ID_INVALID',
    );
  const expiresAtMs = requiredEpochMs(
    payload.expires_at,
    'STRIPE_WEB_CURRENT_STATE_SESSION_EXPIRY_INVALID',
  );

  return Object.freeze({
    verification: 'verified_stripe_checkout_session_current_state',
    id,
    customerId,
    clientReferenceId,
    subscriptionId,
    status: payload.status,
    expiresAtMs,
    metadata: metadataMap(payload.metadata),
    rawPayloadIncluded: false,
  });
}

function normalizeSubscription(payload, environment) {
  if (payload?.object !== 'subscription') {
    fail('STRIPE_WEB_CURRENT_STATE_SUBSCRIPTION_OBJECT_INVALID');
  }
  assertLivemode(payload, environment);

  const id = assertRef(payload.id, /^sub_[A-Za-z0-9]+$/, 'STRIPE_WEB_CURRENT_STATE_SUBSCRIPTION_ID_INVALID');
  const createdMs = requiredEpochMs(
    payload.created,
    'STRIPE_WEB_CURRENT_STATE_SUBSCRIPTION_CREATED_INVALID',
  );
  const canceledAtMs = optionalEpochMs(
    payload.canceled_at,
    'STRIPE_WEB_CURRENT_STATE_CANCELED_AT_INVALID',
  );
  const endedAtMs = optionalEpochMs(
    payload.ended_at,
    'STRIPE_WEB_CURRENT_STATE_ENDED_AT_INVALID',
  );
  const customerId = assertRef(payload.customer, /^cus_[A-Za-z0-9]+$/, 'STRIPE_WEB_CURRENT_STATE_CUSTOMER_ID_INVALID');
  if (!SUBSCRIPTION_STATUSES.has(payload.status)) {
    fail('STRIPE_WEB_CURRENT_STATE_SUBSCRIPTION_STATUS_INVALID');
  }
  if (typeof payload.cancel_at_period_end !== 'boolean') {
    fail('STRIPE_WEB_CURRENT_STATE_CANCEL_FLAG_INVALID');
  }

  const items = payload.items?.data;
  if (!Array.isArray(items) || items.length !== 1) {
    fail('STRIPE_WEB_CURRENT_STATE_SUBSCRIPTION_ITEMS_INVALID');
  }
  const item = items[0];
  if (!item || typeof item !== 'object' || item.quantity !== 1) {
    fail('STRIPE_WEB_CURRENT_STATE_SUBSCRIPTION_ITEM_INVALID');
  }
  if (item.subscription != null && item.subscription !== id) {
    fail('STRIPE_WEB_CURRENT_STATE_SUBSCRIPTION_ITEM_OWNER_MISMATCH');
  }
  const price = item.price;
  if (!price || typeof price !== 'object') {
    fail('STRIPE_WEB_CURRENT_STATE_PRICE_INVALID');
  }
  const priceId = assertRef(price.id, /^price_[A-Za-z0-9]+$/, 'STRIPE_WEB_CURRENT_STATE_PRICE_ID_INVALID');
  const currency = String(price.currency ?? '').toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) {
    fail('STRIPE_WEB_CURRENT_STATE_PRICE_CURRENCY_INVALID');
  }
  const recurringInterval = String(price.recurring?.interval ?? '').toLowerCase();
  const recurringIntervalCount = price.recurring?.interval_count;
  if (
    !['day', 'week', 'month', 'year'].includes(recurringInterval)
    || !Number.isSafeInteger(recurringIntervalCount)
    || recurringIntervalCount <= 0
  ) {
    fail('STRIPE_WEB_CURRENT_STATE_PRICE_RECURRING_INVALID');
  }

  const currentPeriodStartMs = optionalEpochMs(
    item.current_period_start,
    'STRIPE_WEB_CURRENT_STATE_PERIOD_START_INVALID',
  );
  const currentPeriodEndMs = optionalEpochMs(
    item.current_period_end,
    'STRIPE_WEB_CURRENT_STATE_PERIOD_END_INVALID',
  );
  if (
    (currentPeriodStartMs == null) !== (currentPeriodEndMs == null)
    || (
      currentPeriodStartMs != null
      && currentPeriodEndMs <= currentPeriodStartMs
    )
  ) {
    fail('STRIPE_WEB_CURRENT_STATE_PERIOD_INVALID');
  }

  const trialStartMs = optionalEpochMs(
    payload.trial_start,
    'STRIPE_WEB_CURRENT_STATE_TRIAL_START_INVALID',
  );
  const trialEndMs = optionalEpochMs(
    payload.trial_end,
    'STRIPE_WEB_CURRENT_STATE_TRIAL_END_INVALID',
  );
  if (
    (trialStartMs == null) !== (trialEndMs == null)
    || (trialStartMs != null && trialEndMs <= trialStartMs)
  ) {
    fail('STRIPE_WEB_CURRENT_STATE_TRIAL_INVALID');
  }

  if (payload.status === 'active' && currentPeriodStartMs == null) {
    fail('STRIPE_WEB_CURRENT_STATE_ACTIVE_PERIOD_REQUIRED');
  }
  if (payload.status === 'trialing' && trialStartMs == null) {
    fail('STRIPE_WEB_CURRENT_STATE_TRIAL_WINDOW_REQUIRED');
  }

  return Object.freeze({
    verification: 'verified_stripe_subscription_current_state',
    id,
    customerId,
    status: payload.status,
    createdMs,
    canceledAtMs,
    endedAtMs,
    cancelAtPeriodEnd: payload.cancel_at_period_end,
    priceId,
    currency,
    recurringInterval,
    recurringIntervalCount,
    currentPeriodStartMs,
    currentPeriodEndMs,
    trialStartMs,
    trialEndMs,
    metadata: metadataMap(payload.metadata),
    rawPayloadIncluded: false,
  });
}

export function createStripeWebCurrentStateClient(
  config,
  {
    fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {},
) {
  const environment = assertEnvironment(config);
  if (typeof fetchImpl !== 'function') {
    fail('STRIPE_WEB_CURRENT_STATE_FETCH_INVALID');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30_000) {
    fail('STRIPE_WEB_CURRENT_STATE_TIMEOUT_INVALID');
  }

  async function request(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`${STRIPE_API_BASE}${path}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.stripeSecretKey}`,
          Accept: 'application/json',
          'Stripe-Version': STRIPE_API_VERSION,
        },
        signal: controller.signal,
      });
    } catch (error) {
      fail(
        error?.name === 'AbortError'
          ? 'STRIPE_WEB_CURRENT_STATE_TIMEOUT'
          : 'STRIPE_WEB_CURRENT_STATE_NETWORK_ERROR',
        { retryable: true },
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        fail('STRIPE_WEB_CURRENT_STATE_RESPONSE_INVALID', {
          httpStatusCode: response.status,
          retryable: response.status >= 500,
        });
      }
    }

    if (!response.ok) {
      const retryable = [408, 425, 429].includes(response.status)
        || response.status >= 500;
      fail('STRIPE_WEB_CURRENT_STATE_REQUEST_FAILED', {
        httpStatusCode: response.status,
        retryable,
      });
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      fail('STRIPE_WEB_CURRENT_STATE_RESPONSE_INVALID');
    }
    return payload;
  }

  return Object.freeze({
    apiVersion: STRIPE_API_VERSION,
    environment,
    async retrieveCheckoutSession(sessionId) {
      const id = assertRef(
        sessionId,
        /^cs_[A-Za-z0-9_]+$/,
        'STRIPE_WEB_CURRENT_STATE_SESSION_ID_INVALID',
      );
      return normalizeSession(
        await request(`/checkout/sessions/${encodeURIComponent(id)}`),
        environment,
      );
    },
    async retrieveSubscription(subscriptionId) {
      const id = assertRef(
        subscriptionId,
        /^sub_[A-Za-z0-9]+$/,
        'STRIPE_WEB_CURRENT_STATE_SUBSCRIPTION_ID_INVALID',
      );
      return normalizeSubscription(
        await request(`/subscriptions/${encodeURIComponent(id)}`),
        environment,
      );
    },
  });
}
