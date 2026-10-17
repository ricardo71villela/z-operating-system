/* Run with: DATABASE_URL=postgres://... node apps/fashion/apps/fashion-partner/tests/db-checkout.test.js
   Real Postgres round-trip for cart, checkout and orders (migration
   20261016090000_z_fashion_checkout_v2.sql): cart lines, current-price
   repricing, all-or-nothing stock holds, per-store tickets and
   commission, payment confirmation, store sales, expiry. */

const assert = require('assert');
const db = require('../src/db');
const commission = require('../../../packages/fashion-domain/src/commission');

async function activeStore(pool, name, categories) {
  const p = await db.insertPartner(pool, { legalName: name, countryIso: 'FR', locales: ['fr'], categories, ageSegments: ['adults'], minorSafeDataAcknowledged: false });
  await db.updatePartnerStatus(pool, p.id, { onboardingStatus: 'under_review' });
  await db.updatePartnerStatus(pool, p.id, { onboardingStatus: 'approved' });
  await db.updatePartnerStatus(pool, p.id, { onboardingStatus: 'active', feedReliabilityTier: 'live' });
  return p;
}

async function product(pool, partner, brand, name, price, quantity, approve = true) {
  const p = await db.insertProduct(pool, {
    partnerId: partner.id, brandId: brand.id, names: { fr: name }, categories: ['clothing'],
    gender: 'female', ageSegments: ['adults'], size: { system: 'alpha', value: 'M' },
  });
  if (approve) await db.setProductModerationPg(pool, p.id, 'pending', { moderationStatus: 'approved', moderatedAt: new Date().toISOString() });
  if (price !== null) await db.recordPricePg(pool, p.id, price, '2026-10-01T08:00:00Z');
  if (quantity !== null) await db.applyStockUpdatePg(pool, p.id, quantity, '2026-10-01T08:00:00Z');
  return p;
}

async function user(pool, label) {
  return (await pool.query(`insert into auth.users (email) values ($1 || '-' || gen_random_uuid() || '@example.fr') returning id`, [label])).rows[0].id;
}

async function stockOf(pool, productId) {
  return (await db.getStockPg(pool, productId));
}

