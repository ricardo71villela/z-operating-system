/* Run with: DATABASE_URL=postgres://... node apps/fashion/apps/fashion-partner/tests/payouts-pg.test.js
   Store payouts over HTTP in database mode (authentication off, local
   disposable database only) against a local fake of the Stripe API:
   Connect onboarding, payout states, weekly run, never paying twice,
   failed transfers retried, open returns blocking, scheduler secret. */

const assert = require('assert');
const http = require('http');

const FAKE_PORT = 4297;
const PORT = 4298;
const CRON_SECRET = 'cron-secret-0123456789abcdef0123456789';
process.env.FASHION_ALLOW_UNAUTHENTICATED = '1';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_fake123';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake123';
process.env.FASHION_STRIPE_API_BASE = `http://127.0.0.1:${FAKE_PORT}/v1`;
process.env.FASHION_PARTNER_CONSOLE_URL = 'https://partner.zfashion.test/dashboard.html';
process.env.FASHION_CRON_SECRET = CRON_SECRET;
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }

const db = require('../src/db');
const { server } = require('../src/server');
const { payoutAmounts } = require('../../../packages/fashion-domain/src/payouts');

// --- fake Stripe (Connect)
const ACCT = `acct_fake${Math.random().toString(36).slice(2, 8)}`;
const fake = { accounts: new Map(), transfers: [], failTransfers: false, calls: [] };
const fakeStripe = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const params = Object.fromEntries(new URLSearchParams(body));
    fake.calls.push({ method: req.method, path: url.pathname, params, headers: req.headers });
    const send = (status, json) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(json)); };
    let m;
    if (req.method === 'POST' && url.pathname === '/v1/accounts') {
      const id = `${ACCT}${fake.accounts.size + 1}`;
      const acct = { id, object: 'account', details_submitted: false, payouts_enabled: false, capabilities: { transfers: 'inactive' },
        requirements: { currently_due: ['external_account', 'individual.id_number'] }, metadata: { partner_id: params['metadata[partner_id]'] } };
      fake.accounts.set(id, acct);
      return send(200, acct);
    }
    if (req.method === 'GET' && (m = url.pathname.match(/^\/v1\/accounts\/(acct_\w+)$/))) return send(200, fake.accounts.get(m[1]));
    if (req.method === 'POST' && url.pathname === '/v1/account_links') return send(200, { object: 'account_link', url: `https://connect.stripe.test/setup/${params.account}` });
    if (req.method === 'POST' && (m = url.pathname.match(/^\/v1\/accounts\/(acct_\w+)\/login_links$/))) return send(200, { object: 'login_link', url: `https://connect.stripe.test/express/${m[1]}` });
    if (req.method === 'GET' && (m = url.pathname.match(/^\/v1\/payment_intents\/(pi_\w+)$/))) return send(200, { id: m[1], object: 'payment_intent', latest_charge: `ch_${m[1].slice(3)}` });
    if (req.method === 'GET' && url.pathname === '/v1/transfers') {
      const data = fake.transfers.filter((t) => t.transfer_group === url.searchParams.get('transfer_group') && t.destination === url.searchParams.get('destination'));
      return send(200, { object: 'list', data });
    }
    if (req.method === 'POST' && url.pathname === '/v1/transfers') {
      if (fake.failTransfers) return send(400, { error: { type: 'invalid_request_error', code: 'balance_insufficient' } });
      const tr = { id: `tr_fake${ACCT.slice(9)}${fake.transfers.length + 1}`, object: 'transfer', amount: Number(params.amount), destination: params.destination,
        transfer_group: params.transfer_group, source_transaction: params.source_transaction, reversed: false,
        metadata: { order_id: params['metadata[order_id]'], partner_id: params['metadata[partner_id]'] } };
      fake.transfers.push(tr);
      return send(200, tr);
    }
    return send(404, { error: { code: 'not_found' } });
  });
});

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
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

