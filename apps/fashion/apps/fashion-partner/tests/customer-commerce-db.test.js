'use strict';

const assert = require('assert');
const { randomUUID } = require('crypto');
const {
  createPool,
  insertPartner,
  insertBrand,
  insertProduct,
  recordPricePg,
  applyStockUpdatePg,
  getStockPg,
} = require('../src/db');
const { createPgCustomerCommerceRepository, HttpError } = require('../src/customer-commerce');

async function run() {
  const pool = createPool();
  const repository = createPgCustomerCommerceRepository(pool);
  const clientA = randomUUID();
  const clientB = randomUUID();
  const checkoutKey = `checkout-db-${randomUUID()}`;

  try {
    await pool.query(
      `insert into auth.users (id, email) values ($1, $2), ($3, $4)`,
      [clientA, `fashion-a-${clientA}@example.test`, clientB, `fashion-b-${clientB}@example.test`]
    );

    const partner = await insertPartner(pool, {
      legalName: `Checkout Atelier ${randomUUID().slice(0, 8)}`,
      countryIso: 'FR',
      locales: ['fr'],
      categories: ['accessories_leather_goods'],
      ageSegments: ['adults'],
      minorSafeDataAcknowledged: false,
    });
    const brand = await insertBrand(pool, { name: `Checkout Brand ${randomUUID().slice(0, 8)}`, houseLabelOfPartnerId: partner.id });
    const product = await insertProduct(pool, {
      partnerId: partner.id,
      brandId: brand.id,
      names: { fr: 'Sac checkout CI' },
      descriptions: {},
      categories: ['accessories_leather_goods'],
      technicalPurpose: false,
      gender: 'unisex',
      ageSegments: ['adults'],
      safetyCertifications: [],
      size: null,
      format: null,
      cornerExclusive: false,
      styleId: null,
    });

    await recordPricePg(pool, product.id, 12900, new Date('2026-08-27T10:00:00.000Z'));
    await applyStockUpdatePg(pool, product.id, 5, new Date('2026-08-27T10:00:00.000Z'));

    const cart = await repository.createCart(clientA);
    assert.strictEqual(cart.clientUserId, clientA);

    // Browser-supplied Partner/price values are ignored. Canonical Product
    // ownership and current price are derived by PostgreSQL.
    const item = await repository.addCartItem(clientA, cart.id, {
      productId: product.id,
      quantity: 2,
      partnerId: randomUUID(),
      unitPriceMinorUnits: 1,
    });
    assert.strictEqual(item.partnerId, partner.id);
    assert.strictEqual(item.unitPriceMinorUnits, 12900);
    assert.strictEqual(item.quantity, 2);

    await assert.rejects(
      () => repository.checkoutPreflight(clientB, cart.id),
      (err) => err instanceof HttpError && err.statusCode === 404 && err.code === 'cart_not_found'
    );

    const preflight = await repository.checkoutPreflight(clientA, cart.id);
    assert.strictEqual(preflight.ready, true);
    assert.strictEqual(preflight.totalMinorUnits, 25800);
    assert.strictEqual(preflight.items[0].sellableQuantity, 5);
    assert.strictEqual(preflight.items[0].priceMatches, true);

    const order = await repository.attemptCheckout(clientA, cart.id, checkoutKey);
    assert.strictEqual(order.id.length, 36);
    assert.strictEqual(order.status, 'pending_payment');
    assert.strictEqual(order.totalMinorUnits, 25800);
    assert.strictEqual(order.packages.length, 1);
    assert.strictEqual(order.packages[0].partnerId, partner.id);
    assert.strictEqual(order.packages[0].items[0].quantity, 2);

    const stockAfterFirstAttempt = await getStockPg(pool, product.id);
    assert.strictEqual(stockAfterFirstAttempt.quantityAvailable, 5);
    assert.strictEqual(stockAfterFirstAttempt.quantityReserved, 2);

    // The exact retry key must resolve to the same Order and must not reserve
    // another two units of stock.
    const retried = await repository.attemptCheckout(clientA, cart.id, checkoutKey);
    assert.strictEqual(retried.id, order.id);
    const stockAfterRetry = await getStockPg(pool, product.id);
    assert.strictEqual(stockAfterRetry.quantityReserved, 2);

    const requestRows = await pool.query(
      `select cart_id, order_id from fashion.checkout_requests where client_user_id = $1 and idempotency_key = $2`,
      [clientA, checkoutKey]
    );
    assert.strictEqual(requestRows.rows.length, 1);
    assert.strictEqual(requestRows.rows[0].cart_id, cart.id);
    assert.strictEqual(requestRows.rows[0].order_id, order.id);

    const commercial = await pool.query(
      `select status, payment_status, payment_amount_minor_units from fashion.orders where id = $1`,
      [order.id]
    );
    assert.strictEqual(commercial.rows[0].status, 'pending_payment');
    assert.strictEqual(commercial.rows[0].payment_status, 'requires_payment_method');
    assert.strictEqual(commercial.rows[0].payment_amount_minor_units, null);

    const shipments = await pool.query('select count(*)::int as count from fashion.shipments where order_id = $1', [order.id]);
    assert.strictEqual(shipments.rows[0].count, 0);

    const ordersA = await repository.listOrders(clientA);
    assert.ok(ordersA.some((entry) => entry.id === order.id));
    const ordersB = await repository.listOrders(clientB);
    assert.ok(!ordersB.some((entry) => entry.id === order.id));

    await assert.rejects(
      () => repository.getOrder(clientB, order.id),
      (err) => err instanceof HttpError && err.statusCode === 404 && err.code === 'order_not_found'
    );

    // Reusing the same retry key for another Cart is structurally rejected.
    const secondCart = await repository.createCart(clientA);
    await repository.addCartItem(clientA, secondCart.id, { productId: product.id, quantity: 1 });
    await assert.rejects(
      () => repository.attemptCheckout(clientA, secondCart.id, checkoutKey),
      /Idempotency-Key is already bound to another Cart/
    );

    console.log('Z Fashion customer commerce PostgreSQL authority: PASS');
  } finally {
    await pool.end();
  }
}

run().catch((err) => { console.error(err); process.exit(1); });
