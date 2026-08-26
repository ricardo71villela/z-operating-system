/* Run with: node apps/fashion/packages/fashion-domain/tests/price-history.test.js */

const assert = require('assert');
const { emptyHistory, recordPrice, referencePrice, currentPrice } = require('../src/price-history');

let history = emptyHistory();
history = recordPrice(history, { priceMinorUnits: 10000, observedAt: '2026-07-01T00:00:00.000Z' });
history = recordPrice(history, { priceMinorUnits: 8500, observedAt: '2026-07-15T00:00:00.000Z' });
history = recordPrice(history, { priceMinorUnits: 9000, observedAt: '2026-07-25T00:00:00.000Z' });

// Reference price is the LOWEST price in the 30 days before asOf — not the
// most recent, not the highest. Here the lowest (8500) was mid-window.
assert.strictEqual(referencePrice(history, { asOf: '2026-07-30T00:00:00.000Z' }), 8500);

// A price recorded outside the lookback window doesn't count.
history = recordPrice(history, { priceMinorUnits: 5000, observedAt: '2026-05-01T00:00:00.000Z' });
assert.strictEqual(referencePrice(history, { asOf: '2026-07-30T00:00:00.000Z' }), 8500);

// No price data at all in the window: null, not a guess or a fallback.
const emptyHist = emptyHistory();
assert.strictEqual(referencePrice(emptyHist, { asOf: '2026-07-30T00:00:00.000Z' }), null);

// --- currentPrice: the most recent entry, never the lowest ---
assert.strictEqual(currentPrice(emptyHist), null);
let priceOrder = emptyHistory();
priceOrder = recordPrice(priceOrder, { priceMinorUnits: 10000, observedAt: '2026-07-01T00:00:00.000Z' });
priceOrder = recordPrice(priceOrder, { priceMinorUnits: 7500, observedAt: '2026-07-15T00:00:00.000Z' }); // lowest
priceOrder = recordPrice(priceOrder, { priceMinorUnits: 8900, observedAt: '2026-07-28T00:00:00.000Z' }); // most recent
assert.strictEqual(currentPrice(priceOrder), 8900); // not 7500 (that's what referencePrice() would return)

// currentPrice is stable regardless of insertion order — recordPrice()
// always keeps entries sorted by observedAt, not insertion time.
let outOfOrder = emptyHistory();
outOfOrder = recordPrice(outOfOrder, { priceMinorUnits: 8900, observedAt: '2026-07-28T00:00:00.000Z' });
outOfOrder = recordPrice(outOfOrder, { priceMinorUnits: 10000, observedAt: '2026-07-01T00:00:00.000Z' });
assert.strictEqual(currentPrice(outOfOrder), 8900);

console.log('price-history.js: all invariant checks passed.');
