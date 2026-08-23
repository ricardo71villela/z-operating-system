'use strict';

const { transition: transitionReturn } = require('./return');
const { recordRefund } = require('./order');

function assertReturnMatchesOrderLine(returnRequest, order, orderItem) {
  if (returnRequest.orderId !== order.id) {
    throw new Error('settleReturnRefund: Return belongs to a different Order');
  }
  if (returnRequest.partnerId !== orderItem.partnerId) {
    throw new Error('settleReturnRefund: Return Partner does not own the Order line');
  }
  if (returnRequest.productId !== orderItem.productId) {
    throw new Error('settleReturnRefund: Return Product does not match the Order line');
  }
  if (returnRequest.quantity > orderItem.quantity) {
    throw new Error('settleReturnRefund: return quantity exceeds purchased quantity');
  }
}

/**
 * Settles one provider-confirmed return refund as one domain action.
 * The Return cannot become `refunded` unless the Order refund aggregate
 * is updated for the exact purchased unit price × returned quantity.
 *
 * `alreadyReturnedQuantity` is the quantity from other non-rejected
 * Return requests for the same Order line. It prevents several partial
 * requests from cumulatively exceeding what was purchased.
 */
function settleReturnRefund({
  order,
  returnRequest,
  orderItem,
  alreadyReturnedQuantity = 0,
  now = new Date(),
}) {
  if (!order || !returnRequest || !orderItem) {
    throw new Error('settleReturnRefund: order, returnRequest and orderItem are required');
  }

  assertReturnMatchesOrderLine(returnRequest, order, orderItem);

  if (!Number.isInteger(alreadyReturnedQuantity) || alreadyReturnedQuantity < 0) {
    throw new Error('settleReturnRefund: alreadyReturnedQuantity must be a non-negative integer');
  }
  if (alreadyReturnedQuantity + returnRequest.quantity > orderItem.quantity) {
    throw new Error('settleReturnRefund: cumulative returned quantity exceeds purchased quantity');
  }

  const refundMinorUnits = orderItem.unitPriceMinorUnits * returnRequest.quantity;

  // Idempotent retry: if the return is already financially settled with
  // the exact amount, do not add a second Order refund.
  if (returnRequest.status === 'refunded') {
    if (returnRequest.refundedMinorUnits !== refundMinorUnits) {
      throw new Error('settleReturnRefund: refunded Return amount conflicts with Order line price');
    }
    return Object.freeze({ order, returnRequest, refundMinorUnits, idempotent: true });
  }

  if (returnRequest.status !== 'in_transit') {
    throw new Error(
      `settleReturnRefund: Return must be in_transit before settlement, got "${returnRequest.status}"`,
    );
  }

  const updatedOrder = recordRefund(order, refundMinorUnits, { now });
  const transitionedReturn = transitionReturn(returnRequest, 'refunded', { now });
  const updatedReturn = Object.freeze({
    ...transitionedReturn,
    refundedMinorUnits: refundMinorUnits,
    refundedAt: now.toISOString(),
  });

  return Object.freeze({
    order: updatedOrder,
    returnRequest: updatedReturn,
    refundMinorUnits,
    idempotent: false,
  });
}

module.exports = { settleReturnRefund };
