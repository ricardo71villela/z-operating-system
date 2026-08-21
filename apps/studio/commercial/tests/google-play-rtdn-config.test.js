import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGooglePlayRtdnConfig } from '../lib/google-play-config.js';

function env(overrides = {}) {
  return {
    GOOGLE_PLAY_ENVIRONMENT: 'sandbox',
    GOOGLE_PLAY_PACKAGE_NAME: 'com.zoperatingsystem.zstudio',
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({
      type: 'service_account',
      project_id: 'zstudio-billing-test',
      private_key_id: 'abcdef1234567890',
      private_key: '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----',
      client_email: 'billing@zstudio-billing-test.iam.gserviceaccount.com',
      token_uri: 'https://oauth2.googleapis.com/token',
    }),
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_test',
    GOOGLE_PLAY_PUBSUB_AUDIENCE: 'https://commercial.example/api/google/play/rtdn',
    GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL: 'rtdn@zstudio-billing-test.iam.gserviceaccount.com',
    GOOGLE_PLAY_PUBSUB_SUBSCRIPTION: 'projects/zstudio-billing-test/subscriptions/zstudio-google-play-rtdn',
    ...overrides,
  };
}

test('loads RTDN audience, auth service account and exact Pub/Sub subscription separately from Play API service account', () => {
  const config = loadGooglePlayRtdnConfig(env());
  assert.equal(config.pubsubAudience, 'https://commercial.example/api/google/play/rtdn');
  assert.equal(config.pubsubServiceAccountEmail, 'rtdn@zstudio-billing-test.iam.gserviceaccount.com');
  assert.equal(config.pubsubSubscription, 'projects/zstudio-billing-test/subscriptions/zstudio-google-play-rtdn');
  assert.equal(config.serviceAccount.clientEmail, 'billing@zstudio-billing-test.iam.gserviceaccount.com');
});

test('fails closed on non-HTTPS audience, malformed push service account or subscription path', () => {
  assert.throws(() => loadGooglePlayRtdnConfig(env({ GOOGLE_PLAY_PUBSUB_AUDIENCE: 'http://commercial.example/rtdn' })));
  assert.throws(() => loadGooglePlayRtdnConfig(env({ GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL: 'user@example.com' })));
  assert.throws(() => loadGooglePlayRtdnConfig(env({ GOOGLE_PLAY_PUBSUB_SUBSCRIPTION: 'zstudio-google-play-rtdn' })));
});
