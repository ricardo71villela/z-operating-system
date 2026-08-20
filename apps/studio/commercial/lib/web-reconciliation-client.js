const RPC_RESOLVE_SUBSCRIPTION = 'zstudio_resolve_web_subscription_reconciliation';
const RPC_RESOLVE_SESSION = 'zstudio_resolve_web_checkout_session_reconciliation';
const RPC_CLAIM_TRIAL = 'zstudio_claim_verified_web_trial_consumption';
const DEFAULT_TIMEOUT_MS = 10_000;

export class WebReconciliationRpcError extends Error {
  constructor(code, { httpStatusCode = null, retryable = false } = {}) {
    super(code);
    this.name = 'WebReconciliationRpcError';
    this.code = code;
    this.httpStatusCode = httpStatusCode;
    this.retryable = retryable;
  }
}

function fail(code, options) {
  throw new WebReconciliationRpcError(code, options);
}

function uuid(value, code) {
  const normalized = String(value ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    fail(code);
  }
  return normalized;
}

function providerRef(value, regex, code) {
  const normalized = String(value ?? '').trim();
  if (!regex.test(normalized)) fail(code);
  return normalized;
}

function environment(value) {
  if (!['sandbox', 'production'].includes(value)) {
    fail('WEB_RECONCILIATION_ENVIRONMENT_INVALID');
  }
  return value;
}

function planCode(value) {
  if (!['weekly', 'monthly', 'annual'].includes(value)) {
    fail('WEB_RECONCILIATION_PLAN_INVALID');
  }
  return value;
}

function assertBaseConfig(config) {
  const base = String(config?.supabaseUrl ?? '').replace(/\/+$/, '');
  let url;
  try {
    url = new URL(base);
  } catch {
    fail('WEB_RECONCILIATION_SUPABASE_URL_INVALID');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    fail('WEB_RECONCILIATION_SUPABASE_URL_INVALID');
  }
  const secret = String(config?.supabaseSecretKey ?? '');
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(secret)) {
    fail('WEB_RECONCILIATION_SUPABASE_SECRET_INVALID');
  }
  return { base, secret };
}

function normalizeSessionIdentity(payload) {
  if (!payload || payload.result !== 'resolved') {
    fail('WEB_SESSION_RECONCILIATION_RESULT_INVALID');
  }
  return Object.freeze({
    result: 'resolved',
    personId: uuid(payload.person_id, 'WEB_SESSION_RECONCILIATION_PERSON_INVALID'),
    checkoutIntentId: uuid(
      payload.checkout_intent_id,
      'WEB_SESSION_RECONCILIATION_INTENT_INVALID',
    ),
    planCode: planCode(payload.plan_code),
    billingEnvironment: environment(payload.billing_environment),
    sourceCustomerRef: providerRef(
      payload.source_customer_ref,
      /^cus_[A-Za-z0-9]+$/,
      'WEB_SESSION_RECONCILIATION_CUSTOMER_INVALID',
    ),
    sourceCheckoutSessionRef: providerRef(
      payload.source_checkout_session_ref,
      /^cs_[A-Za-z0-9_]+$/,
      'WEB_SESSION_RECONCILIATION_SESSION_INVALID',
    ),
    intentState: String(payload.intent_state ?? ''),
    trialReserved: payload.trial_reserved === true,
    providerExpiresAt: payload.provider_expires_at == null
      ? null
      : String(payload.provider_expires_at),
  });
}

function normalizeSubscriptionIdentity(payload) {
  if (!payload || payload.result !== 'resolved') {
    fail('WEB_SUBSCRIPTION_RECONCILIATION_RESULT_INVALID');
  }
  return Object.freeze({
    result: 'resolved',
    personId: uuid(payload.person_id, 'WEB_SUBSCRIPTION_RECONCILIATION_PERSON_INVALID'),
    checkoutIntentId: uuid(
      payload.checkout_intent_id,
      'WEB_SUBSCRIPTION_RECONCILIATION_INTENT_INVALID',
    ),
    planCode: planCode(payload.plan_code),
    billingEnvironment: environment(payload.billing_environment),
    sourceCustomerRef: providerRef(
      payload.source_customer_ref,
      /^cus_[A-Za-z0-9]+$/,
      'WEB_SUBSCRIPTION_RECONCILIATION_CUSTOMER_INVALID',
    ),
    sourceCheckoutSessionRef: providerRef(
      payload.source_checkout_session_ref,
      /^cs_[A-Za-z0-9_]+$/,
      'WEB_SUBSCRIPTION_RECONCILIATION_SESSION_INVALID',
    ),
    sourceSubscriptionRef: providerRef(
      payload.source_subscription_ref,
      /^stripe:web:subscription:sub_[A-Za-z0-9]+$/,
      'WEB_SUBSCRIPTION_RECONCILIATION_SUBSCRIPTION_INVALID',
    ),
    trialReserved: payload.trial_reserved === true,
    subscriptionAlreadyKnown: payload.subscription_already_known === true,
  });
}

