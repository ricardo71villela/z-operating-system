const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PREPARE_RPC = 'zstudio_prepare_web_checkout';
const BIND_CUSTOMER_RPC = 'zstudio_bind_web_stripe_customer';
const BIND_SESSION_RPC = 'zstudio_bind_web_checkout_session';
const CLOSE_INTENT_RPC = 'zstudio_close_web_checkout_intent';

export class WebCheckoutPreflightRpcError extends Error {
  constructor(
    code,
    {
      httpStatus = null,
      retryable = false,
      postgresCode = null,
      databaseCode = null,
      cause,
    } = {},
  ) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'WebCheckoutPreflightRpcError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
    this.postgresCode = postgresCode;
    this.databaseCode = databaseCode;
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
  const normalized = requiredString(
    value,
    'WEB_PREFLIGHT_ENVIRONMENT_REQUIRED',
  ).toLowerCase();
  if (!['sandbox', 'production'].includes(normalized)) {
    throw new Error('WEB_PREFLIGHT_ENVIRONMENT_INVALID');
  }
  return normalized;
}

function requiredPlan(value) {
  const normalized = requiredString(value, 'WEB_PREFLIGHT_PLAN_REQUIRED').toLowerCase();
  if (!['weekly', 'monthly', 'annual'].includes(normalized)) {
    throw new Error('WEB_PREFLIGHT_PLAN_INVALID');
  }
  return normalized;
}

function requiredHttpsUrl(value) {
  const normalized = requiredString(value, 'WEB_PREFLIGHT_SUPABASE_URL_REQUIRED')
    .replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('WEB_PREFLIGHT_SUPABASE_URL_INVALID');
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
  ) {
    throw new Error('WEB_PREFLIGHT_SUPABASE_URL_INVALID');
  }
  return normalized;
}

function requiredSecret(value) {
  const normalized = requiredString(
    value,
    'WEB_PREFLIGHT_SUPABASE_SECRET_KEY_REQUIRED',
  );
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error('WEB_PREFLIGHT_SUPABASE_SECRET_KEY_INVALID');
  }
  return normalized;
}

function retryableHttpStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function databaseCode(body) {
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  return /^(WEB|COMMERCIAL)_[A-Z0-9_]+$/.test(message) ? message : null;
}

function parseTimestamp(value, code, { optional = false } = {}) {
  if ((value === null || value === undefined) && optional) return null;
  const normalized = requiredString(value, code);
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) throw new Error(code);
  return new Date(ms).toISOString();
}

function normalizePrepare(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('WEB_PREFLIGHT_RESPONSE_INVALID');
  }
  const result = String(payload.result ?? '').trim();
  if (!['prepared', 'existing'].includes(result)) {
    throw new Error('WEB_PREFLIGHT_RESPONSE_RESULT_INVALID');
  }
  const sourceCustomerRef =
    payload.source_customer_ref == null
      ? null
      : requiredString(payload.source_customer_ref, 'WEB_PREFLIGHT_CUSTOMER_REF_INVALID');
  const sourceCheckoutSessionRef =
    payload.source_checkout_session_ref == null
      ? null
      : requiredString(
        payload.source_checkout_session_ref,
        'WEB_PREFLIGHT_SESSION_REF_INVALID',
      );

  if (typeof payload.trial_eligible !== 'boolean') {
    throw new Error('WEB_PREFLIGHT_TRIAL_ELIGIBILITY_INVALID');
  }

  return Object.freeze({
    result,
    intentId: requiredUuid(payload.intent_id, 'WEB_PREFLIGHT_INTENT_ID_INVALID'),
    bindingId: requiredUuid(payload.binding_id, 'WEB_PREFLIGHT_BINDING_ID_INVALID'),
    sourceCustomerRef,
    planCode: requiredPlan(payload.plan_code),
    billingEnvironment: requiredEnvironment(payload.billing_environment),
    trialEligible: payload.trial_eligible,
    sourceCheckoutSessionRef,
    intentExpiresAt: parseTimestamp(
      payload.intent_expires_at,
      'WEB_PREFLIGHT_INTENT_EXPIRY_INVALID',
    ),
    providerExpiresAt: parseTimestamp(
      payload.provider_expires_at,
      'WEB_PREFLIGHT_PROVIDER_EXPIRY_INVALID',
      { optional: true },
    ),
  });
}

