import { randomUUID } from 'node:crypto';
import { ApplePurchaseAuthorityRpcError } from './apple-purchase-authority-client.js';

const DEFAULT_ALLOWED_ORIGINS = new Set(['capacitor://localhost','https://localhost','https://zstudio.space','https://www.zstudio.space']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_TRANSACTION_ID_RE = /^[^\s\u0000-\u001f\u007f]{1,256}$/;

export class ApplePurchaseAuthBoundaryError extends Error {
  constructor(code, { invalid = false, cause = null } = {}) {
    super(code); this.name = 'ApplePurchaseAuthBoundaryError'; this.code = code; this.invalid = invalid; if (cause) this.cause = cause;
  }
}

export async function validateApplePurchaseBearerAndResolvePerson(config, token, { fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const url = String(config?.supabaseUrl ?? '').trim().replace(/\/+$/, '');
  const publishableKey = String(config?.supabasePublishableKey ?? '').trim();
  if (!/^https:\/\//i.test(url) || !publishableKey || !token || typeof fetchImpl !== 'function') throw new ApplePurchaseAuthBoundaryError('APPLE_PURCHASE_AUTH_CONFIG_INVALID');
  const call = async (endpoint, options) => {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try { return await fetchImpl(endpoint, { ...options, signal: controller.signal }); }
    catch (cause) { throw new ApplePurchaseAuthBoundaryError('APPLE_PURCHASE_AUTH_UNAVAILABLE', { cause }); }
    finally { clearTimeout(timer); }
  };
  const headers = { apikey: publishableKey, Authorization: `Bearer ${token}` };
  const user = await call(`${url}/auth/v1/user`, { method: 'GET', headers });
  if (!user.ok) {
    if ([401,403].includes(user.status)) throw new ApplePurchaseAuthBoundaryError('APPLE_PURCHASE_AUTH_INVALID', { invalid: true });
    throw new ApplePurchaseAuthBoundaryError('APPLE_PURCHASE_AUTH_UNAVAILABLE');
  }
  const account = await call(`${url}/rest/v1/rpc/zstudio_ensure_account`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' });
  if (!account.ok) {
    if ([401,403].includes(account.status)) throw new ApplePurchaseAuthBoundaryError('APPLE_PURCHASE_AUTH_INVALID', { invalid: true });
    throw new ApplePurchaseAuthBoundaryError('APPLE_PURCHASE_ACCOUNT_UNAVAILABLE');
  }
  let personId;
  try { personId = await account.json(); } catch (cause) { throw new ApplePurchaseAuthBoundaryError('APPLE_PURCHASE_ACCOUNT_RESPONSE_INVALID', { cause }); }
  if (typeof personId !== 'string' || !UUID_RE.test(personId)) throw new ApplePurchaseAuthBoundaryError('APPLE_PURCHASE_ACCOUNT_RESPONSE_INVALID');
  return personId.toLowerCase();
}

function bearer(req) {
  const raw = String(req?.headers?.authorization ?? req?.headers?.Authorization ?? '').trim();
  return raw.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}
function body(req) {
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8'));
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}
function request(payload, resolvePlan) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('APPLE_PURCHASE_PREPARE_REQUEST_INVALID');
  if (Object.keys(payload).sort().join('\n') !== 'app_transaction_id\nplan_code') throw new Error('APPLE_PURCHASE_PREPARE_REQUEST_INVALID');
  const transactionId = String(payload.app_transaction_id ?? '').trim();
  if (!APP_TRANSACTION_ID_RE.test(transactionId)) throw new Error('APPLE_APP_TRANSACTION_ID_INVALID');
  const resolved = resolvePlan(String(payload.plan_code ?? '').trim().toLowerCase());
  return { transactionId, plan: resolved };
}
function cors(origin, origins) {
  const headers = { 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Access-Control-Allow-Headers':'Authorization, Content-Type', 'Cache-Control':'no-store', Vary:'Origin' };
  if (origin && origins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}
function send(res, status, payload, origin, origins, extra = {}) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', ...cors(origin, origins), ...extra });
  res.end(JSON.stringify(payload));
}

export function createApplePurchasePreflightHttpHandler({
  loadConfig,
  createAuthorityClient,
  resolvePlan,
  resolvePerson = validateApplePurchaseBearerAndResolvePerson,
  createSignatureCreator = async (config) => {
    const { IntroductoryOfferEligibilitySignatureCreator } = await import('@apple/app-store-server-library');
    return new IntroductoryOfferEligibilitySignatureCreator(
      config.privateKey, config.keyId, config.issuerId, config.bundleId,
    );
  },
  allowedOrigins = DEFAULT_ALLOWED_ORIGINS,
} = {}) {
  if ([loadConfig, createAuthorityClient, resolvePlan, resolvePerson, createSignatureCreator].some((fn) => typeof fn !== 'function')) {
    throw new Error('APPLE_PURCHASE_PREPARE_DEPENDENCIES_INVALID');
  }
  return async function handler(req, res) {
    const requestId = randomUUID();
    const origin = String(req?.headers?.origin ?? '');
    const origins = allowedOrigins instanceof Set ? allowedOrigins : new Set(allowedOrigins ?? []);
    if (origin && !origins.has(origin)) { send(res,403,{code:'ORIGIN_DENIED',request_id:requestId},origin,origins); return; }
    if (req.method === 'OPTIONS') { res.writeHead(204,cors(origin,origins)); res.end(); return; }
    if (req.method !== 'POST') { send(res,405,{code:'METHOD_NOT_ALLOWED',request_id:requestId},origin,origins,{Allow:'POST, OPTIONS'}); return; }
    const token = bearer(req);
    if (!token) { send(res,401,{code:'AUTH_REQUIRED',request_id:requestId},origin,origins,{'WWW-Authenticate':'Bearer'}); return; }

    let parsed;
    try { parsed = request(body(req), resolvePlan); }
    catch (error) { send(res,400,{code:error.message || 'APPLE_PURCHASE_PREPARE_REQUEST_INVALID',request_id:requestId},origin,origins); return; }

    let config;
    try { config = loadConfig(); }
    catch { send(res,500,{code:'COMMERCIAL_CONFIG_UNAVAILABLE',request_id:requestId},origin,origins); return; }

    let personId;
    try { personId = await resolvePerson(config, token); }
    catch (error) {
      if (error instanceof ApplePurchaseAuthBoundaryError && error.invalid) { send(res,401,{code:'AUTH_INVALID',request_id:requestId},origin,origins,{'WWW-Authenticate':'Bearer'}); return; }
      send(res,503,{code:'AUTH_UNAVAILABLE',request_id:requestId},origin,origins,{'Retry-After':'5'}); return;
    }

    let prepared;
    try {
      prepared = await createAuthorityClient(config).prepare({
        personId,
        planCode: parsed.plan.planCode,
        billingEnvironment: config.environment,
        productId: parsed.plan.productId,
      });
    } catch (error) {
      if (error instanceof ApplePurchaseAuthorityRpcError && error.retryable) { send(res,503,{code:'APPLE_PURCHASE_PREFLIGHT_UNAVAILABLE',request_id:requestId},origin,origins,{'Retry-After':'5'}); return; }
      if (error instanceof ApplePurchaseAuthorityRpcError && error.databaseCode) { send(res,409,{code:'APPLE_PURCHASE_PREFLIGHT_CONFLICT',request_id:requestId},origin,origins); return; }
      send(res,502,{code:'APPLE_PURCHASE_PREFLIGHT_FAILED',request_id:requestId},origin,origins); return;
    }

    if (prepared.planCode !== parsed.plan.planCode || prepared.productId !== parsed.plan.productId || prepared.billingEnvironment !== config.environment) {
      send(res,502,{code:'APPLE_PURCHASE_PREFLIGHT_MISMATCH',request_id:requestId},origin,origins); return;
    }

    let eligibilityJws;
    try {
      const signatureCreator = await createSignatureCreator(config);
      eligibilityJws = signatureCreator.createSignature(
        prepared.productId,
        prepared.trialEligible,
        parsed.transactionId,
      );
    } catch {
      send(res,502,{code:'APPLE_INTRO_ELIGIBILITY_SIGNATURE_FAILED',request_id:requestId},origin,origins); return;
    }
    if (typeof eligibilityJws !== 'string' || eligibilityJws.split('.').length !== 3) {
      send(res,502,{code:'APPLE_INTRO_ELIGIBILITY_SIGNATURE_INVALID',request_id:requestId},origin,origins); return;
    }

    send(res,200,{
      ok:true,
      purchase_intent_id:prepared.intentId,
      app_account_token:personId,
      product_id:prepared.productId,
      plan_code:prepared.planCode,
      trial_eligible:prepared.trialEligible,
      introductory_offer_eligibility_jws:eligibilityJws,
      expires_at:prepared.intentExpiresAt,
      request_id:requestId,
    },origin,origins);
  };
}
