/* Partner pricing decided 2026-10-14 — see src/commission.js header. */
const assert = require('assert');
const c = require('../src/commission');

// --- subscription by number of categories (HT, cents)
assert.strictEqual(c.subscriptionFeeMinorUnits(['clothing']), 3900, 'only clothing');
assert.strictEqual(c.subscriptionFeeMinorUnits(['footwear']), 3900, 'only footwear');
assert.strictEqual(c.subscriptionFeeMinorUnits(['cosmetics']), 3900, 'only perfumes/cosmetics');
assert.strictEqual(c.subscriptionFeeMinorUnits(['sportswear']), 3900, 'any single category');
assert.strictEqual(c.subscriptionFeeMinorUnits(['clothing', 'footwear']), 4900, 'clothing + footwear');
assert.strictEqual(c.subscriptionFeeMinorUnits(['clothing', 'accessories_leather_goods']), 4900, 'any two categories');
assert.strictEqual(c.subscriptionFeeMinorUnits(['clothing', 'footwear', 'cosmetics']), 5900, 'three categories');
assert.strictEqual(c.subscriptionFeeMinorUnits(['clothing', 'footwear', 'sportswear', 'accessories_leather_goods', 'cosmetics']), 5900, 'everything');
assert.strictEqual(c.subscriptionFeeMinorUnits(['clothing', 'clothing']), 3900, 'duplicates count once');
assert.throws(() => c.subscriptionFeeMinorUnits([]), /at least one category/);
assert.throws(() => c.subscriptionFeeMinorUnits(['jewellery']), /unknown categories/);

// --- first month free, then the tier fee
assert.strictEqual(c.subscriptionFeeOwedMinorUnits(1, ['clothing', 'footwear']), 0);
assert.strictEqual(c.subscriptionFeeOwedMinorUnits(2, ['clothing', 'footwear']), 4900);
assert.strictEqual(c.subscriptionFeeOwedMinorUnits(12, ['clothing']), 3900);
assert.throws(() => c.subscriptionFeeOwedMinorUnits(0, ['clothing']), />= 1/);

// --- commission per ticket, whole ticket at one rate
assert.strictEqual(c.ticketCommissionRatePercent(0), 10);
assert.strictEqual(c.ticketCommissionRatePercent(10000), 10, 'EUR 100.00 is still 10 %');
assert.strictEqual(c.ticketCommissionRatePercent(10001), 8, 'EUR 100.01 is 8 %');
assert.strictEqual(c.ticketCommissionRatePercent(20000), 8, 'EUR 200.00 is still 8 %');
assert.strictEqual(c.ticketCommissionRatePercent(20001), 6, 'above EUR 200 is 6 %');
assert.strictEqual(c.ticketCommissionRatePercent(1000000), 6);
assert.throws(() => c.ticketCommissionRatePercent(-1));
assert.throws(() => c.ticketCommissionRatePercent(12.5));

assert.strictEqual(c.ticketCommissionOwedMinorUnits(8000), 800, 'EUR 80 ticket -> EUR 8');
assert.strictEqual(c.ticketCommissionOwedMinorUnits(15000), 1200, 'EUR 150 ticket -> EUR 12');
assert.strictEqual(c.ticketCommissionOwedMinorUnits(25000), 1500, 'EUR 250 ticket -> EUR 15');
assert.strictEqual(c.commissionOwedMinorUnits(999, 8), 79, 'floors');
assert.throws(() => c.commissionOwedMinorUnits(100, 101));

// --- tables are well-formed
assert.ok(Object.isFrozen(c.SUBSCRIPTION_TIERS) && Object.isFrozen(c.TICKET_COMMISSION_TIERS));
assert.strictEqual(c.TICKET_COMMISSION_TIERS.at(-1).maxTicketMinorUnits, null, 'last tier is open-ended');
assert.strictEqual(c.PRICES_EXCLUDE_VAT, true);
assert.strictEqual(c.FIRST_MONTH_FREE, true);

console.log('commission.js: all invariant checks passed.');
