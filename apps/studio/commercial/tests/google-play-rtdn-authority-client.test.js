import test from 'node:test';
import assert from 'node:assert/strict';
import { createGooglePlayRtdnAuthorityClient } from '../lib/google-play-rtdn-authority-client.js';

const config = { supabaseUrl: 'https://example.supabase.co', supabaseSecretKey: 'sb_secret_test' };
function response(payload, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => payload }; }

test('resolves RTDN identity through service-role RPC with hashed subscription ref only', async () => {
  let body;
  const client = createGooglePlayRtdnAuthorityClient(config, { fetchImpl: async (_url, options) => {
    body = JSON.parse(options.body);
    return response({ result: 'resolved', person_id: '11111111-1111-4111-8111-111111111111', intent_id: null, existing_subscription: true, trial_reserved: false });
  }});
  const result = await client.resolveIdentity({
    billingEnvironment: 'production',
    sourceSubscriptionRef: `google:play:purchase:${'a'.repeat(64)}`,
    externalAccountId: null,
    planCode: 'monthly',
    providerTrialing: false,
  });
  assert.equal(result.existingSubscription, true);
  assert.equal(result.intentId, null);
  assert.equal(body.p_source_subscription_ref, `google:play:purchase:${'a'.repeat(64)}`);
  assert.equal('purchase_token' in body, false);
});

test('checks message dedupe before provider calls and marks only normalized trigger metadata', async () => {
  const calls = [];
  const client = createGooglePlayRtdnAuthorityClient(config, { fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push([url, body]);
    if (url.endsWith('zstudio_google_play_rtdn_is_processed')) return response(false);
    return response({ result: 'processed' });
  }});
  assert.equal(await client.isProcessed('123456'), false);
  const result = await client.markProcessed({
    messageId: '123456',
    notificationKind: 'subscription',
    notificationType: 2,
    eventTimeMs: 1800000000000,
    sourceSubscriptionRef: `google:play:purchase:${'b'.repeat(64)}`,
  });
  assert.equal(result.result, 'processed');
  assert.equal(calls.length, 2);
  assert.equal(JSON.stringify(calls).includes('opaque'), false);
});

test('classifies transient Supabase failure as retryable and database conflict as permanent', async () => {
  const transient = createGooglePlayRtdnAuthorityClient(config, { fetchImpl: async () => response({ message: 'temporary' }, 503) });
  await assert.rejects(() => transient.isProcessed('1'), (error) => error.retryable === true);
  const conflict = createGooglePlayRtdnAuthorityClient(config, { fetchImpl: async () => response({ code: '23514', message: 'GOOGLE_PLAY_RTDN_EXTERNAL_IDENTITY_CONFLICT' }, 400) });
  await assert.rejects(() => conflict.resolveIdentity({
    billingEnvironment: 'production',
    sourceSubscriptionRef: `google:play:purchase:${'c'.repeat(64)}`,
    externalAccountId: '11111111-1111-4111-8111-111111111111',
    planCode: 'weekly',
    providerTrialing: false,
  }), (error) => error.databaseCode === 'GOOGLE_PLAY_RTDN_EXTERNAL_IDENTITY_CONFLICT' && error.retryable === false);
});

test('records pending refund review in support-only RPC without invoking commercial writer', async () => {
  let urlSeen;
  let bodySeen;
  const client = createGooglePlayRtdnAuthorityClient(config, { fetchImpl: async (url, options) => {
    urlSeen = url;
    bodySeen = JSON.parse(options.body);
    return response({ result: 'recorded' });
  }});
  const result = await client.recordPendingRefundReview({
    messageId: '999',
    pendingRefundToken: 'pending-review-token',
    orderId: 'GPA.review',
    refundReason: 7,
    obfuscatedAccountId: '11111111-1111-4111-8111-111111111111',
    eventTimeMs: 1800000000000,
  });
  assert.equal(result.result, 'recorded');
  assert.match(urlSeen, /zstudio_record_google_play_pending_refund_review$/);
  assert.equal(bodySeen.p_pending_refund_token, 'pending-review-token');
  assert.equal(JSON.stringify(bodySeen).includes('purchase_token'), false);
});
