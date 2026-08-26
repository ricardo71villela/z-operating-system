export const STRIPE_API_VERSION = '2026-07-29.dahlia';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROVIDER_EXPIRY_SECONDS = 31 * 60;

export class StripeWebApiError extends Error {
  constructor(
    code,
    {
      httpStatus = null,
      retryable = false,
      stripeType = null,
      stripeCode = null,
      cause,
    } = {},
  ) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'StripeWebApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
    this.stripeType = stripeType;
    this.stripeCode = stripeCode;
  }
}

function requiredString(value, code) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function requiredUuid(value, code) {
  const normalized = requiredString(value, code);
  if (!UUID_PATTERN.test(normalized)) throw new Error(code);
  return normalized.toLowerCase();
}

function requiredEnvironment(value) {
  const normalized = requiredString(value, 'STRIPE_WEB_ENVIRONMENT_REQUIRED').toLowerCase();
  if (!['sandbox', 'production'].includes(normalized)) {
    throw new Error('STRIPE_WEB_ENVIRONMENT_INVALID');
  }
  return normalized;
}

function requiredSecret(value, environment) {
  const normalized = requiredString(value, 'STRIPE_WEB_SECRET_KEY_REQUIRED');
  const prefix = environment === 'production' ? 'sk_live_' : 'sk_test_';
  if (!normalized.startsWith(prefix) || normalized.length <= prefix.length) {
    throw new Error('STRIPE_WEB_SECRET_KEY_INVALID');
  }
  return normalized;
}

function requiredPrice(value) {
  const normalized = requiredString(value, 'STRIPE_WEB_PRICE_ID_REQUIRED');
  if (!/^price_[A-Za-z0-9]+$/.test(normalized)) {
    throw new Error('STRIPE_WEB_PRICE_ID_INVALID');
  }
  return normalized;
}

function requiredCustomer(value) {
  const normalized = requiredString(value, 'STRIPE_WEB_CUSTOMER_ID_REQUIRED');
  if (!/^cus_[A-Za-z0-9]+$/.test(normalized)) {
    throw new Error('STRIPE_WEB_CUSTOMER_ID_INVALID');
  }
  return normalized;
}

function requiredSession(value) {
  const normalized = requiredString(value, 'STRIPE_WEB_SESSION_ID_REQUIRED');
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(normalized)) {
    throw new Error('STRIPE_WEB_SESSION_ID_INVALID');
  }
  return normalized;
}

function requiredHttpsUrl(value, code) {
  const normalized = requiredString(value, code);
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(code);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error(code);
  }
  return normalized;
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function retryableStatus(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function expectedLivemode(environment) {
  return environment === 'production';
}

function normalizeCustomer(payload, environment) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('STRIPE_WEB_CUSTOMER_RESPONSE_INVALID');
  }
  const id = requiredCustomer(payload.id);
  if (typeof payload.livemode !== 'boolean' || payload.livemode !== expectedLivemode(environment)) {
    throw new Error('STRIPE_WEB_MODE_MISMATCH');
  }
  return Object.freeze({ id, livemode: payload.livemode });
}

function normalizeSession(payload, environment) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('STRIPE_WEB_SESSION_RESPONSE_INVALID');
  }
  const id = requiredSession(payload.id);
  if (typeof payload.livemode !== 'boolean' || payload.livemode !== expectedLivemode(environment)) {
    throw new Error('STRIPE_WEB_MODE_MISMATCH');
  }
  const url = requiredHttpsUrl(payload.url, 'STRIPE_WEB_SESSION_URL_INVALID');
  const parsedUrl = new URL(url);
  if (parsedUrl.hostname !== 'checkout.stripe.com') {
    throw new Error('STRIPE_WEB_SESSION_URL_INVALID');
  }
  if (!Number.isInteger(payload.expires_at) || payload.expires_at <= 0) {
    throw new Error('STRIPE_WEB_SESSION_EXPIRY_INVALID');
  }
  const customer =
    typeof payload.customer === 'string'
      ? requiredCustomer(payload.customer)
      : null;
  const clientReferenceId =
    payload.client_reference_id == null
      ? null
      : requiredString(
        payload.client_reference_id,
        'STRIPE_WEB_CLIENT_REFERENCE_INVALID',
      );
  const status =
    payload.status == null
      ? null
      : requiredString(payload.status, 'STRIPE_WEB_SESSION_STATUS_INVALID');

  return Object.freeze({
    id,
    url,
    livemode: payload.livemode,
    customer,
    clientReferenceId,
    status,
    expiresAt: new Date(payload.expires_at * 1000).toISOString(),
  });
}