function normalizeTrialClaim(payload) {
  if (!payload || !['claimed', 'duplicate', 'sandbox_ignored'].includes(payload.result)) {
    fail('WEB_TRIAL_CONSUMPTION_RESULT_INVALID');
  }
  return Object.freeze({
    result: payload.result,
    personId: uuid(payload.person_id, 'WEB_TRIAL_CONSUMPTION_PERSON_INVALID'),
    checkoutIntentId: uuid(
      payload.checkout_intent_id,
      'WEB_TRIAL_CONSUMPTION_INTENT_INVALID',
    ),
    sourceSubscriptionRef: providerRef(
      payload.source_subscription_ref,
      /^stripe:web:subscription:sub_[A-Za-z0-9]+$/,
      'WEB_TRIAL_CONSUMPTION_SUBSCRIPTION_INVALID',
    ),
  });
}

export function createWebReconciliationClient(
  config,
  {
    fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {},
) {
  const { base, secret } = assertBaseConfig(config);
  if (typeof fetchImpl !== 'function') fail('WEB_RECONCILIATION_FETCH_INVALID');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30_000) {
    fail('WEB_RECONCILIATION_TIMEOUT_INVALID');
  }

  async function rpc(name, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`${base}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
          apikey: secret,
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      fail(
        error?.name === 'AbortError'
          ? 'WEB_RECONCILIATION_RPC_TIMEOUT'
          : 'WEB_RECONCILIATION_RPC_NETWORK_ERROR',
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
        fail('WEB_RECONCILIATION_RPC_RESPONSE_INVALID', {
          httpStatusCode: response.status,
          retryable: response.status >= 500,
        });
      }
    }

    if (!response.ok) {
      fail('WEB_RECONCILIATION_RPC_REJECTED', {
        httpStatusCode: response.status,
        retryable: [408, 425, 429].includes(response.status) || response.status >= 500,
      });
    }
    return payload;
  }

  return Object.freeze({
    async resolveCheckoutSession({
      sourceCheckoutSessionRef,
      sourceCustomerRef,
      billingEnvironment,
    }) {
      return normalizeSessionIdentity(await rpc(RPC_RESOLVE_SESSION, {
        p_source_checkout_session_ref: providerRef(
          sourceCheckoutSessionRef,
          /^cs_[A-Za-z0-9_]+$/,
          'WEB_SESSION_RECONCILIATION_SESSION_INVALID',
        ),
        p_source_customer_ref: providerRef(
          sourceCustomerRef,
          /^cus_[A-Za-z0-9]+$/,
          'WEB_SESSION_RECONCILIATION_CUSTOMER_INVALID',
        ),
        p_billing_environment: environment(billingEnvironment),
      }));
    },

    async resolveSubscription({
      checkoutIntentId,
      sourceSubscriptionRef,
      sourceCustomerRef,
      billingEnvironment,
    }) {
      return normalizeSubscriptionIdentity(await rpc(RPC_RESOLVE_SUBSCRIPTION, {
        p_checkout_intent_id: uuid(
          checkoutIntentId,
          'WEB_SUBSCRIPTION_RECONCILIATION_INTENT_INVALID',
        ),
        p_source_subscription_ref: providerRef(
          sourceSubscriptionRef,
          /^stripe:web:subscription:sub_[A-Za-z0-9]+$/,
          'WEB_SUBSCRIPTION_RECONCILIATION_SUBSCRIPTION_INVALID',
        ),
        p_source_customer_ref: providerRef(
          sourceCustomerRef,
          /^cus_[A-Za-z0-9]+$/,
          'WEB_SUBSCRIPTION_RECONCILIATION_CUSTOMER_INVALID',
        ),
        p_billing_environment: environment(billingEnvironment),
      }));
    },

    async claimVerifiedTrialConsumption({
      checkoutIntentId,
      personId,
      sourceCustomerRef,
      sourceSubscriptionRef,
      billingEnvironment,
      effectiveAtMs,
    }) {
      if (!Number.isSafeInteger(effectiveAtMs) || effectiveAtMs <= 0) {
        fail('WEB_TRIAL_CONSUMPTION_EFFECTIVE_AT_INVALID');
      }
      return normalizeTrialClaim(await rpc(RPC_CLAIM_TRIAL, {
        p_checkout_intent_id: uuid(
          checkoutIntentId,
          'WEB_TRIAL_CONSUMPTION_INTENT_INVALID',
        ),
        p_person_id: uuid(personId, 'WEB_TRIAL_CONSUMPTION_PERSON_INVALID'),
        p_source_customer_ref: providerRef(
          sourceCustomerRef,
          /^cus_[A-Za-z0-9]+$/,
          'WEB_TRIAL_CONSUMPTION_CUSTOMER_INVALID',
        ),
        p_source_subscription_ref: providerRef(
          sourceSubscriptionRef,
          /^stripe:web:subscription:sub_[A-Za-z0-9]+$/,
          'WEB_TRIAL_CONSUMPTION_SUBSCRIPTION_INVALID',
        ),
        p_billing_environment: environment(billingEnvironment),
        p_effective_at: new Date(effectiveAtMs).toISOString(),
      }));
    },
  });
}
