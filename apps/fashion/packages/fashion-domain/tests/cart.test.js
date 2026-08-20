/* Run with: node apps/fashion/packages/fashion-domain/tests/cart.test.js */

const assert = require('assert');
const { emptyCart, addItem, cartTotal, partnerSplits, attemptCheckoutReservation } = require('../src/cart');
const { initStock, applyStockUpdate, sellableQuantity } = require('../src/stock');

function stockOf(productId, quantity) {
  return applyStockUpdate(initStock(productId), { quantityAvailable: quantity, observedAt: '2026-08-20T10:00:00.000Z' });
}

// A cart spanning two different Partners.
let cart = emptyCart();
cart = addItem(cart, { productId: 'prod_shoe', partnerId: 'partner_a', quantity: 1, unitPriceMinorUnits: 8900 });
cart = addItem(cart, { productId: 'prod_bag', partnerId: 'partner_b', quantity: 2, unitPriceMinorUnits: 15000 });
assert.strictEqual(cartTotal(cart), 8900 + 15000 * 2);

const splits = partnerSplits(cart);
assert.strictEqual(Object.keys(splits).length, 2);
assert.strictEqual(splits.partner_a.subtotalMinorUnits, 8900);
assert.strictEqual(splits.partner_b.subtotalMinorUnits, 30000);

// Happy path: both Partners have enough stock, both get reserved.
const now = new Date('2026-08-20T12:00:00.000Z');
const okResult = attemptCheckoutReservation(cart, {
  prod_shoe: stockOf('prod_shoe', 5),
  prod_bag: stockOf('prod_bag', 3),
}, { now });
assert.strictEqual(okResult.ok, true);
assert.strictEqual(sellableQuantity(okResult.stockByProductId.prod_shoe), 4);
assert.strictEqual(sellableQuantity(okResult.stockByProductId.prod_bag), 1);
assert.ok(okResult.reservationsByProductId.prod_shoe);
assert.ok(okResult.reservationsByProductId.prod_bag);

// THE critical case: partner_a's item reserves fine, but partner_b's item
// has insufficient stock. The whole checkout must fail, AND partner_a's
// reservation — already made in this attempt — must be rolled back. A
// Client should never end up holding one Partner's stock hostage because
// another Partner's item in the same cart couldn't be fulfilled.
const failResult = attemptCheckoutReservation(cart, {
  prod_shoe: stockOf('prod_shoe', 5),
  prod_bag: stockOf('prod_bag', 1), // only 1 available, cart wants 2
}, { now });
assert.strictEqual(failResult.ok, false);
assert.strictEqual(failResult.failedProductId, 'prod_bag');
assert.ok(/insufficient stock/.test(failResult.reason));
// No stockByProductId is returned on failure — nothing partial to inspect,
// by design: the caller re-fetches fresh stock and retries, it never
// carries forward a half-committed reservation state.
assert.strictEqual(failResult.stockByProductId, undefined);

// A product with no stock record at all also fails the whole cart cleanly.
const missingResult = attemptCheckoutReservation(cart, {
  prod_shoe: stockOf('prod_shoe', 5),
}, { now });
assert.strictEqual(missingResult.ok, false);
assert.strictEqual(missingResult.failedProductId, 'prod_bag');
assert.strictEqual(missingResult.reason, 'no stock record for this product');

console.log('cart.js: all invariant checks passed.');
