import { randomUUID } from 'node:crypto';

const DEFAULT_ALLOWED_ORIGINS = new Set([
  'capacitor://localhost',
  'https://localhost',
  'https://zstudio.space',
  'https://www.zstudio.space',
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bearer(req) {
  const raw = String(req?.headers?.authorization ?? req?.headers?.Authorization ?? '').trim();
  return raw.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}
function parseBody(req) {
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8'));
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}
function input(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('GOOGLE_PLAY_RESTORE_REQUEST_INVALID');
  if (Object.keys(value).sort().join('\n') !== 'purchase_token') throw new Error('GOOGLE_PLAY_RESTORE_REQUEST_INVALID');
  const purchaseToken = String(value.purchase_token ?? '');
  if (!purchaseToken || purchaseToken.length > 4096 || /[\u0000-\u001f\u007f\s]/.test(purchaseToken)) {
    throw new Error('GOOGLE_PLAY_RESTORE_REQUEST_INVALID');
  }
  return Object.freeze({ purchaseToken });
}
function cors(origin, origins) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
  if (origin && origins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}
function send(res, status, payload, origin, origins, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...cors(origin, origins), ...extra });
  res.end(JSON.stringify(payload));
}
function retryable(error) { return error?.retryable === true || error?.httpStatusCode === 408 || error?.httpStatusCode === 425 || error?.httpStatusCode === 429 || error?.httpStatusCode >= 500; }
function conflict(error) { return !!error?.databaseCode; }

