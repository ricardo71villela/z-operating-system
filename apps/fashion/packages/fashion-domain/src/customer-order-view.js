'use strict';

/* ============================================================
   Z FASHION — CUSTOMER ORDER VIEW (read model)
   ============================================================
   Pure projection for the authenticated Client account. It composes
   existing authorities instead of inventing another Order lifecycle:

   - order.js: immutable commercial totals + purchased lines
   - shipment.js: one independent fulfillment stream per Partner
   - return.js: line-return lifecycle + 14-day delivery window
   - return-settlement.js/order.js: financial refund aggregates

   No persistence authority lives here. This module exists so Web/mobile
   do not have to reconstruct multi-boutique accounting and fulfillment
   rules independently.
   ============================================================ */

const { isWithinReturnWindow } = require('./return');

const ACTIVE_RETURN_STATUSES = Object.freeze(['requested', 'approved', 'in_transit']);

function lineKey(partnerId, productId) {
  return `${partnerId}::${productId}`;
}

function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (value && typeof value === 'object') {
    const copy = {};
    for (const [key, nested] of Object.entries(value)) copy[key] = freeze(nested);
    return Object.freeze(copy);
  }
  return value;
}

function assertOrderAuthority(order, clientUserId) {
  if (!order || !order.id) throw new Error('buildCustomerOrderView: Order is required');
  if (!clientUserId) throw new Error('buildCustomerOrderView: clientUserId is required');
  if (order.clientUserId !== clientUserId) {
    throw new Error('buildCustomerOrderView: Client cannot read another Client Order');
  }
  if (!Array.isArray(order.partnerOrders) || !Array.isArray(order.items)) {
    throw new Error('buildCustomerOrderView: immutable Order items/partnerOrders are required');
  }
}

/**
 * Builds one Client-safe Order projection.
 *
 * `canRequestReturnByWindow` is intentionally narrower than a final
 * product return decision: cosmetics hygiene-seal eligibility belongs to
 * product.js and requires product/seal evidence not present in an Order
 * history read model. The UI can safely use this flag to know whether the
 * delivery/time/quantity gates are open, then invoke the real Return
 * command which performs product eligibility validation as well.
 */
