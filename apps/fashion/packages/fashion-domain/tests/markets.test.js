/* Run with: node apps/fashion/packages/fashion-domain/tests/markets.test.js */

const assert = require('assert');
const { MARKETS, isKnownMarket, isLaunched, launchedMarkets } = require('../src/markets');

// Exactly 26 jurisdictions, matching apps/find/content/legal/ 1:1.
assert.strictEqual(Object.keys(MARKETS).length, 26);
assert.ok(isKnownMarket('FR'));
assert.ok(isKnownMarket('GB-ENG'));
assert.ok(isKnownMarket('AE-DU'));
assert.strictEqual(isKnownMarket('ZZ'), false);

// France is the only launched market — everything else is
// provisioned but not live, mirroring how Z Find's own content
// folders exist for jurisdictions not yet fully activated either.
assert.deepStrictEqual(launchedMarkets(), ['FR']);
assert.strictEqual(isLaunched('FR'), true);
assert.strictEqual(isLaunched('ES'), false);
assert.strictEqual(isLaunched('DE'), false);

// Same jurisdiction codes as Z Find's content/legal folder, copied
// verbatim, not re-derived.
const expected = [
  'FR', 'ES', 'DE', 'IT', 'GB-ENG', 'GB-SCT', 'GB-WLS', 'GB-NIR', 'IE',
  'US', 'CA', 'BR', 'MX', 'AR', 'NL', 'BE', 'PL', 'GR', 'CY', 'HR',
  'AE-DU', 'DO', 'CL', 'PA', 'AT', 'EE',
];
assert.deepStrictEqual(Object.keys(MARKETS).sort(), expected.sort());

console.log('markets.js: all invariant checks passed. 26 jurisdictions, matching Z Find exactly.');
