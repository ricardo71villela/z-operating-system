'use strict';

const http = require('http');
const { URL } = require('url');
const { createPool } = require('./db');
const { buildCustomerOrderView } = require('../../../packages/fashion-domain/src/customer-order-view');

class HttpError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1024 * 1024) throw new HttpError(413, 'body_too_large', 'request body is too large');
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'invalid_json', 'request body must be valid JSON');
  }
}

function requireUuid(value, fieldName) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))) {
    throw new HttpError(400, 'invalid_identifier', `${fieldName} must be a UUID`);
  }
  return String(value);
}

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new HttpError(422, 'invalid_quantity', `${fieldName} must be a positive integer`);
  }
  return value;
}

function requireIdempotencyKey(value) {
  const key = String(value || '').trim();
  if (key.length < 8 || key.length > 200) {
    throw new HttpError(400, 'idempotency_key_required', 'Idempotency-Key must contain 8..200 characters');
  }
  return key;
}

async function authenticateWithSupabase(req, env = process.env, fetchImpl = globalThis.fetch) {
  const authHeader = String(req.headers.authorization || '');
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) throw new HttpError(401, 'authentication_required', 'Bearer authentication is required');

  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const publishableKey = String(env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || '');
  if (!supabaseUrl || !publishableKey) {
    throw new HttpError(503, 'auth_not_configured', 'Z Fashion customer authentication is not configured');
  }
  if (typeof fetchImpl !== 'function') {
    throw new HttpError(503, 'auth_not_available', 'authentication verifier is not available');
  }

  let response;
  try {
    response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${match[1]}`,
      },
    });
  } catch {
    throw new HttpError(503, 'auth_unavailable', 'authentication service is temporarily unavailable');
  }
  if (!response.ok) throw new HttpError(401, 'invalid_session', 'Supabase session is invalid or expired');
  const user = await response.json();
  const clientUserId = requireUuid(user && user.id, 'authenticated user id');
  return { clientUserId };
}

function createPgCustomerCommerceRepository(pool) {
  async function assertCartOwner(client, clientUserId, cartId, lock = false) {
    const result = await client.query(
      `select id, client_user_id from fashion.carts where id = $1${lock ? ' for update' : ''}`,
      [cartId]
    );
    if (result.rows.length === 0 || result.rows[0].client_user_id !== clientUserId) {
      throw new HttpError(404, 'cart_not_found', 'Cart was not found for the authenticated Client');
    }
  }

  async function createCart(clientUserId) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const authUser = await client.query('select id from auth.users where id = $1', [clientUserId]);
      if (authUser.rows.length === 0) {
        throw new HttpError(403, 'client_identity_not_registered', 'Authenticated Client is not registered in the shared identity store');
      }
      await client.query('insert into fashion.clients (id) values ($1) on conflict (id) do nothing', [clientUserId]);
      const result = await client.query(
        'insert into fashion.carts (client_user_id) values ($1) returning id, client_user_id, created_at',
        [clientUserId]
      );
      await client.query('commit');
      return {
        id: result.rows[0].id,
        clientUserId: result.rows[0].client_user_id,
        createdAt: result.rows[0].created_at,
      };
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }

  async function addCartItem(clientUserId, cartId, input) {
    const productId = requireUuid(input.productId, 'productId');
    const quantity = requirePositiveInteger(input.quantity, 'quantity');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await assertCartOwner(client, clientUserId, cartId, true);

      const product = await client.query(
        `select p.id, p.partner_id, fashion.current_price(p.id) as current_price_minor_units
         from fashion.products p where p.id = $1`,
        [productId]
      );
      if (product.rows.length === 0) throw new HttpError(404, 'product_not_found', 'Product was not found');
      const row = product.rows[0];
      if (row.current_price_minor_units === null) {
        throw new HttpError(409, 'price_unavailable', 'Product has no current commercial price');
      }

      const inserted = await client.query(
        `insert into fashion.cart_items (cart_id, product_id, partner_id, quantity, unit_price_minor_units)
         values ($1, $2, $3, $4, $5)
         returning id, cart_id, product_id, partner_id, quantity, unit_price_minor_units`,
        [cartId, productId, row.partner_id, quantity, row.current_price_minor_units]
      );
      await client.query('commit');
      return toCartItem(inserted.rows[0]);
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }

  async function checkoutPreflight(clientUserId, cartId) {
    await assertCartOwner(pool, clientUserId, cartId, false);
    const result = await pool.query(
      `select
         ci.id,
         ci.product_id,
         ci.partner_id,
         ci.quantity,
         ci.unit_price_minor_units,
         fashion.current_price(ci.product_id) as current_price_minor_units,
         coalesce(s.quantity_available - s.quantity_reserved, 0) as sellable_quantity
       from fashion.cart_items ci
       left join fashion.stock s on s.product_id = ci.product_id
       where ci.cart_id = $1
       order by ci.created_at, ci.id`,
      [cartId]
    );

    const items = result.rows.map((row) => {
      const currentPriceMinorUnits = row.current_price_minor_units === null ? null : Number(row.current_price_minor_units);
      const unitPriceMinorUnits = Number(row.unit_price_minor_units);
      const sellableQuantity = Number(row.sellable_quantity);
      const priceMatches = currentPriceMinorUnits !== null && currentPriceMinorUnits === unitPriceMinorUnits;
      const stockSufficient = sellableQuantity >= Number(row.quantity);
      return {
        id: row.id,
        productId: row.product_id,
        partnerId: row.partner_id,
        quantity: Number(row.quantity),
        unitPriceMinorUnits,
        currentPriceMinorUnits,
        sellableQuantity,
        priceMatches,
        stockSufficient,
      };
    });

    const blockers = [];
    if (items.length === 0) blockers.push({ code: 'empty_cart', message: 'Cart has no items' });
    for (const item of items) {
      if (item.currentPriceMinorUnits === null) {
        blockers.push({ code: 'price_unavailable', productId: item.productId });
      } else if (!item.priceMatches) {
        blockers.push({ code: 'price_changed', productId: item.productId, currentPriceMinorUnits: item.currentPriceMinorUnits });
      }
      if (!item.stockSufficient) {
        blockers.push({ code: 'insufficient_stock', productId: item.productId, sellableQuantity: item.sellableQuantity });
      }
    }

    return {
      cartId,
      totalMinorUnits: items.reduce((sum, item) => sum + item.unitPriceMinorUnits * item.quantity, 0),
      items,
      blockers,
      ready: blockers.length === 0,
    };
  }

  async function attemptCheckout(clientUserId, cartId, idempotencyKey) {
    let orderId;
    const client = await pool.connect();
    try {
      await client.query('begin');
      await assertCartOwner(client, clientUserId, cartId, true);

      const priceCheck = await client.query(
        `select ci.product_id, ci.unit_price_minor_units, fashion.current_price(ci.product_id) as current_price_minor_units
         from fashion.cart_items ci where ci.cart_id = $1 order by ci.id`,
        [cartId]
      );
      if (priceCheck.rows.length === 0) throw new HttpError(409, 'empty_cart', 'Cart has no items');
      for (const row of priceCheck.rows) {
        if (row.current_price_minor_units === null) {
          throw new HttpError(409, 'price_unavailable', `Product ${row.product_id} has no current price`);
        }
        if (Number(row.current_price_minor_units) !== Number(row.unit_price_minor_units)) {
          throw new HttpError(409, 'price_changed', `Product ${row.product_id} price changed after it was added to the Cart`);
        }
      }

      const result = await client.query(
        'select fashion.attempt_checkout_idempotent($1, $2, $3) as order_id',
        [clientUserId, cartId, idempotencyKey]
      );
      orderId = result.rows[0].order_id;
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
    return getOrder(clientUserId, orderId);
  }

  async function listOrders(clientUserId) {
    const result = await pool.query(
      `select o.id, o.total_minor_units, o.refunded_minor_units, o.status, o.payment_status, o.created_at
       from fashion.orders o
       join fashion.carts c on c.id = o.cart_id
       where c.client_user_id = $1
       order by o.created_at desc`,
      [clientUserId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      totalMinorUnits: Number(row.total_minor_units),
      refundedMinorUnits: Number(row.refunded_minor_units || 0),
      status: row.status,
      paymentStatus: row.payment_status,
      createdAt: row.created_at,
    }));
  }

  async function getOrder(clientUserId, orderId) {
    const orderResult = await pool.query(
      `select o.id, o.total_minor_units, o.refunded_minor_units, o.status, o.payment_status, o.created_at,
              c.client_user_id
       from fashion.orders o
       join fashion.carts c on c.id = o.cart_id
       where o.id = $1 and c.client_user_id = $2`,
      [orderId, clientUserId]
    );
    if (orderResult.rows.length === 0) {
      throw new HttpError(404, 'order_not_found', 'Order was not found for the authenticated Client');
    }

    const itemResult = await pool.query(
      `select id, product_id, partner_id, quantity, unit_price_minor_units, line_total_minor_units
       from fashion.order_items where order_id = $1 order by created_at, id`,
      [orderId]
    );
    const items = itemResult.rows.map((row) => ({
      orderItemId: row.id,
      productId: row.product_id,
      partnerId: row.partner_id,
      quantity: Number(row.quantity),
      unitPriceMinorUnits: Number(row.unit_price_minor_units),
      lineTotalMinorUnits: Number(row.line_total_minor_units),
    }));

    const byPartner = new Map();
    for (const item of items) {
      if (!byPartner.has(item.partnerId)) byPartner.set(item.partnerId, []);
      byPartner.get(item.partnerId).push(item);
    }
    const partnerOrders = [...byPartner.entries()].map(([partnerId, partnerItems]) => ({
      partnerId,
      subtotalMinorUnits: partnerItems.reduce((sum, item) => sum + item.lineTotalMinorUnits, 0),
      items: partnerItems,
    }));

    const shipmentResult = await pool.query(
      `select s.id, s.order_id, s.partner_id, s.status, s.delivered_at,
              coalesce(array_agg(si.product_id order by si.product_id) filter (where si.product_id is not null), '{}') as product_ids
       from fashion.shipments s
       left join fashion.shipment_items si on si.shipment_id = s.id
       where s.order_id = $1
       group by s.id
       order by s.created_at, s.id`,
      [orderId]
    );
    const shipments = shipmentResult.rows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      partnerId: row.partner_id,
      status: row.status,
      deliveredAt: row.delivered_at,
      productIds: row.product_ids,
      history: [],
    }));

    const returnResult = await pool.query(
      `select id, order_id, partner_id, product_id, quantity, status, reason,
              refunded_minor_units, refunded_at
       from fashion.returns where order_id = $1 order by created_at, id`,
      [orderId]
    );
    const returns = returnResult.rows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      partnerId: row.partner_id,
      productId: row.product_id,
      quantity: Number(row.quantity),
      status: row.status,
      reason: row.reason,
      refundedMinorUnits: Number(row.refunded_minor_units || 0),
      refundedAt: row.refunded_at,
      history: [],
    }));

    const orderRow = orderResult.rows[0];
    const order = {
      id: orderRow.id,
      clientUserId: orderRow.client_user_id,
      currency: 'eur',
      totalMinorUnits: Number(orderRow.total_minor_units),
      refundedMinorUnits: Number(orderRow.refunded_minor_units || 0),
      status: orderRow.status,
      paymentStatus: orderRow.payment_status,
      createdAt: orderRow.created_at,
      items,
      partnerOrders,
    };
    return buildCustomerOrderView({ order, clientUserId, shipments, returns });
  }

  return { createCart, addCartItem, checkoutPreflight, attemptCheckout, listOrders, getOrder };
}

function toCartItem(row) {
  return {
    id: row.id,
    cartId: row.cart_id,
    productId: row.product_id,
    partnerId: row.partner_id,
    quantity: Number(row.quantity),
    unitPriceMinorUnits: Number(row.unit_price_minor_units),
  };
}

function createCustomerCommerceServer({ repository, authenticateClient = authenticateWithSupabase, writesEnabled } = {}) {
  if (!repository) throw new Error('createCustomerCommerceServer: repository is required');
  const allowWrites = writesEnabled || (() => process.env.FASHION_ENABLE_CLIENT_COMMERCE_WRITES === 'true');

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const parts = url.pathname.split('/').filter(Boolean);

    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, { ok: true, customerCommerce: true, writesEnabled: Boolean(allowWrites()) });
      }

      if (parts[0] !== 'me') throw new HttpError(404, 'not_found', 'not found');
      const { clientUserId } = await authenticateClient(req);
      requireUuid(clientUserId, 'authenticated client id');

      if (req.method === 'POST' && parts.length === 2 && parts[1] === 'cart') {
        if (!allowWrites()) throw new HttpError(503, 'commerce_writes_disabled', 'Customer commerce writes are disabled');
        return sendJson(res, 201, { cart: await repository.createCart(clientUserId) });
      }

      if (req.method === 'POST' && parts.length === 4 && parts[1] === 'cart' && parts[3] === 'items') {
        if (!allowWrites()) throw new HttpError(503, 'commerce_writes_disabled', 'Customer commerce writes are disabled');
        const cartId = requireUuid(parts[2], 'cartId');
        const body = await readJson(req);
        return sendJson(res, 201, { item: await repository.addCartItem(clientUserId, cartId, body) });
      }

      if (req.method === 'GET' && parts.length === 4 && parts[1] === 'cart' && parts[3] === 'checkout-preflight') {
        const cartId = requireUuid(parts[2], 'cartId');
        return sendJson(res, 200, { preflight: await repository.checkoutPreflight(clientUserId, cartId) });
      }

      if (req.method === 'POST' && parts.length === 4 && parts[1] === 'cart' && parts[3] === 'checkout') {
        if (!allowWrites()) throw new HttpError(503, 'commerce_writes_disabled', 'Customer commerce writes are disabled');
        const cartId = requireUuid(parts[2], 'cartId');
        const idempotencyKey = requireIdempotencyKey(req.headers['idempotency-key']);
        const preflight = await repository.checkoutPreflight(clientUserId, cartId);
        if (!preflight.ready) {
          throw new HttpError(409, 'checkout_preflight_failed', 'Checkout preflight failed');
        }
        const order = await repository.attemptCheckout(clientUserId, cartId, idempotencyKey);
        return sendJson(res, 201, { order });
      }

      if (req.method === 'GET' && parts.length === 2 && parts[1] === 'orders') {
        return sendJson(res, 200, { orders: await repository.listOrders(clientUserId) });
      }

      if (req.method === 'GET' && parts.length === 3 && parts[1] === 'orders') {
        const orderId = requireUuid(parts[2], 'orderId');
        return sendJson(res, 200, { order: await repository.getOrder(clientUserId, orderId) });
      }

      throw new HttpError(404, 'not_found', 'not found');
    } catch (err) {
      if (err instanceof HttpError || Number.isInteger(err.statusCode)) {
        return sendJson(res, err.statusCode || 400, { error: err.code || 'invalid_request', message: err.message });
      }
      if (/insufficient stock|no stock record/i.test(String(err.message || ''))) {
        return sendJson(res, 409, { error: 'stock_conflict', message: 'Checkout stock changed; refresh the Cart and try again' });
      }
      console.error('Z Fashion customer commerce unexpected error:', err);
      return sendJson(res, 500, { error: 'internal_error', message: 'Customer commerce request could not be completed' });
    }
  });
}

function createProductionCustomerCommerceServer() {
  const pool = createPool();
  const repository = createPgCustomerCommerceRepository(pool);
  const server = createCustomerCommerceServer({ repository });
  return { server, pool };
}

if (require.main === module) {
  const { server } = createProductionCustomerCommerceServer();
  const port = Number(process.env.FASHION_CUSTOMER_PORT || 4011);
  server.listen(port, () => {
    console.log(`Z Fashion customer commerce API listening on :${port}; writes=${process.env.FASHION_ENABLE_CLIENT_COMMERCE_WRITES === 'true'}`);
  });
}

module.exports = {
  HttpError,
  authenticateWithSupabase,
  createPgCustomerCommerceRepository,
  createCustomerCommerceServer,
  createProductionCustomerCommerceServer,
};
