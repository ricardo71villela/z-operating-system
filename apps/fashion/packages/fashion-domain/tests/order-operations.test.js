'use strict';

const assert = require('assert');
const { emptyCart, addItem } = require('../src/cart');
const { createOrder } = require('../src/order');
const { createShipment, transition } = require('../src/shipment');
const { partnerOrderView, fulfillmentProgress, adminOrderView } = require('../src/order-operations');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS: ${name}`);
}

function makePaidOrder() {
  let cart = emptyCart('client-1');
  cart = addItem(cart, { productId:'p1', partnerId:'partner-a', quantity:1, unitPriceMinorUnits:12000 });
  cart = addItem(cart, { productId:'p2', partnerId:'partner-b', quantity:2, unitPriceMinorUnits:3500 });
  const pending = createOrder({ orderId:'order-1', cart, currency:'eur' });
  return Object.freeze({ ...pending, status:'paid' });
}

test('Partner view exposes only that Partner commercial slice', () => {
  const order = makePaidOrder();
  const shipmentA = createShipment({ orderId:order.id, partnerId:'partner-a', productIds:['p1'] });
  const shipmentB = createShipment({ orderId:order.id, partnerId:'partner-b', productIds:['p2'] });
  const view = partnerOrderView(order, 'partner-a', [shipmentA, shipmentB]);

  assert.equal(view.partnerId, 'partner-a');
  assert.equal(view.subtotalMinorUnits, 12000);
  assert.deepEqual(view.items.map((item) => item.productId), ['p1']);
  assert.deepEqual(view.shipment.productIds, ['p1']);
  assert.equal(JSON.stringify(view).includes('p2'), false);
  assert.equal(JSON.stringify(view).includes('partner-b'), false);
});

test('Partner fulfillment actions come from Shipment authority', () => {
  const order = makePaidOrder();
  let shipment = createShipment({ orderId:order.id, partnerId:'partner-a', productIds:['p1'] });
  assert.deepEqual(partnerOrderView(order, 'partner-a', [shipment]).allowedShipmentTransitions, ['preparing','cancelled']);

  shipment = transition(shipment, 'preparing');
  assert.deepEqual(partnerOrderView(order, 'partner-a', [shipment]).allowedShipmentTransitions, ['shipped','cancelled']);

  shipment = transition(shipment, 'shipped');
  assert.deepEqual(partnerOrderView(order, 'partner-a', [shipment]).allowedShipmentTransitions, ['delivered']);
});

test('unpaid Order cannot expose a Shipment', () => {
  let cart = emptyCart('client-1');
  cart = addItem(cart, { productId:'p1', partnerId:'partner-a', quantity:1, unitPriceMinorUnits:12000 });
  const order = createOrder({ orderId:'order-pending', cart });
  const shipment = createShipment({ orderId:order.id, partnerId:'partner-a', productIds:['p1'] });
  assert.throws(() => partnerOrderView(order, 'partner-a', [shipment]), /unpaid\/cancelled Order/);
});

test('duplicate Partner Shipment authority is rejected', () => {
  const order = makePaidOrder();
  const first = createShipment({ orderId:order.id, partnerId:'partner-a', productIds:['p1'] });
  const second = createShipment({ orderId:order.id, partnerId:'partner-a', productIds:['p1'] });
  assert.throws(() => partnerOrderView(order, 'partner-a', [first, second]), /duplicate Shipment authority/);
});

test('unknown Partner cannot inspect another Partner Order', () => {
  const order = makePaidOrder();
  assert.throws(() => partnerOrderView(order, 'partner-x', []), /has no commercial slice/);
});

test('Admin view reconciles Partner subtotals to immutable Order total', () => {
  const order = makePaidOrder();
  const shipments = [
    createShipment({ orderId:order.id, partnerId:'partner-a', productIds:['p1'] }),
    createShipment({ orderId:order.id, partnerId:'partner-b', productIds:['p2'] }),
  ];
  const view = adminOrderView(order, shipments);
  assert.equal(view.totalMinorUnits, 19000);
  assert.equal(view.partnerCount, 2);
  assert.equal(view.partnerViews.reduce((sum, row) => sum + row.subtotalMinorUnits, 0), 19000);
});

test('fulfillment progress respects independent Partner Shipments', () => {
  const order = makePaidOrder();
  let a = createShipment({ orderId:order.id, partnerId:'partner-a', productIds:['p1'] });
  let b = createShipment({ orderId:order.id, partnerId:'partner-b', productIds:['p2'] });
  a = transition(transition(transition(a, 'preparing'), 'shipped'), 'delivered');
  b = transition(b, 'preparing');

  const progress = fulfillmentProgress(order, [a, b]);
  assert.equal(progress.total, 2);
  assert.equal(progress.delivered, 1);
  assert.equal(progress.preparing, 1);
  assert.equal(progress.complete, false);
});

console.log(`\nZ FASHION ORDER OPERATIONS: ${passed}/${passed} PASSED`);
