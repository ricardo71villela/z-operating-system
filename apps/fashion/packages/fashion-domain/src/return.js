/* ============================================================
   Z FASHION — RETURN (bounded context: fashion-domain)
   ============================================================
   Owns: the Return request lifecycle for one Product within a
   delivered Shipment. Closes the other half of the "onde estamos"
   gap (2026-08-21, ponto 2): the 14-day return policy and the
   Cosmetics hygiene-seal exception were both already real rules
   (isReturnEligible(), product.js) with nowhere for a Client to
   actually invoke them — no Return entity existed at all.

   Deliberately reuses isReturnEligible() rather than re-deriving the
   Cosmetics exception — this module owns *when* a return window is
   open and *what state* a request is in, never *whether a Category is
   returnable at all*, which stays product.js's one source of truth.

   Same ALLOWED_TRANSITIONS + transition() + history pattern as
   onboarding.js/shipment.js.
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

/**
 * @param {string} deliveredAt - the Shipment's deliveredAt (shipment.js), ISO string
 * @param {Date} [now]
 * @returns {boolean} whether the 14-day window is still open, counted
 *   from delivery — never from purchase/checkout, which is the wrong
 *   anchor (a Client can't return what they haven't received yet, and
 *   shouldn't lose window time to a Partner's own dispatch delay)
 */
function isWithinReturnWindow(deliveredAt, now = new Date()) {
  if (!deliveredAt) return false;
  const deadline = new Date(deliveredAt);
  deadline.setDate(deadline.getDate() + RETURN_WINDOW_DAYS);
  return now <= deadline;
}

/**
 * Opens a Return request. Throws — never silently creates an
 * unreturnable Return — when the Category is never returnable
 * (isReturnEligible(), e.g. an opened Cosmetics seal) or the 14-day
 * window from delivery has already closed.
 *
 * @param {object} args
 * @param {string} args.orderId
 * @param {string} args.partnerId
 * @param {string} args.productId
 * @param {object} args.product - product.js shape, for isReturnEligible()
 * @param {string} args.deliveredAt - the owning Shipment's deliveredAt
 * @param {boolean} [args.sealBroken] - Cosmetics only, see
 *   isReturnEligible() — defaults false (unopened)
 * @param {string} [args.reason]
 * @param {Date} [args.now]
 */
function requestReturn({ orderId, partnerId, productId, product, deliveredAt, sealBroken = false, reason, now = new Date() }) {
  if (!orderId) throw new Error('requestReturn: orderId is required');
  if (!partnerId) throw new Error('requestReturn: partnerId is required');
  if (!productId) throw new Error('requestReturn: productId is required');
  if (!product) throw new Error('requestReturn: product is required (to check isReturnEligible)');

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
    status: 'requested',
    reason: reason || null,
    history: [{ status: 'requested', at: now.toISOString() }],
  });
}

/**
 * @param {object} returnRequest - requestReturn() shape
 * @param {string} toStatus
 * @param {object} [context]
 * @param {Date} [context.now]
 */
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
    history: [...returnRequest.history, { status: toStatus, at: now.toISOString() }],
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
