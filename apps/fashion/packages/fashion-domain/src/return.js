/* ============================================================
   Z FASHION — RETURN (bounded context: fashion-domain)
   ============================================================
   Owns the Return request lifecycle for an explicit quantity of one
   Product within a delivered Partner Shipment.

   Return quantity is explicit because an Order line can contain more
   than one unit. Refund settlement itself is orchestrated separately
   (return-settlement.js) so a Return cannot become financially refunded
   without the Order aggregate being updated in the same business action.
   ============================================================ */

const { isReturnEligible } = require('./product');

const RETURN_WINDOW_DAYS = 14;

const STATUSES = Object.freeze(['requested', 'approved', 'rejected', 'in_transit', 'refunded']);

const ALLOWED_TRANSITIONS = Object.freeze({
  requested: ['approved', 'rejected'],
  approved: ['in_transit'],
  in_transit: ['refunded'],
  rejected: [],
  refunded: [],
});

function isWithinReturnWindow(deliveredAt, now = new Date()) {
  if (!deliveredAt) return false;
  const deadline = new Date(deliveredAt);
  deadline.setDate(deadline.getDate() + RETURN_WINDOW_DAYS);
  return now <= deadline;
}

/**
 * Opens a Return request.
 *
 * Quantity is never inferred from the purchased line: returning one of
 * two units must be distinguishable from returning both.
 */
function requestReturn({
  orderId,
  partnerId,
  productId,
  product,
  deliveredAt,
  quantity = 1,
  sealBroken = false,
  reason,
  now = new Date(),
}) {
  if (!orderId) throw new Error('requestReturn: orderId is required');
  if (!partnerId) throw new Error('requestReturn: partnerId is required');
  if (!productId) throw new Error('requestReturn: productId is required');
  if (!product) throw new Error('requestReturn: product is required (to check isReturnEligible)');
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('requestReturn: quantity must be a positive integer');
  }

  if (!isReturnEligible(product, { sealBroken })) {
    throw new Error(
      `requestReturn: Product "${productId}" is not return-eligible ` +
      '(Cosmetics with a broken hygiene seal — see product.js isReturnEligible()).'
    );
  }

  if (!isWithinReturnWindow(deliveredAt, now)) {
    throw new Error(
      `requestReturn: the ${RETURN_WINDOW_DAYS}-day return window (from delivery) has closed for order "${orderId}".`
    );
  }

  return Object.freeze({
    orderId,
    partnerId,
    productId,
    quantity,
    status: 'requested',
    reason: reason || null,
    refundedMinorUnits: 0,
    refundedAt: null,
    history: Object.freeze([{ status: 'requested', at: now.toISOString() }]),
  });
}

function transition(returnRequest, toStatus, { now = new Date() } = {}) {
  const allowed = ALLOWED_TRANSITIONS[returnRequest.status] || [];

  if (!allowed.includes(toStatus)) {
    throw new Error(
      `transition: cannot move from "${returnRequest.status}" to "${toStatus}" — ` +
      `allowed: ${allowed.length ? allowed.join(', ') : '(terminal state)'}`
    );
  }

  return Object.freeze({
    ...returnRequest,
    status: toStatus,
    history: Object.freeze([
      ...returnRequest.history,
      { status: toStatus, at: now.toISOString() },
    ]),
  });
}

module.exports = {
  RETURN_WINDOW_DAYS,
  STATUSES,
  ALLOWED_TRANSITIONS,
  isWithinReturnWindow,
  requestReturn,
  transition,
};
