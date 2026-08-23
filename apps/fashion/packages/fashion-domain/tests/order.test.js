'use strict';

const assert = require('assert');
const { emptyCart, addItem, attemptCheckoutReservation } = require('../src/cart');
const { initStock, applyStockUpdate } = require('../src/stock');
const { createPaymentIntent, transition: transitionPayment } = require('../src/payment');
const { createShipment, transition: transitionShipment } = require('../src/shipment');
const {
  createOrder,
  confirmPaidOrder,
  cancelPendingOrder,
  refreshFulfillment,
  recordRefund,
} = require('../src/order');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS: ${name}`);
}

function makeCheckout() {
  let cart = emptyCart('client-1');
  cart = addItem(cart, { productId: 'p1', partnerId: 'partner-a', quantity: 1, unitPriceMinorUnits: 12000 });
  cart = addItem(cart, { productId: 'p2', partnerId: 'partner-b', quantity: 2, unitPriceMinorUnits: 3500 });

  const now = new Date('2026-08-23T03:00:00.000Z');
  const stockByProductId = {
    p1: applyStockUpdate(initStock('p1'), { quantityAvailable: 3, observedAt: '2026-08-23T02:59:00.000Z' }),
    p2: applyStockUpdate(initStock('p2'), { quantityAvailable: 4, observedAt: '2026-08-23T02:59:00.000Z' }),
  };
  const reservation = attemptCheckoutReservation(cart, stockByProductId, { now });
  assert.equal(reservation.ok, true);
  return { cart, stockByProductId, reservation, now };
}

test('Order starts pending_payment and snapshots multi-Partner Cart', () => {
  const { cart, now } = makeCheckout();
  const order = createOrder({ orderId: 'order-1', cart, now });
  assert.equal(order.status, 'pending_payment');
  assert.equal(order.totalMinorUnits, 19000);
  assert.equal(order.partnerOrders.length, 2);
  assert.equal(order.items[1].lineTotalMinorUnits, 7000);

  // Mutating the source Cart array after creation cannot change history.
  cart.items.push({ productId: 'late', partnerId: 'partner-c', quantity: 1, unitPriceMinorUnits: 1 });
  assert.equal(order.items.length, 2);
  assert.equal(order.totalMinorUnits, 19000);
});

test('payment not succeeded can never confirm Order or commit stock sale', () => {
  const { cart, reservation } = makeCheckout();
  const order = createOrder({ orderId: 'order-1', cart });
  const payment = createPaymentIntent({ orderId: order.id, amountMinorUnits: order.totalMinorUnits });
  assert.throws(
    () => confirmPaidOrder(order, payment, reservation.stockByProductId, reservation.reservationsByProductId),
    /payment is not confirmed/
  );
});

test('successful payment atomically converts every reservation into sold stock', () => {
  const { cart, reservation } = makeCheckout();
  const order = createOrder({ orderId: 'order-1', cart });
  let payment = createPaymentIntent({ orderId: order.id, amountMinorUnits: order.totalMinorUnits });
  payment = transitionPayment(payment, 'processing');
  payment = transitionPayment(payment, 'succeeded');

  const confirmed = confirmPaidOrder(
    order,
    payment,
    reservation.stockByProductId,
    reservation.reservationsByProductId
  );
  assert.equal(confirmed.order.status, 'paid');
  assert.equal(confirmed.stockByProductId.p1.quantityAvailable, 2);
  assert.equal(confirmed.stockByProductId.p1.quantityReserved, 0);
  assert.equal(confirmed.stockByProductId.p2.quantityAvailable, 2);
  assert.equal(confirmed.stockByProductId.p2.quantityReserved, 0);
});

test('wrong payment amount is rejected against immutable Order total', () => {
  const { cart, reservation } = makeCheckout();
  const order = createOrder({ orderId: 'order-1', cart });
  let payment = createPaymentIntent({ orderId: order.id, amountMinorUnits: order.totalMinorUnits - 1 });
  payment = transitionPayment(payment, 'processing');
  payment = transitionPayment(payment, 'succeeded');
  assert.throws(
    () => confirmPaidOrder(order, payment, reservation.stockByProductId, reservation.reservationsByProductId),
    /payment amount does not match/
  );
});

test('unpaid cancellation releases all Partner reservations', () => {
  const { cart, reservation } = makeCheckout();
  const order = createOrder({ orderId: 'order-1', cart });
  const cancelled = cancelPendingOrder(
    order,
    reservation.stockByProductId,
    reservation.reservationsByProductId
  );
  assert.equal(cancelled.order.status, 'cancelled');
  assert.equal(cancelled.stockByProductId.p1.quantityReserved, 0);
  assert.equal(cancelled.stockByProductId.p2.quantityReserved, 0);
});

test('paid Order cannot use unpaid cancellation shortcut', () => {
  const { cart, reservation } = makeCheckout();
  const order = createOrder({ orderId: 'order-1', cart });
  let payment = createPaymentIntent({ orderId: order.id, amountMinorUnits: order.totalMinorUnits });
  payment = transitionPayment(transitionPayment(payment, 'processing'), 'succeeded');
  const paid = confirmPaidOrder(order, payment, reservation.stockByProductId, reservation.reservationsByProductId).order;
  assert.throws(
    () => cancelPendingOrder(paid, reservation.stockByProductId, reservation.reservationsByProductId),
    /only pending_payment Orders/
  );
});

test('Order fulfillment aggregates Partner Shipments without pretending they move together', () => {
  const { cart, reservation } = makeCheckout();
  let order = createOrder({ orderId: 'order-1', cart });
  let payment = createPaymentIntent({ orderId: order.id, amountMinorUnits: order.totalMinorUnits });
  payment = transitionPayment(transitionPayment(payment, 'processing'), 'succeeded');
  order = confirmPaidOrder(order, payment, reservation.stockByProductId, reservation.reservationsByProductId).order;

  let shipmentA = createShipment({ orderId: order.id, partnerId: 'partner-a', productIds: ['p1'] });
  let shipmentB = createShipment({ orderId: order.id, partnerId: 'partner-b', productIds: ['p2'] });
  shipmentA = transitionShipment(shipmentA, 'preparing');
  order = refreshFulfillment(order, [shipmentA, shipmentB]);
  assert.equal(order.status, 'fulfilling');

  shipmentA = transitionShipment(transitionShipment(shipmentA, 'shipped'), 'delivered');
  assert.equal(refreshFulfillment(order, [shipmentA, shipmentB]).status, 'fulfilling');

  shipmentB = transitionShipment(shipmentB, 'preparing');
  shipmentB = transitionShipment(transitionShipment(shipmentB, 'shipped'), 'delivered');
  order = refreshFulfillment(order, [shipmentA, shipmentB]);
  assert.equal(order.status, 'fulfilled');
});

test('partial and full refunds are bounded by immutable paid total', () => {
  const { cart, reservation } = makeCheckout();
  let order = createOrder({ orderId: 'order-1', cart });
  let payment = createPaymentIntent({ orderId: order.id, amountMinorUnits: order.totalMinorUnits });
  payment = transitionPayment(transitionPayment(payment, 'processing'), 'succeeded');
  order = confirmPaidOrder(order, payment, reservation.stockByProductId, reservation.reservationsByProductId).order;

  order = recordRefund(order, 7000);
  assert.equal(order.status, 'partially_refunded');
  assert.equal(order.refundedMinorUnits, 7000);

  order = recordRefund(order, 12000);
  assert.equal(order.status, 'refunded');
  assert.equal(order.refundedMinorUnits, 19000);

  assert.throws(() => recordRefund(order, 1), /cannot be refunded/);
});

console.log(`\nZ FASHION ORDER AUTHORITY: ${passed}/${passed} PASSED`);
