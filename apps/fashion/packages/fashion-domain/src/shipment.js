/* ============================================================
   Z FASHION — SHIPMENT (bounded context: fashion-domain)
   ============================================================
   Owns: the per-Partner fulfillment lifecycle within an Order. Closes
   a gap flagged in the "onde estamos" status review (2026-08-21,
   ponto 2): fashion.orders.status was a single global value
   ('confirmed'/'cancelled') with no state machine at all — no
   'processing'/'shipped'/'delivered' progression existed anywhere,
   even though the Client Account prototype already showed each
   Partner's portion of an Order as a separate tracked package.

   A Shipment, not the Order itself, is what actually has a fulfillment
   status — the same way cart.js's partnerSplits() already treats "one
   Partner's portion of the Cart" as the natural unit for checkout
   (all-or-nothing per Partner within the reservation step); this
   module continues that unit past checkout into fulfillment. An Order
   spanning 3 Partners has 3 Shipments, each progressing independently
   — one boutique shipping before another is normal, not an error
   state to reconcile.

   Same ALLOWED_TRANSITIONS + transition() + history pattern already
   established in onboarding.js — a fulfillment status change is a
   business event with its own gates, not a free-form field update.
   ============================================================ */

const STATUSES = Object.freeze(['confirmed', 'preparing', 'shipped', 'delivered', 'cancelled']);

const ALLOWED_TRANSITIONS = Object.freeze({
  confirmed: ['preparing', 'cancelled'],
  preparing: ['shipped', 'cancelled'],
  // Once shipped, the Client-side remedy is a Return (return.js), never
  // a Shipment cancellation — physical goods already left the Partner.
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
});

/**
 * @param {object} args
 * @param {string} args.orderId
 * @param {string} args.partnerId - which Partner's portion of the Order
 *   this Shipment tracks
 * @param {string[]} args.productIds - the Product line items in this
 *   Partner's portion (mirrors one partnerSplits() group from cart.js)
 * @param {Date} [args.now]
 */
function createShipment({ orderId, partnerId, productIds, now = new Date() }) {
  if (!orderId) throw new Error('createShipment: orderId is required');
  if (!partnerId) throw new Error('createShipment: partnerId is required');
  if (!Array.isArray(productIds) || productIds.length === 0) {
    throw new Error('createShipment: productIds must be a non-empty array');
  }
  return Object.freeze({
    orderId,
    partnerId,
    productIds: [...productIds],
    status: 'confirmed',
    deliveredAt: null,
    history: [{ status: 'confirmed', at: now.toISOString() }],
  });
}

/**
 * @param {object} shipment - createShipment() shape
 * @param {string} toStatus
 * @param {object} [context]
 * @param {Date} [context.now]
 */
function transition(shipment, toStatus, { now = new Date() } = {}) {
  const allowed = ALLOWED_TRANSITIONS[shipment.status] || [];

  if (!allowed.includes(toStatus)) {
    throw new Error(
      `transition: cannot move from "${shipment.status}" to "${toStatus}" — ` +
      `allowed: ${allowed.length ? allowed.join(', ') : '(terminal state)'}`
    );
  }

  return Object.freeze({
    ...shipment,
    status: toStatus,
    // deliveredAt is the anchor return.js's 14-day window counts from —
    // set exactly once, the moment 'delivered' is actually reached, never
    // backfilled or estimated.
    deliveredAt: toStatus === 'delivered' ? now.toISOString() : shipment.deliveredAt,
    history: [...shipment.history, { status: toStatus, at: now.toISOString() }],
  });
}

module.exports = { STATUSES, ALLOWED_TRANSITIONS, createShipment, transition };
