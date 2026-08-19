#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const STUDIO = path.join(ROOT, 'apps', 'studio');

const paths = {
  plugin: path.join(
    STUDIO,
    'native/ios/App/App/ZStudioStoreKitPlugin.swift',
  ),
  bridge: path.join(
    STUDIO,
    'native/ios/App/App/ZStudioBridgeViewController.swift',
  ),
  scene: path.join(
    STUDIO,
    'native/ios/App/App/SceneDelegate.swift',
  ),
  project: path.join(
    STUDIO,
    'native/ios/App/App.xcodeproj/project.pbxproj',
  ),
  catalog: path.join(
    STUDIO,
    'commercial/store-products.v1.json',
  ),
  workflow: path.join(
    ROOT,
    '.github/workflows/zstudio-apple-storekit-authority.yml',
  ),
};

let failures = 0;

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function check(condition, label) {
  if (condition) {
    console.log(`PASS: ${label}`);
    return;
  }

  failures += 1;
  console.error(`FAIL: ${label}`);
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

function between(text, start, end) {
  const startIndex = text.indexOf(start);

  if (startIndex < 0) {
    return '';
  }

  const endIndex = text.indexOf(
    end,
    startIndex + start.length,
  );

  if (endIndex < 0) {
    return '';
  }

  return text.slice(startIndex, endIndex);
}

for (const [label, file] of Object.entries(paths)) {
  check(
    fs.existsSync(file),
    `${label} authority file exists`,
  );
}

const plugin = read(paths.plugin);
const bridge = read(paths.bridge);
const scene = read(paths.scene);
const project = read(paths.project);
const workflow = read(paths.workflow);
const catalog = JSON.parse(read(paths.catalog));

check(
  plugin.includes(
    'ZSTUDIO_APPLE_STOREKIT_NATIVE_AUTHORITY_V1',
  ),
  'native authority marker',
);

check(
  plugin.includes('import StoreKit'),
  'StoreKit imported',
);

check(
  plugin.includes(
    'public final class ZStudioStoreKitPlugin: '
      + 'CAPPlugin, CAPBridgedPlugin',
  ),
  'plugin uses CAPPlugin + CAPBridgedPlugin',
);

check(
  plugin.includes(
    'public let identifier = "ZStudioStoreKitPlugin"',
  ),
  'Capacitor identifier exact',
);

check(
  plugin.includes(
    'public let jsName = "ZStudioStoreKit"',
  ),
  'JavaScript plugin name exact',
);

const methods = Array.from(
  plugin.matchAll(
    /CAPPluginMethod\(name: "([^"]+)", returnType: CAPPluginReturnPromise\)/g,
  ),
  (match) => match[1],
);

const expectedMethods = [
  'loadProducts',
  'purchase',
  'currentEntitlements',
  'unfinishedTransactions',
  'syncPurchases',
  'finishTransaction',
];

check(
  JSON.stringify(methods)
    === JSON.stringify(expectedMethods),
  'exact six public StoreKit methods',
);

check(
  plugin.includes('Product.products(for:'),
  'StoreKit product loading authority',
);

check(
  plugin.includes(
    '.appAccountToken(appAccountToken)',
  ),
  'purchase uses canonical UUID appAccountToken option',
);

check(
  plugin.includes(
    'guard transaction.ownershipType == .purchased',
  ),
  'Family Sharing rejected in v1',
);

check(
  plugin.includes(
    'guard let appAccountToken = transaction.appAccountToken',
  ),
  'tokenless Apple transaction rejected in v1',
);

check(
  plugin.includes('result.jwsRepresentation'),
  'verified JWS forwarded for server verification',
);

check(
  plugin.includes(
    '"transactionId": String(transaction.id)',
  ),
  'transactionId crosses JS boundary as decimal string',
);

check(
  plugin.includes(
    '"originalTransactionId": String(transaction.originalID)',
  ),
  'originalTransactionId crosses JS boundary as decimal string',
);

check(
  plugin.includes('Transaction.updates'),
  'transaction updates listener present',
);

check(
  plugin.includes('Transaction.currentEntitlements'),
  'current entitlement reconciliation primitive present',
);

check(
  plugin.includes('Transaction.unfinished'),
  'unfinished transaction recovery primitive present',
);

check(
  count(plugin, 'try await AppStore.sync()') === 1,
  'AppStore.sync exists exactly once',
);

check(
  count(plugin, 'await transaction.finish()') === 1,
  'transaction finish exists exactly once',
);

const loadBody = between(
  plugin,
  'override public func load()',
  'deinit',
);

check(
  loadBody.includes(
    'startTransactionUpdatesListener()',
  ),
  'plugin load starts transaction listener',
);

check(
  !loadBody.includes('AppStore.sync()'),
  'plugin load never forces App Store sync',
);

check(
  !loadBody.includes('.finish()'),
  'plugin load never finishes transaction',
);

const listenerBody = between(
  plugin,
  'private func startTransactionUpdatesListener()',
  '@objc func loadProducts',
);

check(
  listenerBody.includes('Transaction.updates'),
  'listener consumes Transaction.updates',
);

check(
  listenerBody.includes(
    'self.verifiedEnvelope(result)',
  ),
  'listener emits verified transactions only',
);

check(
  !listenerBody.includes('await transaction.finish()'),
  'listener never auto-finishes transaction',
);

check(
  !listenerBody.includes('AppStore.sync()'),
  'listener never forces restore sync',
);

const purchaseBody = between(
  plugin,
  '@objc func purchase',
  '@objc func currentEntitlements',
);

