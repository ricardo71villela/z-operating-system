/* ============================================================
   Z FASHION — ORDER AUTHORITY (bounded context: fashion-domain)
   ============================================================
   Owns the commercial lifecycle of a Client Order after Cart stock
   reservation has succeeded.

   Important boundary:
   - Order status answers "has the Client paid, is fulfillment under way,
     and has money been refunded?"
   - Shipment status answers "what is each Partner physically doing?"
   - Return status answers "what is happening to one returned item?"

   We deliberately do NOT copy preparing/shipped/delivered onto a single
   global Order status. One Order can span several Partners, so those
   states can be true at different times for different Shipments.

   This module also makes checkout history immutable at domain level:
   createOrder() snapshots every Cart line and Partner split instead of
   treating the mutable Cart as the historical purchase record.
   ============================================================ */

const { cartTotal, partnerSplits } = require('./cart');
const { isPaymentConfirmed } = require('./payment');
const { confirmReservation, releaseReservation } = require('./stock');

const STATUSES = Object.freeze([
  'pending_payment',
  'paid',
  'fulfilling',
  'fulfilled',
  'partially_refunded',
  'refunded',
  'cancelled',
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  pending_payment: ['paid', 'cancelled'],
  paid: ['fulfilling', 'partially_refunded', 'refunded'],
  fulfilling: ['fulfilled', 'partially_refunded', 'refunded'],
  fulfilled: ['partially_refunded', 'refunded'],
  partially_refunded: ['refunded'],
  refunded: [],
  cancelled: [],
});

function freezeLine(item) {
  return Object.freeze({
    productId: item.productId,
    partnerId: item.partnerId,
    quantity: item.quantity,
    unitPriceMinorUnits: item.unitPriceMinorUnits,
    lineTotalMinorUnits: item.unitPriceMinorUnits * item.quantity,
  });
}

function createOrder({ orderId, cart, currency = 'eur', now = new Date() }) {
  if (!orderId) throw new Error('createOrder: orderId is required');
  if (!cart || !cart.clientUserId) throw new Error('createOrder: Cart with clientUserId is required');
  if (!Array.isArray(cart.items) || cart.items.length === 0) throw new Error('createOrder: Cart must contain at least one item');

  const items = cart.items.map(freezeLine);
  const splits = partnerSplits({ clientUserId: cart.clientUserId, items });
  const partnerOrders = Object.freeze(
    Object.values(splits).map((split) => Object.freeze({
      partnerId: split.partnerId,
      subtotalMinorUnits: split.subtotalMinorUnits,
      items: Object.freeze(split.items.map(freezeLine)),
    }))
  );

  return Object.freeze({
    id: orderId,
    clientUserId: cart.clientUserId,
    currency,
    totalMinorUnits: cartTotal({ clientUserId: cart.clientUserId, items }),
    refundedMinorUnits: 0,
    status: 'pending_payment',
    items: Object.freeze(items),
    partnerOrders,
    history: Object.freeze([{ status: 'pending_payment', at: now.toISOString() }]),
  });
}

function transition(order, toStatus, { now = new Date() } = {}) {
  const allowed = ALLOWED_TRANSITIONS[order.status] || [];
  if (!allowed.includes(toStatus)) {
    throw new Error(
      `transition: cannot move Order from "${order.status}" to "${toStatus}" — ` +
      `allowed: ${allowed.length ? allowed.join(', ') : '(terminal state)'}`
    );
  }
  return Object.freeze({
    ...order,
    status: toStatus,
    history: Object.freeze([...order.history, { status: toStatus, at: now.toISOString() }]),
  });
}

/**
 * Converts active stock reservations into a real sale only after the
 * payment authority says the PaymentIntent succeeded. This closes the
 * previous gap where an Order could be "confirmed" while payment was
 * still requires_payment_method.
 */
