import { randomUUID } from 'node:crypto';
import {
  StudioAuthBoundaryError,
  validateSupabaseBearerAndResolvePerson,
} from './apple-device-reconcile-http.js';
import { CommercialWriterRpcError } from './commercial-writer-client.js';
import { GooglePlayAuthorityRpcError } from './google-play-authority-client.js';
import { GooglePlayCurrentStateError } from './google-play-current-state.js';
import {
  googlePlayCurrentStateRequiresOrder,
  normalizeGooglePlayCommercialState,
} from './google-play-commercial-state.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_ALLOWED_ORIGINS = new Set([
  'capacitor://localhost',
  'https://localhost',
  'https://zstudio.space',
  'https://www.zstudio.space',
]);

function bearerToken(req) {
  const raw = String(req?.headers?.authorization ?? req?.headers?.Authorization ?? '').trim();
  return raw.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}

function parseBody(req) {
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8'));
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}

function reconcileInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('GOOGLE_PLAY_RECONCILE_REQUEST_INVALID');
  }
  if (Object.keys(value).sort().join('\n') !== 'purchase_intent_id\npurchase_token') {
    throw new Error('GOOGLE_PLAY_RECONCILE_REQUEST_INVALID');
  }
  const intentId = String(value.purchase_intent_id ?? '').trim().toLowerCase();
  const purchaseToken = String(value.purchase_token ?? '');
  if (!UUID_RE.test(intentId)) throw new Error('GOOGLE_PLAY_RECONCILE_INTENT_ID_INVALID');
  if (!purchaseToken || purchaseToken.length > 4096 || /[\u0000-\u001f\u007f\s]/.test(purchaseToken)) {
    throw new Error('GOOGLE_PLAY_RECONCILE_PURCHASE_TOKEN_INVALID');
  }
  return Object.freeze({ intentId, purchaseToken });
}

function cors(origin, allowedOrigins) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
  if (origin && allowedOrigins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function sendJson(res, status, payload, origin, allowedOrigins, extra = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...cors(origin, allowedOrigins),
    ...extra,
  });
  res.end(JSON.stringify(payload));
}

function retryableProvider(error) {
  return error?.retryable === true
    || error?.httpStatusCode === 408
    || error?.httpStatusCode === 425
    || error?.httpStatusCode === 429
    || error?.httpStatusCode >= 500;
}

function retryableDatabase(error) {
  return error?.retryable === true;
}

function safePeriodEnd(normalized, subscription) {
  if (normalized?.mode === 'commercial') {
    return normalized.commercialEvent.trialEndsAtMs
      ?? normalized.commercialEvent.currentPeriodEndMs
      ?? null;
  }
  return subscription.expiryAtMs ?? null;
}

