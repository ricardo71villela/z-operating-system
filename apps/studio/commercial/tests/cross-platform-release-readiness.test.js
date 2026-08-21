import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const studio=path.resolve(here,'../..');
const repo=path.resolve(studio,'../..');
const read=(rel)=>fs.readFileSync(path.resolve(studio,rel),'utf8');
const readRepo=(rel)=>fs.readFileSync(path.resolve(repo,rel),'utf8');

test('all four surfaces share one frozen plan/trial authority',()=>{
  const catalog=JSON.parse(read('commercial/store-products.v1.json'));
  assert.equal(catalog.authority,'ZSTUDIO_STORE_PRODUCT_AUTHORITY_V1');
  assert.equal(catalog.appId,'com.zoperatingsystem.zstudio');
  assert.equal(catalog.commercialTargetCurrency,'EUR');
  assert.equal(catalog.trialDays,3);
  assert.deepEqual(Object.keys(catalog.plans).sort(),['annual','monthly','weekly']);
  assert.equal(catalog.plans.weekly.commercialTargetPriceMinor,599);
  assert.equal(catalog.plans.monthly.commercialTargetPriceMinor,1499);
  assert.equal(catalog.plans.annual.commercialTargetPriceMinor,11999);
});

test('provider routing is explicit: Apple StoreKit, Google Play, Web and Microsoft Stripe',()=>{
  const ui=read('src/platform/billing-ui.js');
  assert.match(ui,/p === 'ios'[\s\S]*ZStudioApple/);
  assert.match(ui,/p === 'android'[\s\S]*ZStudioGooglePlay/);
  assert.match(ui,/\/api\/web\/checkout/);
  assert.match(ui,/checkout\.stripe\.com/);
  assert.match(ui,/\/api\/web\/portal/);

  const adapter=read('commercial/lib/commercial-event-adapter.js');
  assert.match(adapter,/'web'/);
  assert.match(adapter,/'apple_app_store'/);
  assert.match(adapter,/'google_play'/);
  assert.doesNotMatch(adapter,/microsoft_store/);

  const sourceTree=[
    read('src/platform/billing-ui.js'),
    read('scripts/build.js'),
    read('commercial/store-products.v1.json'),
  ].join('\n');
  assert.doesNotMatch(sourceTree,/Windows\.Services\.Store/);
});

test('Apple trial eligibility is ZOS preflighted and server-signed before StoreKit purchase',()=>{
  const bridge=read('src/platform/apple-billing.js');
  const swift=read('native/ios/App/App/ZStudioStoreKitPlugin.swift');
  const migration=readRepo('infrastructure/supabase/migrations/20260821010000_zstudio_apple_purchase_preflight_authority_v1.sql');
  assert.match(bridge,/\/api\/apple\/prepare/);
  assert.match(bridge,/introductoryOfferEligibilityJws/);
  assert.match(swift,/AppTransaction\.shared/);
  assert.match(swift,/\.introductoryOfferEligibility\(compactJWS:/);
  assert.match(swift,/\.appAccountToken\(appAccountToken\)/);
  assert.match(migration,/APPLE_PURCHASE_TRIAL_PREFLIGHT_REQUIRED/);
  assert.match(migration,/reserved_billing_source = 'apple_app_store'/);
});

test('Google lifecycle remains Play Billing 9.1 with server restore and RTDN',()=>{
  const gradle=read('native/android/app/build.gradle');
  const bridge=read('native/www/google-play-billing-bridge.js');
  assert.match(gradle,/com\.android\.billingclient:billing:9\.1\.0/);
  assert.match(bridge,/\/api\/google\/play\/prepare/);
  assert.match(bridge,/\/api\/google\/play\/reconcile/);
  assert.match(bridge,/\/api\/google\/play\/restore/);
  assert.equal(fs.existsSync(path.resolve(studio,'commercial/api/google/play/rtdn.js')),true);
});

test('Microsoft surface is a store-distributed PWA that reuses Web commerce',()=>{
  const manifest=JSON.parse(read('pwa/manifest.webmanifest'));
  const sw=read('pwa/sw.js');
  const main=read('src/main.js');
  const runbook=read('docs/microsoft-store-release-runbook.md');
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.start_url,'./');
  assert.ok(manifest.icons.some((i)=>i.sizes==='192x192'));
  assert.ok(manifest.icons.some((i)=>i.sizes==='512x512'));
  assert.match(sw,/self\.addEventListener\('fetch'/);
  assert.match(main,/navigator\.serviceWorker\.register\('\.\/sw\.js'\)/);
  assert.match(runbook,/Web\/Stripe/);
  assert.match(runbook,/Do not introduce `microsoft_store`/);
});

test('canonical build keeps commercial runtime fail-closed until HTTPS origin is injected',()=>{
  const build=read('scripts/build.js');
  assert.match(build,/ZSTUDIO_COMMERCIAL_BASE_URL/);
  assert.match(build,/parsed\.protocol !== 'https:'/);
  assert.match(build,/enabled: Boolean\(baseUrl\)/);
  assert.match(build,/apple-billing\.js/);
  assert.match(build,/billing-ui\.js/);
});

test('four-surface runbooks exist before external activation',()=>{
  for(const rel of [
    'docs/web-stripe-release-runbook.md',
    'docs/apple-release-runbook.md',
    'docs/google-play-release-runbook.md',
    'docs/microsoft-store-release-runbook.md',
    'docs/zstudio-four-surface-launch-runbook.md',
  ]) assert.equal(fs.existsSync(path.resolve(studio,rel)),true,rel);
});
