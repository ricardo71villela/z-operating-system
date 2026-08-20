import test from 'node:test';
import assert from 'node:assert/strict';
import { createGooglePlayPreflightClient } from '../lib/google-play-preflight-client.js';

const config = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseSecretKey: 'sb_secret_test',
};
const person = '11111111-1111-4111-8111-111111111111';
const intent = '22222222-2222-4222-8222-222222222222';
const source = `google:play:purchase:${'a'.repeat(64)}`;

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test('prepare sends service-role RPC and returns only safe purchase decision', async () => {
  let seen;
  const client = createGooglePlayPreflightClient(config, {
    fetchImpl: async (url, options) => {
      seen = { url, options };
      return response({
        result: 'prepared', intent_id: intent, plan_code: 'monthly',
        billing_environment: 'sandbox', trial_eligible: true,
        intent_expires_at: '2026-08-21T00:30:00Z',
      });
    },
  });
  const result = await client.prepare({ personId: person, planCode: 'monthly', billingEnvironment: 'sandbox' });
  assert.equal(result.trialEligible, true);
  assert.equal(result.intentId, intent);
  assert.match(seen.url, /zstudio_prepare_google_play_purchase$/);
  assert.equal(seen.options.headers.apikey, 'sb_secret_test');
  assert.deepEqual(JSON.parse(seen.options.body), {
    p_person_id: person,
    p_plan_code: 'monthly',
    p_billing_environment: 'sandbox',
  });
});

test('bind and complete pass only hashed purchase reference', async () => {
  const calls = [];
  const client = createGooglePlayPreflightClient(config, {
    fetchImpl: async (url, options) => {
      calls.push([url, JSON.parse(options.body)]);
      return response({ result: 'ok' });
    },
  });
  await client.bind({
    intentId: intent, personId: person, billingEnvironment: 'production',
    planCode: 'annual', sourceSubscriptionRef: source, providerTrialing: false,
  });
  await client.complete({
    intentId: intent, personId: person, billingEnvironment: 'production',
    sourceSubscriptionRef: source,
  });
  assert.equal(JSON.stringify(calls).includes('purchase-token'), false);
  assert.equal(calls[0][1].p_source_subscription_ref, source);
  assert.equal(calls[0][1].p_provider_trialing, false);
  assert.equal(calls[1][1].p_source_subscription_ref, source);
});

test('RPC conflicts and transport failures are classified fail-closed', async () => {
  const conflict = createGooglePlayPreflightClient(config, {
    fetchImpl: async () => response({ code: '23514' }, 400),
  });
  await assert.rejects(() => conflict.prepare({ personId: person, planCode: 'weekly', billingEnvironment: 'production' }),
    (error) => error.databaseCode === '23514' && error.retryable === false);

  const unavailable = createGooglePlayPreflightClient(config, {
    fetchImpl: async () => { throw new Error('offline'); },
  });
  await assert.rejects(() => unavailable.prepare({ personId: person, planCode: 'weekly', billingEnvironment: 'production' }),
    (error) => error.retryable === true);
});
