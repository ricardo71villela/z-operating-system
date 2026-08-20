import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { loadGooglePlayCommercialConfig } from '../lib/google-play-config.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });

function env(overrides = {}) {
  return {
    GOOGLE_PLAY_ENVIRONMENT: 'sandbox',
    GOOGLE_PLAY_PACKAGE_NAME: 'com.zoperatingsystem.zstudio',
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({
      type: 'service_account',
      project_id: 'zstudio-billing-test',
      private_key_id: 'abcdef1234567890',
      private_key: pem,
      client_email: 'billing@zstudio-billing-test.iam.gserviceaccount.com',
      token_uri: 'https://oauth2.googleapis.com/token',
    }),
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_test',
    ...overrides,
  };
}

test('loads exact Google Play package, environment and server-only service account', () => {
  const config = loadGooglePlayCommercialConfig(env());
  assert.equal(config.environment, 'sandbox');
  assert.equal(config.packageName, 'com.zoperatingsystem.zstudio');
  assert.equal(config.serviceAccount.clientEmail, 'billing@zstudio-billing-test.iam.gserviceaccount.com');
  assert.equal(config.serviceAccount.tokenUri, 'https://oauth2.googleapis.com/token');
  assert.equal(config.supabaseSecretKey, 'sb_secret_test');
});

test('fails closed on package, environment, token URI, service account type or Supabase authority mismatch', () => {
  assert.throws(() => loadGooglePlayCommercialConfig(env({ GOOGLE_PLAY_PACKAGE_NAME: 'com.example.other' })));
  assert.throws(() => loadGooglePlayCommercialConfig(env({ GOOGLE_PLAY_ENVIRONMENT: 'internal' })));
  const parsed = JSON.parse(env().GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
  assert.throws(() => loadGooglePlayCommercialConfig(env({
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ ...parsed, token_uri: 'https://example.com/token' }),
  })));
  assert.throws(() => loadGooglePlayCommercialConfig(env({
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ ...parsed, type: 'authorized_user' }),
  })));
  assert.throws(() => loadGooglePlayCommercialConfig(env({ SUPABASE_SECRET_KEY: 'legacy' })));
});
