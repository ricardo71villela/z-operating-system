import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  GOOGLE_PLAY_BASE_PLAN_IDS,
  GOOGLE_PLAY_PACKAGE_NAME,
  GOOGLE_PLAY_PLAN_CODES,
  GOOGLE_PLAY_PRODUCT_ID,
  resolveGooglePlayBasePlan,
  resolveGooglePlayPlan,
} from '../lib/store-products.js';

const nativeRoot = new URL('../../native/android/app/', import.meta.url);
const gradle = fs.readFileSync(new URL('build.gradle', nativeRoot), 'utf8');
const mainActivity = fs.readFileSync(
  new URL('src/main/java/com/zoperatingsystem/zstudio/MainActivity.java', nativeRoot),
  'utf8',
);
const plugin = fs.readFileSync(
  new URL('src/main/java/com/zoperatingsystem/zstudio/ZStudioPlayBillingPlugin.java', nativeRoot),
  'utf8',
);

test('Google Play catalog is exactly the frozen Z Studio subscription authority', () => {
  assert.equal(GOOGLE_PLAY_PACKAGE_NAME, 'com.zoperatingsystem.zstudio');
  assert.equal(GOOGLE_PLAY_PRODUCT_ID, 'zstudio.access');
  assert.deepEqual(GOOGLE_PLAY_PLAN_CODES, ['annual', 'monthly', 'weekly']);
  assert.deepEqual(GOOGLE_PLAY_BASE_PLAN_IDS, ['annual', 'monthly', 'weekly']);

  assert.deepEqual(resolveGooglePlayPlan('weekly'), {
    planCode: 'weekly',
    billingCadence: 'weekly',
    commercialTargetPriceMinor: 599,
    currency: 'EUR',
    trialDays: 3,
    productId: 'zstudio.access',
    basePlanId: 'weekly',
    offerId: 'trial-3d',
    offerType: 'free_trial',
    eligibility: 'never_had_subscription',
  });
  assert.equal(resolveGooglePlayPlan('monthly').commercialTargetPriceMinor, 1499);
  assert.equal(resolveGooglePlayPlan('annual').commercialTargetPriceMinor, 11999);
  assert.equal(
    resolveGooglePlayBasePlan('zstudio.access', 'monthly').planCode,
    'monthly',
  );
  assert.throws(
    () => resolveGooglePlayBasePlan('other.product', 'monthly'),
    /GOOGLE_PLAY_BASE_PLAN_NOT_AUTHORIZED/,
  );
  assert.throws(
    () => resolveGooglePlayPlan('lifetime'),
    /GOOGLE_PLAY_PLAN_NOT_AUTHORIZED/,
  );
});

test('Android pins the current official Play Billing Library with no third-party billing plugin', () => {
  assert.match(gradle, /implementation "com\.android\.billingclient:billing:9\.1\.0"/);
  assert.doesNotMatch(gradle, /revenuecat|purchases-capacitor|cordova-plugin-purchase/i);
});

test('first-party Capacitor plugin is registered before Bridge creation', () => {
  assert.match(plugin, /@CapacitorPlugin\(name = "ZStudioPlayBilling"\)/);
  const registerAt = mainActivity.indexOf('registerPlugin(ZStudioPlayBillingPlugin.class);');
  const superAt = mainActivity.indexOf('super.onCreate(savedInstanceState);');
  assert.ok(registerAt >= 0);
  assert.ok(superAt > registerAt);
});

test('native bridge uses PBL 9 product APIs, auto reconnect and suspended purchase recovery', () => {
  for (const authority of [
    '.enableAutoServiceReconnection()',
    'QueryProductDetailsResult detailsResult',
    '.queryProductDetailsAsync(',
    '.queryPurchasesAsync(',
    '.includeSuspendedSubscriptions(true)',
    '.setObfuscatedAccountId(accountId)',
    '.setOfferToken(offer.getOfferToken())',
    'Purchase.PurchaseState.PURCHASED',
    'Purchase.PurchaseState.PENDING',
  ]) {
    assert.ok(plugin.includes(authority), `missing ${authority}`);
  }
});

test('native bridge cannot grant or acknowledge entitlement and returns purchase token as transient evidence only', () => {
  for (const forbidden of [
    'AcknowledgePurchaseParams',
    '.acknowledgePurchase(',
    '.consumeAsync(',
    'zstudio_apply_verified_commercial_event',
    'SUPABASE_SECRET_KEY',
    'androidpublisher.googleapis.com',
  ]) {
    assert.equal(plugin.includes(forbidden), false, `forbidden native authority: ${forbidden}`);
  }
  assert.ok(plugin.includes('.put("evidence", "google_play_device_purchase")'));
  assert.ok(plugin.includes('.put("purchaseToken", purchase.getPurchaseToken())'));
  assert.ok(plugin.includes('.put("rawProviderPayloadIncluded", false)'));
});

test('trial offer selection is explicit, server-driven and limited to frozen offer id', () => {
  assert.ok(plugin.includes('private static final String TRIAL_OFFER_ID = "trial-3d";'));
  assert.ok(plugin.includes('call.getBoolean("useTrialOffer", false)'));
  assert.ok(plugin.includes('GOOGLE_PLAY_TRIAL_OFFER_UNAVAILABLE'));
  assert.ok(plugin.includes('private static final Set<String> BASE_PLAN_IDS = Set.of("weekly", "monthly", "annual")'));
});
