import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadAppleCommercialConfig } from '../lib/config.js';
import { APPLE_APP_ID, APPLE_PRODUCT_IDS, resolveAppleProduct } from '../lib/store-products.js';

const good = {
  APPLE_ENVIRONMENT: 'sandbox',
  APPLE_BUNDLE_ID: 'com.zoperatingsystem.zstudio',
  APPLE_ISSUER_ID: '11111111-1111-4111-8111-111111111111',
  APPLE_KEY_ID: 'ABC123DEFG',
  APPLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
};

test('pins the official Apple server library exactly', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies['@apple/app-store-server-library'], '3.1.0');
});

test('accepts sandbox without appAppleId but requires all privileged server credentials', () => {
  const config = loadAppleCommercialConfig(good);
  assert.equal(config.environment, 'sandbox');
  assert.equal(config.bundleId, 'com.zoperatingsystem.zstudio');
  assert.equal(config.appAppleId, null);
  assert.equal(config.supabaseUrl, 'https://example.supabase.co');
  assert.equal(config.supabaseSecretKey, 'sb_secret_test');
  assert.equal('supabaseServiceRole' in config, false);
});

test('production requires numeric appAppleId', () => {
  assert.throws(
    () => loadAppleCommercialConfig({ ...good, APPLE_ENVIRONMENT: 'production' }),
    /APPLE_APP_APPLE_ID/,
  );
  const config = loadAppleCommercialConfig({
    ...good,
    APPLE_ENVIRONMENT: 'production',
    APPLE_APP_APPLE_ID: '1234567890',
  });
  assert.equal(config.appAppleId, '1234567890');
});

test('fails closed on wrong bundle id, environment, issuer id, key id, private key, Supabase URL, or secret key', () => {
  const cases = [
    ['APPLE_BUNDLE_ID', 'com.example.other'],
    ['APPLE_ENVIRONMENT', 'xcode'],
    ['APPLE_ISSUER_ID', ''],
    ['APPLE_KEY_ID', ''],
    ['APPLE_PRIVATE_KEY', 'not-a-private-key'],
    ['SUPABASE_URL', 'http://example.supabase.co'],
    ['SUPABASE_SECRET_KEY', 'legacy-or-malformed-key'],
  ];
  for (const [key, value] of cases) {
    assert.throws(() => loadAppleCommercialConfig({ ...good, [key]: value }));
  }
});

test('legacy service_role alone is not accepted as commercial runtime authority', () => {
  const legacyOnly = {
    ...good,
    SUPABASE_SERVICE_ROLE: 'legacy-test-value',
  };
  delete legacyOnly.SUPABASE_SECRET_KEY;

  assert.throws(
    () => loadAppleCommercialConfig(legacyOnly),
    /ZSTUDIO_COMMERCIAL_CONFIG_MISSING:SUPABASE_SECRET_KEY/,
  );
});

test('catalog exposes exactly the three frozen Apple product ids', () => {
  assert.equal(APPLE_APP_ID, 'com.zoperatingsystem.zstudio');
  assert.deepEqual(APPLE_PRODUCT_IDS, [
    'com.zoperatingsystem.zstudio.subscription.annual',
    'com.zoperatingsystem.zstudio.subscription.monthly',
    'com.zoperatingsystem.zstudio.subscription.weekly',
  ]);
  assert.equal(resolveAppleProduct('com.zoperatingsystem.zstudio.subscription.weekly').planCode, 'weekly');
  assert.throws(() => resolveAppleProduct('com.example.unauthorized'), /APPLE_PRODUCT_NOT_AUTHORIZED/);
});
