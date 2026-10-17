/* Run with: node apps/fashion/apps/fashion-partner/tests/payment-api.test.js
   Payment over HTTP (in-memory mode) against a local fake of the
   Stripe API: PaymentIntent per Order, signed webhook, forward-only
   statuses, duplicate events, late payment refunded, store sales. */

const assert = require('assert');
const http = require('http');

const WEBHOOK_SECRET = 'whsec_testsecret123';
const FAKE_PORT = 4197;
const PORT = 4198;
process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_fake123';
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.FASHION_STRIPE_API_BASE = `http://127.0.0.1:${FAKE_PORT}/v1`;

const { server } = require('../src/server');
const { signWebhookPayload, verifyWebhook } = require('../src/stripe');

// --- fake Stripe
const fake = { intents: new Map(), byKey: new Map(), refunds: [], failRefunds: false, calls: [] };
const fakeStripe = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const params = Object.fromEntries(new URLSearchParams(body));
    fake.calls.push({ method: req.method, url: req.url, params, headers: req.headers });
    const send = (status, json) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(json)); };
    if (req.headers.authorization !== 'Bearer sk_test_fake123') return send(401, { error: { type: 'invalid_request_error' } });
    if (req.method === 'POST' && req.url === '/v1/payment_intents') {
      const key = req.headers['idempotency-key'];
      if (fake.byKey.has(key)) return send(200, fake.intents.get(fake.byKey.get(key)));
      const id = `pi_fake${fake.intents.size + 1}`;
      const intent = { id, object: 'payment_intent', amount: Number(params.amount), currency: params.currency, status: 'requires_payment_method',
        client_secret: `${id}_secret_abc`, metadata: { order_id: params['metadata[order_id]'], client_user_id: params['metadata[client_user_id]'], platform: params['metadata[platform]'] } };
      fake.intents.set(id, intent); fake.byKey.set(key, id);
      return send(200, intent);
    }
    const m = req.url.match(/^\/v1\/payment_intents\/([^/]+)$/);
    if (req.method === 'GET' && m) return fake.intents.has(m[1]) ? send(200, fake.intents.get(m[1])) : send(404, { error: { code: 'resource_missing' } });
    if (req.method === 'POST' && req.url === '/v1/refunds') {
      if (fake.failRefunds) return send(500, { error: { type: 'api_error' } });
      fake.refunds.push(params.payment_intent);
      return send(200, { id: `re_${fake.refunds.length}`, payment_intent: params.payment_intent, status: 'succeeded' });
    }
    return send(404, { error: { code: 'not_found' } });
  });
});

// Products start pending moderation (task 8); these tests approve each
// new product as an admin unless they are testing moderation itself.
let autoApprove = true;
async function request(method, path, body, ...rest) {
  const r = await rawRequest(method, path, body, ...rest);
  if (autoApprove && method === 'POST' && /^\/partners\/[^/]+\/products$/.test(path) && r.status === 201) {
    const a = await rawRequest('POST', `/admin/products/${r.body.product.id}/moderation`, { toStatus: 'approved' });
    if (a.status !== 200) throw new Error('auto-approve failed ' + JSON.stringify(a.body));
    r.body.product = a.body.product;
  }
  return r;
}

