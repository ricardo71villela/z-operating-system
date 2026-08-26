'use strict';

const assert = require('node:assert/strict');
const { buildCustomerOrderView } = require('../src/customer-order-view');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(error);
    failed += 1;
  }
}

function order(overrides = {}) {
  const a1 = Object.freeze({
    productId: 'product-a', partnerId: 'partner-a', quantity: 2,
    unitPriceMinorUnits: 1000, lineTotalMinorUnits: 2000,
  });
  const b1 = Object.freeze({
    productId: 'product-b', partnerId: 'partner-b', quantity: 1,
    unitPriceMinorUnits: 4000, lineTotalMinorUnits: 4000,
  });
  return Object.freeze({
    id: 'order-1',
    clientUserId: 'client-1',
    currency: 'eur',
    totalMinorUnits: 6000,
    refundedMinorUnits: 0,
    status: 'fulfilling',
    items: Object.freeze([a1, b1]),
    partnerOrders: Object.freeze([
      Object.freeze({ partnerId: 'partner-a', subtotalMinorUnits: 2000, items: Object.freeze([a1]) }),
      Object.freeze({ partnerId: 'partner-b', subtotalMinorUnits: 4000, items: Object.freeze([b1]) }),
    ]),
    history: Object.freeze([]),
    ...overrides,
  });
}

function shipment(partnerId, productId, status, deliveredAt = null) {
  return Object.freeze({
    orderId: 'order-1',
    partnerId,
    productIds: Object.freeze([productId]),
    status,
    deliveredAt,
    history: Object.freeze([{ status, at: deliveredAt || '2026-08-20T10:00:00.000Z' }]),
  });
}

function ret(overrides = {}) {
  return Object.freeze({
    orderId: 'order-1',
    partnerId: 'partner-a',
    productId: 'product-a',
    quantity: 1,
    status: 'requested',
    reason: 'size',
    refundedMinorUnits: 0,
    refundedAt: null,
    history: Object.freeze([]),
    ...overrides,
  });
}

const NOW = new Date('2026-08-23T10:00:00.000Z');

console.log('customer-order-view.buildCustomerOrderView');

test('projects one Order into independent Partner packages without mixing lines', () => {
  const view = buildCustomerOrderView({
    order: order(),
    clientUserId: 'client-1',
    shipments: [
      shipment('partner-a', 'product-a', 'delivered', '2026-08-20T10:00:00.000Z'),
      shipment('partner-b', 'product-b', 'shipped'),
    ],
    now: NOW,
  });

  assert.equal(view.packages.length, 2);
  assert.deepEqual(view.packages[0].items.map((item) => item.productId), ['product-a']);
  assert.deepEqual(view.packages[1].items.map((item) => item.productId), ['product-b']);
  assert.equal(view.packages[0].shipment.status, 'delivered');
  assert.equal(view.packages[1].shipment.status, 'shipped');
  assert.equal(view.progress.deliveredPackages, 1);
  assert.equal(view.progress.shippedPackages, 1);
});

test('rejects cross-client Order access before projecting any commercial data', () => {
  assert.throws(
    () => buildCustomerOrderView({ order: order(), clientUserId: 'client-other' }),
    /cannot read another Client Order/,
  );
});

test('delivery window enables a return only for a delivered package with remaining quantity', () => {
  const view = buildCustomerOrderView({
    order: order(),
    clientUserId: 'client-1',
    shipments: [
      shipment('partner-a', 'product-a', 'delivered', '2026-08-20T10:00:00.000Z'),
      shipment('partner-b', 'product-b', 'shipped'),
    ],
    now: NOW,
  });

  assert.equal(view.packages[0].deliveryWindowOpen, true);
  assert.equal(view.packages[0].items[0].canRequestReturnByWindow, true);
  assert.equal(view.packages[0].items[0].productEligibilityStillRequired, true);
  assert.equal(view.packages[1].deliveryWindowOpen, false);
  assert.equal(view.packages[1].items[0].canRequestReturnByWindow, false);
});

test('rejected Return does not consume purchased return quantity', () => {
  const view = buildCustomerOrderView({
    order: order(),
    clientUserId: 'client-1',
    shipments: [shipment('partner-a', 'product-a', 'delivered', '2026-08-20T10:00:00.000Z')],
    returns: [ret({ status: 'rejected', quantity: 2 })],
    now: NOW,
  });

  const line = view.packages[0].items[0];
  assert.equal(line.reservedReturnQuantity, 0);
  assert.equal(line.remainingReturnQuantity, 2);
  assert.equal(line.canRequestReturnByWindow, true);
});

