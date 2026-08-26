/* Run with: node apps/fashion/packages/fashion-domain/tests/campaign-pricing.test.js */

const assert = require('assert');
const { emptyHistory, recordPrice } = require('../src/price-history');
const { computeCampaignDiscount } = require('../src/campaign-pricing');

let history = emptyHistory();
history = recordPrice(history, { priceMinorUnits: 10000, observedAt: '2026-06-01T00:00:00.000Z' });
history = recordPrice(history, { priceMinorUnits: 8000, observedAt: '2026-06-20T00:00:00.000Z' });

// A genuine reduction below the real 30-day-low is accepted.
const genuine = computeCampaignDiscount({
  priceHistory: history, finalPriceMinorUnits: 6000, asOf: '2026-06-24T00:00:00.000Z',
});
assert.strictEqual(genuine.ok, true);
assert.strictEqual(genuine.referencePriceMinorUnits, 8000);
assert.strictEqual(genuine.discountPercent, 25);

// A fake discount: Partner sets finalPrice at or above the real 30-day low
// (inflating the "before" price doesn't change this — the reference is
// computed from history, never from Partner-submitted "before" input).
const fake = computeCampaignDiscount({
  priceHistory: history, finalPriceMinorUnits: 8000, asOf: '2026-06-24T00:00:00.000Z',
});
assert.strictEqual(fake.ok, false);
assert.ok(/not a genuine reduction/.test(fake.reason));

// No price history at all in the window: cannot advertise a reduction,
// full stop — never falls back to accepting the Partner's number anyway.
const noHistory = computeCampaignDiscount({
  priceHistory: emptyHistory(), finalPriceMinorUnits: 5000, asOf: '2026-06-24T00:00:00.000Z',
});
assert.strictEqual(noHistory.ok, false);
assert.ok(/cannot legally advertise a reduction/.test(noHistory.reason));

console.log('campaign-pricing.js: all invariant checks passed.');
