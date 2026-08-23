/* Run with: node apps/fashion/packages/fashion-domain/tests/stock.test.js */

const assert = require('assert');
const {
  initStock, applyStockUpdate, sellableQuantity, reserveStock,
  releaseReservation, confirmReservation, isExpired,
  reservationHoldSecondsFor, DEFAULT_RESERVATION_HOLD_SECONDS, DEGRADED_RESERVATION_HOLD_SECONDS,
} = require('../src/stock');

let stock = initStock('prod_running_shoe');
assert.strictEqual(sellableQuantity(stock), 0);

// A normal update applies cleanly.
stock = applyStockUpdate(stock, { quantityAvailable: 10, observedAt: '2026-08-20T10:00:00.000Z' });
assert.strictEqual(stock.quantityAvailable, 10);

// A stale update (older observedAt) is rejected, never silently applied —
// protects a fresher in-store sale from being undone.
assert.throws(
  () => applyStockUpdate(stock, { quantityAvailable: 20, observedAt: '2026-08-20T09:00:00.000Z' }),
  /stale update rejected/
);
// Stock is unchanged after the rejected attempt.
assert.strictEqual(stock.quantityAvailable, 10);

// A newer update is accepted.
stock = applyStockUpdate(stock, { quantityAvailable: 6, observedAt: '2026-08-20T11:00:00.000Z' });
assert.strictEqual(stock.quantityAvailable, 6);

// Reserving units reduces sellable quantity without touching total stock.
const now = new Date('2026-08-20T12:00:00.000Z');
const r1 = reserveStock(stock, 4, { now });
stock = r1.stock;
assert.strictEqual(stock.quantityAvailable, 6);
assert.strictEqual(stock.quantityReserved, 4);
assert.strictEqual(sellableQuantity(stock), 2);

// A second reservation exceeding what's left is rejected — this is the
// actual oversell-prevention mechanism between Partner feed pushes.
assert.throws(
  () => reserveStock(stock, 3, { now }),
  /insufficient stock/
);

// A reservation within what's left succeeds.
const r2 = reserveStock(stock, 2, { now });
stock = r2.stock;
assert.strictEqual(sellableQuantity(stock), 0);

// Releasing a reservation (abandoned checkout) frees the units back up.
stock = releaseReservation(stock, r2.reservation);
assert.strictEqual(sellableQuantity(stock), 2);

// Confirming a reservation (completed sale) commits the deduction —
// total stock drops, reserved count drops with it.
stock = confirmReservation(stock, r1.reservation);
assert.strictEqual(stock.quantityAvailable, 2);
assert.strictEqual(stock.quantityReserved, 0);

// Expiry check.
const held = reserveStock(stock, 1, { now, holdSeconds: 600 }).reservation;
assert.strictEqual(isExpired(held, now), false);
assert.strictEqual(isExpired(held, new Date('2026-08-20T12:20:00.000Z')), true);

// --- reservationHoldSecondsFor: degraded-tier gets the wider window ---
assert.strictEqual(reservationHoldSecondsFor('live'), DEFAULT_RESERVATION_HOLD_SECONDS);
assert.strictEqual(reservationHoldSecondsFor('degraded'), DEGRADED_RESERVATION_HOLD_SECONDS);
assert.ok(DEGRADED_RESERVATION_HOLD_SECONDS > DEFAULT_RESERVATION_HOLD_SECONDS);
// Never defaults upward to the wider window for an unrecognized or
// missing tier — the safer failure direction is the shorter hold.
assert.strictEqual(reservationHoldSecondsFor(undefined), DEFAULT_RESERVATION_HOLD_SECONDS);
assert.strictEqual(reservationHoldSecondsFor(null), DEFAULT_RESERVATION_HOLD_SECONDS);
assert.strictEqual(reservationHoldSecondsFor('unexpected_value'), DEFAULT_RESERVATION_HOLD_SECONDS);

console.log('stock.js: all invariant checks passed.');
