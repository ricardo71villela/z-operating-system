'use strict';

const assert = require('assert');
const http = require('http');
const { createCustomerCommerceServer, HttpError } = require('../src/customer-commerce');

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const CLIENT_B = '22222222-2222-4222-8222-222222222222';
const CART_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const ORDER_ID = '55555555-5555-4555-8555-555555555555';

function makeRepository() {
  const calls = [];
  const orders = new Map([
    [ORDER_ID, {
      id: ORDER_ID,
      clientUserId: CLIENT_A,
      status: 'pending_payment',
      totalMinorUnits: 12900,
      refundedMinorUnits: 0,
      packages: [],
    }],
  ]);
  return {
    calls,
    async createCart(clientUserId) {
      calls.push(['createCart', clientUserId]);
      return { id: CART_ID, clientUserId };
    },
    async addCartItem(clientUserId, cartId, body) {
      calls.push(['addCartItem', clientUserId, cartId, body]);
      return { id: '66666666-6666-4666-8666-666666666666', cartId, productId: body.productId, quantity: body.quantity, unitPriceMinorUnits: 12900 };
    },
    async checkoutPreflight(clientUserId, cartId) {
      calls.push(['checkoutPreflight', clientUserId, cartId]);
      return {
        cartId,
        totalMinorUnits: 12900,
        ready: true,
        blockers: [],
        items: [{ productId: PRODUCT_ID, quantity: 1, unitPriceMinorUnits: 12900, currentPriceMinorUnits: 12900, sellableQuantity: 3, priceMatches: true, stockSufficient: true }],
      };
    },
    async attemptCheckout(clientUserId, cartId) {
      calls.push(['attemptCheckout', clientUserId, cartId]);
      return orders.get(ORDER_ID);
    },
    async listOrders(clientUserId) {
      calls.push(['listOrders', clientUserId]);
      return [...orders.values()].filter((order) => order.clientUserId === clientUserId);
    },
    async getOrder(clientUserId, orderId) {
      calls.push(['getOrder', clientUserId, orderId]);
      const order = orders.get(orderId);
      if (!order || order.clientUserId !== clientUserId) throw new HttpError(404, 'order_not_found', 'Order was not found for the authenticated Client');
      return order;
    },
  };
}

function authenticateClient(req) {
  const clientUserId = req.headers['x-test-client'];
  if (!clientUserId) throw new HttpError(401, 'authentication_required', 'test authentication required');
  return { clientUserId };
}

async function withServer(server, fn) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    await fn(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function request(port, method, path, { clientUserId, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json' };
    if (clientUserId) headers['x-test-client'] = clientUserId;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    const req = http.request({ hostname: '127.0.0.1', port, method, path, headers }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  const repository = makeRepository();

  // Default product boundary: reads can be authenticated, but all customer
  // commerce writes remain fail-closed until explicitly enabled.
  await withServer(createCustomerCommerceServer({ repository, authenticateClient, writesEnabled: () => false }), async (port) => {
    let res = await request(port, 'GET', '/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.writesEnabled, false);

    res = await request(port, 'GET', '/me/orders');
    assert.strictEqual(res.status, 401);

    res = await request(port, 'GET', '/me/orders', { clientUserId: CLIENT_A });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.orders.length, 1);

    res = await request(port, 'POST', '/me/cart', { clientUserId: CLIENT_A });
    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.body.error, 'commerce_writes_disabled');

    // There is deliberately no client id in the URL. Another Client cannot
    // select CLIENT_A by path/body and read its Order.
    res = await request(port, 'GET', `/me/orders/${ORDER_ID}`, { clientUserId: CLIENT_B });
    assert.strictEqual(res.status, 404);
  });

  // Controlled activation exercises the future runtime contract without
  // changing the default. Product/Partner/price authority is derived by the
  // repository; the browser sends only productId + quantity.
  await withServer(createCustomerCommerceServer({ repository, authenticateClient, writesEnabled: () => true }), async (port) => {
    let res = await request(port, 'POST', '/me/cart', { clientUserId: CLIENT_A, body: { clientUserId: CLIENT_B } });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.cart.clientUserId, CLIENT_A);

    res = await request(port, 'POST', `/me/cart/${CART_ID}/items`, {
      clientUserId: CLIENT_A,
      body: { productId: PRODUCT_ID, quantity: 1, partnerId: 'attacker_partner', unitPriceMinorUnits: 1 },
    });
    assert.strictEqual(res.status, 201);
    const addCall = repository.calls.find((entry) => entry[0] === 'addCartItem');
    assert.strictEqual(addCall[1], CLIENT_A);
    assert.deepStrictEqual(addCall[3], { productId: PRODUCT_ID, quantity: 1, partnerId: 'attacker_partner', unitPriceMinorUnits: 1 });

    res = await request(port, 'GET', `/me/cart/${CART_ID}/checkout-preflight`, { clientUserId: CLIENT_A });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.preflight.ready, true);

    res = await request(port, 'POST', `/me/cart/${CART_ID}/checkout`, { clientUserId: CLIENT_A });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.order.id, ORDER_ID);
    assert.strictEqual(res.body.order.status, 'pending_payment');

    // Checkout creates only a pending-payment Order. Payment is deliberately
    // absent from this HTTP authority; a guessed pay endpoint is a hard 404.
    res = await request(port, 'POST', `/me/orders/${ORDER_ID}/pay`, { clientUserId: CLIENT_A });
    assert.strictEqual(res.status, 404);
  });

  console.log('Z Fashion customer commerce HTTP authority: PASS');
}

run().catch((err) => { console.error(err); process.exit(1); });