export function createGooglePlayRestoreHttpHandler({
  loadConfig,
  resolvePerson,
  createCurrentStateClient,
  createRtdnAuthorityClient,
  createPurchaseAuthorityClient,
  createWriterClient,
  normalizeState,
  requiresOrder,
  now = () => Date.now(),
  allowedOrigins = DEFAULT_ALLOWED_ORIGINS,
} = {}) {
  for (const fn of [loadConfig, resolvePerson, createCurrentStateClient, createRtdnAuthorityClient, createPurchaseAuthorityClient, createWriterClient, normalizeState, requiresOrder, now]) {
    if (typeof fn !== 'function') throw new Error('GOOGLE_PLAY_RESTORE_HANDLER_DEPENDENCIES_INVALID');
  }

  return async function handler(req, res) {
    const requestId = randomUUID();
    const origin = String(req?.headers?.origin ?? '');
    const origins = allowedOrigins instanceof Set ? allowedOrigins : new Set(allowedOrigins ?? []);
    if (origin && !origins.has(origin)) { send(res, 403, { code: 'ORIGIN_DENIED', request_id: requestId }, origin, origins); return; }
    if (req.method === 'OPTIONS') { res.writeHead(204, cors(origin, origins)); res.end(); return; }
    if (req.method !== 'POST') { send(res, 405, { code: 'METHOD_NOT_ALLOWED', request_id: requestId }, origin, origins, { Allow: 'POST, OPTIONS' }); return; }

    const token = bearer(req);
    if (!token) { send(res, 401, { code: 'AUTH_REQUIRED', request_id: requestId }, origin, origins, { 'WWW-Authenticate': 'Bearer' }); return; }
    let restoreInput;
    try { restoreInput = input(parseBody(req)); }
    catch { send(res, 400, { code: 'GOOGLE_PLAY_RESTORE_REQUEST_INVALID', request_id: requestId }, origin, origins); return; }

    let config;
    try { config = loadConfig(); }
    catch { send(res, 500, { code: 'COMMERCIAL_CONFIG_UNAVAILABLE', request_id: requestId }, origin, origins); return; }

    let personId;
    try { personId = await resolvePerson(config, token); }
    catch (error) {
      if (error?.invalid === true) { send(res, 401, { code: 'AUTH_INVALID', request_id: requestId }, origin, origins, { 'WWW-Authenticate': 'Bearer' }); return; }
      send(res, 503, { code: 'AUTH_UNAVAILABLE', request_id: requestId }, origin, origins, { 'Retry-After': '5' }); return;
    }
    if (!UUID_RE.test(personId)) { send(res, 503, { code: 'AUTH_UNAVAILABLE', request_id: requestId }, origin, origins); return; }

    const currentStateClient = createCurrentStateClient(config);
    const identityClient = createRtdnAuthorityClient(config);
    const purchaseAuthority = createPurchaseAuthorityClient(config);
    const writer = createWriterClient(config);

    let subscription;
    try { subscription = await currentStateClient.getSubscription(restoreInput.purchaseToken); }
    catch (error) {
      send(res, retryable(error) ? 503 : 422, { code: retryable(error) ? 'GOOGLE_PLAY_RESTORE_UNAVAILABLE' : 'GOOGLE_PLAY_EVIDENCE_REJECTED', request_id: requestId }, origin, origins, retryable(error) ? { 'Retry-After': '5' } : {}); return;
    }

    let identity;
    try {
      identity = await identityClient.resolveIdentity({
        billingEnvironment: subscription.billingEnvironment,
        sourceSubscriptionRef: subscription.sourceSubscriptionRef,
        externalAccountId: subscription.externalAccountId,
        planCode: subscription.planCode,
        providerTrialing: subscription.trialing,
      });
    } catch (error) {
      if (retryable(error)) { send(res, 503, { code: 'GOOGLE_PLAY_RESTORE_IDENTITY_UNAVAILABLE', request_id: requestId }, origin, origins, { 'Retry-After': '5' }); return; }
      send(res, conflict(error) ? 409 : 422, { code: conflict(error) ? 'GOOGLE_PLAY_RESTORE_IDENTITY_CONFLICT' : 'GOOGLE_PLAY_RESTORE_IDENTITY_REJECTED', request_id: requestId }, origin, origins); return;
    }
    if (String(identity?.personId || '').toLowerCase() !== personId.toLowerCase()) {
      send(res, 403, { code: 'GOOGLE_PLAY_PURCHASE_IDENTITY_MISMATCH', request_id: requestId }, origin, origins); return;
    }

    if (identity.intentId != null) {
      try {
        await purchaseAuthority.reconcileIntent({
          intentId: identity.intentId,
          personId,
          billingEnvironment: subscription.billingEnvironment,
          planCode: subscription.planCode,
          sourceSubscriptionRef: subscription.sourceSubscriptionRef,
          providerTrialing: subscription.trialing,
        });
      } catch (error) {
        send(res, retryable(error) ? 503 : (conflict(error) ? 409 : 502), { code: retryable(error) ? 'GOOGLE_PLAY_INTENT_RECONCILIATION_UNAVAILABLE' : (conflict(error) ? 'GOOGLE_PLAY_INTENT_CONFLICT' : 'GOOGLE_PLAY_INTENT_RECONCILIATION_FAILED'), request_id: requestId }, origin, origins, retryable(error) ? { 'Retry-After': '5' } : {}); return;
      }
    }

    if (subscription.subscriptionState === 'SUBSCRIPTION_STATE_PENDING') {
      send(res, 202, { ok: true, purchase_state: 'pending', plan_code: subscription.planCode, request_id: requestId }, origin, origins); return;
    }
    if (subscription.subscriptionState === 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED') {
      if (identity.intentId != null) {
        try { await purchaseAuthority.failIntent({ intentId: identity.intentId, personId, billingEnvironment: subscription.billingEnvironment, sourceSubscriptionRef: subscription.sourceSubscriptionRef }); }
        catch (error) { send(res, retryable(error) ? 503 : (conflict(error) ? 409 : 502), { code: retryable(error) ? 'GOOGLE_PLAY_INTENT_CLOSE_UNAVAILABLE' : (conflict(error) ? 'GOOGLE_PLAY_INTENT_CONFLICT' : 'GOOGLE_PLAY_INTENT_CLOSE_FAILED'), request_id: requestId }, origin, origins, retryable(error) ? { 'Retry-After': '5' } : {}); return; }
      }
      send(res, 200, { ok: true, purchase_state: 'canceled', plan_code: subscription.planCode, request_id: requestId }, origin, origins); return;
    }

    let order = null;
    try {
      if (requiresOrder(subscription)) {
        if (!subscription.latestSuccessfulOrderId) throw Object.assign(new Error('GOOGLE_PLAY_ORDER_ID_REQUIRED'), { retryable: false });
        order = await currentStateClient.getOrder(subscription.latestSuccessfulOrderId);
      }
    } catch (error) {
      send(res, retryable(error) ? 503 : 422, { code: retryable(error) ? 'GOOGLE_PLAY_ORDER_UNAVAILABLE' : 'GOOGLE_PLAY_ORDER_REJECTED', request_id: requestId }, origin, origins, retryable(error) ? { 'Retry-After': '5' } : {}); return;
    }

    const normalizedSubscription = subscription.externalAccountId == null && identity.existingSubscription
      ? Object.freeze({ ...subscription, externalAccountId: personId.toLowerCase() })
      : subscription;
    let normalized;
    try { normalized = normalizeState({ personId, subscription: normalizedSubscription, order, nowMs: now() }); }
    catch { send(res, 422, { code: 'GOOGLE_PLAY_CURRENT_STATE_REJECTED', request_id: requestId }, origin, origins); return; }
    if (!['commercial', 'pause'].includes(normalized.mode)) { send(res, 422, { code: 'GOOGLE_PLAY_CURRENT_STATE_UNSUPPORTED', request_id: requestId }, origin, origins); return; }

    if (normalized.historicalTrialConsumed && subscription.billingEnvironment === 'production') {
      if (identity.intentId == null) { send(res, 409, { code: 'GOOGLE_PLAY_TRIAL_CONFLICT', request_id: requestId }, origin, origins); return; }
      try { await purchaseAuthority.claimConsumedTrial({ intentId: identity.intentId, personId, sourceSubscriptionRef: subscription.sourceSubscriptionRef, billingEnvironment: subscription.billingEnvironment, claimedAtMs: normalized.commercialEvent.effectiveAtMs }); }
      catch (error) { send(res, retryable(error) ? 503 : (conflict(error) ? 409 : 502), { code: retryable(error) ? 'GOOGLE_PLAY_TRIAL_CLAIM_UNAVAILABLE' : (conflict(error) ? 'GOOGLE_PLAY_TRIAL_CONFLICT' : 'GOOGLE_PLAY_TRIAL_CLAIM_FAILED'), request_id: requestId }, origin, origins, retryable(error) ? { 'Retry-After': '5' } : {}); return; }
    }

    let written;
    try {
      written = normalized.mode === 'pause'
        ? await purchaseAuthority.applyPause({ personId, billingEnvironment: subscription.billingEnvironment, sourceEventRef: normalized.sourceEventRef, sourceSubscriptionRef: subscription.sourceSubscriptionRef, sourceProductRef: subscription.sourceProductRef, planCode: subscription.planCode, effectiveAtMs: normalized.pause.effectiveAtMs })
        : await writer.applyVerifiedCommercialEvent(normalized.writerArgs);
    } catch (error) {
      send(res, retryable(error) ? 503 : (conflict(error) ? 409 : 502), { code: retryable(error) ? 'COMMERCIAL_WRITE_UNAVAILABLE' : (conflict(error) ? 'COMMERCIAL_WRITE_CONFLICT' : 'COMMERCIAL_WRITE_FAILED'), request_id: requestId }, origin, origins, retryable(error) ? { 'Retry-After': '5' } : {}); return;
    }

    let acknowledged = subscription.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
    if (!acknowledged) {
      try { await currentStateClient.acknowledgeSubscription(restoreInput.purchaseToken); acknowledged = true; }
      catch (error) { send(res, retryable(error) ? 503 : 502, { code: retryable(error) ? 'GOOGLE_PLAY_ACKNOWLEDGEMENT_UNAVAILABLE' : 'GOOGLE_PLAY_ACKNOWLEDGEMENT_FAILED', request_id: requestId }, origin, origins, retryable(error) ? { 'Retry-After': '5' } : {}); return; }
    }

    if (identity.intentId != null) {
      try { await purchaseAuthority.completeIntent({ intentId: identity.intentId, personId, billingEnvironment: subscription.billingEnvironment, sourceSubscriptionRef: subscription.sourceSubscriptionRef }); }
      catch (error) { send(res, retryable(error) ? 503 : (conflict(error) ? 409 : 502), { code: retryable(error) ? 'GOOGLE_PLAY_INTENT_COMPLETE_UNAVAILABLE' : (conflict(error) ? 'GOOGLE_PLAY_INTENT_CONFLICT' : 'GOOGLE_PLAY_INTENT_COMPLETE_FAILED'), request_id: requestId }, origin, origins, retryable(error) ? { 'Retry-After': '5' } : {}); return; }
    }

    const event = normalized.commercialEvent ?? normalized.pause ?? null;
    const periodEndMs = event?.trialEndsAtMs ?? event?.currentPeriodEndMs ?? subscription.expiryAtMs ?? null;
    send(res, 200, {
      ok: true,
      verification: 'verified_current_state',
      purchase_state: 'processed',
      commercial_result: written.result,
      subscription_status: written.subscriptionStatus ?? event?.status ?? null,
      plan_code: written.planCode ?? subscription.planCode,
      studio_access_status: written.studioAccessStatus ?? null,
      ai_access_status: written.aiAccessStatus ?? null,
      cancel_at_period_end: event?.cancelAtPeriodEnd ?? false,
      period_end: periodEndMs == null ? null : new Date(periodEndMs).toISOString(),
      acknowledged,
      request_id: requestId,
    }, origin, origins);
  };
}
