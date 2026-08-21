const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APPLE_PRODUCT_RE = /^com\.zoperatingsystem\.zstudio\.subscription\.(weekly|monthly|annual)$/;

export class ApplePurchaseAuthorityRpcError extends Error {
  constructor(code, { retryable = false, httpStatusCode = null, databaseCode = null, postgresCode = null, cause = null } = {}) {
    super(code);
    this.name = 'ApplePurchaseAuthorityRpcError';
    this.code = code;
    this.retryable = retryable;
    this.httpStatusCode = httpStatusCode;
    this.databaseCode = databaseCode;
    this.postgresCode = postgresCode;
    if (cause) this.cause = cause;
  }
}
function fail(code, options) { throw new ApplePurchaseAuthorityRpcError(code, options); }
function retryableStatus(status) { return status === 408 || status === 425 || status === 429 || status >= 500; }
function uuid(value, code) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!UUID_RE.test(text)) fail(code);
  return text;
}
function environment(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!['sandbox','production'].includes(text)) fail('APPLE_PURCHASE_AUTHORITY_ENVIRONMENT_INVALID');
  return text;
}
function plan(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!['weekly','monthly','annual'].includes(text)) fail('APPLE_PURCHASE_AUTHORITY_PLAN_INVALID');
  return text;
}
function product(value) {
  const text = String(value ?? '').trim();
  if (!APPLE_PRODUCT_RE.test(text)) fail('APPLE_PURCHASE_AUTHORITY_PRODUCT_INVALID');
  return text;
}
function subscriptionRef(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) fail('APPLE_PURCHASE_AUTHORITY_SUBSCRIPTION_REF_INVALID');
  return text;
}
function databaseCode(payload) {
  const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
  return /^(APPLE|COMMERCIAL)_[A-Z0-9_]+$/.test(message) ? message : null;
}

export function createApplePurchaseAuthorityClient(config, { fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
  const url = String(config?.supabaseUrl ?? '').trim().replace(/\/+$/, '');
  const secret = String(config?.supabaseSecretKey ?? '').trim();
  if (!/^https:\/\//.test(url) || !/^sb_secret_[A-Za-z0-9_-]+$/.test(secret)) fail('APPLE_PURCHASE_AUTHORITY_CONFIG_INVALID');
  if (typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs <= 0) fail('APPLE_PURCHASE_AUTHORITY_CLIENT_INVALID');

  async function rpc(name, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { apikey: secret, Authorization: `Bearer ${secret}`, accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (cause) {
      fail('APPLE_PURCHASE_AUTHORITY_RPC_UNAVAILABLE', { retryable: true, cause });
    } finally {
      clearTimeout(timer);
    }
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      fail('APPLE_PURCHASE_AUTHORITY_RPC_FAILED', {
        retryable: retryableStatus(response.status),
        httpStatusCode: response.status,
        postgresCode: typeof payload?.code === 'string' ? payload.code : null,
        databaseCode: databaseCode(payload),
      });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('APPLE_PURCHASE_AUTHORITY_RESPONSE_INVALID');
    return payload;
  }

  return Object.freeze({
    async prepare({ personId, planCode, billingEnvironment, productId }) {
      const payload = await rpc('zstudio_prepare_apple_purchase', {
        p_person_id: uuid(personId, 'APPLE_PURCHASE_AUTHORITY_PERSON_INVALID'),
        p_plan_code: plan(planCode),
        p_billing_environment: environment(billingEnvironment),
        p_product_id: product(productId),
      });
      const result = String(payload.result ?? '');
      if (!['prepared','existing'].includes(result)) fail('APPLE_PURCHASE_AUTHORITY_PREPARE_RESULT_INVALID');
      return Object.freeze({
        result,
        intentId: uuid(payload.intent_id, 'APPLE_PURCHASE_AUTHORITY_INTENT_INVALID'),
        planCode: plan(payload.plan_code),
        productId: product(payload.product_id),
        billingEnvironment: environment(payload.billing_environment),
        trialEligible: payload.trial_eligible === true,
        intentExpiresAt: String(payload.intent_expires_at ?? ''),
      });
    },

    async reconcileIntent({ intentId, personId, billingEnvironment, planCode, productId, sourceSubscriptionRef, providerTrialing }) {
      if (typeof providerTrialing !== 'boolean') fail('APPLE_PURCHASE_AUTHORITY_TRIAL_STATE_INVALID');
      return rpc('zstudio_reconcile_apple_purchase_intent', {
        p_intent_id: uuid(intentId, 'APPLE_PURCHASE_AUTHORITY_INTENT_INVALID'),
        p_person_id: uuid(personId, 'APPLE_PURCHASE_AUTHORITY_PERSON_INVALID'),
        p_billing_environment: environment(billingEnvironment),
        p_plan_code: plan(planCode),
        p_product_id: product(productId),
        p_source_subscription_ref: subscriptionRef(sourceSubscriptionRef),
        p_provider_trialing: providerTrialing,
      });
    },

    async completeIntent({ intentId, personId, billingEnvironment, sourceSubscriptionRef, providerTrialing }) {
      if (typeof providerTrialing !== 'boolean') fail('APPLE_PURCHASE_AUTHORITY_TRIAL_STATE_INVALID');
      return rpc('zstudio_complete_apple_purchase_intent', {
        p_intent_id: uuid(intentId, 'APPLE_PURCHASE_AUTHORITY_INTENT_INVALID'),
        p_person_id: uuid(personId, 'APPLE_PURCHASE_AUTHORITY_PERSON_INVALID'),
        p_billing_environment: environment(billingEnvironment),
        p_source_subscription_ref: subscriptionRef(sourceSubscriptionRef),
        p_provider_trialing: providerTrialing,
      });
    },
  });
}
