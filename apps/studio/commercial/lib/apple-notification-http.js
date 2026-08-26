import { randomUUID } from 'node:crypto';
import { CommercialWriterRpcError } from './commercial-writer-client.js';

const MAX_NOTIFICATION_BODY_BYTES = 262_144;

function parseBody(req) {
  if (Buffer.isBuffer(req?.body)) {
    if (req.body.byteLength > MAX_NOTIFICATION_BODY_BYTES) {
      throw new Error('APPLE_NOTIFICATION_REQUEST_TOO_LARGE');
    }
    return JSON.parse(req.body.toString('utf8'));
  }

  if (typeof req?.body === 'string') {
    if (Buffer.byteLength(req.body, 'utf8') > MAX_NOTIFICATION_BODY_BYTES) {
      throw new Error('APPLE_NOTIFICATION_REQUEST_TOO_LARGE');
    }
    return JSON.parse(req.body);
  }

  return req?.body;
}

function signedPayloadFromBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('APPLE_NOTIFICATION_REQUEST_INVALID');
  }

  if (Object.keys(body).sort().join('\n') !== 'signedPayload') {
    throw new Error('APPLE_NOTIFICATION_REQUEST_INVALID');
  }

  const signedPayload = String(body.signedPayload ?? '').trim();
  if (
    !signedPayload
    || Buffer.byteLength(signedPayload, 'utf8') > MAX_NOTIFICATION_BODY_BYTES
  ) {
    throw new Error('APPLE_NOTIFICATION_SIGNED_PAYLOAD_INVALID');
  }

  return signedPayload;
}

function responseHeaders(extra = {}) {
  return {
    'Cache-Control': 'no-store',
    ...extra,
  };
}

function sendEmpty(res, status, extra = {}) {
  res.writeHead(status, responseHeaders(extra));
  res.end();
}

function sendError(res, status, code, requestId, extra = {}) {
  res.writeHead(status, responseHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    ...extra,
  }));
  res.end(JSON.stringify({
    code,
    request_id: requestId,
  }));
}

function verifiedUnsupportedNotification(error) {
  return error?.message === 'APPLE_NOTIFICATION_TYPE_UNSUPPORTED';
}

function permanentAppleEvidenceError(error) {
  return String(error?.message ?? '').startsWith('APPLE_')
    && !Number.isInteger(error?.httpStatusCode);
}

function retryableServerFailure(error) {
  if (error instanceof CommercialWriterRpcError) {
    return error.retryable === true;
  }

  if (Number.isInteger(error?.httpStatusCode)) {
    // Errors returned by App Store Server API are server-side reconciliation
    // failures from this endpoint's perspective. Ask Apple to retry rather
    // than acknowledging commercial state that was not reconciled.
    return true;
  }

  return !permanentAppleEvidenceError(error);
}

export function createAppleNotificationsHttpHandler({
  loadConfig,
  reconcileNotification,
} = {}) {
  if (
    typeof loadConfig !== 'function'
    || typeof reconcileNotification !== 'function'
  ) {
    throw new Error('APPLE_NOTIFICATION_HTTP_DEPENDENCIES_INVALID');
  }

  return async function handler(req, res) {
    const requestId = randomUUID();

    if (req?.method !== 'POST') {
      sendError(
        res,
        405,
        'METHOD_NOT_ALLOWED',
        requestId,
        { Allow: 'POST' },
      );
      return;
    }

    let body;
    try {
      body = parseBody(req);
    } catch (error) {
      const tooLarge =
        error?.message === 'APPLE_NOTIFICATION_REQUEST_TOO_LARGE';
      sendError(
        res,
        tooLarge ? 413 : 400,
        tooLarge ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON',
        requestId,
      );
      return;
    }

    let signedPayload;
    try {
      signedPayload = signedPayloadFromBody(body);
    } catch (error) {
      const tooLarge =
        error?.message === 'APPLE_NOTIFICATION_SIGNED_PAYLOAD_INVALID'
        && Buffer.byteLength(String(body?.signedPayload ?? ''), 'utf8')
          > MAX_NOTIFICATION_BODY_BYTES;
      sendError(
        res,
        tooLarge ? 413 : 400,
        tooLarge
          ? 'REQUEST_TOO_LARGE'
          : 'APPLE_NOTIFICATION_REQUEST_INVALID',
        requestId,
      );
      return;
    }

    let config;
    try {
      config = loadConfig();
    } catch {
      sendError(
        res,
        503,
        'COMMERCIAL_CONFIG_UNAVAILABLE',
        requestId,
      );
      return;
    }

    let result;
    try {
      result = await reconcileNotification(signedPayload, config);
    } catch (error) {
      if (verifiedUnsupportedNotification(error)) {
        // The JWS has already passed outer verification before the core can
        // classify the notification type as unsupported. Acknowledge it so
        // unrelated Apple event families do not create retry storms or any
        // commercial state in Z Studio.
        sendEmpty(res, 200);
        return;
      }

      if (error instanceof CommercialWriterRpcError) {
        sendError(
          res,
          error.retryable ? 503 : 500,
          error.retryable
            ? 'COMMERCIAL_WRITE_UNAVAILABLE'
            : 'COMMERCIAL_WRITE_FAILED',
          requestId,
        );
        return;
      }

      if (retryableServerFailure(error)) {
        sendError(
          res,
          503,
          'APPLE_NOTIFICATION_PROCESSING_UNAVAILABLE',
          requestId,
        );
        return;
      }

      sendError(
        res,
        400,
        'APPLE_NOTIFICATION_REJECTED',
        requestId,
      );
      return;
    }

    const acceptedCommercial =
      result?.verification === 'verified_notification_reconciled'
      && result.writerExecuted === true
      && result.rawJwsIncluded === false;
    const acceptedTest =
      result?.verification === 'verified_notification_test'
      && result.writerExecuted === false
      && result.rawJwsIncluded === false;

    if (!acceptedCommercial && !acceptedTest) {
      sendError(
        res,
        503,
        'APPLE_NOTIFICATION_PROCESSING_INVALID',
        requestId,
      );
      return;
    }

    sendEmpty(res, 200);
  };
}