export function createGooglePlayDeviceReconcileHttpHandler({
  loadConfig,
  resolvePerson = validateSupabaseBearerAndResolvePerson,
  createCurrentStateClient,
  createAuthorityClient,
  createWriterClient,
  normalizeState = normalizeGooglePlayCommercialState,
  requiresOrder = googlePlayCurrentStateRequiresOrder,
  now = () => Date.now(),
  allowedOrigins = DEFAULT_ALLOWED_ORIGINS,
} = {}) {
  if (
    typeof loadConfig !== 'function'
    || typeof resolvePerson !== 'function'
    || typeof createCurrentStateClient !== 'function'
    || typeof createAuthorityClient !== 'function'
    || typeof createWriterClient !== 'function'
    || typeof normalizeState !== 'function'
    || typeof requiresOrder !== 'function'
    || typeof now !== 'function'
  ) {
    throw new Error('GOOGLE_PLAY_RECONCILE_HANDLER_DEPENDENCIES_INVALID');
  }

  return async function handler(req, res) {
    const requestId = randomUUID();
    const origin = String(req?.headers?.origin ?? '');
    const origins = allowedOrigins instanceof Set ? allowedOrigins : new Set(allowedOrigins ?? []);

    if (origin && !origins.has(origin)) {
      sendJson(res, 403, { code: 'ORIGIN_DENIED', request_id: requestId }, origin, origins);
      return;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors(origin, origins));
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { code: 'METHOD_NOT_ALLOWED', request_id: requestId }, origin, origins, { Allow: 'POST, OPTIONS' });
      return;
    }

    const bearer = bearerToken(req);
    if (!bearer) {
      sendJson(res, 401, { code: 'AUTH_REQUIRED', request_id: requestId }, origin, origins, { 'WWW-Authenticate': 'Bearer' });
      return;
    }

    let input;
    try {
      input = reconcileInput(parseBody(req));
    } catch (error) {
      sendJson(res, 400, { code: error.message === 'GOOGLE_PLAY_RECONCILE_INTENT_ID_INVALID' ? error.message : 'GOOGLE_PLAY_RECONCILE_REQUEST_INVALID', request_id: requestId }, origin, origins);
      return;
    }

    let config;
    try {
      config = loadConfig();
    } catch {
      sendJson(res, 500, { code: 'COMMERCIAL_CONFIG_UNAVAILABLE', request_id: requestId }, origin, origins);
      return;
    }

    let personId;
    try {
      personId = await resolvePerson(config, bearer);
    } catch (error) {
      if (error instanceof StudioAuthBoundaryError && error.invalid) {
        sendJson(res, 401, { code: 'AUTH_INVALID', request_id: requestId }, origin, origins, { 'WWW-Authenticate': 'Bearer' });
        return;
      }
      sendJson(res, 503, { code: 'AUTH_UNAVAILABLE', request_id: requestId }, origin, origins, { 'Retry-After': '5' });
      return;
    }

    const currentStateClient = createCurrentStateClient(config);
    const authorityClient = createAuthorityClient(config);
    const writerClient = createWriterClient(config);

    let subscription;
    try {
      subscription = await currentStateClient.getSubscription(input.purchaseToken);
    } catch (error) {
      sendJson(
        res,
        retryableProvider(error) ? 503 : 422,
        { code: retryableProvider(error) ? 'GOOGLE_PLAY_RECONCILIATION_UNAVAILABLE' : 'GOOGLE_PLAY_EVIDENCE_REJECTED', request_id: requestId },
        origin,
        origins,
        retryableProvider(error) ? { 'Retry-After': '5' } : {},
      );
      return;
    }

    if (subscription.externalAccountId !== personId) {
      sendJson(res, 403, { code: 'GOOGLE_PLAY_PURCHASE_IDENTITY_MISMATCH', request_id: requestId }, origin, origins);
      return;
    }

    try {
      await authorityClient.reconcileIntent({
        intentId: input.intentId,
        personId,
        billingEnvironment: subscription.billingEnvironment,
        planCode: subscription.planCode,
        sourceSubscriptionRef: subscription.sourceSubscriptionRef,
        providerTrialing: subscription.trialing,
      });
    } catch (error) {
      if (error instanceof GooglePlayAuthorityRpcError && retryableDatabase(error)) {
        sendJson(res, 503, { code: 'GOOGLE_PLAY_INTENT_RECONCILIATION_UNAVAILABLE', request_id: requestId }, origin, origins, { 'Retry-After': '5' });
        return;
      }
      if (error instanceof GooglePlayAuthorityRpcError && error.databaseCode) {
        sendJson(res, 409, { code: 'GOOGLE_PLAY_INTENT_CONFLICT', request_id: requestId }, origin, origins);
        return;
      }
      sendJson(res, 502, { code: 'GOOGLE_PLAY_INTENT_RECONCILIATION_FAILED', request_id: requestId }, origin, origins);
      return;
    }

    if (subscription.subscriptionState === 'SUBSCRIPTION_STATE_PENDING') {
      sendJson(res, 202, {
        ok: true,
        purchase_state: 'pending',
        plan_code: subscription.planCode,
        request_id: requestId,
      }, origin, origins);
      return;
    }

    if (subscription.subscriptionState === 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED') {
      try {
        await authorityClient.failIntent({
          intentId: input.intentId,
          personId,
          billingEnvironment: subscription.billingEnvironment,
          sourceSubscriptionRef: subscription.sourceSubscriptionRef,
        });
      } catch (error) {
        if (error instanceof GooglePlayAuthorityRpcError && retryableDatabase(error)) {
          sendJson(res, 503, { code: 'GOOGLE_PLAY_INTENT_CLOSE_UNAVAILABLE', request_id: requestId }, origin, origins, { 'Retry-After': '5' });
          return;
        }
        if (error instanceof GooglePlayAuthorityRpcError && error.databaseCode) {
          sendJson(res, 409, { code: 'GOOGLE_PLAY_INTENT_CONFLICT', request_id: requestId }, origin, origins);
          return;
        }
        sendJson(res, 502, { code: 'GOOGLE_PLAY_INTENT_CLOSE_FAILED', request_id: requestId }, origin, origins);
        return;
      }
      sendJson(res, 200, {
        ok: true,
        purchase_state: 'canceled',
        plan_code: subscription.planCode,
        request_id: requestId,
      }, origin, origins);
      return;
    }

    let order = null;
    try {
      if (requiresOrder(subscription)) {
        if (!subscription.latestSuccessfulOrderId) {
          throw new GooglePlayCurrentStateError('GOOGLE_PLAY_ORDER_ID_REQUIRED');
        }
        order = await currentStateClient.getOrder(subscription.latestSuccessfulOrderId);
      }
    } catch (error) {
      sendJson(
        res,
        retryableProvider(error) ? 503 : 422,
        { code: retryableProvider(error) ? 'GOOGLE_PLAY_ORDER_UNAVAILABLE' : 'GOOGLE_PLAY_ORDER_REJECTED', request_id: requestId },
        origin,
        origins,
        retryableProvider(error) ? { 'Retry-After': '5' } : {},
      );
      return;
    }

    let normalized;
    try {
      normalized = normalizeState({ personId, subscription, order, nowMs: now() });
    } catch {
      sendJson(res, 422, { code: 'GOOGLE_PLAY_CURRENT_STATE_REJECTED', request_id: requestId }, origin, origins);
      return;
    }

    if (!['commercial', 'pause'].includes(normalized.mode)) {
      sendJson(res, 422, { code: 'GOOGLE_PLAY_CURRENT_STATE_UNSUPPORTED', request_id: requestId }, origin, origins);
      return;
    }

    if (normalized.historicalTrialConsumed) {
      try {
        await authorityClient.claimConsumedTrial({
          intentId: input.intentId,
          personId,
          sourceSubscriptionRef: subscription.sourceSubscriptionRef,
          billingEnvironment: subscription.billingEnvironment,
          claimedAtMs: normalized.commercialEvent.effectiveAtMs,
        });
      } catch (error) {
        if (error instanceof GooglePlayAuthorityRpcError && retryableDatabase(error)) {
          sendJson(res, 503, { code: 'GOOGLE_PLAY_TRIAL_CLAIM_UNAVAILABLE', request_id: requestId }, origin, origins, { 'Retry-After': '5' });
          return;
        }
        if (error instanceof GooglePlayAuthorityRpcError && error.databaseCode) {
          sendJson(res, 409, { code: 'GOOGLE_PLAY_TRIAL_CONFLICT', request_id: requestId }, origin, origins);
          return;
        }
        sendJson(res, 502, { code: 'GOOGLE_PLAY_TRIAL_CLAIM_FAILED', request_id: requestId }, origin, origins);
        return;
      }
    }

    let written;
    try {
      if (normalized.mode === 'pause') {
        written = await authorityClient.applyPause({
          personId,
          billingEnvironment: subscription.billingEnvironment,
          sourceEventRef: normalized.sourceEventRef,
          sourceSubscriptionRef: subscription.sourceSubscriptionRef,
          sourceProductRef: subscription.sourceProductRef,
          planCode: subscription.planCode,
          effectiveAtMs: normalized.pause.effectiveAtMs,
        });
      } else {
        written = await writerClient.applyVerifiedCommercialEvent(normalized.writerArgs);
      }
    } catch (error) {
      const isAuthority = error instanceof GooglePlayAuthorityRpcError;
      const isWriter = error instanceof CommercialWriterRpcError;
      if ((isAuthority || isWriter) && error.retryable) {
        sendJson(res, 503, { code: 'COMMERCIAL_WRITE_UNAVAILABLE', request_id: requestId }, origin, origins, { 'Retry-After': '5' });
        return;
      }
      if ((isAuthority || isWriter) && error.databaseCode) {
        sendJson(res, 409, { code: 'COMMERCIAL_WRITE_CONFLICT', request_id: requestId }, origin, origins);
        return;
      }
      sendJson(res, 502, { code: 'COMMERCIAL_WRITE_FAILED', request_id: requestId }, origin, origins);
      return;
    }

    let acknowledgedNow = false;
    if (subscription.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') {
      try {
        await currentStateClient.acknowledgeSubscription(input.purchaseToken);
        acknowledgedNow = true;
      } catch (error) {
        sendJson(
          res,
          retryableProvider(error) ? 503 : 502,
          { code: retryableProvider(error) ? 'GOOGLE_PLAY_ACKNOWLEDGEMENT_UNAVAILABLE' : 'GOOGLE_PLAY_ACKNOWLEDGEMENT_FAILED', request_id: requestId },
          origin,
          origins,
          retryableProvider(error) ? { 'Retry-After': '5' } : {},
        );
        return;
      }
    }

    try {
      await authorityClient.completeIntent({
        intentId: input.intentId,
        personId,
        billingEnvironment: subscription.billingEnvironment,
        sourceSubscriptionRef: subscription.sourceSubscriptionRef,
      });
    } catch (error) {
      if (error instanceof GooglePlayAuthorityRpcError && error.retryable) {
        sendJson(res, 503, { code: 'GOOGLE_PLAY_INTENT_COMPLETE_UNAVAILABLE', request_id: requestId }, origin, origins, { 'Retry-After': '5' });
        return;
      }
      if (error instanceof GooglePlayAuthorityRpcError && error.databaseCode) {
        sendJson(res, 409, { code: 'GOOGLE_PLAY_INTENT_CONFLICT', request_id: requestId }, origin, origins);
        return;
      }
      sendJson(res, 502, { code: 'GOOGLE_PLAY_INTENT_COMPLETE_FAILED', request_id: requestId }, origin, origins);
      return;
    }

    const periodEndMs = safePeriodEnd(normalized, subscription);
    sendJson(res, 200, {
      ok: true,
      verification: 'verified_current_state',
      purchase_state: 'processed',
      commercial_result: written.result,
      subscription_status: written.subscriptionStatus
        ?? normalized.commercialEvent?.status
        ?? normalized.pause?.status
        ?? null,
      plan_code: written.planCode ?? subscription.planCode,
      studio_access_status: written.studioAccessStatus ?? null,
      ai_access_status: written.aiAccessStatus ?? null,
      cancel_at_period_end: normalized.commercialEvent?.cancelAtPeriodEnd ?? false,
      period_end: periodEndMs == null ? null : new Date(periodEndMs).toISOString(),
      acknowledged: subscription.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' || acknowledgedNow,
      request_id: requestId,
    }, origin, origins);
  };
}