test('partial active + refunded Returns consume only their explicit quantities', () => {
  const view = buildCustomerOrderView({
    order: order({ refundedMinorUnits: 1000, status: 'partially_refunded' }),
    clientUserId: 'client-1',
    shipments: [shipment('partner-a', 'product-a', 'delivered', '2026-08-20T10:00:00.000Z')],
    returns: [
      ret({ status: 'refunded', quantity: 1, refundedMinorUnits: 1000, refundedAt: '2026-08-22T10:00:00.000Z' }),
      ret({ status: 'requested', quantity: 1 }),
      ret({ status: 'rejected', quantity: 1 }),
    ],
    now: NOW,
  });

  const line = view.packages[0].items[0];
  assert.equal(line.reservedReturnQuantity, 2);
  assert.equal(line.refundedReturnQuantity, 1);
  assert.equal(line.remainingReturnQuantity, 0);
  assert.equal(line.canRequestReturnByWindow, false);
  assert.equal(view.progress.activeReturnCount, 1);
  assert.equal(view.progress.refundedReturnCount, 1);
  assert.equal(view.progress.reservedReturnQuantity, 2);
  assert.equal(view.progress.refundedReturnQuantity, 1);
});

test('financial summary uses immutable Order refund aggregate and separates Return refunds', () => {
  const view = buildCustomerOrderView({
    order: order({ refundedMinorUnits: 1500, status: 'partially_refunded' }),
    clientUserId: 'client-1',
    returns: [ret({ status: 'refunded', refundedMinorUnits: 1000, refundedAt: '2026-08-22T10:00:00.000Z' })],
    now: NOW,
  });

  assert.equal(view.financials.totalMinorUnits, 6000);
  assert.equal(view.financials.refundedMinorUnits, 1500);
  assert.equal(view.financials.returnRefundedMinorUnits, 1000);
  assert.equal(view.financials.otherRefundedMinorUnits, 500);
  assert.equal(view.financials.netPaidMinorUnits, 4500);
  assert.equal(view.netPaidMinorUnits, 4500);
});

test('return window closes exactly from delivery authority, not purchase date', () => {
  const view = buildCustomerOrderView({
    order: order(),
    clientUserId: 'client-1',
    shipments: [shipment('partner-a', 'product-a', 'delivered', '2026-08-01T10:00:00.000Z')],
    now: NOW,
  });
  assert.equal(view.packages[0].deliveryWindowOpen, false);
  assert.equal(view.packages[0].items[0].canRequestReturnByWindow, false);
});

test('detects duplicate Shipment authority for the same Partner', () => {
  assert.throws(
    () => buildCustomerOrderView({
      order: order(),
      clientUserId: 'client-1',
      shipments: [
        shipment('partner-a', 'product-a', 'shipped'),
        shipment('partner-a', 'product-a', 'delivered', '2026-08-20T10:00:00.000Z'),
      ],
      now: NOW,
    }),
    /duplicate Shipment authority/,
  );
});

test('detects cumulative Return quantity above the immutable purchased line', () => {
  assert.throws(
    () => buildCustomerOrderView({
      order: order(),
      clientUserId: 'client-1',
      returns: [ret({ quantity: 2 }), ret({ quantity: 1, status: 'approved' })],
      now: NOW,
    }),
    /exceeds purchased quantity/,
  );
});

test('detects financial Return refunds that exceed the Order refund aggregate', () => {
  assert.throws(
    () => buildCustomerOrderView({
      order: order({ refundedMinorUnits: 500, status: 'partially_refunded' }),
      clientUserId: 'client-1',
      returns: [ret({ status: 'refunded', refundedMinorUnits: 1000, refundedAt: '2026-08-22T10:00:00.000Z' })],
      now: NOW,
    }),
    /Return refunds exceed Order refund aggregate/,
  );
});

test('projection is deeply immutable for UI consumers', () => {
  const view = buildCustomerOrderView({ order: order(), clientUserId: 'client-1', now: NOW });
  assert.equal(Object.isFrozen(view), true);
  assert.equal(Object.isFrozen(view.packages), true);
  assert.equal(Object.isFrozen(view.packages[0].items[0]), true);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
