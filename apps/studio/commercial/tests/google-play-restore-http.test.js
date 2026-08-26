import test from 'node:test';
import assert from 'node:assert/strict';
import { createGooglePlayRestoreHttpHandler } from '../lib/google-play-restore-http.js';

function response() { return { status: null, headers: null, payload: null, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(data = '') { this.payload = data ? JSON.parse(data) : null; } }; }
const personId = '11111111-1111-4111-8111-111111111111';
const sub = {
  billingEnvironment: 'production', sourceSubscriptionRef: 'google:play:purchase:' + 'a'.repeat(64), sourceProductRef: 'google:play:product:zstudio.access:base_plan:monthly',
  externalAccountId: personId, planCode: 'monthly', trialing: false, subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', latestSuccessfulOrderId: 'GPA.1', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING', expiryAtMs: Date.now() + 86400000,
};
function build(overrides = {}) {
  const calls = [];
  const handler = createGooglePlayRestoreHttpHandler({
    loadConfig: () => ({ environment: 'production' }), resolvePerson: async () => personId,
    createCurrentStateClient: () => ({ getSubscription: async () => ({ ...sub, ...(overrides.subscription || {}) }), getOrder: async () => ({ orderId: 'GPA.1' }), acknowledgeSubscription: async () => { calls.push('ack'); } }),
    createRtdnAuthorityClient: () => ({ resolveIdentity: async () => ({ personId, intentId: null, existingSubscription: true, ...(overrides.identity || {}) }) }),
    createPurchaseAuthorityClient: () => ({ reconcileIntent: async () => calls.push('intent'), claimConsumedTrial: async () => calls.push('claim'), applyPause: async () => ({ result: 'applied' }), completeIntent: async () => calls.push('complete'), failIntent: async () => calls.push('fail') }),
    createWriterClient: () => ({ applyVerifiedCommercialEvent: async () => { calls.push('write'); return { result: 'applied', subscriptionStatus: 'active', planCode: 'monthly', studioAccessStatus: 'active', aiAccessStatus: 'active' }; } }),
    normalizeState: () => ({ mode: 'commercial', historicalTrialConsumed: false, writerArgs: {}, commercialEvent: { status: 'active', cancelAtPeriodEnd: false, currentPeriodEndMs: sub.expiryAtMs } }),
    requiresOrder: () => true,
  });
  return { handler, calls };
}

test('restores existing bound purchase, writes before acknowledge, and needs no intent', async () => {
  const { handler, calls } = build(); const res = response();
  await handler({ method: 'POST', headers: { authorization: 'Bearer user', origin: 'capacitor://localhost' }, body: { purchase_token: 'raw-token' } }, res);
  assert.equal(res.status, 200); assert.equal(res.payload.purchase_state, 'processed'); assert.deepEqual(calls, ['write', 'ack']);
});

test('restore fails closed when provider subscription belongs to another canonical person', async () => {
  const { handler } = build({ identity: { personId: '22222222-2222-4222-8222-222222222222' } }); const res = response();
  await handler({ method: 'POST', headers: { authorization: 'Bearer user' }, body: { purchase_token: 'raw-token' } }, res);
  assert.equal(res.status, 403); assert.equal(res.payload.code, 'GOOGLE_PLAY_PURCHASE_IDENTITY_MISMATCH');
});

test('pending restore returns 202 without writer or acknowledge', async () => {
  const { handler, calls } = build({ subscription: { subscriptionState: 'SUBSCRIPTION_STATE_PENDING', latestSuccessfulOrderId: null } }); const res = response();
  await handler({ method: 'POST', headers: { authorization: 'Bearer user' }, body: { purchase_token: 'raw-token' } }, res);
  assert.equal(res.status, 202); assert.equal(res.payload.purchase_state, 'pending'); assert.deepEqual(calls, []);
});