async function run() {
  const pool = db.createPool();
  await new Promise((r) => fakeStripe.listen(FAKE_PORT, r));
  await new Promise((r) => server.listen(PORT, r));

  const store = await db.insertPartner(pool, { legalName: 'Boutique Versements', countryIso: 'FR', locales: ['fr'], categories: ['clothing'], ageSegments: ['adults'], minorSafeDataAcknowledged: false });
  for (const s of ['under_review', 'approved']) await db.updatePartnerStatus(pool, store.id, { onboardingStatus: s });
  await db.updatePartnerStatus(pool, store.id, { onboardingStatus: 'active', feedReliabilityTier: 'live' });
  const brand = await db.insertBrand(pool, { name: 'Marque V', houseLabelOfPartnerId: store.id });
  let n = 0;
  const runId = Math.random().toString(36).slice(2, 8);

  async function paidOrder(price) {
    n += 1;
    const p = await db.insertProduct(pool, { partnerId: store.id, brandId: brand.id, names: { fr: `Article ${n}` }, categories: ['clothing'], gender: 'female', ageSegments: ['adults'], size: { system: 'alpha', value: 'M' } });
    await db.setProductModerationPg(pool, p.id, 'pending', { moderationStatus: 'approved', moderatedAt: new Date().toISOString() });
    await db.recordPricePg(pool, p.id, price, '2026-10-01T00:00:00Z');
    await db.applyStockUpdatePg(pool, p.id, 5, '2026-10-01T00:00:00Z');
    const u = (await pool.query(`insert into auth.users (email) values ('payout' || gen_random_uuid() || '@x.fr') returning id`)).rows[0].id;
    const a = await db.insertClientAddressPg(pool, { clientUserId: u, type: 'shipping', line1: '1 rue', postalCode: '75001', city: 'Paris', countryIso: 'FR' });
    await db.setCartItemPg(pool, u, p.id, 1);
    const orderId = await db.checkoutCartPg(pool, u, { addressId: a.id, allowedCountries: ['FR'], holdSeconds: 1800 });
    const pi = `pi_payout${runId}${n}`;
    await db.attachPaymentIntentPg(pool, orderId, pi);
    const outcome = await db.recordStripePaymentEventPg(pool, { eventId: `evt_payout${runId}${n}`, eventType: 'payment_intent.succeeded', paymentIntentId: pi, orderId, status: 'succeeded', amountReceivedMinorUnits: price }, { onRefund: async () => {} });
    assert.strictEqual(outcome, 'confirmed');
    const shipmentId = (await pool.query('select id from fashion.shipments where order_id = $1', [orderId])).rows[0].id;
    return { orderId, productId: p.id, shipmentId, pi };
  }
  async function deliver(o, daysAgo) {
    for (const s of ['preparing', 'shipped', 'delivered']) await db.updateShipmentStatus(pool, o.shipmentId, s);
    await pool.query(`update fashion.shipments set delivered_at = now() - make_interval(days => $2) where id = $1`, [o.shipmentId, daysAgo]);
  }
  const lineOf = (body, orderId) => body.lines.find((l) => l.orderId === orderId);
  // Re-runnable on a database that already holds earlier runs: other stores' due tickets are
  // left waiting (their accounts are switched off) and subtracted from the run counters.
  await pool.query('update fashion.partner_payout_accounts set transfers_active = false where partner_id <> $1', [store.id]);
  const othersDue = (await db.listPayoutLinesPg(pool)).filter((l) => l.state === 'due' && l.partnerId !== store.id).length;
  const mine = (r) => ({ ...r, due: r.due - othersDue, waitingForAccount: r.waitingForAccount - othersDue });

  // --- states
  const o1 = await paidOrder(15500);
  let res = await request('GET', `/partners/${store.id}/payouts`);
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  assert.deepStrictEqual(res.body.account, { connected: false, ready: false, detailsSubmitted: false, payoutsEnabled: false, requirementsDue: [] });
  assert.strictEqual(lineOf(res.body, o1.orderId).state, 'awaiting_delivery');

  await deliver(o1, 3);
  res = await request('GET', `/partners/${store.id}/payouts`);
  let l1 = lineOf(res.body, o1.orderId);
  assert.strictEqual(l1.state, 'return_window');
  const expected = payoutAmounts(15500);
  assert.strictEqual(l1.netMinorUnits, expected.netMinorUnits, 'SQL and payouts.js agree');
  assert.strictEqual(l1.commissionMinorUnits, expected.commissionMinorUnits);
  assert.ok(l1.expectedPayoutDate && new Date(l1.expectedPayoutDate).getUTCDay() === 1, 'paid on a Monday');
  assert.strictEqual(res.body.totals.upcomingMinorUnits, expected.netMinorUnits);

  await pool.query(`update fashion.shipments set delivered_at = now() - interval '15 days' where id = $1`, [o1.shipmentId]);
  res = await request('GET', `/partners/${store.id}/payouts`);
  assert.strictEqual(lineOf(res.body, o1.orderId).state, 'due');
  assert.strictEqual(res.body.totals.dueMinorUnits, expected.netMinorUnits);

  // A return still open blocks the payout.
  const o2 = await paidOrder(4000);
  await deliver(o2, 1);
  await db.insertReturn(pool, { orderId: o2.orderId, partnerId: store.id, productId: o2.productId, reason: 'taille', sealBroken: false });
  await pool.query(`update fashion.shipments set delivered_at = now() - interval '20 days' where id = $1`, [o2.shipmentId]);
  res = await request('GET', `/partners/${store.id}/payouts`);
  assert.strictEqual(lineOf(res.body, o2.orderId).state, 'return_in_progress');

  // --- no account yet: nothing is sent
  res = await request('POST', '/admin/payouts/run');
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  assert.strictEqual(mine(res.body.result).due, 1);
  assert.strictEqual(mine(res.body.result).waitingForAccount, 1);
  assert.strictEqual(fake.transfers.length, 0);

  // --- onboarding
  res = await request('POST', `/partners/${store.id}/payouts/dashboard`);
  assert.strictEqual(res.status, 409, 'no Express dashboard before onboarding');
  res = await request('POST', `/partners/${store.id}/payouts/onboarding`);
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  assert.strictEqual(res.body.url, `https://connect.stripe.test/setup/${ACCT}1`);
  const createCall = fake.calls.find((c) => c.path === '/v1/accounts');
  assert.strictEqual(createCall.params['controller[stripe_dashboard][type]'], 'express');
  assert.strictEqual(createCall.params['controller[fees][payer]'], 'application');
  assert.strictEqual(createCall.params['capabilities[transfers][requested]'], 'true');
  assert.strictEqual(createCall.headers['idempotency-key'], `zfashion-account-${store.id}`);
  const linkCall = fake.calls.find((c) => c.path === '/v1/account_links');
  assert.strictEqual(linkCall.params.return_url, 'https://partner.zfashion.test/dashboard.html?payouts=return#payouts');
  res = await request('POST', `/partners/${store.id}/payouts/onboarding`);
  assert.strictEqual(fake.accounts.size, 1, 'one account per store');

  res = await request('GET', `/partners/${store.id}/payouts`);
  assert.deepStrictEqual(res.body.account.requirementsDue, ['external_account', 'individual.id_number']);
  assert.strictEqual(res.body.account.ready, false);

  // Store finishes Stripe onboarding.
  Object.assign(fake.accounts.get(`${ACCT}1`), { details_submitted: true, payouts_enabled: true, capabilities: { transfers: 'active' }, requirements: { currently_due: [] } });
  res = await request('GET', `/partners/${store.id}/payouts`);
  assert.strictEqual(res.body.account.ready, true);
  res = await request('POST', `/partners/${store.id}/payouts/dashboard`);
  assert.strictEqual(res.body.url, `https://connect.stripe.test/express/${ACCT}1`);

  // --- weekly run pays the closed sale, funded by its own charge
  res = await request('POST', '/admin/payouts/run');
  assert.deepStrictEqual(mine(res.body.result), { due: 1, transferred: 1, transferredMinorUnits: expected.netMinorUnits, waitingForAccount: 0, failed: 0, skipped: 0 });
  assert.strictEqual(fake.transfers.length, 1);
  assert.deepStrictEqual(
    { amount: fake.transfers[0].amount, destination: fake.transfers[0].destination, group: fake.transfers[0].transfer_group, source: fake.transfers[0].source_transaction },
    { amount: expected.netMinorUnits, destination: `${ACCT}1`, group: `order_${o1.orderId}`, source: `ch_payout${runId}1` }
  );
  res = await request('GET', `/partners/${store.id}/payouts`);
  l1 = lineOf(res.body, o1.orderId);
  assert.strictEqual(l1.state, 'transferred');
  assert.match(l1.stripeTransferId, /^tr_fake/);
  assert.strictEqual(res.body.totals.transferredMinorUnits, expected.netMinorUnits);

  res = await request('POST', '/admin/payouts/run');
  assert.strictEqual(mine(res.body.result).due, 0, 'never twice');
  assert.strictEqual(fake.transfers.length, 1);

  // --- a refused transfer is retried at the next run
  const o3 = await paidOrder(30000);
  await deliver(o3, 16);
  fake.failTransfers = true;
  res = await request('POST', '/admin/payouts/run');
  assert.strictEqual(res.body.result.failed, 1);
  assert.strictEqual((await pool.query('select status, failure from fashion.partner_transfers where order_id = $1', [o3.orderId])).rows[0].status, 'failed');
  fake.failTransfers = false;
  res = await request('POST', '/admin/payouts/run');
  assert.strictEqual(res.body.result.transferred, 1);
  assert.strictEqual(fake.transfers[1].amount, payoutAmounts(30000).netMinorUnits, '6 % tier');

  // --- crash after Stripe accepted the transfer: the next run records it, does not pay again
  const o4 = await paidOrder(2000);
  await deliver(o4, 16);
  const claim = await db.claimPartnerTransferPg(pool, o4.orderId, store.id);
  assert.ok(claim && claim.attempt === 1, JSON.stringify(claim));
  assert.strictEqual(await db.claimPartnerTransferPg(pool, o4.orderId, store.id), null, 'claimed: not claimable again');
  fake.transfers.push({ id: `tr_crash${ACCT.slice(9)}`, amount: claim.netMinorUnits, destination: `${ACCT}1`, transfer_group: `order_${o4.orderId}`, reversed: false, metadata: { partner_id: store.id } });
  await pool.query(`update fashion.partner_transfers set updated_at = now() - interval '2 hours' where order_id = $1`, [o4.orderId]);
  const before = fake.transfers.length;
  res = await request('POST', '/admin/payouts/run');
  assert.strictEqual(res.body.result.transferred, 1);
  assert.strictEqual(fake.transfers.length, before, 'no second transfer');
  assert.strictEqual((await pool.query('select stripe_transfer_id from fashion.partner_transfers where order_id = $1', [o4.orderId])).rows[0].stripe_transfer_id, `tr_crash${ACCT.slice(9)}`);

  // --- scheduler secret
  res = await request('POST', '/internal/payouts/run');
  assert.strictEqual(res.status, 401);
  res = await request('POST', '/internal/payouts/run', undefined, { Authorization: 'Bearer wrong' });
  assert.strictEqual(res.status, 401);
  res = await request('POST', '/internal/payouts/run', undefined, { Authorization: `Bearer ${CRON_SECRET}` });
  assert.strictEqual(res.status, 200);

  // --- admin overview
  res = await request('GET', '/admin/payouts');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.accounts.some((a) => a.partnerId === store.id && a.ready && a.storeName === 'Boutique Versements'));
  assert.ok(res.body.lines.some((l) => l.orderId === o2.orderId && l.state === 'return_in_progress'));

  server.close(); fakeStripe.close(); await pool.end();
  console.log('payouts (Postgres + fake Stripe): all checks passed.');
  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });
