const SUBSCRIPTION_TYPES = new Set([1,2,3,4,5,6,7,8,9,10,11,12,13,17,18,19,20,22]);
const NOTIFICATION_KEYS = [
  'subscriptionNotification',
  'oneTimeProductNotification',
  'voidedPurchaseNotification',
  'pendingRefundReviewNotification',
  'testNotification',
];

export class GooglePlayRtdnParseError extends Error {
  constructor(code) {
    super(code);
    this.name = 'GooglePlayRtdnParseError';
    this.code = code;
  }
}
function fail(code) { throw new GooglePlayRtdnParseError(code); }

function parseBody(body) {
  if (Buffer.isBuffer(body)) {
    if (body.length > 131072) fail('GOOGLE_PLAY_RTDN_BODY_TOO_LARGE');
    try { return JSON.parse(body.toString('utf8')); } catch { fail('GOOGLE_PLAY_RTDN_BODY_INVALID'); }
  }
  if (typeof body === 'string') {
    if (Buffer.byteLength(body, 'utf8') > 131072) fail('GOOGLE_PLAY_RTDN_BODY_TOO_LARGE');
    try { return JSON.parse(body); } catch { fail('GOOGLE_PLAY_RTDN_BODY_INVALID'); }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('GOOGLE_PLAY_RTDN_BODY_INVALID');
  return body;
}
function requiredString(value, code, max = 4096) {
  const result = String(value ?? '').trim();
  if (!result || result.length > max) fail(code);
  return result;
}
function opaqueToken(value, code) {
  const token = String(value ?? '');
  if (!token || token.length > 4096 || /[\u0000-\u001f\u007f\s]/.test(token)) fail(code);
  return token;
}
function eventTime(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,16}$/.test(text)) fail('GOOGLE_PLAY_RTDN_EVENT_TIME_INVALID');
  const ms = Number(text);
  if (!Number.isSafeInteger(ms) || ms <= 0) fail('GOOGLE_PLAY_RTDN_EVENT_TIME_INVALID');
  return ms;
}
function base64Json(value) {
  const data = requiredString(value, 'GOOGLE_PLAY_RTDN_DATA_REQUIRED', 100000);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 !== 0) fail('GOOGLE_PLAY_RTDN_DATA_BASE64_INVALID');
  let decoded;
  try { decoded = Buffer.from(data, 'base64'); } catch { fail('GOOGLE_PLAY_RTDN_DATA_BASE64_INVALID'); }
  if (decoded.length > 65536 || decoded.toString('base64') !== data) fail('GOOGLE_PLAY_RTDN_DATA_BASE64_INVALID');
  try { return JSON.parse(decoded.toString('utf8')); } catch { fail('GOOGLE_PLAY_RTDN_DATA_JSON_INVALID'); }
}

