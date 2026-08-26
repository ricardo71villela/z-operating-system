import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const commercial = path.resolve(here, '..');
const studio = path.resolve(commercial, '..');
const repo = path.resolve(studio, '../..');
const native = path.join(studio, 'native');
const read = (file) => fs.readFileSync(file, 'utf8');

const authority = JSON.parse(read(path.join(commercial, 'store-products.v1.json')));

test('Google Play catalog authority is exact and single-product/base-plan based', () => {
  assert.equal(authority.authority, 'ZSTUDIO_STORE_PRODUCT_AUTHORITY_V1');
  assert.equal(authority.appId, 'com.zoperatingsystem.zstudio');
  assert.equal(authority.commercialTargetCurrency, 'EUR');
  assert.equal(authority.trialDays, 3);
  const prices = { weekly: 599, monthly: 1499, annual: 11999 };
  for (const [plan, expectedPrice] of Object.entries(prices)) {
    const item = authority.plans[plan];
    assert.equal(item.commercialTargetPriceMinor, expectedPrice);
    assert.equal(item.google.productId, 'zstudio.access');
    assert.equal(item.google.basePlanId, plan);
    assert.equal(item.google.offerId, 'trial-3d');
    assert.equal(item.google.offerType, 'free_trial');
    assert.equal(item.google.trialDurationDays, 3);
    assert.equal(item.google.eligibility, 'never_had_subscription');
  }
});

test('Android package, Billing Library and server-only acknowledgement authority are frozen', () => {
  const gradle = read(path.join(native, 'android/app/build.gradle'));
  const plugin = read(path.join(native, 'android/app/src/main/java/com/zoperatingsystem/zstudio/ZStudioPlayBillingPlugin.java'));
  assert.match(gradle, /namespace = "com\.zoperatingsystem\.zstudio"/);
  assert.match(gradle, /applicationId "com\.zoperatingsystem\.zstudio"/);
  assert.match(gradle, /com\.android\.billingclient:billing:9\.1\.0/);
  assert.match(plugin, /setObfuscatedAccountId\(accountId\)/);
  assert.match(plugin, /includeSuspendedSubscriptions\(true\)/);
  assert.doesNotMatch(plugin, /acknowledgePurchase\s*\(/);
});

test('native lifecycle restore exists and remains fail-closed before commercial deployment', () => {
  const main = read(path.join(native, 'android/app/src/main/java/com/zoperatingsystem/zstudio/MainActivity.java'));
  const bridge = read(path.join(native, 'www/google-play-billing-bridge.js'));
  const config = JSON.parse(read(path.join(native, 'capacitor.config.json')));
  assert.match(main, /protected void onResume\(\)/);
  assert.match(main, /google-play-billing-bridge\.js/);
  assert.match(bridge, /currentPurchases\(\)/);
  assert.match(bridge, /\/api\/google\/play\/restore/);
  assert.match(bridge, /obfuscated_account_id/);
  assert.equal(config.plugins.CapacitorHttp.enabled, true);
  assert.equal(config.plugins.ZStudioPlayBilling.commercialBaseUrl, '');
});

test('commercial Google endpoints and environment boundaries are present', () => {
  for (const name of ['prepare.js', 'reconcile.js', 'restore.js', 'rtdn.js']) {
    assert.equal(fs.existsSync(path.join(commercial, 'api/google/play', name)), true, name);
  }
  const config = read(path.join(commercial, 'lib/google-play-config.js'));
  for (const key of [
    'GOOGLE_PLAY_ENVIRONMENT',
    'GOOGLE_PLAY_PACKAGE_NAME',
    'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON',
    'SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
    'GOOGLE_PLAY_PUBSUB_AUDIENCE',
    'GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_PLAY_PUBSUB_SUBSCRIPTION',
  ]) assert.match(config, new RegExp(key));
  const reconcileApi = read(path.join(commercial, 'api/google/play/reconcile.js'));
  const restoreApi = read(path.join(commercial, 'api/google/play/restore.js'));
  assert.match(reconcileApi, /SUPABASE_PUBLISHABLE_KEY/);
  assert.match(restoreApi, /SUPABASE_PUBLISHABLE_KEY/);
});

test('forward-only Google Play database authority migrations exist', () => {
  const migrations = path.join(repo, 'infrastructure/supabase/migrations');
  const required = [
    '20260820235500_zstudio_google_play_pause_authority_v1.sql',
    '20260821002000_zstudio_google_play_purchase_preflight_authority_v1.sql',
    '20260821004000_zstudio_google_play_reconciliation_hardening_v1.sql',
    '20260821005000_zstudio_google_play_rtdn_authority_v1.sql',
  ];
  for (const name of required) assert.equal(fs.existsSync(path.join(migrations, name)), true, name);
});
