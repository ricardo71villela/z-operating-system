import test from 'node:test';
import assert from 'node:assert/strict';
import {
  StudioAuthBoundaryError,
  createAppleDeviceReconcileHttpHandler,
  validateSupabaseBearerAndResolvePerson,
} from '../lib/apple-device-reconcile-http.js';
import { CommercialWriterRpcError } from '../lib/commercial-writer-client.js';

const personId = 'a1111111-b222-c333-d444-e55555555555';
const subscriptionId = 'b1111111-b222-c333-d444-e55555555555';
const transactionId = '2000000000000005';
const productId = 'com.zoperatingsystem.zstudio.subscription.monthly';
const config = Object.freeze({
  environment: 'sandbox',
  bundleId: 'com.zoperatingsystem.zstudio',
  supabaseUrl: 'https://example.supabase.co',
  supabasePublishableKey: 'test-publishable-key',
  supabaseServiceRole: 'test-service-role-not-real',
});

function req({ method = 'POST', body = { jwsRepresentation: 'header.payload.signature' }, authorization = 'Bearer user-token', origin = 'capacitor://localhost' } = {}) {
  return { method, body, headers: { authorization, origin } };
}

function res() {
  return {
    status: null,
    headers: null,
    body: '',
    writeHead(status, headers = {}) { this.status = status; this.headers = headers; },
    end(body = '') { this.body = body; },
  };
}

function json(response) {
  return response.body ? JSON.parse(response.body) : null;
}

function device(overrides = {}) {
  return {
    verification: 'verified',
    transactionId,
    originalTransactionId: '2000000000000000',
    productId,
    planCode: 'monthly',
    appAccountToken: personId,
    bundleId: 'com.zoperatingsystem.zstudio',
    environment: 'sandbox',
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return {
    verification: 'verified_current_state',
    billingSource: 'apple_app_store',
    billingEnvironment: 'sandbox',
    sourceEventRef: `app:${'a'.repeat(64)}`,
    sourceSubscriptionRef: '2000000000000000',
    sourceProductRef: productId,
    personId,
    planCode: 'monthly',
    normalizedStatus: 'active',
    cancelAtPeriodEnd: false,
    trialStartedAtMs: null,
    trialEndsAtMs: null,
    currentPeriodStartMs: 1789761600000,
    currentPeriodEndMs: 1792440000000,
    currentProductId: productId,
    rawJwsIncluded: false,
    ...overrides,
  };
}

function successfulHandler(overrides = {}) {
  const calls = [];
  const handler = createAppleDeviceReconcileHttpHandler({
    loadConfig: () => config,
    resolvePerson: async (_config, token) => { calls.push(['person', token]); return personId; },
    verifyTransaction: async (jws) => { calls.push(['verify', jws]); return device(); },
    reconcileCurrentState: async (evidence) => { calls.push(['reconcile', evidence.transactionId]); return snapshot(); },
    applyCommercialEvent: async (state) => {
      calls.push(['writer', state.personId]);
      return {
        result: 'applied',
        subscriptionId,
        subscriptionStatus: 'active',
        planCode: 'monthly',
        studioAccessStatus: 'active',
        aiAccessStatus: 'active',
      };
    },
    ...overrides,
  });
  return { handler, calls };
}

test('successful device reconcile requires bearer identity before Apple and writer boundaries', async () => {
  const { handler, calls } = successfulHandler();
  const response = res();
  await handler(req(), response);
  const body = json(response);

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    ['person', 'user-token'],
    ['verify', 'header.payload.signature'],
    ['reconcile', transactionId],
    ['writer', personId],
  ]);
  assert.equal(body.ok, true);
  assert.equal(body.verification, 'verified_current_state');
  assert.equal(body.commercial_result, 'applied');
  assert.equal(body.subscription_id, subscriptionId);
  assert.equal(body.finish_transaction_id, transactionId);
  assert.equal(body.product_id, productId);
  assert.equal(body.period_end, '2026-10-19T20:00:00.000Z');
  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes('header.payload.signature'), false);
  assert.equal(serialized.includes(config.supabaseServiceRole), false);
});

test('request contract accepts only jwsRepresentation and rejects client commercial authority fields', async () => {
  let touched = false;
  const { handler } = successfulHandler({
    resolvePerson: async () => { touched = true; return personId; },
  });
  const response = res();
  await handler(req({ body: { jwsRepresentation: 'x.y.z', productId, personId } }), response);
  assert.equal(response.status, 400);
  assert.equal(json(response).code, 'APPLE_RECONCILE_REQUEST_INVALID');
  assert.equal(touched, false);
});

test('missing or invalid bearer fails before Apple verification', async () => {
  let verified = false;
  const { handler } = successfulHandler({
    resolvePerson: async () => { throw new StudioAuthBoundaryError('STUDIO_AUTH_INVALID', { invalid: true }); },
    verifyTransaction: async () => { verified = true; return device(); },
  });

  const missing = res();
  await handler(req({ authorization: '' }), missing);
  assert.equal(missing.status, 401);
  assert.equal(json(missing).code, 'AUTH_REQUIRED');

  const invalid = res();
  await handler(req(), invalid);
  assert.equal(invalid.status, 401);
  assert.equal(json(invalid).code, 'AUTH_INVALID');
  assert.equal(verified, false);
});

