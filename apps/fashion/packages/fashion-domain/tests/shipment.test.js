/* Run with: node apps/fashion/packages/fashion-domain/tests/shipment.test.js */

const assert = require('assert');
const { createShipment, transition, STATUSES, ALLOWED_TRANSITIONS } = require('../src/shipment');

assert.throws(() => createShipment({ orderId: null, partnerId: 'p1', productIds: ['x'] }), /orderId is required/);
assert.throws(() => createShipment({ orderId: 'o1', partnerId: null, productIds: ['x'] }), /partnerId is required/);
assert.throws(() => createShipment({ orderId: 'o1', partnerId: 'p1', productIds: [] }), /non-empty array/);

let shipment = createShipment({
  orderId: 'order_48213', partnerId: 'partner_atelier', productIds: ['prod_shoe'],
  now: new Date('2026-08-15T10:00:00.000Z'),
});
assert.strictEqual(shipment.status, 'confirmed');
assert.strictEqual(shipment.deliveredAt, null);
assert.strictEqual(shipment.history.length, 1);

// Happy path: confirmed -> preparing -> shipped -> delivered.
shipment = transition(shipment, 'preparing', { now: new Date('2026-08-16T09:00:00.000Z') });
assert.strictEqual(shipment.status, 'preparing');

shipment = transition(shipment, 'shipped', { now: new Date('2026-08-17T09:00:00.000Z') });
assert.strictEqual(shipment.status, 'shipped');
assert.strictEqual(shipment.deliveredAt, null); // not delivered yet

shipment = transition(shipment, 'delivered', { now: new Date('2026-08-19T14:00:00.000Z') });
assert.strictEqual(shipment.status, 'delivered');
assert.strictEqual(shipment.deliveredAt, '2026-08-19T14:00:00.000Z');
assert.strictEqual(shipment.history.length, 4);

// deliveredAt is set exactly once, at the real transition — never
// backfilled by a later, unrelated call.
assert.throws(() => transition(shipment, 'shipped'), /cannot move from "delivered"/);

// Cancellation is only reachable before shipment — once shipped, the
// remedy is a Return (return.js), never a Shipment cancellation.
let cancellable = createShipment({ orderId: 'o2', partnerId: 'p1', productIds: ['x'] });
cancellable = transition(cancellable, 'cancelled');
assert.strictEqual(cancellable.status, 'cancelled');

let shippedAlready = createShipment({ orderId: 'o3', partnerId: 'p1', productIds: ['x'] });
shippedAlready = transition(shippedAlready, 'preparing');
shippedAlready = transition(shippedAlready, 'shipped');
assert.throws(() => transition(shippedAlready, 'cancelled'), /cannot move from "shipped" to "cancelled"/);

// Terminal states have no outgoing transitions.
assert.deepStrictEqual(ALLOWED_TRANSITIONS.delivered, []);
assert.deepStrictEqual(ALLOWED_TRANSITIONS.cancelled, []);
assert.deepStrictEqual(STATUSES, ['confirmed', 'preparing', 'shipped', 'delivered', 'cancelled']);

console.log('shipment.js: all invariant checks passed.');
