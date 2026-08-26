const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUB_REF_RE = /^google:play:purchase:[0-9a-f]{64}$/;
const KINDS = new Set(['subscription','voided_subscription','one_time_ignored','pending_refund_review','test']);

export class GooglePlayRtdnAuthorityRpcError extends Error {
  constructor(code, { retryable = false, httpStatusCode = null, databaseCode = null, postgresCode = null, cause = null } = {}) {
    super(code);
    this.name = 'GooglePlayRtdnAuthorityRpcError';
    this.code = code;
    this.retryable = retryable;
    this.httpStatusCode = httpStatusCode;
    this.databaseCode = databaseCode;
    this.postgresCode = postgresCode;
    if (cause) this.cause = cause;
  }
}
function fail(code, options) { throw new GooglePlayRtdnAuthorityRpcError(code, options); }
function retryableStatus(status) { return status === 408 || status === 425 || status === 429 || status >= 500; }
function requiredUuid(value, code) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!UUID_RE.test(text)) fail(code);
  return text;
}
function optionalUuid(value, code) {
  if (value == null || value === '') return null;
  return requiredUuid(value, code);
}
function requiredRef(value, code) {
  const text = String(value ?? '').trim();
  if (!SUB_REF_RE.test(text)) fail(code);
  return text;
}
function requiredMessageId(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,40}$/.test(text)) fail('GOOGLE_PLAY_RTDN_AUTHORITY_MESSAGE_ID_INVALID');
  return text;
}
function databaseCode(payload) {
  const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
  return /^(GOOGLE_PLAY|COMMERCIAL)_[A-Z0-9_]+$/.test(message) ? message : null;
}

