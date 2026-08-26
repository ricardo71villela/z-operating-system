'use strict';

const { ALLOWED_TRANSITIONS: SHIPMENT_TRANSITIONS } = require('./shipment');

function shipmentsForOrder(orderId, shipments) {
  return (shipments || []).filter((shipment) => shipment.orderId === orderId);
}

function findPartnerOrder(order, partnerId) {
  const slice = (order.partnerOrders || []).find((partnerOrder) => partnerOrder.partnerId === partnerId);
  if (!slice) {
    throw new Error(`partnerOrderView: Partner "${partnerId}" has no commercial slice in Order "${order.id}"`);
  }
  return slice;
}

function partnerOrderView(order, partnerId, shipments = []) {
  if (!order || !order.id) throw new Error('partnerOrderView: Order is required');
  if (!partnerId) throw new Error('partnerOrderView: partnerId is required');

  const partnerOrder = findPartnerOrder(order, partnerId);
  const partnerShipments = shipmentsForOrder(order.id, shipments)
    .filter((shipment) => shipment.partnerId === partnerId);

  if (partnerShipments.length > 1) {
    throw new Error(`partnerOrderView: duplicate Shipment authority for Partner "${partnerId}"`);
  }

  const shipment = partnerShipments[0] || null;
  const paymentSettled = ['paid', 'fulfilling', 'fulfilled', 'partially_refunded', 'refunded'].includes(order.status);

  if (!paymentSettled && shipment) {
    throw new Error('partnerOrderView: an unpaid/cancelled Order cannot expose an active Partner Shipment');
  }

  return Object.freeze({
    orderId: order.id,
    orderStatus: order.status,
    currency: order.currency,
    partnerId,
    subtotalMinorUnits: partnerOrder.subtotalMinorUnits,
    items: Object.freeze(partnerOrder.items.map((item) => Object.freeze({ ...item }))),
    shipment: shipment
      ? Object.freeze({
          status: shipment.status,
          deliveredAt: shipment.deliveredAt,
          productIds: Object.freeze([...shipment.productIds]),
        })
      : null,
    allowedShipmentTransitions: Object.freeze(
      shipment ? [...(SHIPMENT_TRANSITIONS[shipment.status] || [])] : [],
    ),
  });
}

function fulfillmentProgress(order, shipments = []) {
  const relevant = shipmentsForOrder(order.id, shipments);
  const total = relevant.length;
  const count = (status) => relevant.filter((shipment) => shipment.status === status).length;

  return Object.freeze({
    total,
    confirmed: count('confirmed'),
    preparing: count('preparing'),
    shipped: count('shipped'),
    delivered: count('delivered'),
    cancelled: count('cancelled'),
    complete: total > 0 && count('delivered') === total,
  });
}

function adminOrderView(order, shipments = []) {
  if (!order || !order.id) throw new Error('adminOrderView: Order is required');

  const partnerViews = (order.partnerOrders || []).map((partnerOrder) =>
    partnerOrderView(order, partnerOrder.partnerId, shipments),
  );

  const subtotal = partnerViews.reduce((sum, view) => sum + view.subtotalMinorUnits, 0);
  if (subtotal !== order.totalMinorUnits) {
    throw new Error(
      `adminOrderView: Partner subtotals (${subtotal}) do not equal immutable Order total (${order.totalMinorUnits})`,
    );
  }

  return Object.freeze({
    orderId: order.id,
    orderStatus: order.status,
    currency: order.currency,
    totalMinorUnits: order.totalMinorUnits,
    refundedMinorUnits: order.refundedMinorUnits,
    partnerCount: partnerViews.length,
    partnerViews: Object.freeze(partnerViews),
    fulfillment: fulfillmentProgress(order, shipments),
  });
}

module.exports = {
  partnerOrderView,
  fulfillmentProgress,
  adminOrderView,
};