function buildCustomerOrderView({
  order,
  clientUserId,
  shipments = [],
  returns = [],
  now = new Date(),
}) {
  assertOrderAuthority(order, clientUserId);

  const shipmentsByPartner = new Map();
  for (const shipment of shipments) {
    if (shipment.orderId !== order.id) {
      throw new Error('buildCustomerOrderView: every Shipment must belong to this Order');
    }
    if (shipmentsByPartner.has(shipment.partnerId)) {
      throw new Error(`buildCustomerOrderView: duplicate Shipment authority for Partner "${shipment.partnerId}"`);
    }
    shipmentsByPartner.set(shipment.partnerId, shipment);
  }

  const purchasedByLine = new Map();
  for (const item of order.items) {
    const key = lineKey(item.partnerId, item.productId);
    if (purchasedByLine.has(key)) {
      throw new Error(`buildCustomerOrderView: duplicate immutable Order line for ${key}`);
    }
    purchasedByLine.set(key, item);
  }

  const returnsByLine = new Map();
  for (const returnRequest of returns) {
    if (returnRequest.orderId !== order.id) {
      throw new Error('buildCustomerOrderView: every Return must belong to this Order');
    }
    const key = lineKey(returnRequest.partnerId, returnRequest.productId);
    if (!purchasedByLine.has(key)) {
      throw new Error(`buildCustomerOrderView: Return references a Product not purchased in this Order (${key})`);
    }
    if (!Number.isInteger(returnRequest.quantity) || returnRequest.quantity <= 0) {
      throw new Error('buildCustomerOrderView: Return quantity must be a positive integer');
    }
    const list = returnsByLine.get(key) ?? [];
    list.push(returnRequest);
    returnsByLine.set(key, list);
  }

  let totalReservedReturnQuantity = 0;
  let totalRefundedReturnQuantity = 0;
  let activeReturnCount = 0;
  let refundedReturnCount = 0;
  let returnRefundedMinorUnits = 0;

  const packages = order.partnerOrders.map((partnerOrder) => {
    const shipment = shipmentsByPartner.get(partnerOrder.partnerId) ?? null;

    if (shipment) {
      const shipmentProducts = new Set(shipment.productIds ?? []);
      for (const item of partnerOrder.items) {
        if (!shipmentProducts.has(item.productId)) {
          throw new Error(
            `buildCustomerOrderView: Shipment for Partner "${partnerOrder.partnerId}" is missing purchased Product "${item.productId}"`,
          );
        }
      }
    }

    const deliveredAt = shipment?.deliveredAt ?? null;
    const deliveryWindowOpen = shipment?.status === 'delivered'
      && isWithinReturnWindow(deliveredAt, now);

    const items = partnerOrder.items.map((item) => {
      const key = lineKey(item.partnerId, item.productId);
      const lineReturns = returnsByLine.get(key) ?? [];

      const nonRejected = lineReturns.filter((entry) => entry.status !== 'rejected');
      const reservedReturnQuantity = nonRejected.reduce((sum, entry) => sum + entry.quantity, 0);
      const refundedReturnQuantity = lineReturns
        .filter((entry) => entry.status === 'refunded')
        .reduce((sum, entry) => sum + entry.quantity, 0);
      const activeReturns = lineReturns.filter((entry) => ACTIVE_RETURN_STATUSES.includes(entry.status));
      const refundedReturns = lineReturns.filter((entry) => entry.status === 'refunded');
      const lineRefundedMinorUnits = refundedReturns.reduce(
        (sum, entry) => sum + (entry.refundedMinorUnits || 0),
        0,
      );

      if (reservedReturnQuantity > item.quantity) {
        throw new Error(
          `buildCustomerOrderView: Return quantity exceeds purchased quantity for ${key}`,
        );
      }

      const remainingReturnQuantity = item.quantity - reservedReturnQuantity;
      const canRequestReturnByWindow = Boolean(
        deliveryWindowOpen
        && remainingReturnQuantity > 0
        && !['pending_payment', 'cancelled'].includes(order.status),
      );

      totalReservedReturnQuantity += reservedReturnQuantity;
      totalRefundedReturnQuantity += refundedReturnQuantity;
      activeReturnCount += activeReturns.length;
      refundedReturnCount += refundedReturns.length;
      returnRefundedMinorUnits += lineRefundedMinorUnits;

      return {
        productId: item.productId,
        partnerId: item.partnerId,
        quantity: item.quantity,
        unitPriceMinorUnits: item.unitPriceMinorUnits,
        lineTotalMinorUnits: item.lineTotalMinorUnits,
        reservedReturnQuantity,
        refundedReturnQuantity,
        remainingReturnQuantity,
        lineRefundedMinorUnits,
        canRequestReturnByWindow,
        productEligibilityStillRequired: canRequestReturnByWindow,
        returns: lineReturns.map((entry) => ({
          quantity: entry.quantity,
          status: entry.status,
          reason: entry.reason ?? null,
          refundedMinorUnits: entry.refundedMinorUnits || 0,
          refundedAt: entry.refundedAt ?? null,
          history: entry.history ?? [],
        })),
      };
    });

    return {
      partnerId: partnerOrder.partnerId,
      subtotalMinorUnits: partnerOrder.subtotalMinorUnits,
      shipment: shipment
        ? {
            status: shipment.status,
            deliveredAt,
            history: shipment.history ?? [],
          }
        : null,
      deliveryWindowOpen,
      items,
    };
  });

  const deliveredPackages = packages.filter((entry) => entry.shipment?.status === 'delivered').length;
  const shippedPackages = packages.filter((entry) => entry.shipment?.status === 'shipped').length;
  const preparingPackages = packages.filter((entry) => entry.shipment?.status === 'preparing').length;
  const cancelledPackages = packages.filter((entry) => entry.shipment?.status === 'cancelled').length;
  const netPaidMinorUnits = Math.max(0, order.totalMinorUnits - (order.refundedMinorUnits || 0));

  if ((order.refundedMinorUnits || 0) > order.totalMinorUnits) {
    throw new Error('buildCustomerOrderView: Order refunded total exceeds immutable Order total');
  }
  if (returnRefundedMinorUnits > (order.refundedMinorUnits || 0)) {
    throw new Error('buildCustomerOrderView: Return refunds exceed Order refund aggregate');
  }

  return freeze({
    id: order.id,
    clientUserId,
    status: order.status,
    currency: order.currency,
    totalMinorUnits: order.totalMinorUnits,
    refundedMinorUnits: order.refundedMinorUnits || 0,
    netPaidMinorUnits,
    financials: {
      totalMinorUnits: order.totalMinorUnits,
      refundedMinorUnits: order.refundedMinorUnits || 0,
      returnRefundedMinorUnits,
      otherRefundedMinorUnits: (order.refundedMinorUnits || 0) - returnRefundedMinorUnits,
      netPaidMinorUnits,
    },
    progress: {
      totalPackages: packages.length,
      preparingPackages,
      shippedPackages,
      deliveredPackages,
      cancelledPackages,
      activeReturnCount,
      refundedReturnCount,
      reservedReturnQuantity: totalReservedReturnQuantity,
      refundedReturnQuantity: totalRefundedReturnQuantity,
    },
    packages,
  });
}

module.exports = {
  ACTIVE_RETURN_STATUSES,
  buildCustomerOrderView,
};
