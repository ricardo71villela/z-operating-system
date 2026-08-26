import { randomUUID } from 'node:crypto';
import {
  MAX_WEBHOOK_BODY_BYTES,
  StripeWebhookVerificationError,
} from './stripe-webhook-signature.js';

export class StripeWebhookHttpError extends Error {
  constructor(code, { retryable = false } = {}) {
    super(code);
    this.name = 'StripeWebhookHttpError';
    this.code = code;
    this.retryable = retryable;
  }
}

function fail(code, options) {
  throw new StripeWebhookHttpError(code, options);
}

function responseHeaders(extra = {}) {
  return {
    'Cache-Control': 'no-store',
    ...extra,
  };
}

function sendJson(res, status, payload, extra = {}) {
  res.writeHead(status, responseHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    ...extra,
  }));
  res.end(JSON.stringify(payload));
}

function signatureHeader(req) {
  return req?.headers?.['stripe-signature']
    ?? req?.headers?.['Stripe-Signature']
    ?? '';
}

export async function readStripeWebhookRawBody(req) {
  if (Buffer.isBuffer(req?.body)) {
    if (req.body.byteLength === 0) fail('STRIPE_WEBHOOK_BODY_EMPTY');
    if (req.body.byteLength > MAX_WEBHOOK_BODY_BYTES) {
      fail('STRIPE_WEBHOOK_BODY_TOO_LARGE');
    }
    return req.body;
  }

  if (typeof req?.body === 'string') {
    const body = Buffer.from(req.body, 'utf8');
    if (body.byteLength === 0) fail('STRIPE_WEBHOOK_BODY_EMPTY');
    if (body.byteLength > MAX_WEBHOOK_BODY_BYTES) {
      fail('STRIPE_WEBHOOK_BODY_TOO_LARGE');
    }
    return body;
  }

  // Never reconstruct a parsed JSON object. Stripe signature verification
  // requires the exact bytes that were signed by Stripe.
  if (req?.body != null) {
    fail('STRIPE_WEBHOOK_RAW_BODY_REQUIRED');
  }

  if (!req || typeof req[Symbol.asyncIterator] !== 'function') {
    fail('STRIPE_WEBHOOK_RAW_BODY_REQUIRED');
  }

  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk);
      total += buffer.byteLength;
      if (total > MAX_WEBHOOK_BODY_BYTES) {
        fail('STRIPE_WEBHOOK_BODY_TOO_LARGE');
      }
      chunks.push(buffer);
    }
  } catch (error) {
    if (error instanceof StripeWebhookHttpError) throw error;
    fail('STRIPE_WEBHOOK_BODY_READ_FAILED', { retryable: true });
  }

  const body = Buffer.concat(chunks, total);
  if (body.byteLength === 0) fail('STRIPE_WEBHOOK_BODY_EMPTY');
  return body;
}

function retryableProcessingError(error) {
  return error?.retryable === true;
}

export function createStripeWebhookHttpHandler({
  loadConfig,
  verifyTrigger,
  reconcileTrigger,
  createStripeClient,
  createIdentityClient,
  createWriterClient,
  createPreflightClient,
  resolvePlan,
  buildWriterArgs,
} = {}) {
  for (const [name, value] of Object.entries({
    loadConfig,
    verifyTrigger,
    reconcileTrigger,
    createStripeClient,
    createIdentityClient,
    createWriterClient,
    createPreflightClient,
    resolvePlan,
    buildWriterArgs,
  })) {
    if (typeof value !== 'function') {
      throw new Error(`STRIPE_WEBHOOK_HTTP_DEPENDENCY_INVALID:${name}`);
    }
  }

  return async function handler(req, res) {
    const requestId = randomUUID();

    if (req?.method !== 'POST') {
      sendJson(
        res,
        405,
        { code: 'METHOD_NOT_ALLOWED', request_id: requestId },
        { Allow: 'POST' },
      );
      return;
    }

    let rawBody;
    try {
      rawBody = await readStripeWebhookRawBody(req);
    } catch (error) {
      const tooLarge = error?.code === 'STRIPE_WEBHOOK_BODY_TOO_LARGE';
      const retryable = retryableProcessingError(error);
      sendJson(
        res,
        tooLarge ? 413 : retryable ? 503 : 400,
        {
          code: tooLarge
            ? 'REQUEST_TOO_LARGE'
            : retryable
              ? 'WEBHOOK_BODY_UNAVAILABLE'
              : 'WEBHOOK_RAW_BODY_REQUIRED',
          request_id: requestId,
        },
        retryable ? { 'Retry-After': '5' } : {},
      );
      return;
    }

    let config;
    try {
      config = loadConfig();
    } catch {
      sendJson(
        res,
        503,
        { code: 'COMMERCIAL_CONFIG_UNAVAILABLE', request_id: requestId },
        { 'Retry-After': '5' },
      );
      return;
    }

    let trigger;
    try {
      trigger = verifyTrigger(
        rawBody,
        signatureHeader(req),
        config,
      );
    } catch (error) {
      if (error instanceof StripeWebhookVerificationError) {
        sendJson(
          res,
          error.code === 'STRIPE_WEBHOOK_BODY_TOO_LARGE' ? 413 : 400,
          { code: 'STRIPE_WEBHOOK_REJECTED', request_id: requestId },
        );
        return;
      }
      sendJson(
        res,
        400,
        { code: 'STRIPE_WEBHOOK_REJECTED', request_id: requestId },
      );
      return;
    }

    let result;
    try {
      result = await reconcileTrigger(trigger, config, {
        stripeClient: createStripeClient(config),
        identityClient: createIdentityClient(config),
        writerClient: createWriterClient(config),
        preflightClient: createPreflightClient(config),
        resolvePlan,
        buildWriterArgs,
      });
    } catch (error) {
      const retryable = retryableProcessingError(error);
      sendJson(
        res,
        retryable ? 503 : 500,
        {
          code: retryable
            ? 'STRIPE_WEBHOOK_PROCESSING_UNAVAILABLE'
            : 'STRIPE_WEBHOOK_PROCESSING_FAILED',
          request_id: requestId,
        },
        retryable ? { 'Retry-After': '5' } : {},
      );
      return;
    }

    if (
      !result
      || typeof result !== 'object'
      || result.rawProviderPayloadIncluded === true
    ) {
      sendJson(
        res,
        503,
        { code: 'STRIPE_WEBHOOK_PROCESSING_INVALID', request_id: requestId },
        { 'Retry-After': '5' },
      );
      return;
    }

    // Do not echo provider event/customer/subscription data back to callers.
    sendJson(res, 200, { received: true, request_id: requestId });
  };
}
