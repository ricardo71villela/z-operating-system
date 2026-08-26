import test from 'node:test';
import assert from 'node:assert/strict';
import { createGooglePlayAuthorityClient } from '../lib/google-play-authority-client.js';

const config = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseSecretKey: 'sb_secret_test',
};
const intentId = '22222222-2222-4222-8222-222222222222';
const personId = '11111111-1111-4111-8111-111111111111';
const subRef = `google:play:purchase:${'a'.repeat(64)}`;
const eventRef = `google:play:event:current-state:snapshot:${'b'.repeat(64)}`;
const productRef = 'google:play:product:zstudio.access:base_plan:monthly';

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test('reconcile intent passes exact hashed current-state authority', async () => {
  let seen;
  const client = createGooglePlayAuthorityClient(config, {
    fetchImpl: async (url, options) => {
      seen = [url, JSON.parse(options.body), options.headers];
      return response({
        result: 'purchase_seen',
        intent_id: intentId,
        state: 'purchase_seen',
        plan_code: 'monthly',
        trial_reserved: true,
        source_subscription_ref: subRef,
      });
    },
  });
  const result = await client.reconcileIntent({
    intentId, personId, billingEnvironment: 'production', planCode: 'monthly',
    sourceSubscriptionRef: subRef, providerTrialing: true,
  });
  assert.equal(result.result, 'purchase_seen');
  assert.match(seen[0], /zstudio_reconcile_google_play_purchase_intent$/);
  assert.deepEqual(seen[1], {
    p_intent_id: intentId,
    p_person_id: personId,
    p_billing_environment: 'production',
    p_plan_code: 'monthly',
    p_source_subscription_ref: subRef,
    p_provider_trialing: true,
  });
  assert.equal(seen[2].apikey, 'sb_secret_test');
});

test('terminal-trial claim sends deterministic effective timestamp and no provider token', async () => {
  let body;
  const client = createGooglePlayAuthorityClient(config, {
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return response({ result: 'claimed' });
    },
  });
  const result = await client.claimConsumedTrial({
    intentId, personId, sourceSubscriptionRef: subRef,
    billingEnvironment: 'production', claimedAtMs: Date.parse('2026-08-20T20:00:00Z'),
  });
  assert.equal(result.result, 'claimed');
  assert.equal(body.p_claimed_at, '2026-08-20T20:00:00.000Z');
  assert.equal(JSON.stringify(body).includes('purchase-token'), false);
});

test('pause authority uses the dedicated RPC and exact snapshot event ref', async () => {
  let seen;
  const client = createGooglePlayAuthorityClient(config, {
    fetchImpl: async (url, options) => {
      seen = [url, JSON.parse(options.body)];
      return response({
        result: 'applied',
        subscription_id: '33333333-3333-4333-8333-333333333333',
        subscription_status: 'paused',
        plan_code: 'monthly',
        studio_access_status: 'expired',
        ai_access_status: 'expired',
      });
    },
  });
  const result = await client.applyPause({
    personId,
    billingEnvironment: 'sandbox',
    sourceEventRef: eventRef,
    sourceSubscriptionRef: subRef,
    sourceProductRef: productRef,
    planCode: 'monthly',
    effectiveAtMs: Date.parse('2026-08-20T20:00:00Z'),
  });
  assert.equal(result.subscriptionStatus, 'paused');
  assert.match(seen[0], /zstudio_apply_verified_google_play_pause_event$/);
  assert.equal(seen[1].p_source_event_ref, eventRef);
});

test('complete and failed intents are separate explicit authorities', async () => {
  const names = [];
  const client = createGooglePlayAuthorityClient(config, {
    fetchImpl: async (url) => {
      names.push(url);
      if (url.endsWith('zstudio_complete_google_play_purchase_intent')) {
        return response({ result: 'completed', intent_id: intentId, state: 'completed' });
      }
      return response({ result: 'failed', intent_id: intentId, state: 'failed' });
    },
  });
  assert.equal((await client.completeIntent({ intentId, personId, billingEnvironment: 'sandbox', sourceSubscriptionRef: subRef })).result, 'completed');
  assert.equal((await client.failIntent({ intentId, personId, billingEnvironment: 'sandbox', sourceSubscriptionRef: subRef })).result, 'failed');
  assert.ok(names[0].endsWith('zstudio_complete_google_play_purchase_intent'));
  assert.ok(names[1].endsWith('zstudio_fail_google_play_purchase_intent'));
});

test('database conflicts are permanent while 429/5xx and transport are retryable', async () => {
  const conflict = createGooglePlayAuthorityClient(config, {
    fetchImpl: async () => response({ code: '23514', message: 'GOOGLE_PLAY_RECONCILE_INTENT_IDENTITY_CONFLICT' }, 400),
  });
  await assert.rejects(
    () => conflict.reconcileIntent({ intentId, personId, billingEnvironment: 'sandbox', planCode: 'monthly', sourceSubscriptionRef: subRef, providerTrialing: false }),
    (error) => error.databaseCode === 'GOOGLE_PLAY_RECONCILE_INTENT_IDENTITY_CONFLICT' && error.retryable === false,
  );

  const throttled = createGooglePlayAuthorityClient(config, {
    fetchImpl: async () => response({}, 429),
  });
  await assert.rejects(
    () => throttled.completeIntent({ intentId, personId, billingEnvironment: 'sandbox', sourceSubscriptionRef: subRef }),
    (error) => error.retryable === true && error.httpStatusCode === 429,
  );

  const offline = createGooglePlayAuthorityClient(config, {
    fetchImpl: async () => { throw new Error('offline'); },
  });
  await assert.rejects(
    () => offline.failIntent({ intentId, personId, billingEnvironment: 'sandbox', sourceSubscriptionRef: subRef }),
    (error) => error.retryable === true,
  );
});