async function run() {
  const pool = db.createPool();

  const storeA = await activeStore(pool, 'Boutique A', ['clothing']);
  const storeB = await activeStore(pool, 'Boutique B', ['clothing']);
  const pending = await db.insertPartner(pool, { legalName: 'Pas active', countryIso: 'FR', locales: ['fr'], categories: ['clothing'], ageSegments: ['adults'], minorSafeDataAcknowledged: false });
  const brandA = await db.insertBrand(pool, { name: 'Marque A', houseLabelOfPartnerId: storeA.id });
  const brandB = await db.insertBrand(pool, { name: 'Marque B', houseLabelOfPartnerId: storeB.id });
  const brandP = await db.insertBrand(pool, { name: 'Marque P', houseLabelOfPartnerId: pending.id });

  const robe = await product(pool, storeA, brandA, 'Robe', 6000, 3);
  const jupe = await product(pool, storeA, brandA, 'Jupe', 4500, 1);
  const manteau = await product(pool, storeB, brandB, 'Manteau', 25000, 2);
  const unpriced = await product(pool, storeA, brandA, 'Sans prix', null, 5);
  const hidden = await product(pool, pending, brandP, 'Boutique pas active', 1000, 5);

  const lea = await user(pool, 'lea');
  const other = await user(pool, 'other');

  // --- cart lines
  await assert.rejects(() => db.setCartItemPg(pool, lea, robe.id, 4), (e) => e.code === 'insufficient_stock' && e.productId === robe.id && e.sellable === 3);
  await assert.rejects(() => db.setCartItemPg(pool, lea, robe.id, 11), (e) => e.code === 'invalid_quantity');
  await assert.rejects(() => db.setCartItemPg(pool, lea, unpriced.id, 1), (e) => e.code === 'product_unavailable');
  await assert.rejects(() => db.setCartItemPg(pool, lea, hidden.id, 1), (e) => e.code === 'product_unavailable', 'store not active');

  await db.setCartItemPg(pool, lea, robe.id, 2);
  await db.setCartItemPg(pool, lea, jupe.id, 1);
  await db.setCartItemPg(pool, lea, manteau.id, 1);
  await db.setCartItemPg(pool, lea, robe.id, 2); // same line, not a second one
  let cart = await db.getOpenCartPg(pool, lea);
  assert.strictEqual(cart.items.length, 3);
  assert.strictEqual(cart.items.find((i) => i.productId === robe.id).quantity, 2);
  await db.setCartItemPg(pool, lea, jupe.id, 0);
  assert.strictEqual((await db.getOpenCartPg(pool, lea)).items.length, 2);
  await db.setCartItemPg(pool, lea, jupe.id, 1);
  assert.strictEqual((await pool.query('select count(*)::int n from fashion.carts where client_user_id = $1', [lea])).rows[0].n, 1, 'one open cart');

  // --- addresses
  const addrFr = await db.insertClientAddressPg(pool, { clientUserId: lea, type: 'shipping', recipientName: 'Léa', line1: '3 rue des Lilas', postalCode: '69001', city: 'Lyon', countryIso: 'FR', isDefault: true });
  const addrPt = await db.insertClientAddressPg(pool, { clientUserId: lea, type: 'shipping', line1: 'Rua Augusta 1', postalCode: '1100-048', city: 'Lisboa', countryIso: 'PT' });
  const addrOther = await db.insertClientAddressPg(pool, { clientUserId: other, type: 'shipping', line1: 'x', postalCode: '75001', city: 'Paris', countryIso: 'FR' });
  const opts = (addressId) => ({ addressId, allowedCountries: ['FR'], holdSeconds: 1800 });

  await assert.rejects(() => db.checkoutCartPg(pool, lea, opts(addrPt.id)), (e) => e.code === 'shipping_country_not_served');
  await assert.rejects(() => db.checkoutCartPg(pool, lea, opts(addrOther.id)), (e) => e.code === 'address_not_found');
  await assert.rejects(() => db.checkoutCartPg(pool, lea, opts('not-a-uuid')), (e) => e.code === 'address_not_found');
  await assert.rejects(() => db.checkoutCartPg(pool, other, opts(addrOther.id)), (e) => e.code === 'empty_cart');

  // --- price changed after add: checkout uses the current price
  await db.recordPricePg(pool, robe.id, 5500, '2026-10-02T08:00:00Z');
  const orderId = await db.checkoutCartPg(pool, lea, opts(addrFr.id));
  let order = await db.getOrderPg(pool, orderId);
  assert.strictEqual(order.status, 'pending_payment');
  assert.strictEqual(order.clientUserId, lea);
  assert.strictEqual(order.subtotalMinorUnits, 11000 + 4500 + 25000);
  assert.strictEqual(order.shippingMinorUnits, 0);
  assert.strictEqual(order.totalMinorUnits, 40500);
  assert.strictEqual(order.items.find((i) => i.productId === robe.id).unitPriceMinorUnits, 5500);
  assert.deepStrictEqual(order.shippingAddress, { recipientName: 'Léa', line1: '3 rue des Lilas', line2: null, postalCode: '69001', city: 'Lyon', countryIso: 'FR' });
  const ticketA = order.tickets.find((t) => t.partnerId === storeA.id);
  const ticketB = order.tickets.find((t) => t.partnerId === storeB.id);
  assert.deepStrictEqual(ticketA, { partnerId: storeA.id, subtotalMinorUnits: 15500, itemCount: 3,
    commissionRatePercent: commission.ticketCommissionRatePercent(15500), commissionMinorUnits: commission.ticketCommissionOwedMinorUnits(15500) });
  assert.strictEqual(ticketA.commissionRatePercent, 8);
  assert.strictEqual(ticketB.commissionRatePercent, 6);
  assert.strictEqual(ticketB.commissionMinorUnits, 1500);
  assert.strictEqual((await stockOf(pool, jupe.id)).quantityReserved, 1, 'stock held');
  const holdSeconds = (await pool.query(`select extract(epoch from (payment_expires_at - created_at))::int s from fashion.orders where id = $1`, [orderId])).rows[0].s;
  assert.ok(holdSeconds >= 1795 && holdSeconds <= 1805);
  assert.strictEqual((await db.getOpenCartPg(pool, lea)).pendingOrderId, orderId);

  // Someone else cannot take the held unit.
  await assert.rejects(() => db.setCartItemPg(pool, other, jupe.id, 1), (e) => e.code === 'insufficient_stock' && e.sellable === 0);

  // Checking out again replaces the unpaid Order: no double hold.
  const order2Id = await db.checkoutCartPg(pool, lea, opts(addrFr.id));
  assert.strictEqual((await db.getOrderPg(pool, orderId)).status, 'cancelled');
  assert.strictEqual((await stockOf(pool, jupe.id)).quantityReserved, 1);

  // Changing the cart cancels the unpaid Order and frees the stock.
  await db.setCartItemPg(pool, lea, robe.id, 1);
  assert.strictEqual((await db.getOrderPg(pool, order2Id)).status, 'cancelled');
  assert.strictEqual((await stockOf(pool, jupe.id)).quantityReserved, 0);
  assert.strictEqual((await stockOf(pool, robe.id)).quantityReserved, 0);

  // All-or-nothing: one line short, nothing is held, no Order is left behind.
  await db.setCartItemPg(pool, lea, robe.id, 2);
  await db.applyStockUpdatePg(pool, manteau.id, 0, '2026-10-03T08:00:00Z');
  const ordersBefore = (await pool.query('select count(*)::int n from fashion.orders where client_user_id = $1', [lea])).rows[0].n;
  await assert.rejects(() => db.checkoutCartPg(pool, lea, opts(addrFr.id)), (e) => e.code === 'insufficient_stock' && e.productId === manteau.id && e.sellable === 0);
  assert.strictEqual((await pool.query('select count(*)::int n from fashion.orders where client_user_id = $1', [lea])).rows[0].n, ordersBefore);
  assert.strictEqual((await stockOf(pool, robe.id)).quantityReserved, 0, 'earlier lines were not left held');
  await db.applyStockUpdatePg(pool, manteau.id, 2, '2026-10-04T08:00:00Z');

  // A line can be removed even though cancelled Orders point at it.
  await db.setCartItemPg(pool, lea, jupe.id, 0);
  await db.setCartItemPg(pool, lea, jupe.id, 1);

  // --- pay (what the Stripe webhook will do in task 11)
  const paidId = await db.checkoutCartPg(pool, lea, opts(addrFr.id));
  await assert.rejects(() => db.cancelUnpaidOrderPg(pool, '00000000-0000-0000-0000-000000000000'), (e) => e.code === 'order_not_found');
  await pool.query(`update fashion.orders set payment_status = 'processing' where id = $1`, [paidId]);
  await assert.rejects(() => db.cancelUnpaidOrderPg(pool, paidId), (e) => e.code === 'payment_in_progress');
  await assert.rejects(() => db.setCartItemPg(pool, lea, robe.id, 1), (e) => e.code === 'payment_in_progress', 'cart locked while paying');
  const total = (await db.getOrderPg(pool, paidId)).totalMinorUnits;
  await pool.query(`update fashion.orders set payment_status = 'succeeded', payment_amount_minor_units = $2 where id = $1`, [paidId, total]);
  await pool.query('select fashion.confirm_order_payment($1)', [paidId]);
  order = await db.getOrderPg(pool, paidId);
  assert.strictEqual(order.status, 'paid');
  assert.strictEqual(order.shipments.length, 2, 'one shipment per store');
  assert.deepStrictEqual(await stockOf(pool, jupe.id).then((s) => [s.quantityAvailable, s.quantityReserved]), [0, 0], 'sale committed');
  await assert.rejects(() => db.cancelUnpaidOrderPg(pool, paidId), (e) => e.code === 'order_not_cancellable');

  // The paid Order closed the cart; the next add opens a new one.
  assert.strictEqual((await db.getOpenCartPg(pool, lea)).cartId, null);
  await db.setCartItemPg(pool, lea, manteau.id, 1);
  cart = await db.getOpenCartPg(pool, lea);
  assert.ok(cart.cartId);
  assert.strictEqual(cart.items.length, 1);

  // --- store views: only paid Orders, only its own lines
  const salesA = await db.listOrdersForPartnerPg(pool, storeA.id);
  assert.strictEqual(salesA.length, 1);
  assert.strictEqual(salesA[0].id, paidId);
  assert.ok(salesA[0].items.every((i) => i.partnerId === storeA.id));
  assert.strictEqual(salesA[0].tickets.length, 1);
  assert.strictEqual(salesA[0].shipments.length, 1);
  assert.strictEqual(salesA[0].shipments[0].status, 'confirmed');
  const sinceMonth = await db.partnerSalesSincePg(pool, storeA.id, new Date(Date.now() - 86400000));
  assert.deepStrictEqual(sinceMonth, { gmvMinorUnits: 15500, commissionMinorUnits: commission.ticketCommissionOwedMinorUnits(15500), ticketCount: 1 });
  assert.deepStrictEqual(await db.partnerSalesSincePg(pool, storeA.id, new Date(Date.now() + 86400000)), { gmvMinorUnits: 0, commissionMinorUnits: 0, ticketCount: 0 });

  const leaOrders = await db.listOrdersForClientPg(pool, lea);
  assert.deepStrictEqual(leaOrders.map((o) => o.status), ['paid', 'cancelled', 'cancelled']);
  assert.strictEqual(leaOrders[0].id, paidId, 'newest first');
  assert.deepStrictEqual(await db.listOrdersForClientPg(pool, other), []);

  // --- expiry: an unpaid Order past its hold is cancelled and the stock released
  const expId = await db.checkoutCartPg(pool, lea, opts(addrFr.id));
  assert.strictEqual((await stockOf(pool, manteau.id)).quantityReserved, 1);
  await pool.query(`update fashion.orders set payment_expires_at = now() - interval '1 second' where id = $1`, [expId]);
  assert.ok((await db.expirePendingOrdersPg(pool)) >= 1);
  assert.strictEqual((await db.getOrderPg(pool, expId)).status, 'cancelled');
  assert.strictEqual((await stockOf(pool, manteau.id)).quantityReserved, 0);

  // A payment being processed is never expired.
  const procId = await db.checkoutCartPg(pool, lea, opts(addrFr.id));
  await pool.query(`update fashion.orders set payment_status = 'processing', payment_expires_at = now() - interval '1 second' where id = $1`, [procId]);
  await db.expirePendingOrdersPg(pool);
  assert.strictEqual((await db.getOrderPg(pool, procId)).status, 'pending_payment');

  // --- names for display
  await db.upsertCornerConfig(pool, { partnerId: storeB.id, displayName: 'Corner B', logoUrl: 'https://example.fr/logo.png' });
  const names = await db.getStoreNamesPg(pool, [storeA.id, storeB.id]);
  assert.deepStrictEqual(names, { [storeA.id]: 'Boutique A', [storeB.id]: 'Corner B' });

  // --- storefront listing: priced products of active stores, current price, newest first
  const listing = await db.listCatalogPg(pool);
  const listed = (id) => listing.find((r) => r.product.id === id);
  assert.strictEqual(listed(robe.id).priceMinorUnits, 5500, 'latest price');
  assert.strictEqual(listed(robe.id).brandName, 'Marque A');
  assert.ok(listed(robe.id).product.createdAt);
  assert.ok(!listed(unpriced.id), 'unpriced products are not listed');
  assert.ok(!listed(hidden.id), 'stores that are not active are not listed');

  // --- product moderation (task 8)
  {
    const fresh = await product(pool, storeA, brandA, 'Nouveau gilet', 7000, 4, false);
    const row = await db.getProduct(pool, fresh.id);
    assert.strictEqual(row.moderationStatus, 'pending', 'new products wait for an admin');
    assert.ok(row.submittedAt);
    assert.ok(!(await db.listCatalogPg(pool)).some((r) => r.product.id === fresh.id), 'pending: not listed');
    const buyer = await user(pool, 'moderation');
    await assert.rejects(() => db.setCartItemPg(pool, buyer, fresh.id, 1), (e) => e.code === 'product_unavailable', 'pending: not in a cart');
    const queue = await db.listProductsForModerationPg(pool, { status: 'pending' });
    const q = queue.find((r) => r.product.id === fresh.id);
    assert.ok(q, 'in the queue');
    assert.strictEqual(q.priceMinorUnits, 7000);
    assert.strictEqual(q.quantityAvailable, 4);
    assert.strictEqual(q.brandName, 'Marque A');
    await assert.rejects(() => pool.query(`update fashion.products set moderation_status = 'rejected' where id = $1`, [fresh.id]), /fashion_products_rejection_needs_note/, 'a refusal needs a note');
    assert.strictEqual(await db.setProductModerationPg(pool, fresh.id, 'approved', { moderationStatus: 'rejected', moderationNote: 'x' }), null, 'stale decision is refused');
    const ok = await db.setProductModerationPg(pool, fresh.id, 'pending', { moderationStatus: 'approved', moderatedAt: new Date().toISOString(), moderatedBy: buyer });
    assert.strictEqual(ok.moderationStatus, 'approved');
    assert.ok((await db.listCatalogPg(pool)).some((r) => r.product.id === fresh.id), 'approved: listed');
    await db.setCartItemPg(pool, buyer, fresh.id, 1);
    // Withdrawn while in a cart: checkout refuses it.
    await db.setProductModerationPg(pool, fresh.id, 'approved', { moderationStatus: 'rejected', moderationNote: 'Retiré', moderatedAt: new Date().toISOString() });
    const addr = await db.insertClientAddressPg(pool, { clientUserId: buyer, type: 'shipping', line1: '1 rue', postalCode: '75001', city: 'Paris', countryIso: 'FR' });
    await assert.rejects(() => db.checkoutCartPg(pool, buyer, { addressId: addr.id, allowedCountries: ['FR'], holdSeconds: 1800 }), (e) => e.code === 'product_unavailable' && e.productId === fresh.id);
    const back = await db.setProductModerationPg(pool, fresh.id, 'rejected', { moderationStatus: 'pending', moderationNote: 'Retiré', submittedAt: new Date().toISOString() });
    assert.strictEqual(back.moderationStatus, 'pending');
    assert.strictEqual(back.moderationNote, 'Retiré', 'the last note stays visible to the store');
    assert.ok((await db.countProductsPendingModerationPg(pool)) >= 1);
  }

  // --- not callable by API roles
  const g = (await pool.query(`select
      has_function_privilege('anon', 'fashion.checkout_cart(uuid,uuid,text[],integer)', 'execute') as anon,
      has_function_privilege('authenticated', 'fashion.set_cart_item(uuid,uuid,integer)', 'execute') as auth,
      has_table_privilege('authenticated', 'fashion.order_tickets', 'select') as tickets`)).rows[0];
  assert.deepStrictEqual(g, { anon: false, auth: false, tickets: false });

  await pool.end();
  console.log('db checkout: real Postgres round-trip checks passed.');
}

run().catch((err) => { console.error(err); process.exit(1); });
