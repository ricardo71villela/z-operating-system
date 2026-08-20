import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_TOLERANCE_SECONDS = 300;
const MAX_WEBHOOK_BODY_BYTES = 262_144;
const EVENT_ID_RE = /^evt_[A-Za-z0-9]+$/;

export class StripeWebhookVerificationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'StripeWebhookVerificationError';
    this.code = code;
    this.retryable = false;
  }
}

function fail(code) {
  throw new StripeWebhookVerificationError(code);
}

function signatureHeaderValue(header) {
  if (Array.isArray(header)) return header.join(',');
  return String(header ?? '').trim();
}

function parseSignatureHeader(header) {
  const value = signatureHeaderValue(header);
  if (!value) fail('STRIPE_WEBHOOK_SIGNATURE_MISSING');

  const timestamps = [];
  const signatures = [];
  for (const part of value.split(',')) {
    const [rawKey, ...rawValueParts] = part.split('=');
    const key = String(rawKey ?? '').trim();
    const rawValue = rawValueParts.join('=').trim();
    if (key === 't' && /^\d+$/.test(rawValue)) {
      timestamps.push(Number(rawValue));
    } else if (key === 'v1' && /^[a-fA-F0-9]{64}$/.test(rawValue)) {
      signatures.push(rawValue.toLowerCase());
    }
  }

  if (timestamps.length !== 1 || signatures.length === 0) {
    fail('STRIPE_WEBHOOK_SIGNATURE_INVALID');
  }

  return { timestampSeconds: timestamps[0], signatures };
}

function rawBuffer(rawBody) {
  if (!Buffer.isBuffer(rawBody)) {
    fail('STRIPE_WEBHOOK_RAW_BODY_REQUIRED');
  }
  if (rawBody.byteLength === 0) fail('STRIPE_WEBHOOK_BODY_EMPTY');
  if (rawBody.byteLength > MAX_WEBHOOK_BODY_BYTES) {
    fail('STRIPE_WEBHOOK_BODY_TOO_LARGE');
  }
  return rawBody;
}

function verifyDigest(rawBody, header, secret, nowMs, toleranceSeconds) {
  if (!/^whsec_[A-Za-z0-9]+$/.test(String(secret ?? ''))) {
    fail('STRIPE_WEBHOOK_SECRET_INVALID');
  }

  const { timestampSeconds, signatures } = parseSignatureHeader(header);
  const nowSeconds = Math.floor(nowMs() / 1000);
  if (
    !Number.isSafeInteger(timestampSeconds)
    || Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds
  ) {
    fail('STRIPE_WEBHOOK_TIMESTAMP_OUTSIDE_TOLERANCE');
  }

  const signedPayload = Buffer.concat([
    Buffer.from(`${timestampSeconds}.`, 'utf8'),
    rawBody,
  ]);
  const expected = createHmac('sha256', secret)
    .update(signedPayload)
    .digest();

  const matched = signatures.some((signature) => {
    const supplied = Buffer.from(signature, 'hex');
    return supplied.byteLength === expected.byteLength
      && timingSafeEqual(supplied, expected);
  });

  if (!matched) fail('STRIPE_WEBHOOK_SIGNATURE_MISMATCH');
  return timestampSeconds;
}

function parseVerifiedEvent(rawBody, environment) {
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    fail('STRIPE_WEBHOOK_JSON_INVALID');
  }

  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    fail('STRIPE_WEBHOOK_EVENT_INVALID');
  }
  if (!EVENT_ID_RE.test(String(event.id ?? '')) || event.object !== 'event') {
    fail('STRIPE_WEBHOOK_EVENT_INVALID');
  }
  if (typeof event.type !== 'string' || !event.type.trim()) {
    fail('STRIPE_WEBHOOK_EVENT_TYPE_INVALID');
  }
  if (!Number.isSafeInteger(event.created) || event.created <= 0) {
    fail('STRIPE_WEBHOOK_EVENT_CREATED_INVALID');
  }
  if (typeof event.livemode !== 'boolean') {
    fail('STRIPE_WEBHOOK_EVENT_LIVEMODE_INVALID');
  }
  const expectedLivemode = environment === 'production';
  if (event.livemode !== expectedLivemode) {
    fail('STRIPE_WEBHOOK_EVENT_ENVIRONMENT_MISMATCH');
  }
  if (
    !event.data
    || typeof event.data !== 'object'
    || !event.data.object
    || typeof event.data.object !== 'object'
    || Array.isArray(event.data.object)
  ) {
    fail('STRIPE_WEBHOOK_EVENT_DATA_INVALID');
  }

  return Object.freeze({
    verification: 'verified_stripe_webhook_trigger',
    eventId: event.id,
    eventType: event.type,
    createdMs: event.created * 1000,
    billingEnvironment: environment,
    dataObject: Object.freeze({ ...event.data.object }),
    rawPayloadIncluded: false,
  });
}

export function verifyStripeWebhookTrigger(
  rawBody,
  signatureHeader,
  config,
  {
    nowMs = Date.now,
    toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  } = {},
) {
  const body = rawBuffer(rawBody);
  if (
    !Number.isSafeInteger(toleranceSeconds)
    || toleranceSeconds <= 0
    || toleranceSeconds > 900
  ) {
    fail('STRIPE_WEBHOOK_TOLERANCE_INVALID');
  }
  if (!['sandbox', 'production'].includes(config?.environment)) {
    fail('STRIPE_WEBHOOK_ENVIRONMENT_INVALID');
  }

  verifyDigest(
    body,
    signatureHeader,
    config?.stripeWebhookSecret,
    nowMs,
    toleranceSeconds,
  );
  return parseVerifiedEvent(body, config.environment);
}

export { MAX_WEBHOOK_BODY_BYTES };
