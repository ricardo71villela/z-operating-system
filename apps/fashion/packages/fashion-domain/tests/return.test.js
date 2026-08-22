/* Run with: node apps/fashion/packages/fashion-domain/tests/return.test.js */

const assert = require('assert');
const { createProduct } = require('../src/product');
const {
  RETURN_WINDOW_DAYS,
  isWithinReturnWindow,
  requestReturn,
  transition,
  ALLOWED_TRANSITIONS,
} = require('../src/return');

const shoe = createProduct({
  id: 'prod_shoe', partnerId: 'partner_atelier', brandId: 'brand_a',
  names: { fr: 'Escarpins' }, gender: 'female', categories: ['footwear'],
  size: { system: 'EU', value: 38 },
});
const perfume = createProduct({
  id: 'prod_perfume', partnerId: 'partner_verlaine', brandId: 'brand_b',
  names: { fr: 'Parfum' }, gender: 'unisex', categories: ['cosmetics'], format: { volumeMl: 50 },
});

// --- isWithinReturnWindow ---
assert.strictEqual(isWithinReturnWindow(null), false);
assert.strictEqual(
  isWithinReturnWindow('2026-08-10T10:00:00.000Z', new Date('2026-08-20T10:00:00.000Z')),
  true // 10 days later, window is 14
);
assert.strictEqual(
  isWithinReturnWindow('2026-08-01T10:00:00.000Z', new Date('2026-08-20T10:00:00.000Z')),
  false // 19 days later, window closed
);
assert.strictEqual(RETURN_WINDOW_DAYS, 14);

// --- requestReturn: happy path, footwear, within window ---
let ret = requestReturn({
  orderId: 'order_48213', partnerId: 'partner_atelier', productId: 'prod_shoe', product: shoe,
  deliveredAt: '2026-08-15T10:00:00.000Z', reason: 'Taille trop petite',
  now: new Date('2026-08-20T10:00:00.000Z'),
});
assert.strictEqual(ret.status, 'requested');
assert.strictEqual(ret.reason, 'Taille trop petite');

// --- requestReturn: window closed ---
assert.throws(
  () => requestReturn({
    orderId: 'order_x', partnerId: 'partner_atelier', productId: 'prod_shoe', product: shoe,
    deliveredAt: '2026-08-01T10:00:00.000Z', now: new Date('2026-08-20T10:00:00.000Z'),
  }),
  /return window .* has closed/
);

// --- requestReturn: unopened Cosmetics is eligible ---
const perfumeReturn = requestReturn({
  orderId: 'order_y', partnerId: 'partner_verlaine', productId: 'prod_perfume', product: perfume,
  deliveredAt: '2026-08-15T10:00:00.000Z', sealBroken: false,
  now: new Date('2026-08-18T10:00:00.000Z'),
});
assert.strictEqual(perfumeReturn.status, 'requested');

// --- requestReturn: opened Cosmetics is never eligible, regardless of window ---
assert.throws(
  () => requestReturn({
    orderId: 'order_z', partnerId: 'partner_verlaine', productId: 'prod_perfume', product: perfume,
    deliveredAt: '2026-08-18T10:00:00.000Z', sealBroken: true,
    now: new Date('2026-08-19T10:00:00.000Z'), // well within the window
  }),
  /not return-eligible/
);

// --- transition: happy path, requested -> approved -> in_transit -> refunded ---
ret = transition(ret, 'approved');
assert.strictEqual(ret.status, 'approved');
ret = transition(ret, 'in_transit');
assert.strictEqual(ret.status, 'in_transit');
ret = transition(ret, 'refunded');
assert.strictEqual(ret.status, 'refunded');
assert.strictEqual(ret.history.length, 4);

// --- transition: rejected path ---
let rejected = requestReturn({
  orderId: 'order_w', partnerId: 'partner_atelier', productId: 'prod_shoe', product: shoe,
  deliveredAt: '2026-08-19T10:00:00.000Z', now: new Date('2026-08-20T10:00:00.000Z'),
});
rejected = transition(rejected, 'rejected');
assert.strictEqual(rejected.status, 'rejected');
assert.deepStrictEqual(ALLOWED_TRANSITIONS.rejected, []); // terminal

// --- transition: refunded/rejected are terminal, no further moves ---
assert.throws(() => transition(ret, 'approved'), /cannot move from "refunded"/);
assert.throws(() => transition(rejected, 'approved'), /cannot move from "rejected"/);

// --- transition: cannot skip states (requested straight to refunded) ---
let freshRequest = requestReturn({
  orderId: 'order_v', partnerId: 'partner_atelier', productId: 'prod_shoe', product: shoe,
  deliveredAt: '2026-08-19T10:00:00.000Z', now: new Date('2026-08-20T10:00:00.000Z'),
});
assert.throws(() => transition(freshRequest, 'refunded'), /cannot move from "requested" to "refunded"/);

console.log('return.js: all invariant checks passed.');