function normalizeSimpleResult(payload, allowed, code) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(code);
  }
  const result = String(payload.result ?? '').trim();
  if (!allowed.includes(result)) throw new Error(code);
  return { result };
}

export function createWebCheckoutPreflightClient(
  config,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = 10_000,
  } = {},
) {
  if (!config || typeof config !== 'object') {
    throw new Error('WEB_PREFLIGHT_CONFIG_REQUIRED');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('WEB_PREFLIGHT_FETCH_REQUIRED');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('WEB_PREFLIGHT_TIMEOUT_INVALID');
  }

  const supabaseUrl = requiredHttpsUrl(config.supabaseUrl);
  const secretKey = requiredSecret(config.supabaseSecretKey);

  async function rpc(name, args) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
          apikey: secretKey,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(args),
        signal: controller.signal,
      });
    } catch (cause) {
      const timedOut = cause?.name === 'AbortError';
      throw new WebCheckoutPreflightRpcError(
        timedOut ? 'WEB_PREFLIGHT_RPC_TIMEOUT' : 'WEB_PREFLIGHT_RPC_TRANSPORT_FAILED',
        { retryable: true, cause },
      );
    } finally {
      clearTimeout(timeout);
    }

    let text;
    try {
      text = await response.text();
    } catch (cause) {
      throw new WebCheckoutPreflightRpcError(
        'WEB_PREFLIGHT_RPC_RESPONSE_READ_FAILED',
        {
          httpStatus: response.status,
          retryable: retryableHttpStatus(response.status),
          cause,
        },
      );
    }
    const payload = parseJson(text);

    if (!response.ok) {
      throw new WebCheckoutPreflightRpcError(
        'WEB_PREFLIGHT_RPC_FAILED',
        {
          httpStatus: response.status,
          retryable: retryableHttpStatus(response.status),
          postgresCode: typeof payload?.code === 'string' ? payload.code : null,
          databaseCode: databaseCode(payload),
        },
      );
    }
    if (payload === null) {
      throw new WebCheckoutPreflightRpcError(
        'WEB_PREFLIGHT_RPC_RESPONSE_INVALID',
        { httpStatus: response.status },
      );
    }
    return payload;
  }

  async function prepareWebCheckout({ personId, planCode, billingEnvironment }) {
    const person = requiredUuid(personId, 'WEB_PREFLIGHT_PERSON_ID_INVALID');
    const plan = requiredPlan(planCode);
    const environment = requiredEnvironment(billingEnvironment);
    const payload = await rpc(PREPARE_RPC, {
      p_person_id: person,
      p_plan_code: plan,
      p_billing_environment: environment,
    });
    try {
      return normalizePrepare(payload);
    } catch (cause) {
      throw new WebCheckoutPreflightRpcError(cause.message, {
        httpStatus: 200,
        cause,
      });
    }
  }

  async function bindStripeCustomer({
    bindingId,
    personId,
    billingEnvironment,
    sourceCustomerRef,
  }) {
    const payload = await rpc(BIND_CUSTOMER_RPC, {
      p_binding_id: requiredUuid(bindingId, 'WEB_PREFLIGHT_BINDING_ID_INVALID'),
      p_person_id: requiredUuid(personId, 'WEB_PREFLIGHT_PERSON_ID_INVALID'),
      p_billing_environment: requiredEnvironment(billingEnvironment),
      p_source_customer_ref: requiredString(
        sourceCustomerRef,
        'WEB_PREFLIGHT_CUSTOMER_REF_INVALID',
      ),
    });
    try {
      const normalized = normalizeSimpleResult(
        payload,
        ['bound', 'duplicate'],
        'WEB_PREFLIGHT_CUSTOMER_BIND_RESPONSE_INVALID',
      );
      return Object.freeze({
        result: normalized.result,
        bindingId: requiredUuid(
          payload.binding_id,
          'WEB_PREFLIGHT_BINDING_ID_INVALID',
        ),
        sourceCustomerRef: requiredString(
          payload.source_customer_ref,
          'WEB_PREFLIGHT_CUSTOMER_REF_INVALID',
        ),
      });
    } catch (cause) {
      throw new WebCheckoutPreflightRpcError(cause.message, {
        httpStatus: 200,
        cause,
      });
    }
  }

  async function bindCheckoutSession({
    intentId,
    personId,
    billingEnvironment,
    sourceCheckoutSessionRef,
    providerExpiresAt,
  }) {
    const payload = await rpc(BIND_SESSION_RPC, {
      p_intent_id: requiredUuid(intentId, 'WEB_PREFLIGHT_INTENT_ID_INVALID'),
      p_person_id: requiredUuid(personId, 'WEB_PREFLIGHT_PERSON_ID_INVALID'),
      p_billing_environment: requiredEnvironment(billingEnvironment),
      p_source_checkout_session_ref: requiredString(
        sourceCheckoutSessionRef,
        'WEB_PREFLIGHT_SESSION_REF_INVALID',
      ),
      p_provider_expires_at: parseTimestamp(
        providerExpiresAt,
        'WEB_PREFLIGHT_PROVIDER_EXPIRY_INVALID',
      ),
    });
    try {
      const normalized = normalizeSimpleResult(
        payload,
        ['bound', 'duplicate'],
        'WEB_PREFLIGHT_SESSION_BIND_RESPONSE_INVALID',
      );
      return Object.freeze({
        result: normalized.result,
        intentId: requiredUuid(payload.intent_id, 'WEB_PREFLIGHT_INTENT_ID_INVALID'),
        sourceCheckoutSessionRef: requiredString(
          payload.source_checkout_session_ref,
          'WEB_PREFLIGHT_SESSION_REF_INVALID',
        ),
        state: requiredString(payload.state, 'WEB_PREFLIGHT_SESSION_STATE_INVALID'),
        providerExpiresAt:
          payload.provider_expires_at == null
            ? null
            : parseTimestamp(
              payload.provider_expires_at,
              'WEB_PREFLIGHT_PROVIDER_EXPIRY_INVALID',
            ),
      });
    } catch (cause) {
      throw new WebCheckoutPreflightRpcError(cause.message, {
        httpStatus: 200,
        cause,
      });
    }
  }

  async function closeCheckoutIntent({
    intentId,
    personId,
    billingEnvironment,
    finalState,
  }) {
    const normalizedFinalState = requiredString(
      finalState,
      'WEB_PREFLIGHT_CLOSE_STATE_REQUIRED',
    ).toLowerCase();
    if (!['completed', 'expired', 'failed'].includes(normalizedFinalState)) {
      throw new Error('WEB_PREFLIGHT_CLOSE_STATE_INVALID');
    }
    const payload = await rpc(CLOSE_INTENT_RPC, {
      p_intent_id: requiredUuid(intentId, 'WEB_PREFLIGHT_INTENT_ID_INVALID'),
      p_person_id: requiredUuid(personId, 'WEB_PREFLIGHT_PERSON_ID_INVALID'),
      p_billing_environment: requiredEnvironment(billingEnvironment),
      p_final_state: normalizedFinalState,
    });
    try {
      const normalized = normalizeSimpleResult(
        payload,
        ['closed', 'duplicate'],
        'WEB_PREFLIGHT_CLOSE_RESPONSE_INVALID',
      );
      return Object.freeze({
        result: normalized.result,
        intentId: requiredUuid(payload.intent_id, 'WEB_PREFLIGHT_INTENT_ID_INVALID'),
        state: requiredString(payload.state, 'WEB_PREFLIGHT_CLOSE_STATE_INVALID'),
      });
    } catch (cause) {
      throw new WebCheckoutPreflightRpcError(cause.message, {
        httpStatus: 200,
        cause,
      });
    }
  }

  return Object.freeze({
    prepareWebCheckout,
    bindStripeCustomer,
    bindCheckoutSession,
    closeCheckoutIntent,
  });
}
