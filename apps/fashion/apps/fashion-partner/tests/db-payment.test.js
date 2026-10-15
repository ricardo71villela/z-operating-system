/* Run with: DATABASE_URL=postgres://... node apps/fashion/apps/fashion-partner/tests/db-payment.test.js
   Real Postgres round-trip for Stripe payment (migration
   20261016120000_z_fashion_stripe_payment_v2.sql). */

const assert = require('assert');
const db = require('../src/db');

async function run() {
  const pool = db.createPool();

  const store = await db.insertPartner(pool, { legalName: 'Boutique Paiement', countryIso: 'FR', locales: ['fr'], categories: ['clothing'], ageSegments: ['adults'], minorSafeDataAcknowledged: false });
  for (const s of ['under_review', 'approved']) await db.updatePartnerStatus(pool, store.id, { onboardingStatus: s });
  await db.updatePartnerStatus(pool, store.id, { onboardingStatus: 'active', feedReliabilityTier: 'live' });
  const brand = await db.insertBrand(pool, { name: 'Marque', houseLabelOfPartnerId: store.id });

  async function newOrder(label, price) {
    const p = await db.insertProduct(pool, { partnerId: store.id, brandId: brand.id, names: { fr: label }, categories: ['clothing'], gender: 'female', ageSegments: ['adults'], size: { system: 'alpha', value: 'M' } });
    await db.recordPricePg(pool, p.id, price, '2026-10-01T00:00:00Z');
    await db.applyStockUpdatePg(pool, p.id, 3, '2026-10-01T00:00:00Z');
    const u = (await pool.query(`insert into auth.users (email) values ($1 || gen_random_uuid() || '@x.fr') returning id`, [label])).rows[0].id;
    const a = await db.insertClientAddressPg(pool, { clientUserId: u, type: 'shipping', line1: '1 rue', postalCode: '75001', city: 'Paris', countryIso: 'FR' });
    await db.setCartItemPg(pool, u, p.id, 1);
    const orderId = await db.checkoutCartPg(pool, u, { addressId: a.id, allowedCountries: ['FR'], holdSeconds: 1800 });
    return { orderId, productId: p.id, clientId: u };
  }
  const refunds = [];
  const onRefund = async (pi) => { refunds.push(pi); };
  let seq = 0;
  const ev = (pi, orderId, status, amount, id) => ({ eventId: id || `evt_db${++seq}`, eventType: `payment_intent.${status}`, paymentIntentId: pi, orderId, status, amountReceivedMinorUnits: amount });
  const order = (id) => db.getOrderPg(pool, id);
  const stock = (id) => db.getStockPg(pool, id);

  // --- start payment, attach intent, pay
  const a = await newOrder('a', 12000);
  assert.strictEqual(await db.startOrderPaymentPg(pool, a.orderId), null);
  const extended = (await db.getOrderPaymentPg(pool, a.orderId)).paymentExpiresAt;
  assert.ok(new Date(extended) > new Date(Date.now() + 14 * 60000));
  await db.attachPaymentIntentPg(pool, a.orderId, 'pi_dbA');
  assert.strictEqual(await db.startOrderPaymentPg(pool, a.orderId), 'pi_dbA');
  await assert.rejects(() => db.attachPaymentIntentPg(pool, a.orderId, 'pi_other'), /already has PaymentIntent/);

  assert.strictEqual(await db.recordStripePaymentEventPg(pool, ev('pi_dbA', a.orderId, 'failed', null), { onRefund }), 'failed');
  assert.strictEqual((await order(a.orderId)).paymentStatus, 'failed');
  await db.startOrderPaymentPg(pool, a.orderId);
  assert.strictEqual((await order(a.orderId)).paymentStatus, 'requires_payment_method', 'retry resets a decline');

  assert.strictEqual(await db.recordStripePaymentEventPg(pool, ev('pi_dbA', a.orderId, 'succeeded', 12000, 'evt_dbpaid'), { onRefund }), 'confirmed');
  let o = await order(a.orderId);
  assert.strictEqual(o.status, 'paid');
  assert.strictEqual(o.paymentStatus, 'succeeded');
  assert.strictEqual(o.shipments.length, 1);
  assert.deepStrictEqual(await stock(a.productId).then((s) => [s.quantityAvailable, s.quantityReserved]), [2, 0]);
  assert.strictEqual(await db.recordStripePaymentEventPg(pool, ev('pi_dbA', a.orderId, 'succeeded', 12000, 'evt_dbpaid'), { onRefund }), 'duplicate');
  assert.strictEqual(await db.recordStripePaymentEventPg(pool, ev('pi_dbA', a.orderId, 'processing', null), { onRefund }), 'ignored');
  await assert.rejects(() => db.startOrderPaymentPg(pool, a.orderId), (e) => e.code === 'order_not_payable');
  assert.strictEqual((await pool.query(`select outcome from fashion.stripe_webhook_events where stripe_event_id = 'evt_dbpaid'`)).rows[0].outcome, 'confirmed');

  // --- intent id not saved: matched by metadata.order_id
  const b = await newOrder('b', 4000);
  assert.strictEqual(await db.recordStripePaymentEventPg(pool, ev('pi_dbB', b.orderId, 'succeeded', 4000), { onRefund }), 'confirmed');
  assert.strictEqual((await order(b.orderId)).status, 'paid');

  // --- late payment on a cancelled order: refund inside the transaction
  const c = await newOrder('c', 5000);
  await db.startOrderPaymentPg(pool, c.orderId);
  await db.attachPaymentIntentPg(pool, c.orderId, 'pi_dbC');
  await db.cancelUnpaidOrderPg(pool, c.orderId);
  await assert.rejects(
    () => db.recordStripePaymentEventPg(pool, ev('pi_dbC', c.orderId, 'succeeded', 5000, 'evt_dblate'), { onRefund: async () => { throw new Error('stripe down'); } }),
    /stripe down/
  );
  assert.strictEqual((await order(c.orderId)).paymentStatus, 'requires_payment_method', 'rolled back');
  assert.strictEqual((await pool.query(`select count(*)::int n from fashion.stripe_webhook_events where stripe_event_id = 'evt_dblate'`)).rows[0].n, 0, 'event not recorded, Stripe will retry');
  assert.strictEqual(await db.recordStripePaymentEventPg(pool, ev('pi_dbC', c.orderId, 'succeeded', 5000, 'evt_dblate'), { onRefund }), 'late_payment');
  o = await order(c.orderId);
  assert.strictEqual(o.status, 'cancelled');
  assert.strictEqual(o.paymentStatus, 'refunded');
  assert.deepStrictEqual(refunds, ['pi_dbC']);

  // --- wrong amount: refunded, order cancelled, stock released
  const d = await newOrder('d', 3000);
  await db.attachPaymentIntentPg(pool, d.orderId, 'pi_dbD');
  assert.strictEqual(await db.recordStripePaymentEventPg(pool, ev('pi_dbD', d.orderId, 'succeeded', 2999), { onRefund }), 'amount_mismatch');
  o = await order(d.orderId);
  assert.strictEqual(o.status, 'cancelled');
  assert.strictEqual(o.paymentStatus, 'refunded');
  assert.strictEqual((await stock(d.productId)).quantityReserved, 0);

  // --- expired hold cannot be paid; processing payments are never expired
  const e = await newOrder('e', 2000);
  await pool.query(`update fashion.orders set payment_expires_at = now() - interval '1 second' where id = $1`, [e.orderId]);
  await assert.rejects(() => db.startOrderPaymentPg(pool, e.orderId), (err) => err.code === 'order_not_payable');
  const f = await newOrder('f', 2000);
  await db.attachPaymentIntentPg(pool, f.orderId, 'pi_dbF');
  assert.strictEqual(await db.recordStripePaymentEventPg(pool, ev('pi_dbF', f.orderId, 'processing', null), { onRefund }), 'processing');
  await pool.query(`update fashion.orders set payment_expires_at = now() - interval '1 second' where id = $1`, [f.orderId]);
  await db.expirePendingOrdersPg(pool);
  assert.strictEqual((await order(f.orderId)).status, 'pending_payment');
  assert.strictEqual(await db.recordStripePaymentEventPg(pool, ev('pi_dbF', f.orderId, 'succeeded', 2000), { onRefund }), 'confirmed');

  // --- hold never extended beyond 60 minutes after checkout
  const g = await newOrder('g', 2000);
  await pool.query(`update fashion.orders set created_at = now() - interval '55 minutes' where id = $1`, [g.orderId]);
  await db.startOrderPaymentPg(pool, g.orderId);
  const cap = (await pool.query(`select payment_expires_at = created_at + interval '60 minutes' as capped from fashion.orders where id = $1`, [g.orderId])).rows[0].capped;
  assert.strictEqual(cap, true);

  assert.strictEqual(await db.recordStripePaymentEventPg(pool, ev('pi_nobody', null, 'succeeded', 1), { onRefund }), 'unknown_payment_intent');

  const grants = (await pool.query(`select
      has_function_privilege('anon', 'fashion.record_stripe_payment_event(text,text,text,uuid,text,integer)', 'execute') as anon,
      has_function_privilege('authenticated', 'fashion.start_order_payment(uuid)', 'execute') as auth,
      has_table_privilege('authenticated', 'fashion.stripe_webhook_events', 'select') as events`)).rows[0];
  assert.deepStrictEqual(grants, { anon: false, auth: false, events: false });

  await pool.end();
  console.log('db payment: real Postgres round-trip checks passed.');
}

run().catch((err) => { console.error(err); process.exit(1); });
