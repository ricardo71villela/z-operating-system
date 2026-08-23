'use strict';

const assert = require('assert');
const { requestReturn, transition } = require('../src/return');
const { settleReturnRefund } = require('../src/return-settlement');

const product = {
  id:'p1',
  categories:['clothing'],
};

function makeOrder() {
  return Object.freeze({
    id:'order-1',
    status:'fulfilled',
    totalMinorUnits:20000,
    refundedMinorUnits:0,
    history:Object.freeze([{ status:'fulfilled', at:'2026-08-20T10:00:00.000Z' }]),
  });
}

function makeOrderItem() {
  return Object.freeze({
    productId:'p1',
    partnerId:'partner-a',
    quantity:2,
    unitPriceMinorUnits:10000,
    lineTotalMinorUnits:20000,
  });
}

function makeInTransitReturn(quantity = 1) {
  let ret = requestReturn({
    orderId:'order-1',
    partnerId:'partner-a',
    productId:'p1',
    product,
    deliveredAt:'2026-08-20T10:00:00.000Z',
    quantity,
    now:new Date('2026-08-21T10:00:00.000Z'),
  });
  ret = transition(ret, 'approved', { now:new Date('2026-08-21T11:00:00.000Z') });
  ret = transition(ret, 'in_transit', { now:new Date('2026-08-22T10:00:00.000Z') });
  return ret;
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS: ${name}`);
}

test('Return quantity is explicit and positive', () => {
  const ret = requestReturn({
    orderId:'order-1', partnerId:'partner-a', productId:'p1', product,
    deliveredAt:'2026-08-20T10:00:00.000Z', quantity:2,
    now:new Date('2026-08-21T10:00:00.000Z'),
  });
  assert.equal(ret.quantity, 2);
  assert.throws(() => requestReturn({
    orderId:'order-1', partnerId:'partner-a', productId:'p1', product,
    deliveredAt:'2026-08-20T10:00:00.000Z', quantity:0,
  }), /quantity must be a positive integer/);
});

test('settlement refunds exact unit price multiplied by returned quantity', () => {
  const result = settleReturnRefund({
    order:makeOrder(),
    returnRequest:makeInTransitReturn(1),
    orderItem:makeOrderItem(),
    now:new Date('2026-08-23T10:00:00.000Z'),
  });
  assert.equal(result.refundMinorUnits, 10000);
  assert.equal(result.order.refundedMinorUnits, 10000);
  assert.equal(result.order.status, 'partially_refunded');
  assert.equal(result.returnRequest.status, 'refunded');
  assert.equal(result.returnRequest.refundedMinorUnits, 10000);
});

test('returning the full purchased quantity fully refunds Order', () => {
  const result = settleReturnRefund({
    order:makeOrder(),
    returnRequest:makeInTransitReturn(2),
    orderItem:makeOrderItem(),
  });
  assert.equal(result.refundMinorUnits, 20000);
  assert.equal(result.order.status, 'refunded');
  assert.equal(result.order.refundedMinorUnits, 20000);
});

test('single Return cannot exceed purchased quantity', () => {
  assert.throws(() => settleReturnRefund({
    order:makeOrder(),
    returnRequest:makeInTransitReturn(3),
    orderItem:makeOrderItem(),
  }), /return quantity exceeds purchased quantity/);
});

test('multiple partial Returns cannot cumulatively exceed purchased quantity', () => {
  assert.throws(() => settleReturnRefund({
    order:makeOrder(),
    returnRequest:makeInTransitReturn(2),
    orderItem:makeOrderItem(),
    alreadyReturnedQuantity:1,
  }), /cumulative returned quantity exceeds purchased quantity/);
});

test('wrong Partner or Product cannot settle another Order line', () => {
  const ret = makeInTransitReturn(1);
  assert.throws(() => settleReturnRefund({
    order:makeOrder(), returnRequest:ret,
    orderItem:{ ...makeOrderItem(), partnerId:'partner-b' },
  }), /Partner does not own/);
  assert.throws(() => settleReturnRefund({
    order:makeOrder(), returnRequest:ret,
    orderItem:{ ...makeOrderItem(), productId:'p2' },
  }), /Product does not match/);
});

test('Return must reach in_transit before financial settlement', () => {
  const requested = requestReturn({
    orderId:'order-1', partnerId:'partner-a', productId:'p1', product,
    deliveredAt:'2026-08-20T10:00:00.000Z', quantity:1,
    now:new Date('2026-08-21T10:00:00.000Z'),
  });
  assert.throws(() => settleReturnRefund({
    order:makeOrder(), returnRequest:requested, orderItem:makeOrderItem(),
  }), /must be in_transit/);
});

test('provider retry is idempotent and cannot double-refund', () => {
  const first = settleReturnRefund({
    order:makeOrder(),
    returnRequest:makeInTransitReturn(1),
    orderItem:makeOrderItem(),
  });
  const retry = settleReturnRefund({
    order:first.order,
    returnRequest:first.returnRequest,
    orderItem:makeOrderItem(),
  });
  assert.equal(retry.idempotent, true);
  assert.equal(retry.order.refundedMinorUnits, 10000);
});

console.log(`\nZ FASHION RETURN SETTLEMENT: ${passed}/${passed} PASSED`);
