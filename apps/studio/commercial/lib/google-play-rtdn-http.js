import { randomUUID } from 'node:crypto';
import { GooglePlayRtdnAuthError } from './google-play-rtdn-auth.js';
import { GooglePlayRtdnParseError } from './google-play-rtdn-parser.js';
import { GooglePlayRtdnAuthorityRpcError } from './google-play-rtdn-authority-client.js';
import { GooglePlayRtdnReconciliationError } from './google-play-rtdn-reconciliation.js';

function send(res, status, extra = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...extra });
  res.end();
}
function authorization(req) {
  return String(req?.headers?.authorization ?? req?.headers?.Authorization ?? '').trim();
}
function retryable(error) {
  return error?.retryable === true
    || error?.httpStatusCode === 408
    || error?.httpStatusCode === 425
    || error?.httpStatusCode === 429
    || error?.httpStatusCode >= 500;
}

export function createGooglePlayRtdnHttpHandler({
  loadConfig,
  verifyOidc,
  parseEnvelope,
  createCurrentStateClient,
  createRtdnAuthorityClient,
  createPurchaseAuthorityClient,
  createWriterClient,
  reconcileRtdn,
} = {}) {
  for (const dependency of [loadConfig, verifyOidc, parseEnvelope, createCurrentStateClient, createRtdnAuthorityClient, createPurchaseAuthorityClient, createWriterClient, reconcileRtdn]) {
    if (typeof dependency !== 'function') throw new Error('GOOGLE_PLAY_RTDN_HANDLER_DEPENDENCIES_INVALID');
  }

  return async function handler(req, res) {
    const requestId = randomUUID();
    res.setHeader?.('X-Request-Id', requestId);
    if (req.method !== 'POST') {
      send(res, 405, { Allow: 'POST' });
      return;
    }

    let config;
    try { config = loadConfig(); } catch {
      send(res, 503, { 'Retry-After': '5' });
      return;
    }

    const auth = authorization(req);
    if (!auth) {
      send(res, 401, { 'WWW-Authenticate': 'Bearer' });
      return;
    }
    try {
      await verifyOidc(auth, config);
    } catch (error) {
      if (error instanceof GooglePlayRtdnAuthError && retryable(error)) {
        send(res, 503, { 'Retry-After': '5' });
      } else {
        send(res, 401, { 'WWW-Authenticate': 'Bearer' });
      }
      return;
    }

    let trigger;
    try { trigger = parseEnvelope(req.body, config); } catch (error) {
      if (error instanceof GooglePlayRtdnParseError) send(res, 400);
      else send(res, 500);
      return;
    }

    try {
      await reconcileRtdn({
        trigger,
        config,
        currentStateClient: createCurrentStateClient(config),
        rtdnAuthorityClient: createRtdnAuthorityClient(config),
        purchaseAuthorityClient: createPurchaseAuthorityClient(config),
        writerClient: createWriterClient(config),
      });
      send(res, 204);
    } catch (error) {
      if (retryable(error)) {
        send(res, 503, { 'Retry-After': '5' });
        return;
      }
      if (error instanceof GooglePlayRtdnAuthorityRpcError && error.databaseCode) {
        send(res, 409);
        return;
      }
      if (error instanceof GooglePlayRtdnReconciliationError) {
        send(res, 409);
        return;
      }
      send(res, 422);
    }
  };
}