export function parseGooglePlayRtdnEnvelope(body, config) {
  const envelope = parseBody(body);
  const expectedSubscription = String(config?.pubsubSubscription ?? '').trim();
  const packageName = String(config?.packageName ?? '').trim();
  if (!expectedSubscription || !packageName) fail('GOOGLE_PLAY_RTDN_PARSER_CONFIG_INVALID');
  if (envelope.subscription !== expectedSubscription) fail('GOOGLE_PLAY_RTDN_SUBSCRIPTION_MISMATCH');
  const message = envelope.message;
  if (!message || typeof message !== 'object' || Array.isArray(message)) fail('GOOGLE_PLAY_RTDN_MESSAGE_INVALID');
  const messageId = requiredString(message.messageId ?? message.message_id, 'GOOGLE_PLAY_RTDN_MESSAGE_ID_INVALID', 40);
  if (!/^\d+$/.test(messageId)) fail('GOOGLE_PLAY_RTDN_MESSAGE_ID_INVALID');
  if (message.messageId != null && message.message_id != null && String(message.messageId) !== String(message.message_id)) {
    fail('GOOGLE_PLAY_RTDN_MESSAGE_ID_CONFLICT');
  }
  const developer = base64Json(message.data);
  if (!developer || typeof developer !== 'object' || Array.isArray(developer)) fail('GOOGLE_PLAY_RTDN_DEVELOPER_NOTIFICATION_INVALID');
  if (developer.version !== '1.0' || developer.packageName !== packageName) fail('GOOGLE_PLAY_RTDN_DEVELOPER_NOTIFICATION_MISMATCH');
  const present = NOTIFICATION_KEYS.filter((key) => developer[key] != null);
  if (present.length !== 1) fail('GOOGLE_PLAY_RTDN_NOTIFICATION_KIND_INVALID');
  const eventTimeMs = eventTime(developer.eventTimeMillis);
  const publishRaw = message.publishTime ?? message.publish_time ?? null;
  const publishTimeMs = publishRaw == null ? null : Date.parse(String(publishRaw));
  if (publishRaw != null && !Number.isFinite(publishTimeMs)) fail('GOOGLE_PLAY_RTDN_PUBLISH_TIME_INVALID');
  const key = present[0];
  const payload = developer[key];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('GOOGLE_PLAY_RTDN_NOTIFICATION_INVALID');

  const common = { messageId, eventTimeMs, publishTimeMs, rawProviderPayloadIncluded: false };
  if (key === 'subscriptionNotification') {
    if (payload.version !== '1.0' || !SUBSCRIPTION_TYPES.has(payload.notificationType)) fail('GOOGLE_PLAY_RTDN_SUBSCRIPTION_NOTIFICATION_INVALID');
    return Object.freeze({ ...common, kind: 'subscription', notificationType: payload.notificationType, purchaseToken: opaqueToken(payload.purchaseToken, 'GOOGLE_PLAY_RTDN_PURCHASE_TOKEN_INVALID') });
  }
  if (key === 'voidedPurchaseNotification') {
    if (![1,2].includes(payload.productType) || ![1,2].includes(payload.refundType)) fail('GOOGLE_PLAY_RTDN_VOIDED_NOTIFICATION_INVALID');
    const voidedToken = opaqueToken(payload.purchaseToken, 'GOOGLE_PLAY_RTDN_PURCHASE_TOKEN_INVALID');
    const voidedOrderId = requiredString(payload.orderId, 'GOOGLE_PLAY_RTDN_ORDER_ID_INVALID', 256);
    if (payload.productType === 2) return Object.freeze({ ...common, kind: 'one_time_ignored', notificationType: null, purchaseToken: null });
    return Object.freeze({
      ...common,
      kind: 'voided_subscription',
      notificationType: null,
      refundType: payload.refundType,
      orderId: voidedOrderId,
      purchaseToken: voidedToken,
    });
  }
  if (key === 'oneTimeProductNotification') {
    if (payload.version !== '1.0' || ![1,2].includes(payload.notificationType)) fail('GOOGLE_PLAY_RTDN_ONE_TIME_NOTIFICATION_INVALID');
    opaqueToken(payload.purchaseToken, 'GOOGLE_PLAY_RTDN_PURCHASE_TOKEN_INVALID');
    requiredString(payload.sku, 'GOOGLE_PLAY_RTDN_SKU_INVALID', 256);
    return Object.freeze({ ...common, kind: 'one_time_ignored', notificationType: payload.notificationType, purchaseToken: null });
  }
  if (key === 'pendingRefundReviewNotification') {
    if (payload.version !== '1.0' || !Number.isInteger(payload.refundReason) || payload.refundReason <= 0 || payload.refundReason > 1000) {
      fail('GOOGLE_PLAY_RTDN_PENDING_REFUND_NOTIFICATION_INVALID');
    }
    const account = payload.obfuscatedAccountId == null ? null : requiredString(payload.obfuscatedAccountId, 'GOOGLE_PLAY_RTDN_REFUND_ACCOUNT_ID_INVALID', 256);
    return Object.freeze({
      ...common,
      kind: 'pending_refund_review',
      notificationType: null,
      purchaseToken: null,
      pendingRefundToken: opaqueToken(payload.pendingRefundToken, 'GOOGLE_PLAY_RTDN_PENDING_REFUND_TOKEN_INVALID'),
      orderId: requiredString(payload.orderId, 'GOOGLE_PLAY_RTDN_ORDER_ID_INVALID', 256),
      refundReason: payload.refundReason,
      obfuscatedAccountId: account,
    });
  }
  if (payload.version !== '1.0') fail('GOOGLE_PLAY_RTDN_TEST_NOTIFICATION_INVALID');
  return Object.freeze({ ...common, kind: 'test', notificationType: null, purchaseToken: null });
}
