const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUB_REF_RE = /^google:play:purchase:[0-9a-f]{64}$/;
const EVENT_REF_RE = /^google:play:event:[A-Za-z0-9._:-]+:snapshot:[0-9a-f]{64}$/;
const PRODUCT_REF_RE = /^google:play:product:zstudio\.access:base_plan:(weekly|monthly|annual)$/;

export class GooglePlayAuthorityRpcError extends Error {
  constructor(code, {
    retryable = false,
    httpStatusCode = null,
    databaseCode = null,
    postgresCode = null,
    cause = null,
  } = {}) {
    super(code);
    this.name = 'GooglePlayAuthorityRpcError';
    this.code = code;
    this.retryable = retryable;
    this.httpStatusCode = httpStatusCode;
    this.databaseCode = databaseCode;
    this.postgresCode = postgresCode;
    if (cause) this.cause = cause;
  }
}

function requiredUuid(value, code) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!UUID_RE.test(normalized)) throw new GooglePlayAuthorityRpcError(code);
  return normalized;
}

function requiredEnum(value, values, code) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!values.includes(normalized)) throw new GooglePlayAuthorityRpcError(code);
  return normalized;
}

function requiredRef(value, pattern, code) {
  const normalized = String(value ?? '').trim();
  if (!pattern.test(normalized)) throw new GooglePlayAuthorityRpcError(code);
  return normalized;
}

function requiredMs(value, code) {
  if (!Number.isFinite(value) || value <= 0) throw new GooglePlayAuthorityRpcError(code);
  return value;
}

function retryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function databaseCode(payload) {
  const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
  return /^(GOOGLE_PLAY|COMMERCIAL)_[A-Z0-9_]+$/.test(message) ? message : null;
}

function resultObject(payload, allowed, code) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new GooglePlayAuthorityRpcError(code);
  }
  const result = String(payload.result ?? '').trim();
  if (!allowed.includes(result)) throw new GooglePlayAuthorityRpcError(code);
  return Object.freeze({
    result,
    intentId: payload.intent_id == null
      ? null
      : requiredUuid(payload.intent_id, `${code}_INTENT_ID`),
    state: payload.state == null ? null : String(payload.state),
    planCode: payload.plan_code == null ? null : String(payload.plan_code),
    trialReserved: payload.trial_reserved == null ? null : payload.trial_reserved === true,
    sourceSubscriptionRef: payload.source_subscription_ref == null
      ? null
      : requiredRef(payload.source_subscription_ref, SUB_REF_RE, `${code}_SUBSCRIPTION_REF`),
    subscriptionId: payload.subscription_id == null
      ? null
      : requiredUuid(payload.subscription_id, `${code}_SUBSCRIPTION_ID`),
    subscriptionStatus: payload.subscription_status == null ? null : String(payload.subscription_status),
    studioAccessStatus: payload.studio_access_status == null ? null : String(payload.studio_access_status),
    aiAccessStatus: payload.ai_access_status == null ? null : String(payload.ai_access_status),
    processingStatus: payload.processing_status == null ? null : String(payload.processing_status),
  });
}

