import { randomUUID } from 'node:crypto';
import {
  StudioAuthBoundaryError,
  validateSupabaseBearerAndResolvePerson,
} from './apple-device-reconcile-http.js';
import { GooglePlayPreflightRpcError } from './google-play-preflight-client.js';

const ALLOWED_ORIGINS = new Set([
  'capacitor://localhost',
  'https://localhost',
  'https://zstudio.space',
  'https://www.zstudio.space',
]);

function bearer(req) {
  const raw = String(req?.headers?.authorization ?? req?.headers?.Authorization ?? '').trim();
  return raw.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}

function body(req) {
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8'));
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
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
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...cors(origin, origins),
    ...extra,
  });
  res.end(JSON.stringify(payload));
}

function requestedPlan(payload, resolvePlan) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('GOOGLE_PLAY_PREPARE_REQUEST_INVALID');
  }
  if (Object.keys(payload).sort().join('\n') !== 'plan_code') {
    throw new Error('GOOGLE_PLAY_PREPARE_REQUEST_INVALID');
  }
  return resolvePlan(payload.plan_code).planCode;
}

export function createGooglePlayPreflightHttpHandler({
  loadConfig,
  createClient,
  resolvePlan,
  resolvePerson = validateSupabaseBearerAndResolvePerson,
  allowedOrigins = ALLOWED_ORIGINS,
} = {}) {
  if (
    typeof loadConfig !== 'function'
    || typeof createClient !== 'function'
    || typeof resolvePlan !== 'function'
    || typeof resolvePerson !== 'function'
  ) {
    throw new Error('GOOGLE_PLAY_PREFLIGHT_HANDLER_DEPENDENCIES_INVALID');
  }

  return async function handler(req, res) {
    const requestId = randomUUID();
    const origin = String(req?.headers?.origin ?? '');
    const origins = allowedOrigins instanceof Set ? allowedOrigins : new Set(allowedOrigins ?? []);

    if (origin && !origins.has(origin)) {
      send(res, 403, { code: 'ORIGIN_DENIED', request_id: requestId }, origin, origins);
      return;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors(origin, origins));
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      send(res, 405, { code: 'METHOD_NOT_ALLOWED', request_id: requestId }, origin, origins, { Allow: 'POST, OPTIONS' });
      return;
    }

    const token = bearer(req);
    if (!token) {
      send(res, 401, { code: 'AUTH_REQUIRED', request_id: requestId }, origin, origins, { 'WWW-Authenticate': 'Bearer' });
      return;
    }

    let planCode;
    try {
      planCode = requestedPlan(body(req), resolvePlan);
    } catch {
      send(res, 400, { code: 'GOOGLE_PLAY_PREPARE_REQUEST_INVALID', request_id: requestId }, origin, origins);
      return;
    }

    let config;
    try {
      config = loadConfig();
    } catch {
      send(res, 500, { code: 'COMMERCIAL_CONFIG_UNAVAILABLE', request_id: requestId }, origin, origins);
      return;
    }

    let personId;
    try {
      personId = await resolvePerson(config, token);
    } catch (error) {
      if (error instanceof StudioAuthBoundaryError && error.invalid) {
        send(res, 401, { code: 'AUTH_INVALID', request_id: requestId }, origin, origins, { 'WWW-Authenticate': 'Bearer' });
        return;
      }
      send(res, 503, { code: 'AUTH_UNAVAILABLE', request_id: requestId }, origin, origins, { 'Retry-After': '5' });
      return;
    }

    let prepared;
    try {
      prepared = await createClient(config).prepare({
        personId,
        planCode,
        billingEnvironment: config.environment,
      });
    } catch (error) {
      if (error instanceof GooglePlayPreflightRpcError && error.retryable) {
        send(res, 503, { code: 'GOOGLE_PLAY_PREFLIGHT_UNAVAILABLE', request_id: requestId }, origin, origins, { 'Retry-After': '5' });
        return;
      }
      if (error instanceof GooglePlayPreflightRpcError && error.databaseCode) {
        send(res, 409, { code: 'GOOGLE_PLAY_PREFLIGHT_CONFLICT', request_id: requestId }, origin, origins);
        return;
      }
      send(res, 502, { code: 'GOOGLE_PLAY_PREFLIGHT_FAILED', request_id: requestId }, origin, origins);
      return;
    }

    send(res, 200, {
      ok: true,
      purchase_intent_id: prepared.intentId,
      plan_code: prepared.planCode,
      use_trial_offer: prepared.trialEligible,
      expires_at: prepared.intentExpiresAt,
      request_id: requestId,
    }, origin, origins);
  };
}
