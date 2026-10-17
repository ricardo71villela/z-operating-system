/* Run with: DATABASE_URL=postgres://... node apps/fashion/apps/fashion-partner/tests/subscription-pg.test.js
   Store subscription (task 9) over HTTP in database mode (authentication
   off, local disposable database only) against a local fake of the
   Stripe API: free month as a trial, Stripe Checkout set-up with VAT,
   webhook events read back from Stripe, failed payment, portal,
   cancellation, backoffice list. */

const assert = require('assert');
const http = require('http');

const FAKE_PORT = 4397;
const PORT = 4398;
process.env.FASHION_ALLOW_UNAUTHENTICATED = '1';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_fake123';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake123';
process.env.FASHION_STRIPE_API_BASE = `http://127.0.0.1:${FAKE_PORT}/v1`;
process.env.FASHION_PARTNER_CONSOLE_URL = 'https://partner.zfashion.test/dashboard.html';
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }

const db = require('../src/db');
const { server } = require('../src/server');
const { signWebhookPayload } = require('../src/stripe');
const { freeMonthEnd } = require('../../../packages/fashion-domain/src/subscription');

// --- fake Stripe (Billing)
const RUN = Math.random().toString(36).slice(2, 8);
const fake = { customers: new Map(), subs: new Map(), taxRates: [], sessions: [], portal: [], calls: [] };
const fakeStripe = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const params = Object.fromEntries(new URLSearchParams(body));
    fake.calls.push({ method: req.method, path: url.pathname, params, headers: req.headers });
    const send = (status, json) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(json)); };
    let m;
    if (req.method === 'POST' && url.pathname === '/v1/customers') {
      const id = `cus_fake${RUN}${fake.customers.size + 1}`;
      fake.customers.set(id, { id, object: 'customer', email: params.email, name: params.name, metadata: { partner_id: params['metadata[partner_id]'] } });
      return send(200, fake.customers.get(id));
    }
    if (req.method === 'GET' && url.pathname === '/v1/tax_rates') return send(200, { object: 'list', data: fake.taxRates });
    if (req.method === 'POST' && url.pathname === '/v1/tax_rates') {
      const t = { id: `txr_fake${RUN}${fake.taxRates.length + 1}`, object: 'tax_rate', active: true, inclusive: params.inclusive === 'true', percentage: Number(params.percentage), metadata: { zfashion: params['metadata[zfashion]'] } };
      fake.taxRates.push(t); return send(200, t);
    }
    if (req.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
      const s = { id: `cs_fake${RUN}${fake.sessions.length + 1}`, object: 'checkout.session', url: `https://checkout.stripe.test/${fake.sessions.length + 1}`, params };
      fake.sessions.push(s); return send(200, s);
    }
    if (req.method === 'GET' && (m = url.pathname.match(/^\/v1\/subscriptions\/(sub_\w+)$/))) return send(fake.subs.has(m[1]) ? 200 : 404, fake.subs.get(m[1]) || { error: { code: 'resource_missing' } });
    if (req.method === 'POST' && url.pathname === '/v1/billing_portal/sessions') {
      fake.portal.push(params); return send(200, { object: 'billing_portal.session', url: `https://billing.stripe.test/${params.customer}` });
    }
    return send(404, { error: { code: 'not_found' } });
  });
});