function rawRequest(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const req = http.request({ hostname: '127.0.0.1', port: PORT, path, method, headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: chunks ? JSON.parse(chunks) : null }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

let eventSeq = 0;
function webhook(type, intent, { secret = WEBHOOK_SECRET, id } = {}) {
  eventSeq += 1;
  const payload = JSON.stringify({ id: id || `evt_test${eventSeq}`, object: 'event', type, data: { object: intent } });
  return request('POST', '/stripe/webhook', payload, { 'Stripe-Signature': signWebhookPayload(payload, secret) });
}

async function setupOrder(client, price, qty = 1) {
  const r = await request('POST', '/partners/pay_store/products', {
    brandId: setupOrder.brandId, names: { fr: `Article ${price}` }, gender: 'female', categories: ['clothing'],
    size: { system: 'alpha', value: 'M' }, priceMinorUnits: price,
  });
  const productId = r.body.product.id;
  await request('POST', `/partners/pay_store/stock/${productId}`, { quantityAvailable: 2, observedAt: '2026-10-01T00:00:00.000Z' });
  await request('PUT', `/clients/${client}/cart/items/${productId}`, { quantity: qty });
  const a = await request('POST', `/clients/${client}/addresses`, { type: 'shipping', line1: '1 rue', postalCode: '75001', city: 'Paris', countryIso: 'FR' });
  const o = await request('POST', `/clients/${client}/checkout`, { addressId: a.body.address.id });
  assert.strictEqual(o.status, 201, JSON.stringify(o.body));
  return { order: o.body.order, productId };
}

async function run() {
  // Signature checks (unit).
  const payload = '{"id":"evt_1","type":"x"}';
  const now = Date.now();
  assert.strictEqual(verifyWebhook(Buffer.from(payload), signWebhookPayload(payload, WEBHOOK_SECRET, Math.floor(now / 1000)), WEBHOOK_SECRET, now).id, 'evt_1');
  assert.throws(() => verifyWebhook(Buffer.from(payload), signWebhookPayload(payload, 'whsec_other', Math.floor(now / 1000)), WEBHOOK_SECRET, now), /webhook_signature_invalid/);
  assert.throws(() => verifyWebhook(Buffer.from(payload + ' '), signWebhookPayload(payload, WEBHOOK_SECRET, Math.floor(now / 1000)), WEBHOOK_SECRET, now), /webhook_signature_invalid/, 'body changed');
  assert.throws(() => verifyWebhook(Buffer.from(payload), signWebhookPayload(payload, WEBHOOK_SECRET, Math.floor(now / 1000) - 400), WEBHOOK_SECRET, now), /outside_tolerance/);
  assert.throws(() => verifyWebhook(Buffer.from(payload), '', WEBHOOK_SECRET, now), /webhook_signature_invalid/);

  await new Promise((r) => fakeStripe.listen(FAKE_PORT, r));
  await new Promise((r) => server.listen(PORT, r));

  await request('POST', '/partners', { id: 'pay_store', legalName: 'Boutique Paiement', countryIso: 'FR', locales: ['fr'], categories: ['clothing'] });
  for (const toStatus of ['under_review', 'approved']) await request('POST', '/partners/pay_store/transition', { toStatus });
  await request('POST', '/partners/pay_store/transition', { toStatus: 'active', feedReliabilityTier: 'live' });
  setupOrder.brandId = (await request('POST', '/partners/pay_store/brands', { name: 'Marque Paiement' })).body.brand.id;

  // --- 1. Pay an order
  const { order, productId } = await setupOrder('client_pay', 12000);
  let res = await request('POST', `/clients/client_pay/orders/${order.id}/payment`);
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  const pay = res.body.payment;
  assert.strictEqual(pay.publishableKey, 'pk_test_fake123');
  assert.strictEqual(pay.amountMinorUnits, 12000);
  assert.strictEqual(pay.livemode, false);
  assert.match(pay.clientSecret, /^pi_fake1_secret/);
  const createCall = fake.calls.find((c) => c.url === '/v1/payment_intents');
  assert.strictEqual(createCall.params.amount, '12000');
  assert.strictEqual(createCall.params['metadata[order_id]'], order.id);
  assert.strictEqual(createCall.params.transfer_group, `order_${order.id}`);
  assert.strictEqual(createCall.headers['idempotency-key'], `zfashion-order-${order.id}`);
  assert.strictEqual(createCall.headers['stripe-version'], '2026-07-29.dahlia');

  // Opening the form again reuses the same PaymentIntent.
  res = await request('POST', `/clients/client_pay/orders/${order.id}/payment`);
  assert.strictEqual(res.body.payment.clientSecret, pay.clientSecret);
  assert.strictEqual(fake.intents.size, 1);
  // Not someone else's order.
  res = await request('POST', `/clients/intruder/orders/${order.id}/payment`);
  assert.strictEqual(res.status, 404);

  // Unsigned / badly signed webhooks are refused.
  const intent = fake.intents.get('pi_fake1');
  res = await webhook('payment_intent.succeeded', { ...intent, status: 'succeeded', amount_received: 12000 }, { secret: 'whsec_wrong' });
  assert.strictEqual(res.status, 400);
  res = await request('POST', '/stripe/webhook', '{"id":"evt_x"}');
  assert.strictEqual(res.status, 400);
  res = await request('GET', `/clients/client_pay/orders/${order.id}`);
  assert.strictEqual(res.body.order.status, 'pending_payment', 'nothing changed');

  // A declined card, then a retry that succeeds.
  res = await webhook('payment_intent.payment_failed', { ...intent, status: 'requires_payment_method' });
  assert.strictEqual(res.body.outcome, 'failed');
  res = await request('GET', `/clients/client_pay/orders/${order.id}`);
  assert.strictEqual(res.body.order.paymentStatus, 'failed');
  res = await request('POST', `/clients/client_pay/orders/${order.id}/payment`);
  assert.strictEqual(res.status, 200, 'retry allowed');
  res = await request('GET', `/clients/client_pay/orders/${order.id}`);
  assert.strictEqual(res.body.order.paymentStatus, 'requires_payment_method');

  const succeeded = { ...intent, status: 'succeeded', amount_received: 12000 };
  res = await webhook('payment_intent.succeeded', succeeded, { id: 'evt_paid1' });
  assert.deepStrictEqual(res.body, { received: true, outcome: 'confirmed' });
  res = await request('GET', `/clients/client_pay/orders/${order.id}`);
  assert.strictEqual(res.body.order.status, 'paid');
  assert.strictEqual(res.body.order.paymentStatus, 'succeeded');
  assert.strictEqual(res.body.order.stores[0].shipmentStatus, 'confirmed');
  res = await request('GET', `/partners/pay_store/stock/${productId}`);
  assert.strictEqual(res.body.stock.quantityAvailable, 1, 'sale committed');
  assert.strictEqual(res.body.stock.quantityReserved, 0);

  // Same event again, and a late "processing": nothing changes.
  res = await webhook('payment_intent.succeeded', succeeded, { id: 'evt_paid1' });
  assert.strictEqual(res.body.outcome, 'duplicate');
  res = await webhook('payment_intent.processing', { ...intent, status: 'processing' });
  assert.strictEqual(res.body.outcome, 'ignored');
  res = await request('POST', `/clients/client_pay/orders/${order.id}/payment`);
  assert.strictEqual(res.status, 409, 'a paid order cannot be paid again');

  // The paid order closed the cart; the store sees the sale.
  res = await request('GET', '/clients/client_pay/cart');
  assert.deepStrictEqual(res.body.cart.lines, []);
  res = await request('GET', '/partners/pay_store/orders');
  assert.strictEqual(res.body.total, 1);
  assert.strictEqual(res.body.orders[0].ticket.commissionMinorUnits, 960, '12000 is in the 8 % tier');
  res = await request('GET', '/partners/pay_store/commission');
  assert.strictEqual(res.body.monthlyGmvMinorUnits, 12000);
  assert.strictEqual(res.body.monthlyCommissionMinorUnits, 960);

  // --- 2. Payment for an order that was cancelled meanwhile: refunded.
  const second = await setupOrder('client_late', 5000);
  res = await request('POST', `/clients/client_late/orders/${second.order.id}/payment`);
  const lateIntent = fake.intents.get(res.body.payment.clientSecret.split('_secret')[0]);
  res = await request('POST', `/clients/client_late/orders/${second.order.id}/cancel`);
  assert.strictEqual(res.body.order.status, 'cancelled');

  fake.failRefunds = true;
  res = await webhook('payment_intent.succeeded', { ...lateIntent, status: 'succeeded', amount_received: 5000 }, { id: 'evt_late' });
  assert.strictEqual(res.status, 500, 'refund refused by Stripe: nothing recorded, Stripe retries');
  res = await request('GET', `/clients/client_late/orders/${second.order.id}`);
  assert.strictEqual(res.body.order.paymentStatus, 'requires_payment_method');

  fake.failRefunds = false;
  res = await webhook('payment_intent.succeeded', { ...lateIntent, status: 'succeeded', amount_received: 5000 }, { id: 'evt_late' });
  assert.deepStrictEqual(res.body, { received: true, outcome: 'late_payment' });
  assert.deepStrictEqual(fake.refunds, [lateIntent.id]);
  res = await request('GET', `/clients/client_late/orders/${second.order.id}`);
  assert.strictEqual(res.body.order.status, 'cancelled');
  assert.strictEqual(res.body.order.paymentStatus, 'refunded');

  // --- 3. Wrong amount: refunded, order released.
  const third = await setupOrder('client_amount', 3000);
  res = await request('POST', `/clients/client_amount/orders/${third.order.id}/payment`);
  const amountIntent = fake.intents.get(res.body.payment.clientSecret.split('_secret')[0]);
  res = await webhook('payment_intent.succeeded', { ...amountIntent, status: 'succeeded', amount_received: 2999 });
  assert.strictEqual(res.body.outcome, 'amount_mismatch');
  res = await request('GET', `/clients/client_amount/orders/${third.order.id}`);
  assert.strictEqual(res.body.order.status, 'cancelled');
  res = await request('GET', `/partners/pay_store/stock/${third.productId}`);
  assert.strictEqual(res.body.stock.quantityReserved, 0, 'stock released');

  // --- 4. Events of other platforms / unknown intents.
  res = await webhook('payment_intent.succeeded', { id: 'pi_other', object: 'payment_intent', status: 'succeeded', amount_received: 1, metadata: {} });
  assert.strictEqual(res.body.outcome, 'ignored');
  res = await webhook('customer.created', { id: 'cus_1', object: 'customer' });
  assert.strictEqual(res.body.outcome, 'ignored');
  res = await webhook('payment_intent.succeeded', { id: 'pi_ghost', object: 'payment_intent', status: 'succeeded', amount_received: 1, metadata: { platform: 'zfashion', order_id: 'nope' } });
  assert.strictEqual(res.body.outcome, 'unknown_payment_intent');

  server.close();
  fakeStripe.close();
  console.log('fashion-partner payment API: all checks passed.');
}

run().catch((err) => { console.error(err); server.close(); fakeStripe.close(); process.exit(1); });