export function createStripeWebApi(
  config,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = 10_000,
    nowMs = () => Date.now(),
  } = {},
) {
  if (!config || typeof config !== 'object') {
    throw new Error('STRIPE_WEB_CONFIG_REQUIRED');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('STRIPE_WEB_FETCH_REQUIRED');
  }
  if (typeof nowMs !== 'function') {
    throw new Error('STRIPE_WEB_CLOCK_REQUIRED');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('STRIPE_WEB_TIMEOUT_INVALID');
  }

  const environment = requiredEnvironment(config.environment);
  const secretKey = requiredSecret(config.stripeSecretKey, environment);
  const successUrl = requiredHttpsUrl(
    config.successUrl,
    'STRIPE_WEB_SUCCESS_URL_INVALID',
  );
  const cancelUrl = requiredHttpsUrl(
    config.cancelUrl,
    'STRIPE_WEB_CANCEL_URL_INVALID',
  );

  async function request(method, path, { params, idempotencyKey } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const headers = {
      Authorization: `Bearer ${secretKey}`,
      accept: 'application/json',
      'Stripe-Version': STRIPE_API_VERSION,
    };
    let body;
    if (params) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(params).toString();
    }
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    let response;
    try {
      response = await fetchImpl(`${STRIPE_API_BASE}${path}`, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (cause) {
      const timedOut = cause?.name === 'AbortError';
      throw new StripeWebApiError(
        timedOut ? 'STRIPE_WEB_API_TIMEOUT' : 'STRIPE_WEB_API_TRANSPORT_FAILED',
        { retryable: true, cause },
      );
    } finally {
      clearTimeout(timeout);
    }

    let text;
    try {
      text = await response.text();
    } catch (cause) {
      throw new StripeWebApiError(
        'STRIPE_WEB_API_RESPONSE_READ_FAILED',
        {
          httpStatus: response.status,
          retryable: retryableStatus(response.status),
          cause,
        },
      );
    }
    const payload = parseJson(text);

    if (!response.ok) {
      throw new StripeWebApiError(
        'STRIPE_WEB_API_FAILED',
        {
          httpStatus: response.status,
          retryable: retryableStatus(response.status),
          stripeType:
            typeof payload?.error?.type === 'string'
              ? payload.error.type
              : null,
          stripeCode:
            typeof payload?.error?.code === 'string'
              ? payload.error.code
              : null,
        },
      );
    }
    if (payload === null) {
      throw new StripeWebApiError(
        'STRIPE_WEB_API_RESPONSE_INVALID',
        { httpStatus: response.status },
      );
    }
    return payload;
  }

  async function createCustomer({ personId, bindingId }) {
    const person = requiredUuid(personId, 'STRIPE_WEB_PERSON_ID_INVALID');
    const binding = requiredUuid(bindingId, 'STRIPE_WEB_BINDING_ID_INVALID');
    const payload = await request('POST', '/customers', {
      idempotencyKey: `zstudio:web:customer:${environment}:${binding}`,
      params: {
        description: 'Z Studio Web subscription customer',
        'metadata[zos_person_id]': person,
        'metadata[zstudio_binding_id]': binding,
        'metadata[billing_source]': 'web',
        'metadata[billing_environment]': environment,
      },
    });
    try {
      return normalizeCustomer(payload, environment);
    } catch (cause) {
      throw new StripeWebApiError(cause.message, {
        httpStatus: 200,
        cause,
      });
    }
  }

  async function createCheckoutSession({
    personId,
    intentId,
    planCode,
    priceId,
    customerId,
    trialEligible,
    trialDays,
  }) {
    const person = requiredUuid(personId, 'STRIPE_WEB_PERSON_ID_INVALID');
    const intent = requiredUuid(intentId, 'STRIPE_WEB_INTENT_ID_INVALID');
    const plan = requiredString(planCode, 'STRIPE_WEB_PLAN_REQUIRED').toLowerCase();
    if (!['weekly', 'monthly', 'annual'].includes(plan)) {
      throw new Error('STRIPE_WEB_PLAN_INVALID');
    }
    const price = requiredPrice(priceId);
    const customer = requiredCustomer(customerId);
    if (typeof trialEligible !== 'boolean') {
      throw new Error('STRIPE_WEB_TRIAL_ELIGIBILITY_INVALID');
    }
    if (!Number.isInteger(trialDays) || trialDays !== 3) {
      throw new Error('STRIPE_WEB_TRIAL_DAYS_INVALID');
    }

    // Stripe requires expires_at to be at least 30 minutes after Session
    // creation. One minute of provider-clock/network buffer avoids falling
    // below that hard minimum while the database intent still owns the 30m
    // serialization window.
    const expiresAt = Math.floor(Number(nowMs()) / 1000) + PROVIDER_EXPIRY_SECONDS;
    const params = {
      mode: 'subscription',
      customer,
      client_reference_id: intent,
      success_url: successUrl,
      cancel_url: cancelUrl,
      'line_items[0][price]': price,
      'line_items[0][quantity]': '1',
      payment_method_collection: 'always',
      expires_at: String(expiresAt),
      'metadata[zos_person_id]': person,
      'metadata[zstudio_checkout_intent_id]': intent,
      'metadata[plan_code]': plan,
      'metadata[billing_environment]': environment,
      'subscription_data[metadata][zos_person_id]': person,
      'subscription_data[metadata][zstudio_checkout_intent_id]': intent,
      'subscription_data[metadata][plan_code]': plan,
      'subscription_data[metadata][billing_environment]': environment,
    };
    if (trialEligible) {
      params['subscription_data[trial_period_days]'] = String(trialDays);
      params['subscription_data[trial_settings][end_behavior][missing_payment_method]'] =
        'cancel';
    }

    const payload = await request('POST', '/checkout/sessions', {
      idempotencyKey: `zstudio:web:checkout:${environment}:${intent}`,
      params,
    });
    try {
      return normalizeSession(payload, environment);
    } catch (cause) {
      throw new StripeWebApiError(cause.message, {
        httpStatus: 200,
        cause,
      });
    }
  }

  async function retrieveCheckoutSession(sessionId) {
    const session = requiredSession(sessionId);
    const payload = await request(
      'GET',
      `/checkout/sessions/${encodeURIComponent(session)}`,
    );
    try {
      return normalizeSession(payload, environment);
    } catch (cause) {
      throw new StripeWebApiError(cause.message, {
        httpStatus: 200,
        cause,
      });
    }
  }

  return Object.freeze({
    apiVersion: STRIPE_API_VERSION,
    environment,
    createCustomer,
    createCheckoutSession,
    retrieveCheckoutSession,
  });
}
