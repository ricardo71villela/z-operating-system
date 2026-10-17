/* Checkout rules — see src/checkout.js header. */
const assert = require('assert');
const c = require('../src/checkout');

// --- quantities
assert.strictEqual(c.lineQuantityError(1), null);
assert.strictEqual(c.lineQuantityError(0), null, '0 removes the line');
assert.strictEqual(c.lineQuantityError(c.MAX_LINE_QUANTITY), null);
assert.match(c.lineQuantityError(c.MAX_LINE_QUANTITY + 1), /at most/);
assert.match(c.lineQuantityError(-1), /zero or positive/);
assert.match(c.lineQuantityError(1.5), /integer/);
assert.match(c.lineQuantityError('2'), /integer/);

// --- shipping countries
assert.deepStrictEqual([...c.parseShippingCountries('')], ['FR']);
assert.deepStrictEqual([...c.parseShippingCountries('fr, be ,xx1,BE')], ['FR', 'BE']);

const address = { id: 'a1', clientUserId: 'u1', type: 'shipping', recipientName: 'Léa', line1: '1 rue X', line2: null, postalCode: '75001', city: 'Paris', countryIso: 'FR' };
assert.deepStrictEqual({ ...c.shippingAddressSnapshot(address) },
  { recipientName: 'Léa', line1: '1 rue X', line2: null, postalCode: '75001', city: 'Paris', countryIso: 'FR' });
assert.throws(() => c.shippingAddressSnapshot({ ...address, type: 'billing' }), /shipping address/);
assert.throws(() => c.shippingAddressSnapshot({ ...address, countryIso: 'DE' }), /shipping_country_not_served/);
assert.doesNotThrow(() => c.shippingAddressSnapshot({ ...address, countryIso: 'BE' }, ['FR', 'BE']));

// --- pricing a two-store cart
const productsById = {
  p1: { id: 'p1', partnerId: 'A', moderationStatus: 'approved' },
  p2: { id: 'p2', partnerId: 'A', moderationStatus: 'approved' },
  p3: { id: 'p3', partnerId: 'B', moderationStatus: 'approved' },
};
const stock = (available, reserved = 0) => ({ quantityAvailable: available, quantityReserved: reserved });
const priced = c.priceCart({
  items: [{ productId: 'p1', quantity: 2 }, { productId: 'p2', quantity: 1 }, { productId: 'p3', quantity: 1 }],
  productsById,
  pricesById: { p1: 4000, p2: 3000, p3: 25000 },
  stockById: { p1: stock(5), p2: stock(1), p3: stock(3, 2) },
  activePartnerIds: ['A', 'B'],
});
assert.strictEqual(priced.canCheckout, true);
assert.strictEqual(priced.subtotalMinorUnits, 8000 + 3000 + 25000);
assert.strictEqual(priced.shippingMinorUnits, 0, 'delivery included at launch');
assert.strictEqual(priced.totalMinorUnits, 36000);
assert.strictEqual(priced.itemCount, 4);
assert.deepStrictEqual(priced.tickets.map((t) => ({ ...t })), [
  { partnerId: 'A', subtotalMinorUnits: 11000, itemCount: 3, commissionRatePercent: 8, commissionMinorUnits: 880 },
  { partnerId: 'B', subtotalMinorUnits: 25000, itemCount: 1, commissionRatePercent: 6, commissionMinorUnits: 1500 },
], 'one ticket per store, rate by ticket amount (not by order total)');

// --- blocked lines
const blocked = c.priceCart({
  items: [
    { productId: 'p1', quantity: 6 },          // only 5 sellable
    { productId: 'p2', quantity: 1 },          // no price
    { productId: 'p3', quantity: 1 },          // store B not active
    { productId: 'gone', quantity: 1, partnerId: 'A' },
  ],
  productsById,
  pricesById: { p1: 4000, p3: 25000 },
  stockById: { p1: stock(5), p2: stock(5), p3: stock(5) },
  activePartnerIds: new Set(['A']),
});
assert.deepStrictEqual(blocked.lines.map((l) => l.status), ['insufficient_stock', 'no_price', 'unavailable', 'unavailable']);
assert.strictEqual(blocked.canCheckout, false);
assert.strictEqual(blocked.subtotalMinorUnits, 0, 'only buyable lines count');
assert.strictEqual(blocked.lines[0].sellableQuantity, 5);

const empty = c.priceCart({ items: [], productsById, pricesById: {}, stockById: {}, activePartnerIds: [] });
assert.strictEqual(empty.canCheckout, false, 'an empty cart cannot be checked out');
assert.strictEqual(empty.totalMinorUnits, 0);

// --- payment hold
const now = new Date('2026-10-16T10:00:00Z');
const pending = { status: 'pending_payment', paymentStatus: 'requires_payment_method', paymentExpiresAt: '2026-10-16T09:59:59Z' };
assert.strictEqual(c.isPaymentHoldExpired(pending, now), true);
assert.strictEqual(c.isPaymentHoldExpired({ ...pending, paymentExpiresAt: '2026-10-16T10:30:00Z' }, now), false);
assert.strictEqual(c.isPaymentHoldExpired({ ...pending, paymentStatus: 'processing' }, now), false, 'never expire a payment in progress');
assert.strictEqual(c.isPaymentHoldExpired({ ...pending, status: 'paid' }, now), false);
assert.strictEqual(c.PAYMENT_HOLD_SECONDS, 1800);

console.log('checkout: all assertions passed.');
