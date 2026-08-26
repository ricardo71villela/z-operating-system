const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASHED_PURCHASE_RE = /^google:play:purchase:[0-9a-f]{64}$/;

export class GooglePlayPreflightRpcError extends Error {
  constructor(code, { retryable = false, httpStatusCode = null, databaseCode = null, cause = null } = {}) {
    super(code);
    this.name = 'GooglePlayPreflightRpcError';
    this.code = code;
    this.retryable = retryable;
    this.httpStatusCode = httpStatusCode;
    this.databaseCode = databaseCode;
    if (cause) this.cause = cause;
  }
}

function uuid(value, code) {
  const result = String(value ?? '').trim().toLowerCase();
  if (!UUID_RE.test(result)) throw new GooglePlayPreflightRpcError(code);
  return result;
}

function plan(value) {
  const result = String(value ?? '').trim().toLowerCase();
  if (!['weekly', 'monthly', 'annual'].includes(result)) {
    throw new GooglePlayPreflightRpcError('GOOGLE_PLAY_PREFLIGHT_PLAN_INVALID');
  }
  return result;
}

function environment(value) {
  const result = String(value ?? '').trim().toLowerCase();
  if (!['sandbox', 'production'].includes(result)) {
    throw new GooglePlayPreflightRpcError('GOOGLE_PLAY_PREFLIGHT_ENVIRONMENT_INVALID');
  }
  return result;
}

function subscriptionRef(value) {
  const result = String(value ?? '').trim();
  if (!HASHED_PURCHASE_RE.test(result)) {
    throw new GooglePlayPreflightRpcError('GOOGLE_PLAY_PREFLIGHT_SUBSCRIPTION_REF_INVALID');
  }
  return result;
}

function retryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function createGooglePlayPreflightClient(
  config,
  { fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {},
) {
  const url = String(config?.supabaseUrl ?? '').trim().replace(/\/+$/, '');
  const secret = String(config?.supabaseSecretKey ?? '').trim();
  if (!/^https:\/\//.test(url) || !/^sb_secret_[A-Za-z0-9_-]+$/.test(secret)) {
    throw new GooglePlayPreflightRpcError('GOOGLE_PLAY_PREFLIGHT_CONFIG_INVALID');
  }

  async function rpc(name, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
          apikey: secret,
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (cause) {
      throw new GooglePlayPreflightRpcError('GOOGLE_PLAY_PREFLIGHT_RPC_UNAVAILABLE', {
        retryable: true,
        cause,
      });
    } finally {
      clearTimeout(timer);
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // Error responses may not be JSON. Successful RPCs always are.
    }

    if (!response.ok) {
      const databaseCode = typeof payload?.code === 'string' ? payload.code : null;
      throw new GooglePlayPreflightRpcError('GOOGLE_PLAY_PREFLIGHT_RPC_FAILED', {
        retryable: retryableStatus(response.status),
        httpStatusCode: response.status,
        databaseCode,
      });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new GooglePlayPreflightRpcError('GOOGLE_PLAY_PREFLIGHT_RPC_RESPONSE_INVALID');
    }
    return payload;
  }

  return Object.freeze({
    async prepare({ personId, planCode, billingEnvironment }) {
      const payload = await rpc('zstudio_prepare_google_play_purchase', {
        p_person_id: uuid(personId, 'GOOGLE_PLAY_PREFLIGHT_PERSON_ID_INVALID'),
        p_plan_code: plan(planCode),
        p_billing_environment: environment(billingEnvironment),
      });
      const result = String(payload.result ?? '');
      if (!['prepared', 'existing'].includes(result)) {
        throw new GooglePlayPreflightRpcError('GOOGLE_PLAY_PREFLIGHT_PREPARE_RESULT_INVALID');
      }
      return Object.freeze({
        result,
        intentId: uuid(payload.intent_id, 'GOOGLE_PLAY_PREFLIGHT_INTENT_ID_INVALID'),
        planCode: plan(payload.plan_code),
        billingEnvironment: environment(payload.billing_environment),
        trialEligible: payload.trial_eligible === true,
        intentExpiresAt: String(payload.intent_expires_at ?? ''),
      });
    },

    async bind({ intentId, personId, billingEnvironment, planCode, sourceSubscriptionRef, providerTrialing }) {
      if (typeof providerTrialing !== 'boolean') {
        throw new GooglePlayPreflightRpcError('GOOGLE_PLAY_PREFLIGHT_TRIAL_STATE_INVALID');
      }
      return rpc('zstudio_bind_google_play_purchase_intent', {
        p_intent_id: uuid(intentId, 'GOOGLE_PLAY_PREFLIGHT_INTENT_ID_INVALID'),
        p_person_id: uuid(personId, 'GOOGLE_PLAY_PREFLIGHT_PERSON_ID_INVALID'),
        p_billing_environment: environment(billingEnvironment),
        p_plan_code: plan(planCode),
        p_source_subscription_ref: subscriptionRef(sourceSubscriptionRef),
        p_provider_trialing: providerTrialing,
      });
    },

    async complete({ intentId, personId, billingEnvironment, sourceSubscriptionRef }) {
      return rpc('zstudio_complete_google_play_purchase_intent', {
        p_intent_id: uuid(intentId, 'GOOGLE_PLAY_PREFLIGHT_INTENT_ID_INVALID'),
        p_person_id: uuid(personId, 'GOOGLE_PLAY_PREFLIGHT_PERSON_ID_INVALID'),
        p_billing_environment: environment(billingEnvironment),
        p_source_subscription_ref: subscriptionRef(sourceSubscriptionRef),
      });
    },
  });
}