function request(method, path, body, headers = {}, raw = null) {
  return new Promise((resolve, reject) => {
    const data = raw !== null ? raw : body === undefined ? null : JSON.stringify(body);
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

let evtN = 0;
function webhook(type, object) {
  evtN += 1;
  const payload = JSON.stringify({ id: `evt_sub${RUN}${evtN}`, object: 'event', type, data: { object } });
  return request('POST', '/stripe/webhook', undefined, { 'Stripe-Signature': signWebhookPayload(payload, 'whsec_fake123') }, payload);
}

function stripeSub(id, customer, status, extra = {}) {
  const sub = { id, object: 'subscription', customer, status, cancel_at_period_end: false, canceled_at: null, trial_end: null,
    metadata: { partner_id: 'x', platform: 'zfashion' }, items: { object: 'list', data: [{ price: { unit_amount: 4900 }, current_period_end: 1797000000 }] }, ...extra };
  fake.subs.set(id, sub);
  return sub;
}

async function run() {
  const pool = db.createPool();
  await new Promise((r) => fakeStripe.listen(FAKE_PORT, r));
  await new Promise((r) => server.listen(PORT, r));

  // A store selling 2 categories, activated now (the trigger stamps the date).
  const store = await db.insertPartner(pool, { legalName: 'Boutique Abonnement', countryIso: 'FR', locales: ['fr'], categories: ['clothing', 'footwear'], ageSegments: ['adults'], minorSafeDataAcknowledged: false });
  let r = await request('GET', `/partners/${store.id}/subscription`);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.subscription.freeUntil, null, 'no free month before activation');
  for (const s of ['under_review', 'approved']) await db.updatePartnerStatus(pool, store.id, { onboardingStatus: s });
  await db.updatePartnerStatus(pool, store.id, { onboardingStatus: 'active', feedReliabilityTier: 'live' });
  const info = await db.getPartnerBillingInfoPg(pool, store.id);
  assert.ok(info.activatedAt, 'activation date stamped');
  const activatedOnce = info.activatedAt;
  await db.updatePartnerStatus(pool, store.id, { onboardingStatus: 'suspended' });
  await db.updatePartnerStatus(pool, store.id, { onboardingStatus: 'active', feedReliabilityTier: 'live' });
  assert.strictEqual((await db.getPartnerBillingInfoPg(pool, store.id)).activatedAt, activatedOnce, 'reactivation keeps the first date');

  r = await request('GET', `/partners/${store.id}/subscription`);
  const v = r.body.subscription;
  assert.strictEqual(v.state, 'not_set_up');
  assert.strictEqual(v.feeMinorUnits, 4900);
  assert.strictEqual(v.vatMinorUnits, 980);
  assert.strictEqual(v.totalMinorUnits, 5880);
  assert.strictEqual(v.freeUntil, freeMonthEnd(activatedOnce).toISOString());
  assert.strictEqual(v.canSetUp, true);
  assert.strictEqual(v.canManage, false);
  assert.strictEqual((await request('POST', `/partners/${store.id}/subscription/portal`)).status, 409, 'nothing to manage yet');

  // Set-up page: customer, VAT rate (created once), trial to the end of the free month.
  r = await request('POST', `/partners/${store.id}/subscription/checkout`);
  assert.strictEqual(r.status, 200);
  assert.match(r.body.url, /^https:\/\/checkout\.stripe\.test\//);
  const p = fake.sessions.at(-1).params;
  assert.strictEqual(p.mode, 'subscription');
  assert.strictEqual(p['line_items[0][price_data][unit_amount]'], '4900');
  assert.strictEqual(p['line_items[0][price_data][recurring][interval]'], 'month');
  assert.strictEqual(p['line_items[0][price_data][tax_behavior]'], 'exclusive');
  assert.strictEqual(p['line_items[0][price_data][product_data][name]'], 'Abonnement Z Fashion — 2 catégories');
  assert.strictEqual(p['line_items[0][tax_rates][0]'], fake.taxRates[0].id);
  assert.strictEqual(p['subscription_data[trial_end]'], String(Math.floor(freeMonthEnd(activatedOnce).getTime() / 1000)));
  assert.strictEqual(p['subscription_data[metadata][partner_id]'], store.id);
  assert.strictEqual(p['metadata[purpose]'], 'subscription');
  assert.strictEqual(p.success_url, 'https://partner.zfashion.test/dashboard.html?subscription=done#subscription');
  assert.ok(!('payment_method_types[0]' in p), 'payment methods come from the Dashboard (card, SEPA)');
  assert.strictEqual(fake.taxRates.length, 1);
  assert.strictEqual(fake.taxRates[0].percentage, 20);
  const customer = (await db.getSubscriptionPg(pool, store.id)).stripeCustomerId;
  assert.match(customer, /^cus_fake/);
  r = await request('POST', `/partners/${store.id}/subscription/checkout`);
  assert.strictEqual(r.status, 200, 'can reopen the page until it is done');
  assert.strictEqual(fake.taxRates.length, 1, 'VAT rate reused');
  assert.strictEqual(fake.calls.filter((c) => c.path === '/v1/customers').length, 1, 'one Stripe customer per store');

  // The store completes the page: Stripe sends checkout.session.completed.
  const subId = `sub_fake${RUN}1`;
  stripeSub(subId, customer, 'trialing', { trial_end: Math.floor(freeMonthEnd(activatedOnce).getTime() / 1000) });
  r = await webhook('checkout.session.completed', { id: 'cs_x', object: 'checkout.session', customer, subscription: subId, metadata: { platform: 'zfashion', purpose: 'subscription', partner_id: store.id } });
  assert.deepStrictEqual(r.body, { received: true, outcome: 'trial' });
  r = await request('GET', `/partners/${store.id}/subscription`);
  assert.strictEqual(r.body.subscription.state, 'trial');
  assert.strictEqual(r.body.subscription.nextBillingAt, freeMonthEnd(activatedOnce).toISOString());
  assert.strictEqual(r.body.subscription.canSetUp, false);
  assert.strictEqual((await request('POST', `/partners/${store.id}/subscription/checkout`)).status, 409, 'already set up');

  // Portal.
  r = await request('POST', `/partners/${store.id}/subscription/portal`);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(fake.portal.at(-1).customer, customer);
  assert.strictEqual(fake.portal.at(-1).return_url, 'https://partner.zfashion.test/dashboard.html?subscription=portal#subscription');

  // First invoice paid; then a failed payment (state read from Stripe, not from the event).
  stripeSub(subId, customer, 'active');
  r = await webhook('invoice.paid', { id: 'in_1', object: 'invoice', customer, parent: { subscription_details: { subscription: subId } } });
  assert.strictEqual(r.body.outcome, 'active');
  stripeSub(subId, customer, 'past_due');
  r = await webhook('invoice.payment_failed', { id: 'in_2', object: 'invoice', customer, parent: { subscription_details: { subscription: subId } } });
  assert.strictEqual(r.body.outcome, 'past_due');
  const since = (await db.getSubscriptionPg(pool, store.id)).pastDueSince;
  assert.ok(since);
  await webhook('customer.subscription.updated', fake.subs.get(subId));
  assert.strictEqual((await db.getSubscriptionPg(pool, store.id)).pastDueSince, since, 'first failure date kept');
  stripeSub(subId, customer, 'active');
  await webhook('invoice.paid', { id: 'in_3', object: 'invoice', customer, subscription: subId });
  assert.strictEqual((await db.getSubscriptionPg(pool, store.id)).pastDueSince, null, 'cleared once paid');

  // Backoffice list.
  r = await request('GET', '/admin/subscriptions');
  assert.strictEqual(r.status, 200);
  const row = r.body.stores.find((s) => s.partnerId === store.id);
  assert.strictEqual(row.state, 'active');
  assert.strictEqual(row.feeMinorUnits, 4900);
  assert.ok(r.body.counts.active >= 1);

  // Cancellation at period end, then canceled; the store can set it up again.
  stripeSub(subId, customer, 'active', { cancel_at_period_end: true });
  await webhook('customer.subscription.updated', fake.subs.get(subId));
  assert.strictEqual((await request('GET', `/partners/${store.id}/subscription`)).body.subscription.cancelAtPeriodEnd, true);
  stripeSub(subId, customer, 'canceled', { canceled_at: 1797000000 });
  r = await webhook('customer.subscription.deleted', fake.subs.get(subId));
  assert.strictEqual(r.body.outcome, 'canceled');
  r = await request('GET', `/partners/${store.id}/subscription`);
  assert.strictEqual(r.body.subscription.canSetUp, true);
  r = await request('POST', `/partners/${store.id}/subscription/checkout`);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(fake.calls.filter((c) => c.path === '/v1/customers').length, 1, 'same customer reused');

  // Events that are not ours are ignored.
  r = await webhook('invoice.paid', { id: 'in_9', object: 'invoice', customer: 'cus_someoneelse', parent: { subscription_details: { subscription: 'sub_other' } } });
  assert.strictEqual(r.body.outcome, 'unknown_customer');
  r = await webhook('checkout.session.completed', { id: 'cs_y', object: 'checkout.session', customer, subscription: subId, metadata: {} });
  assert.strictEqual(r.body.outcome, 'ignored');

  // A store that is not approved cannot subscribe.
  const pending = await db.insertPartner(pool, { legalName: 'Pas encore', countryIso: 'FR', locales: ['fr'], categories: ['clothing'], ageSegments: ['adults'], minorSafeDataAcknowledged: false });
  assert.strictEqual((await request('POST', `/partners/${pending.id}/subscription/checkout`)).status, 409);

  // Not readable by API roles.
  const g = (await pool.query(`select has_table_privilege('authenticated', 'fashion.partner_subscriptions', 'select') as a, has_table_privilege('anon', 'fashion.partner_subscriptions', 'select') as b`)).rows[0];
  assert.deepStrictEqual(g, { a: false, b: false });

  server.close(); fakeStripe.close(); await pool.end();
  console.log('subscriptions (Postgres + fake Stripe): all checks passed.');
}

run().catch((err) => { console.error(err); server.close(); fakeStripe.close(); process.exit(1); });
