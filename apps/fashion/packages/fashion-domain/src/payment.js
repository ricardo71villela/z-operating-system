/* ============================================================
   Z FASHION — PAYMENT (Stripe) (bounded context: fashion-domain)
   ============================================================
   Owns: the PaymentIntent lifecycle for an Order — closes ponto 1 of
   today's "o que falta" review (2026-08-21): Payment was the last
   direct checkout blocker, deliberately left open in
   ACCOUNT-AND-IDENTITY.md until a PSP decision was made. Stripe,
   confirmed as the chosen provider — configured here the same way
   Z Studio's platform billing adapters and Z Jobs's billing.ts were:
   the real shape is modeled and ready, the live/production connection
   (real API keys, webhook signing secret, going out of test mode) is
   deliberately deferred to a separate, explicit "go live" step, never
   silently assumed.

   PCI-DSS boundary, non-negotiable: this module NEVER receives, models,
   stores, or logs raw card data (number, CVC, expiry) — Stripe's own
   client-side tokenization (Stripe.js/Elements) is what touches a
   card, and only a Stripe-issued token/PaymentMethod id ever reaches
   here. `stripeCustomerId` and `stripePaymentIntentId` are opaque
   Stripe-issued references, never anything this module could
   reconstruct a card from.

   Status enum mirrors Stripe's own real PaymentIntent statuses exactly
   (https://docs.stripe.com/payments/paymentintents/lifecycle) — not a
   Z Fashion-invented vocabulary that would need a translation layer
   against Stripe's webhook payloads later.
   ============================================================ */

const STATUSES = Object.freeze([
  'requires_payment_method',
  'requires_confirmation',
  'processing',
  'succeeded',
  'failed',
  'refunded',
]);

// Mirrors Stripe's own PaymentIntent status graph — not exhaustive of
// every Stripe edge case (e.g. requires_action for 3-D Secure is
// folded into requires_confirmation here, deliberately simplified
// until the real Stripe.js integration surfaces that distinction),
// but never contradicts it.
const ALLOWED_TRANSITIONS = Object.freeze({
  requires_payment_method: ['requires_confirmation', 'processing', 'failed'],
  requires_confirmation: ['processing', 'failed'],
  processing: ['succeeded', 'failed'],
  succeeded: ['refunded'],
  failed: ['requires_payment_method'],
  refunded: [],
});

/**
 * @param {object} args
 * @param {string} args.orderId
 * @param {number} args.amountMinorUnits - must match the Order total
 *   exactly; this function does not recompute or trust a caller-
 *   supplied amount against anything, the caller (checkout flow) owns
 *   getting this right from cart.js's cartTotal()
 * @param {string} [args.currency] - ISO 4217, lowercase, Stripe's own
 *   convention (e.g. 'eur') — defaults to 'eur' (France-first launch)
 * @param {string} [args.stripeCustomerId] - Stripe's Customer id for
 *   this Client, if one already exists (created on the Client's first
 *   ever payment attempt, reused after) — null is valid, Stripe can
 *   create one implicitly on first PaymentIntent
 */
function createPaymentIntent({ orderId, amountMinorUnits, currency = 'eur', stripeCustomerId = null }) {
  if (!orderId) throw new Error('createPaymentIntent: orderId is required');
  if (typeof amountMinorUnits !== 'number' || amountMinorUnits <= 0) {
    throw new Error('createPaymentIntent: amountMinorUnits must be a positive number');
  }

  return Object.freeze({
    orderId,
    // Filled in by the API layer after the real Stripe API call
    // (stripe.paymentIntents.create()) returns — this domain function
    // never calls Stripe itself (no I/O in fashion-domain, same
    // discipline as every other module here); null here means "not
    // yet created with Stripe," not "no payment."
    stripePaymentIntentId: null,
    stripeCustomerId,
    amountMinorUnits,
    currency,
    status: 'requires_payment_method',
    history: [],
  });
}

/**
 * Attaches the real Stripe-issued PaymentIntent id once the API layer
 * has actually called Stripe — a pure, non-I/O merge, never the call
 * itself.
 */
function attachStripePaymentIntentId(paymentIntent, stripePaymentIntentId) {
  if (!stripePaymentIntentId) {
    throw new Error('attachStripePaymentIntentId: stripePaymentIntentId is required');
  }
  return Object.freeze({ ...paymentIntent, stripePaymentIntentId });
}

/**
 * @param {object} paymentIntent - createPaymentIntent() shape
 * @param {string} toStatus
 * @param {object} [context]
 * @param {Date} [context.now]
 * @param {string} [context.reason] - e.g. a Stripe decline code, kept
 *   only as opaque text for the Partner/Client-facing message, never
 *   parsed or branched on here
 */
function transition(paymentIntent, toStatus, { now = new Date(), reason } = {}) {
  const allowed = ALLOWED_TRANSITIONS[paymentIntent.status] || [];

  if (!allowed.includes(toStatus)) {
    throw new Error(
      `transition: cannot move from "${paymentIntent.status}" to "${toStatus}" — ` +
      `allowed: ${allowed.length ? allowed.join(', ') : '(terminal state)'}`
    );
  }

  return Object.freeze({
    ...paymentIntent,
    status: toStatus,
    history: [...paymentIntent.history, { status: toStatus, at: now.toISOString(), reason: reason || null }],
  });
}

/**
 * A checkout is only allowed to confirm an Order once its
 * PaymentIntent has actually succeeded — never on 'processing' alone
 * (Stripe's own async-payment-method guidance: a Partner's Shipment
 * must not start preparing goods against a payment that could still
 * fail or get disputed at the 'processing' stage).
 */
function isPaymentConfirmed(paymentIntent) {
  return paymentIntent.status === 'succeeded';
}

module.exports = {
  STATUSES,
  ALLOWED_TRANSITIONS,
  createPaymentIntent,
  attachStripePaymentIntentId,
  transition,
  isPaymentConfirmed,
};