function confirmPaidOrder(
  order,
  paymentIntent,
  stockByProductId,
  reservationsByProductId,
  { now = new Date() } = {}
) {
  if (order.status !== 'pending_payment') {
    throw new Error(`confirmPaidOrder: Order must be pending_payment, got "${order.status}"`);
  }
  if (!isPaymentConfirmed(paymentIntent)) {
    throw new Error(`confirmPaidOrder: payment is not confirmed (status "${paymentIntent.status}")`);
  }
  if (paymentIntent.orderId !== order.id) {
    throw new Error('confirmPaidOrder: PaymentIntent belongs to a different Order');
  }
  if (paymentIntent.amountMinorUnits !== order.totalMinorUnits) {
    throw new Error('confirmPaidOrder: payment amount does not match immutable Order total');
  }

  const updatedStock = { ...stockByProductId };
  for (const item of order.items) {
    const reservation = reservationsByProductId[item.productId];
    const stock = updatedStock[item.productId];
    if (!reservation || !stock) {
      throw new Error(`confirmPaidOrder: missing stock/reservation for Product "${item.productId}"`);
    }
    updatedStock[item.productId] = confirmReservation(stock, reservation);
  }

  return {
    order: transition(order, 'paid', { now }),
    stockByProductId: updatedStock,
  };
}

/** Cancel only an unpaid checkout; a paid Order needs a refund path. */
function cancelPendingOrder(
  order,
  stockByProductId,
  reservationsByProductId,
  { now = new Date() } = {}
) {
  if (order.status !== 'pending_payment') {
    throw new Error('cancelPendingOrder: only pending_payment Orders can be cancelled without a refund');
  }

  const updatedStock = { ...stockByProductId };
  for (const item of order.items) {
    const reservation = reservationsByProductId[item.productId];
    const stock = updatedStock[item.productId];
    if (reservation && stock) updatedStock[item.productId] = releaseReservation(stock, reservation);
  }

  return {
    order: transition(order, 'cancelled', { now }),
    stockByProductId: updatedStock,
  };
}

/**
 * Order-level fulfillment is intentionally coarse. Partner-level detail
 * remains in shipment.js.
 */
function refreshFulfillment(order, shipments, { now = new Date() } = {}) {
  if (!Array.isArray(shipments) || shipments.length === 0) return order;
  if (!shipments.every((shipment) => shipment.orderId === order.id)) {
    throw new Error('refreshFulfillment: every Shipment must belong to this Order');
  }

  const allDelivered = shipments.every((shipment) => shipment.status === 'delivered');
  const anyStarted = shipments.some((shipment) => ['preparing', 'shipped', 'delivered'].includes(shipment.status));

  if (allDelivered && order.status === 'fulfilling') return transition(order, 'fulfilled', { now });
  if (anyStarted && order.status === 'paid') return transition(order, 'fulfilling', { now });
  return order;
}

function recordRefund(order, amountMinorUnits, { now = new Date() } = {}) {
  if (!Number.isInteger(amountMinorUnits) || amountMinorUnits <= 0) {
    throw new Error('recordRefund: amountMinorUnits must be a positive integer');
  }
  if (!['paid', 'fulfilling', 'fulfilled', 'partially_refunded'].includes(order.status)) {
    throw new Error(`recordRefund: Order status "${order.status}" cannot be refunded`);
  }

  const refundedMinorUnits = order.refundedMinorUnits + amountMinorUnits;
  if (refundedMinorUnits > order.totalMinorUnits) {
    throw new Error('recordRefund: cumulative refund cannot exceed immutable Order total');
  }

  const toStatus = refundedMinorUnits === order.totalMinorUnits ? 'refunded' : 'partially_refunded';
  const transitioned = order.status === toStatus
    ? Object.freeze({ ...order, history: order.history })
    : transition(order, toStatus, { now });

  return Object.freeze({ ...transitioned, refundedMinorUnits });
}

module.exports = {
  STATUSES,
  ALLOWED_TRANSITIONS,
  createOrder,
  transition,
  confirmPaidOrder,
  cancelPendingOrder,
  refreshFulfillment,
  recordRefund,
};