export function createGooglePlayAuthorityClient(
  config,
  { fetchImpl = globalThis.fetch, timeoutMs = 10_000 } = {},
) {
  const supabaseUrl = String(config?.supabaseUrl ?? '').trim().replace(/\/+$/, '');
  const secret = String(config?.supabaseSecretKey ?? '').trim();
  if (!/^https:\/\//.test(supabaseUrl) || !/^sb_secret_[A-Za-z0-9_-]+$/.test(secret)) {
    throw new GooglePlayAuthorityRpcError('GOOGLE_PLAY_AUTHORITY_CONFIG_INVALID');
  }
  if (typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new GooglePlayAuthorityRpcError('GOOGLE_PLAY_AUTHORITY_CLIENT_INVALID');
  }

  async function rpc(name, body, allowedResults, responseCode) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
          apikey: secret,
          Authorization: `Bearer ${secret}`,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (cause) {
      throw new GooglePlayAuthorityRpcError('GOOGLE_PLAY_AUTHORITY_RPC_UNAVAILABLE', {
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
      // Handled below. Successful authority calls always return JSON.
    }

    if (!response.ok) {
      throw new GooglePlayAuthorityRpcError('GOOGLE_PLAY_AUTHORITY_RPC_FAILED', {
        retryable: retryableStatus(response.status),
        httpStatusCode: response.status,
        postgresCode: typeof payload?.code === 'string' ? payload.code : null,
        databaseCode: databaseCode(payload),
      });
    }
    return resultObject(payload, allowedResults, responseCode);
  }

  return Object.freeze({
    async reconcileIntent({
      intentId,
      personId,
      billingEnvironment,
      planCode,
      sourceSubscriptionRef,
      providerTrialing,
    }) {
      if (typeof providerTrialing !== 'boolean') {
        throw new GooglePlayAuthorityRpcError('GOOGLE_PLAY_AUTHORITY_TRIAL_STATE_INVALID');
      }
      return rpc(
        'zstudio_reconcile_google_play_purchase_intent',
        {
          p_intent_id: requiredUuid(intentId, 'GOOGLE_PLAY_AUTHORITY_INTENT_ID_INVALID'),
          p_person_id: requiredUuid(personId, 'GOOGLE_PLAY_AUTHORITY_PERSON_ID_INVALID'),
          p_billing_environment: requiredEnum(billingEnvironment, ['sandbox', 'production'], 'GOOGLE_PLAY_AUTHORITY_ENVIRONMENT_INVALID'),
          p_plan_code: requiredEnum(planCode, ['weekly', 'monthly', 'annual'], 'GOOGLE_PLAY_AUTHORITY_PLAN_INVALID'),
          p_source_subscription_ref: requiredRef(sourceSubscriptionRef, SUB_REF_RE, 'GOOGLE_PLAY_AUTHORITY_SUBSCRIPTION_REF_INVALID'),
          p_provider_trialing: providerTrialing,
        },
        ['purchase_seen', 'completed'],
        'GOOGLE_PLAY_AUTHORITY_RECONCILE_RESPONSE_INVALID',
      );
    },

    async claimConsumedTrial({
      intentId,
      personId,
      sourceSubscriptionRef,
      billingEnvironment,
      claimedAtMs,
    }) {
      return rpc(
        'zstudio_claim_verified_google_play_trial_consumption',
        {
          p_intent_id: requiredUuid(intentId, 'GOOGLE_PLAY_AUTHORITY_INTENT_ID_INVALID'),
          p_person_id: requiredUuid(personId, 'GOOGLE_PLAY_AUTHORITY_PERSON_ID_INVALID'),
          p_source_subscription_ref: requiredRef(sourceSubscriptionRef, SUB_REF_RE, 'GOOGLE_PLAY_AUTHORITY_SUBSCRIPTION_REF_INVALID'),
          p_billing_environment: requiredEnum(billingEnvironment, ['sandbox', 'production'], 'GOOGLE_PLAY_AUTHORITY_ENVIRONMENT_INVALID'),
          p_claimed_at: new Date(requiredMs(claimedAtMs, 'GOOGLE_PLAY_AUTHORITY_CLAIM_TIME_INVALID')).toISOString(),
        },
        ['claimed', 'duplicate', 'sandbox_ignored'],
        'GOOGLE_PLAY_AUTHORITY_CLAIM_RESPONSE_INVALID',
      );
    },

    async applyPause({
      personId,
      billingEnvironment,
      sourceEventRef,
      sourceSubscriptionRef,
      sourceProductRef,
      planCode,
      effectiveAtMs,
    }) {
      const plan = requiredEnum(planCode, ['weekly', 'monthly', 'annual'], 'GOOGLE_PLAY_AUTHORITY_PLAN_INVALID');
      const productRef = requiredRef(sourceProductRef, PRODUCT_REF_RE, 'GOOGLE_PLAY_AUTHORITY_PRODUCT_REF_INVALID');
      if (productRef !== `google:play:product:zstudio.access:base_plan:${plan}`) {
        throw new GooglePlayAuthorityRpcError('GOOGLE_PLAY_AUTHORITY_PRODUCT_PLAN_MISMATCH');
      }
      return rpc(
        'zstudio_apply_verified_google_play_pause_event',
        {
          p_person_id: requiredUuid(personId, 'GOOGLE_PLAY_AUTHORITY_PERSON_ID_INVALID'),
          p_billing_environment: requiredEnum(billingEnvironment, ['sandbox', 'production'], 'GOOGLE_PLAY_AUTHORITY_ENVIRONMENT_INVALID'),
          p_source_event_ref: requiredRef(sourceEventRef, EVENT_REF_RE, 'GOOGLE_PLAY_AUTHORITY_EVENT_REF_INVALID'),
          p_source_subscription_ref: requiredRef(sourceSubscriptionRef, SUB_REF_RE, 'GOOGLE_PLAY_AUTHORITY_SUBSCRIPTION_REF_INVALID'),
          p_source_product_ref: productRef,
          p_plan_code: plan,
          p_effective_at: new Date(requiredMs(effectiveAtMs, 'GOOGLE_PLAY_AUTHORITY_EFFECTIVE_AT_INVALID')).toISOString(),
        },
        ['applied', 'duplicate', 'ignored_stale', 'applied_same_state'],
        'GOOGLE_PLAY_AUTHORITY_PAUSE_RESPONSE_INVALID',
      );
    },

    async completeIntent({ intentId, personId, billingEnvironment, sourceSubscriptionRef }) {
      return rpc(
        'zstudio_complete_google_play_purchase_intent',
        {
          p_intent_id: requiredUuid(intentId, 'GOOGLE_PLAY_AUTHORITY_INTENT_ID_INVALID'),
          p_person_id: requiredUuid(personId, 'GOOGLE_PLAY_AUTHORITY_PERSON_ID_INVALID'),
          p_billing_environment: requiredEnum(billingEnvironment, ['sandbox', 'production'], 'GOOGLE_PLAY_AUTHORITY_ENVIRONMENT_INVALID'),
          p_source_subscription_ref: requiredRef(sourceSubscriptionRef, SUB_REF_RE, 'GOOGLE_PLAY_AUTHORITY_SUBSCRIPTION_REF_INVALID'),
        },
        ['completed', 'duplicate'],
        'GOOGLE_PLAY_AUTHORITY_COMPLETE_RESPONSE_INVALID',
      );
    },

    async failIntent({ intentId, personId, billingEnvironment, sourceSubscriptionRef }) {
      return rpc(
        'zstudio_fail_google_play_purchase_intent',
        {
          p_intent_id: requiredUuid(intentId, 'GOOGLE_PLAY_AUTHORITY_INTENT_ID_INVALID'),
          p_person_id: requiredUuid(personId, 'GOOGLE_PLAY_AUTHORITY_PERSON_ID_INVALID'),
          p_billing_environment: requiredEnum(billingEnvironment, ['sandbox', 'production'], 'GOOGLE_PLAY_AUTHORITY_ENVIRONMENT_INVALID'),
          p_source_subscription_ref: requiredRef(sourceSubscriptionRef, SUB_REF_RE, 'GOOGLE_PLAY_AUTHORITY_SUBSCRIPTION_REF_INVALID'),
        },
        ['failed', 'duplicate'],
        'GOOGLE_PLAY_AUTHORITY_FAIL_RESPONSE_INVALID',
      );
    },
  });
}
