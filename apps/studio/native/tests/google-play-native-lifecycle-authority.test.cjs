const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const nativeRoot = path.resolve(__dirname, '..');
const commercialRoot = path.resolve(nativeRoot, '../commercial');
const read = (base, relative) => fs.readFileSync(path.join(base, relative), 'utf8');

test('preflight returns canonical ZOS UUID only as obfuscated account authority', () => {
  const source = read(commercialRoot, 'lib/google-play-preflight-http.js');
  assert.match(source, /obfuscated_account_id:\s*personId/);
  assert.doesNotMatch(source, /person_id:\s*personId/);
});

test('Android resumes inject the isolated billing bridge and runtime URL comes only from Capacitor config', () => {
  const source = read(nativeRoot, 'android/app/src/main/java/com/zoperatingsystem/zstudio/MainActivity.java');
  assert.match(source, /protected void onResume\(\)/);
  assert.match(source, /google-play-billing-bridge\.js/);
  assert.match(source, /commercialBaseUrl/);
  assert.match(source, /JSONObject\.quote\(baseUrl\)/);
  assert.match(source, /ZStudioGooglePlay\.onNativeResume/);
});

test('native config enables CapacitorHttp but keeps commercial runtime fail-closed', () => {
  const config = JSON.parse(read(nativeRoot, 'capacitor.config.json'));
  assert.equal(config.plugins.CapacitorHttp.enabled, true);
  assert.equal(config.plugins.ZStudioPlayBilling.commercialBaseUrl, '');
  assert.equal(config.android.allowMixedContent, false);
});

test('bridge never persists raw purchase token and always supports restore endpoint', () => {
  const source = read(nativeRoot, 'www/google-play-billing-bridge.js');
  assert.match(source, /\/api\/google\/play\/restore/);
  assert.match(source, /currentPurchases\(\)/);
  assert.match(source, /localStorage\?\.setItem\(STORAGE_KEY, JSON\.stringify\(value\)\)/);
  assert.doesNotMatch(source, /persistIntent\([^)]*purchaseToken/);
  assert.match(source, /CapacitorHttp/);
});
