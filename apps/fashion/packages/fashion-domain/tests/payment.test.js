/* Run with: node apps/fashion/packages/fashion-domain/tests/payment.test.js */

const assert = require('assert');
const {
  createPaymentIntent, attachStripePaymentIntentId, transition, isPaymentConfirmed,
  STATUSES, ALLOWED_TRANSITIONS,
} = require('../src/payment');

assert.throws(() => createPaymentIntent({ orderId: null, amountMinorUnits: 15500 }), /orderId is required/);
assert.throws(() => createPaymentIntent({ orderId: 'order_1', amountMinorUnits: 0 }), /positive number/);
assert.throws(() => createPaymentIntent({ orderId: 'order_1', amountMinorUnits: -100 }), /positive number/);

let pi = createPaymentIntent({ orderId: 'order_48213', amountMinorUnits: 30400 });
assert.strictEqual(pi.status, 'requires_payment_method');
assert.strictEqual(pi.stripePaymentIntentId, null);
assert.strictEqual(pi.currency, 'eur'); // France-first default
assert.strictEqual(isPaymentConfirmed(pi), false);

// Never accepts raw card fields even if a caller tried to pass them —
// createPaymentIntent()'s signature has no such parameter at all, so
// there is nothing in this object a card number could ever occupy.
assert.strictEqual(Object.keys(pi).includes('cardNumber'), false);
assert.strictEqual(Object.keys(pi).includes('cvc'), false);

// --- attachStripePaymentIntentId ---
assert.throws(() => attachStripePaymentIntentId(pi, null), /stripePaymentIntentId is required/);
pi = attachStripePaymentIntentId(pi, 'pi_3Ln8x2CZ6qsJgndP1a2b3c4');
assert.strictEqual(pi.stripePaymentIntentId, 'pi_3Ln8x2CZ6qsJgndP1a2b3c4');

// --- happy path: requires_payment_method -> processing -> succeeded ---
pi = transition(pi, 'processing', { now: new Date('2026-08-21T10:00:00.000Z') });
assert.strictEqual(pi.status, 'processing');
assert.strictEqual(isPaymentConfirmed(pi), false); // processing is not yet confirmed — must not trigger fulfillment

pi = transition(pi, 'succeeded', { now: new Date('2026-08-21T10:00:05.000Z') });
assert.strictEqual(pi.status, 'succeeded');
assert.strictEqual(isPaymentConfirmed(pi), true);
assert.strictEqual(pi.history.length, 2);

// --- refund path, only reachable from succeeded ---
pi = transition(pi, 'refunded');
assert.strictEqual(pi.status, 'refunded');
assert.deepStrictEqual(ALLOWED_TRANSITIONS.refunded, []); // terminal

// --- failure + retry path ---
let retryPi = createPaymentIntent({ orderId: 'order_x', amountMinorUnits: 5000 });
retryPi = transition(retryPi, 'processing');
retryPi = transition(retryPi, 'failed', { reason: 'card_declined' });
assert.strictEqual(retryPi.status, 'failed');
assert.strictEqual(retryPi.history[retryPi.history.length - 1].reason, 'card_declined');

// A failed payment can retry with a new payment method.
retryPi = transition(retryPi, 'requires_payment_method');
assert.strictEqual(retryPi.status, 'requires_payment_method');

// --- invalid transitions rejected ---
const fresh = createPaymentIntent({ orderId: 'order_y', amountMinorUnits: 1000 });
assert.throws(() => transition(fresh, 'succeeded'), /cannot move from "requires_payment_method" to "succeeded"/);
assert.throws(() => transition(fresh, 'refunded'), /cannot move from "requires_payment_method" to "refunded"/);

assert.deepStrictEqual(STATUSES, ['requires_payment_method', 'requires_confirmation', 'processing', 'succeeded', 'failed', 'refunded']);

console.log('payment.js: all invariant checks passed.');