export function createGooglePlayRtdnAuthorityClient(config, { fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
  const url = String(config?.supabaseUrl ?? '').trim().replace(/\/+$/, '');
  const secret = String(config?.supabaseSecretKey ?? '').trim();
  if (!/^https:\/\//.test(url) || !/^sb_secret_[A-Za-z0-9_-]+$/.test(secret)) fail('GOOGLE_PLAY_RTDN_AUTHORITY_CONFIG_INVALID');
  if (typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs <= 0) fail('GOOGLE_PLAY_RTDN_AUTHORITY_CLIENT_INVALID');

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
      fail('GOOGLE_PLAY_RTDN_AUTHORITY_RPC_UNAVAILABLE', { retryable: true, cause });
    } finally {
      clearTimeout(timer);
    }
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      fail('GOOGLE_PLAY_RTDN_AUTHORITY_RPC_FAILED', {
        retryable: retryableStatus(response.status),
        httpStatusCode: response.status,
        postgresCode: typeof payload?.code === 'string' ? payload.code : null,
        databaseCode: databaseCode(payload),
      });
    }
    return payload;
  }

  return Object.freeze({
    async isProcessed(messageId) {
      const payload = await rpc('zstudio_google_play_rtdn_is_processed', { p_message_id: requiredMessageId(messageId) });
      if (typeof payload !== 'boolean') fail('GOOGLE_PLAY_RTDN_AUTHORITY_PROCESSED_RESPONSE_INVALID');
      return payload;
    },

    async resolveIdentity({ billingEnvironment, sourceSubscriptionRef, externalAccountId, planCode, providerTrialing }) {
      const environment = String(billingEnvironment ?? '').trim().toLowerCase();
      const plan = String(planCode ?? '').trim().toLowerCase();
      if (!['sandbox','production'].includes(environment)) fail('GOOGLE_PLAY_RTDN_AUTHORITY_ENVIRONMENT_INVALID');
      if (!['weekly','monthly','annual'].includes(plan)) fail('GOOGLE_PLAY_RTDN_AUTHORITY_PLAN_INVALID');
      if (typeof providerTrialing !== 'boolean') fail('GOOGLE_PLAY_RTDN_AUTHORITY_TRIAL_STATE_INVALID');
      const payload = await rpc('zstudio_resolve_google_play_rtdn_identity', {
        p_billing_environment: environment,
        p_source_subscription_ref: requiredRef(sourceSubscriptionRef, 'GOOGLE_PLAY_RTDN_AUTHORITY_SUBSCRIPTION_REF_INVALID'),
        p_external_account_id: optionalUuid(externalAccountId, 'GOOGLE_PLAY_RTDN_AUTHORITY_EXTERNAL_ACCOUNT_INVALID'),
        p_plan_code: plan,
        p_provider_trialing: providerTrialing,
      });
      if (!payload || payload.result !== 'resolved') fail('GOOGLE_PLAY_RTDN_AUTHORITY_IDENTITY_RESPONSE_INVALID');
      return Object.freeze({
        personId: requiredUuid(payload.person_id, 'GOOGLE_PLAY_RTDN_AUTHORITY_PERSON_RESPONSE_INVALID'),
        intentId: optionalUuid(payload.intent_id, 'GOOGLE_PLAY_RTDN_AUTHORITY_INTENT_RESPONSE_INVALID'),
        existingSubscription: payload.existing_subscription === true,
        trialReserved: payload.trial_reserved === true,
      });
    },

    async recordPendingRefundReview({
      messageId,
      pendingRefundToken,
      orderId,
      refundReason,
      obfuscatedAccountId,
      eventTimeMs,
    }) {
      const token = String(pendingRefundToken ?? '');
      const order = String(orderId ?? '').trim();
      const account = obfuscatedAccountId == null ? null : String(obfuscatedAccountId).trim().toLowerCase();
      if (!token || token.length > 4096 || /[\u0000-\u001f\u007f\s]/.test(token)) {
        fail('GOOGLE_PLAY_RTDN_AUTHORITY_PENDING_REFUND_TOKEN_INVALID');
      }
      if (!order || order.length > 256) fail('GOOGLE_PLAY_RTDN_AUTHORITY_ORDER_ID_INVALID');
      if (!Number.isInteger(refundReason) || refundReason <= 0 || refundReason > 1000) {
        fail('GOOGLE_PLAY_RTDN_AUTHORITY_REFUND_REASON_INVALID');
      }
      if (!Number.isFinite(eventTimeMs) || eventTimeMs <= 0) fail('GOOGLE_PLAY_RTDN_AUTHORITY_EVENT_TIME_INVALID');
      const payload = await rpc('zstudio_record_google_play_pending_refund_review', {
        p_message_id: requiredMessageId(messageId),
        p_pending_refund_token: token,
        p_order_id: order,
        p_refund_reason: refundReason,
        p_obfuscated_account_id: account,
        p_event_time: new Date(eventTimeMs).toISOString(),
      });
      if (!payload || !['recorded','duplicate'].includes(payload.result)) {
        fail('GOOGLE_PLAY_RTDN_AUTHORITY_REFUND_REVIEW_RESPONSE_INVALID');
      }
      return Object.freeze({ result: payload.result });
    },

    async markProcessed({ messageId, notificationKind, notificationType, eventTimeMs, sourceSubscriptionRef = null }) {
      const kind = String(notificationKind ?? '').trim().toLowerCase();
      if (!KINDS.has(kind)) fail('GOOGLE_PLAY_RTDN_AUTHORITY_KIND_INVALID');
      if (notificationType != null && (!Number.isInteger(notificationType) || notificationType < 0 || notificationType > 1000)) {
        fail('GOOGLE_PLAY_RTDN_AUTHORITY_NOTIFICATION_TYPE_INVALID');
      }
      if (!Number.isFinite(eventTimeMs) || eventTimeMs <= 0) fail('GOOGLE_PLAY_RTDN_AUTHORITY_EVENT_TIME_INVALID');
      const payload = await rpc('zstudio_mark_google_play_rtdn_processed', {
        p_message_id: requiredMessageId(messageId),
        p_notification_kind: kind,
        p_notification_type: notificationType ?? null,
        p_event_time: new Date(eventTimeMs).toISOString(),
        p_source_subscription_ref: sourceSubscriptionRef == null ? null : requiredRef(sourceSubscriptionRef, 'GOOGLE_PLAY_RTDN_AUTHORITY_SUBSCRIPTION_REF_INVALID'),
      });
      if (!payload || !['processed','duplicate'].includes(payload.result)) fail('GOOGLE_PLAY_RTDN_AUTHORITY_MARK_RESPONSE_INVALID');
      return Object.freeze({ result: payload.result });
    },
  });
}