check(
  purchaseBody.includes(
    'APPLE_TRANSACTION_UNVERIFIED',
  ),
  'purchase fails closed on unverified transaction',
);

check(
  !purchaseBody.includes(
    'transaction.finish()',
  ),
  'purchase success never auto-finishes transaction',
);

check(
  !purchaseBody.includes(
    'studio_access',
  )
    && !purchaseBody.includes(
      'ai_access',
    ),
  'purchase performs no local entitlement grant',
);

const finishBody = plugin.slice(
  plugin.indexOf('@objc func finishTransaction'),
);

check(
  finishBody.includes('Transaction.unfinished'),
  'finish searches unfinished transactions only',
);

check(
  finishBody.includes(
    'transaction.id == transactionId',
  ),
  'finish requires exact transaction ID',
);

check(
  finishBody.includes(
    'await transaction.finish()',
  ),
  'finish explicitly acknowledges exact transaction',
);

for (const forbidden of [
  'SUPABASE_SERVICE_ROLE',
  'service_role',
  'BEGIN PRIVATE KEY',
  'APPLE_PRIVATE_KEY',
  'APPLE_ISSUER_ID',
  'APPLE_KEY_ID',
  'UserDefaults',
  'FileManager',
  'Keychain',
  'localStorage',
  'indexedDB',
  'studio_access',
  'ai_access',
  'com.zoperatingsystem.zstudio.subscription.weekly',
  'com.zoperatingsystem.zstudio.subscription.monthly',
  'com.zoperatingsystem.zstudio.subscription.annual',
]) {
  check(
    !plugin.includes(forbidden),
    `native plugin excludes forbidden authority: ${forbidden}`,
  );
}

check(
  bridge.includes(
    'class ZStudioBridgeViewController: CAPBridgeViewController',
  ),
  'custom bridge subclasses CAPBridgeViewController',
);

check(
  bridge.includes(
    'override open func capacitorDidLoad()',
  ),
  'custom bridge uses Capacitor load hook',
);

check(
  bridge.includes(
    'bridge?.registerPluginInstance(',
  )
    && bridge.includes(
      'ZStudioStoreKitPlugin()',
    ),
  'custom bridge registers exact plugin instance',
);

check(
  count(
    scene,
    'window?.rootViewController = ZStudioBridgeViewController()',
  ) === 1,
  'SceneDelegate uses exact custom bridge',
);

check(
  !scene.includes(
    'window?.rootViewController = CAPBridgeViewController()',
  ),
  'direct stock bridge root removed',
);

check(
  count(
    project,
    'ZStudioStoreKitPlugin.swift',
  ) === 6,
  'Xcode project registers StoreKit plugin exactly',
);

check(
  count(
    project,
    'ZStudioBridgeViewController.swift',
  ) === 6,
  'Xcode project registers custom bridge exactly',
);

for (const forbidden of [
  'StoreKit.framework',
  'RevenueCat',
  'Purchases.framework',
]) {
  check(
    !project.includes(forbidden),
    `Xcode project adds no third-party/store framework dependency: ${forbidden}`,
  );
}

check(
  catalog.authority
    === 'ZSTUDIO_STORE_PRODUCT_AUTHORITY_V1',
  'existing Store Product catalog remains canonical',
);

check(
  catalog.appId
    === 'com.zoperatingsystem.zstudio',
  'catalog native app ID exact',
);

check(
  Object.keys(catalog.plans).sort().join(',')
    === 'annual,monthly,weekly',
  'catalog retains exact paid plans',
);

const appleIds = Object.values(catalog.plans)
  .map((plan) => plan.apple.productId)
  .sort();

check(
  JSON.stringify(appleIds)
    === JSON.stringify([
      'com.zoperatingsystem.zstudio.subscription.annual',
      'com.zoperatingsystem.zstudio.subscription.monthly',
      'com.zoperatingsystem.zstudio.subscription.weekly',
    ]),
  'catalog retains exact Apple product IDs',
);

check(
  workflow.includes(
    'name: Z Studio Apple StoreKit Authority',
  ),
  'dedicated Apple CI workflow named',
);

check(
  workflow.includes(
    'runs-on: macos-26',
  ),
  'dedicated Apple CI uses macOS 26',
);

check(
  workflow.includes(
    'node apps/studio/tests/apple-storekit-native-authority.test.js',
  ),
  'dedicated Apple static contract wired into CI',
);

check(
  workflow.includes(
    'npm ci --prefix apps/studio/native',
  ),
  'native Capacitor dependencies installed in CI',
);

check(
  workflow.includes(
    '-project apps/studio/native/ios/App/App.xcodeproj',
  )
    && workflow.includes(
      '-scheme App',
    )
    && workflow.includes(
      "-destination 'generic/platform=iOS Simulator'",
    )
    && workflow.includes(
      '-derivedDataPath "$RUNNER_TEMP/zstudio-storekit-derived-data"',
    )
    && !workflow.includes(
      '-target App',
    ),
  'CI performs scheme-driven native iOS simulator compile',
);

check(
  workflow.includes(
    'CODE_SIGNING_ALLOWED=NO',
  ),
  'CI compile requires no signing identity',
);

check(
  workflow.includes(
    'ZSTUDIO_APPLE_STOREKIT_NATIVE_CI=PASS',
  ),
  'CI final authority marker present',
);

if (failures > 0) {
  console.error('');
  console.error(
    `ZSTUDIO_APPLE_STOREKIT_NATIVE_AUTHORITY_V1_FAIL=${failures}`,
  );
  process.exit(1);
}

console.log('');
console.log(
  'ZSTUDIO_APPLE_STOREKIT_NATIVE_AUTHORITY_V1_PASS',
);
