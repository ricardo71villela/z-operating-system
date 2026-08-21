import { randomUUID } from 'node:crypto';
import { CommercialWriterRpcError } from './commercial-writer-client.js';
import { ApplePurchaseAuthorityRpcError } from './apple-purchase-authority-client.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_ALLOWED_ORIGINS = new Set(['capacitor://localhost','https://localhost','https://zstudio.space','https://www.zstudio.space']);

export class StudioAuthBoundaryError extends Error {
  constructor(code, { invalid = false, cause } = {}) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'StudioAuthBoundaryError'; this.code = code; this.invalid = invalid;
  }
}
function bearerToken(req) {
  const raw = String(req?.headers?.authorization ?? req?.headers?.Authorization ?? '').trim();
  return raw.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}
function parseBody(req) {
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8'));
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}
function reconcileRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('APPLE_RECONCILE_REQUEST_INVALID');
  const keys = Object.keys(body).sort().join('\n');
  if (!['jwsRepresentation','jwsRepresentation\npurchase_intent_id'].includes(keys)) throw new Error('APPLE_RECONCILE_REQUEST_INVALID');
  const jws = String(body.jwsRepresentation ?? '').trim();
  if (!jws || jws.length > 65536) throw new Error('APPLE_RECONCILE_JWS_INVALID');
  let intentId = null;
  if (body.purchase_intent_id != null) {
    intentId = String(body.purchase_intent_id).trim().toLowerCase();
    if (!UUID_PATTERN.test(intentId)) throw new Error('APPLE_PURCHASE_INTENT_ID_INVALID');
  }
  return { jws, intentId };
}
function cors(origin, origins) {
  const headers = { 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Access-Control-Allow-Headers':'Authorization, Content-Type', 'Cache-Control':'no-store', Vary:'Origin' };
  if (origin && origins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}
function sendJson(res,status,payload,origin,origins,extra={}) {
  res.writeHead(status,{ 'Content-Type':'application/json; charset=utf-8', ...cors(origin,origins), ...extra });
  res.end(JSON.stringify(payload));
}
function retryableAppleError(error) {
  if (Number.isInteger(error?.httpStatusCode)) return error.httpStatusCode === 408 || error.httpStatusCode === 425 || error.httpStatusCode === 429 || error.httpStatusCode >= 500;
  return !String(error?.message ?? '').startsWith('APPLE_');
}

export async function validateSupabaseBearerAndResolvePerson(config, token, { fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const url = String(config?.supabaseUrl ?? '').trim().replace(/\/+$/, '');
  const publishableKey = String(config?.supabasePublishableKey ?? '').trim();
  if (!/^https:\/\//i.test(url) || !publishableKey || !token) throw new StudioAuthBoundaryError('STUDIO_AUTH_CONFIG_INVALID');
  const call = async (endpoint, options) => {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try { return await fetchImpl(endpoint,{...options,signal:controller.signal}); }
    catch (cause) { throw new StudioAuthBoundaryError('STUDIO_AUTH_UNAVAILABLE',{cause}); }
    finally { clearTimeout(timer); }
  };
  const headers = { apikey:publishableKey, Authorization:`Bearer ${token}` };
  const user = await call(`${url}/auth/v1/user`,{method:'GET',headers});
  if (!user.ok) {
    if ([401,403].includes(user.status)) throw new StudioAuthBoundaryError('STUDIO_AUTH_INVALID',{invalid:true});
    throw new StudioAuthBoundaryError('STUDIO_AUTH_UNAVAILABLE');
  }
  const account = await call(`${url}/rest/v1/rpc/zstudio_ensure_account`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'});
  if (!account.ok) {
    if ([401,403].includes(account.status)) throw new StudioAuthBoundaryError('STUDIO_AUTH_INVALID',{invalid:true});
    throw new StudioAuthBoundaryError('STUDIO_ACCOUNT_UNAVAILABLE');
  }
  let personId;
  try { personId = await account.json(); } catch (cause) { throw new StudioAuthBoundaryError('STUDIO_ACCOUNT_RESPONSE_INVALID',{cause}); }
  if (typeof personId !== 'string' || !UUID_PATTERN.test(personId)) throw new StudioAuthBoundaryError('STUDIO_ACCOUNT_RESPONSE_INVALID');
  return personId.toLowerCase();
}

export function createAppleDeviceReconcileHttpHandler({
  loadConfig,
  resolvePerson = validateSupabaseBearerAndResolvePerson,
  verifyTransaction,
  reconcileCurrentState,
  applyCommercialEvent,
  createPurchaseAuthorityClient = null,
  allowedOrigins = DEFAULT_ALLOWED_ORIGINS,
} = {}) {
  if ([loadConfig,resolvePerson,verifyTransaction,reconcileCurrentState,applyCommercialEvent].some((fn)=>typeof fn !== 'function')) {
    throw new Error('APPLE_RECONCILE_HANDLER_DEPENDENCIES_INVALID');
  }
  if (createPurchaseAuthorityClient != null && typeof createPurchaseAuthorityClient !== 'function') throw new Error('APPLE_RECONCILE_HANDLER_DEPENDENCIES_INVALID');

  return async function handler(req,res) {
    const requestId = randomUUID();
    const origin = String(req?.headers?.origin ?? '');
    const origins = allowedOrigins instanceof Set ? allowedOrigins : new Set(allowedOrigins ?? []);
    if (origin && !origins.has(origin)) { sendJson(res,403,{code:'ORIGIN_DENIED',request_id:requestId},origin,origins); return; }
    if (req.method === 'OPTIONS') { res.writeHead(204,cors(origin,origins)); res.end(); return; }
    if (req.method !== 'POST') { sendJson(res,405,{code:'METHOD_NOT_ALLOWED',request_id:requestId},origin,origins,{Allow:'POST, OPTIONS'}); return; }
    const token = bearerToken(req);
    if (!token) { sendJson(res,401,{code:'AUTH_REQUIRED',request_id:requestId},origin,origins,{'WWW-Authenticate':'Bearer'}); return; }

    let parsed;
    try { parsed = reconcileRequest(parseBody(req)); }
    catch (error) { sendJson(res,400,{code:error.message || 'APPLE_RECONCILE_REQUEST_INVALID',request_id:requestId},origin,origins); return; }

    let config;
    try { config = loadConfig(); } catch { sendJson(res,500,{code:'COMMERCIAL_CONFIG_UNAVAILABLE',request_id:requestId},origin,origins); return; }
    let personId;
    try { personId = await resolvePerson(config,token); }
    catch (error) {
      if (error instanceof StudioAuthBoundaryError && error.invalid) { sendJson(res,401,{code:'AUTH_INVALID',request_id:requestId},origin,origins,{'WWW-Authenticate':'Bearer'}); return; }
      sendJson(res,503,{code:'AUTH_UNAVAILABLE',request_id:requestId},origin,origins); return;
    }

    let deviceEvidence;
    try { deviceEvidence = await verifyTransaction(parsed.jws,config); }
    catch { sendJson(res,422,{code:'APPLE_EVIDENCE_REJECTED',request_id:requestId},origin,origins); return; }
    if (deviceEvidence.appAccountToken !== personId) { sendJson(res,403,{code:'APPLE_PURCHASE_IDENTITY_MISMATCH',request_id:requestId},origin,origins); return; }

    let snapshot;
    try { snapshot = await reconcileCurrentState(deviceEvidence,config); }
    catch (error) {
      const retryable = retryableAppleError(error);
      sendJson(res,retryable?503:422,{code:retryable?'APPLE_RECONCILIATION_UNAVAILABLE':'APPLE_RECONCILIATION_REJECTED',request_id:requestId},origin,origins,retryable?{'Retry-After':'5'}:{}); return;
    }
    if (snapshot.personId !== personId) { sendJson(res,403,{code:'APPLE_PURCHASE_IDENTITY_MISMATCH',request_id:requestId},origin,origins); return; }

    const providerTrialing = snapshot.normalizedStatus === 'trialing';
    const purchaseAuthority = createPurchaseAuthorityClient ? createPurchaseAuthorityClient(config) : null;
    if (parsed.intentId) {
      if (!purchaseAuthority) { sendJson(res,500,{code:'APPLE_PURCHASE_AUTHORITY_UNAVAILABLE',request_id:requestId},origin,origins); return; }
      try {
        await purchaseAuthority.reconcileIntent({
          intentId:parsed.intentId, personId,
          billingEnvironment:snapshot.billingEnvironment,
          planCode:snapshot.planCode, productId:snapshot.currentProductId,
          sourceSubscriptionRef:snapshot.sourceSubscriptionRef,
          providerTrialing,
        });
      } catch (error) {
        const retryable = error instanceof ApplePurchaseAuthorityRpcError && error.retryable;
        sendJson(res,retryable?503:409,{code:retryable?'APPLE_PURCHASE_AUTHORITY_UNAVAILABLE':'APPLE_PURCHASE_AUTHORITY_CONFLICT',request_id:requestId},origin,origins,retryable?{'Retry-After':'5'}:{}); return;
      }
    }

    let written;
    try { written = await applyCommercialEvent(snapshot,config); }
    catch (error) {
      if (error instanceof CommercialWriterRpcError && error.retryable) { sendJson(res,503,{code:'COMMERCIAL_WRITE_UNAVAILABLE',request_id:requestId},origin,origins,{'Retry-After':'5'}); return; }
      if (error instanceof CommercialWriterRpcError && error.databaseCode) { sendJson(res,409,{code:'COMMERCIAL_WRITE_CONFLICT',request_id:requestId},origin,origins); return; }
      sendJson(res,502,{code:'COMMERCIAL_WRITE_FAILED',request_id:requestId},origin,origins); return;
    }

    if (parsed.intentId) {
      try {
        await purchaseAuthority.completeIntent({
          intentId:parsed.intentId, personId,
          billingEnvironment:snapshot.billingEnvironment,
          sourceSubscriptionRef:snapshot.sourceSubscriptionRef,
          providerTrialing,
        });
      } catch (error) {
        const retryable = error instanceof ApplePurchaseAuthorityRpcError && error.retryable;
        sendJson(res,retryable?503:409,{code:retryable?'APPLE_PURCHASE_COMPLETE_UNAVAILABLE':'APPLE_PURCHASE_COMPLETE_CONFLICT',request_id:requestId},origin,origins,retryable?{'Retry-After':'5'}:{}); return;
      }
    }

    const periodEndMs = snapshot.trialEndsAtMs ?? snapshot.currentPeriodEndMs ?? null;
    sendJson(res,200,{
      ok:true, verification:'verified_current_state', commercial_result:written.result,
      subscription_id:written.subscriptionId,
      subscription_status:written.subscriptionStatus ?? snapshot.normalizedStatus,
      plan_code:written.planCode ?? snapshot.planCode,
      studio_access_status:written.studioAccessStatus, ai_access_status:written.aiAccessStatus,
      cancel_at_period_end:snapshot.cancelAtPeriodEnd,
      period_end:periodEndMs===null?null:new Date(periodEndMs).toISOString(),
      product_id:snapshot.currentProductId,
      finish_transaction_id:deviceEvidence.transactionId,
      request_id:requestId,
    },origin,origins);
  };
}