test('verified Apple appAccountToken must equal canonical zos person before reconciliation or write', async () => {
  let reconciled = false;
  let written = false;
  const { handler } = successfulHandler({
    verifyTransaction: async () => device({ appAccountToken: 'f1111111-b222-c333-d444-e55555555555' }),
    reconcileCurrentState: async () => { reconciled = true; return snapshot(); },
    applyCommercialEvent: async () => { written = true; return {}; },
  });
  const response = res();
  await handler(req(), response);
  assert.equal(response.status, 403);
  assert.equal(json(response).code, 'APPLE_PURCHASE_IDENTITY_MISMATCH');
  assert.equal(reconciled, false);
  assert.equal(written, false);
});

test('current-state person is checked again before writer', async () => {
  let written = false;
  const { handler } = successfulHandler({
    reconcileCurrentState: async () => snapshot({ personId: 'f1111111-b222-c333-d444-e55555555555' }),
    applyCommercialEvent: async () => { written = true; return {}; },
  });
  const response = res();
  await handler(req(), response);
  assert.equal(response.status, 403);
  assert.equal(written, false);
});

test('Apple evidence rejection is 422 while transient reconciliation failure is 503', async () => {
  const rejected = successfulHandler({ verifyTransaction: async () => { throw new Error('APPLE_SIGNED_TRANSACTION_UNVERIFIED'); } }).handler;
  const rejectedRes = res();
  await rejected(req(), rejectedRes);
  assert.equal(rejectedRes.status, 422);
  assert.equal(json(rejectedRes).code, 'APPLE_EVIDENCE_REJECTED');

  const unavailable = successfulHandler({ reconcileCurrentState: async () => { throw new TypeError('network unavailable'); } }).handler;
  const unavailableRes = res();
  await unavailable(req(), unavailableRes);
  assert.equal(unavailableRes.status, 503);
  assert.equal(json(unavailableRes).code, 'APPLE_RECONCILIATION_UNAVAILABLE');
  assert.equal(unavailableRes.headers['Retry-After'], '5');
});

test('writer retryable failures return 503 and conflicts return 409 without automatic retry', async () => {
  let retryCalls = 0;
  const retryHandler = successfulHandler({
    applyCommercialEvent: async () => {
      retryCalls += 1;
      throw new CommercialWriterRpcError('COMMERCIAL_WRITER_RPC_FAILED', { retryable: true, httpStatus: 503 });
    },
  }).handler;
  const retryRes = res();
  await retryHandler(req(), retryRes);
  assert.equal(retryRes.status, 503);
  assert.equal(retryCalls, 1);

  let conflictCalls = 0;
  const conflictHandler = successfulHandler({
    applyCommercialEvent: async () => {
      conflictCalls += 1;
      throw new CommercialWriterRpcError('COMMERCIAL_WRITER_RPC_FAILED', { retryable: false, databaseCode: 'COMMERCIAL_EVENT_CONFLICT' });
    },
  }).handler;
  const conflictRes = res();
  await conflictHandler(req(), conflictRes);
  assert.equal(conflictRes.status, 409);
  assert.equal(json(conflictRes).code, 'COMMERCIAL_WRITE_CONFLICT');
  assert.equal(conflictCalls, 1);
});

test('origin and method boundaries are explicit', async () => {
  const { handler } = successfulHandler();
  const denied = res();
  await handler(req({ origin: 'https://evil.example' }), denied);
  assert.equal(denied.status, 403);

  const preflight = res();
  await handler(req({ method: 'OPTIONS' }), preflight);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers['Access-Control-Allow-Origin'], 'capacitor://localhost');

  const wrongMethod = res();
  await handler(req({ method: 'GET' }), wrongMethod);
  assert.equal(wrongMethod.status, 405);
});

test('Supabase user boundary validates user token then resolves canonical person with authenticated RPC only', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push([url, options]);
    if (url.endsWith('/auth/v1/user')) {
      return { ok: true, status: 200 };
    }
    if (url.endsWith('/rest/v1/rpc/zstudio_ensure_account')) {
      return { ok: true, status: 200, async json() { return personId; } };
    }
    throw new Error('unexpected url');
  };

  const resolved = await validateSupabaseBearerAndResolvePerson(
    config,
    'user-token',
    { fetchImpl },
  );
  assert.equal(resolved, personId);
  assert.equal(calls.length, 2);
  for (const [, options] of calls) {
    assert.equal(options.headers.apikey, config.supabasePublishableKey);
    assert.equal(options.headers.Authorization, 'Bearer user-token');
    assert.equal(JSON.stringify(options).includes(config.supabaseServiceRole), false);
  }
  assert.equal(calls[1][1].body, '{}');
});
