import test from 'node:test';
import assert from 'node:assert/strict';
import { createGooglePlayPreflightHttpHandler } from '../lib/google-play-preflight-http.js';
import { GooglePlayPreflightRpcError } from '../lib/google-play-preflight-client.js';

function res() {
  return {
    status: null, headers: null, payload: null,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(data = '') { this.payload = data ? JSON.parse(data) : null; },
  };
}

const config = { environment: 'production' };
const resolvePlan = (value) => {
  if (value !== 'monthly') throw new Error('bad');
  return { planCode: 'monthly' };
};

function handler(overrides = {}) {
  return createGooglePlayPreflightHttpHandler({
    loadConfig: () => config,
    resolvePerson: async () => '11111111-1111-4111-8111-111111111111',
    resolvePlan,
    createClient: () => ({
      prepare: async () => ({
        intentId: '22222222-2222-4222-8222-222222222222',
        planCode: 'monthly', trialEligible: true,
        intentExpiresAt: '2026-08-21T00:30:00Z',
      }),
    }),
    ...overrides,
  });
}

test('authenticated prepare returns only intent and server-decided trial flag', async () => {
  const response = res();
  await handler()({
    method: 'POST',
    headers: { authorization: 'Bearer user-token', origin: 'capacitor://localhost' },
    body: { plan_code: 'monthly' },
  }, response);
  assert.equal(response.status, 200);
  assert.equal(response.payload.use_trial_offer, true);
  assert.equal(response.payload.purchase_intent_id, '22222222-2222-4222-8222-222222222222');
  assert.equal('person_id' in response.payload, false);
});

test('rejects extra body authority and missing bearer', async () => {
  let response = res();
  await handler()({ method: 'POST', headers: {}, body: { plan_code: 'monthly' } }, response);
  assert.equal(response.status, 401);

  response = res();
  await handler()({
    method: 'POST', headers: { authorization: 'Bearer x' },
    body: { plan_code: 'monthly', use_trial_offer: true },
  }, response);
  assert.equal(response.status, 400);
});

test('database authority conflict becomes 409 and retryable outage becomes 503', async () => {
  let response = res();
  await handler({
    createClient: () => ({ prepare: async () => { throw new GooglePlayPreflightRpcError('x', { databaseCode: '23514' }); } }),
  })({ method: 'POST', headers: { authorization: 'Bearer x' }, body: { plan_code: 'monthly' } }, response);
  assert.equal(response.status, 409);

  response = res();
  await handler({
    createClient: () => ({ prepare: async () => { throw new GooglePlayPreflightRpcError('x', { retryable: true }); } }),
  })({ method: 'POST', headers: { authorization: 'Bearer x' }, body: { plan_code: 'monthly' } }, response);
  assert.equal(response.status, 503);
  assert.equal(response.headers['Retry-After'], '5');
});
