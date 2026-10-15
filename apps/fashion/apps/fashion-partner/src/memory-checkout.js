/* ============================================================
   Z FASHION PARTNER — in-memory Cart / checkout / orders
   ============================================================
   Same behaviour as fashion.set_cart_item() / checkout_cart() /
   cancel_unpaid_order() / expire_pending_orders() (migration
   20261016090000_z_fashion_checkout_v2.sql), on the server's in-memory
   state. Used without DATABASE_URL (local development, tests/api.test.js).
   Errors carry the same .code keys as db.js checkoutError().
   ============================================================ */

const crypto = require('crypto');
const { initStock, reserveStock, releaseReservation } = require('../../../packages/fashion-domain/src/stock');
const priceHistory = require('../../../packages/fashion-domain/src/price-history');
const checkout = require('../../../packages/fashion-domain/src/checkout');
const addressDomain = require('../../../packages/fashion-domain/src/address');

function fail(code, extra = {}) {
  const err = new Error(code);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function ensureState(memory) {
  if (!memory.carts) memory.carts = new Map();   // clientId -> { id, clientUserId, items: Map(productId -> line) }
  if (!memory.orders) memory.orders = new Map(); // orderId -> order (+ _reservations, _cartId)
}

function currentPrice(memory, productId) {
  return priceHistory.currentPrice(memory.priceHistoryByProductId.get(productId) || priceHistory.emptyHistory());
}

function sellable(memory, productId) {
  const s = memory.stockByProductId.get(productId) || initStock(productId);
  return s.quantityAvailable - s.quantityReserved;
}

function openCart(memory, clientUserId) {
  ensureState(memory);
  let cart = memory.carts.get(clientUserId);
  if (!cart) {
    cart = { id: crypto.randomUUID(), clientUserId, items: new Map() };
    memory.carts.set(clientUserId, cart);
  }
  return cart;
}

function releaseOrder(memory, order) {
  for (const r of order._reservations) {
    const stock = memory.stockByProductId.get(r.productId) || initStock(r.productId);
    memory.stockByProductId.set(r.productId, releaseReservation(stock, r));
  }
  order._reservations = [];
  order.status = 'cancelled';
}

function cancelUnpaidOrder(memory, orderId) {
  ensureState(memory);
  const order = memory.orders.get(orderId);
  if (!order) throw fail('order_not_found');
  if (order.status === 'cancelled') return order;
  if (order.status !== 'pending_payment') throw fail('order_not_cancellable', { detail: order.status });
  if (['processing', 'succeeded'].includes(order.paymentStatus)) throw fail('payment_in_progress');
  releaseOrder(memory, order);
  return order;
}

function expirePendingOrders(memory, now = new Date()) {
  ensureState(memory);
  let n = 0;
  for (const order of memory.orders.values()) {
    if (checkout.isPaymentHoldExpired(order, now)) { releaseOrder(memory, order); n += 1; }
  }
  return n;
}

function cancelCartPendingOrders(memory, cart) {
  for (const order of memory.orders.values()) {
    if (order._cartId === cart.id && order.status === 'pending_payment') cancelUnpaidOrder(memory, order.id);
  }
}

function setCartItem(memory, { clientUserId, productId, quantity, activePartnerIds }) {
  if (checkout.lineQuantityError(quantity)) throw fail('invalid_quantity');
  const cart = openCart(memory, clientUserId);
  cancelCartPendingOrders(memory, cart);
  if (quantity === 0) { cart.items.delete(productId); return cart; }

  const product = memory.products.get(productId);
  if (!product || !activePartnerIds.has(product.partnerId) || currentPrice(memory, productId) === null) {
    throw fail('product_unavailable', { productId });
  }
  const available = sellable(memory, productId);
  if (available < quantity) throw fail('insufficient_stock', { productId, sellable: Math.max(0, available) });
  cart.items.set(productId, { productId, partnerId: product.partnerId, quantity });
  return cart;
}

function getOpenCart(memory, clientUserId) {
  ensureState(memory);
  const cart = memory.carts.get(clientUserId);
  if (!cart) return { cartId: null, items: [], pendingOrderId: null };
  const pending = [...memory.orders.values()].find((o) => o._cartId === cart.id && o.status === 'pending_payment');
  return { cartId: cart.id, items: [...cart.items.values()].map((i) => ({ ...i })), pendingOrderId: pending ? pending.id : null };
}

function checkoutCart(memory, { clientUserId, addressId, allowedCountries, holdSeconds, activePartnerIds, now = new Date() }) {
  ensureState(memory);
  expirePendingOrders(memory, now);
  const cart = memory.carts.get(clientUserId);
  if (!cart || cart.items.size === 0) throw fail('empty_cart');

  const address = addressDomain.listAddressesForClient(memory.addressBook, clientUserId)
    .find((a) => a.id === addressId && a.type === 'shipping');
  if (!address) throw fail('address_not_found');
  if (!allowedCountries.includes(address.countryIso)) throw fail('shipping_country_not_served', { detail: address.countryIso });

  // Validate everything before touching stock (the SQL version gets this from the transaction).
  const previous = [...memory.orders.values()].filter((o) => o._cartId === cart.id && o.status === 'pending_payment');
  for (const o of previous) {
    if (['processing', 'succeeded'].includes(o.paymentStatus)) throw fail('payment_in_progress');
  }
  const lines = [...cart.items.values()].sort((a, b) => (a.productId < b.productId ? -1 : 1));
  const heldByPrevious = (productId) => previous.reduce(
    (sum, o) => sum + o._reservations.filter((r) => r.productId === productId).reduce((s, r) => s + r.quantity, 0), 0);
  const priced = [];
  for (const line of lines) {
    const product = memory.products.get(line.productId);
    const price = currentPrice(memory, line.productId);
    if (!product || !activePartnerIds.has(product.partnerId) || price === null) {
      throw fail('product_unavailable', { productId: line.productId });
    }
    const available = sellable(memory, line.productId) + heldByPrevious(line.productId);
    if (available < line.quantity) throw fail('insufficient_stock', { productId: line.productId, sellable: Math.max(0, available) });
    priced.push({ ...line, partnerId: product.partnerId, unitPriceMinorUnits: price, lineTotalMinorUnits: price * line.quantity });
  }

  for (const o of previous) releaseOrder(memory, o);

  const reservations = [];
  for (const line of priced) {
    const stock = memory.stockByProductId.get(line.productId) || initStock(line.productId);
    const { stock: next, reservation } = reserveStock(stock, line.quantity, { holdSeconds, now, reservationId: crypto.randomUUID() });
    memory.stockByProductId.set(line.productId, next);
    reservations.push({ ...reservation, productId: line.productId, quantity: line.quantity });
  }

  const tickets = checkout.ticketsFor(priced).map((t) => ({ ...t }));
  const subtotal = priced.reduce((sum, l) => sum + l.lineTotalMinorUnits, 0);
  const order = {
    id: crypto.randomUUID(),
    clientUserId,
    status: 'pending_payment',
    paymentStatus: 'requires_payment_method',
    currency: 'eur',
    subtotalMinorUnits: subtotal,
    shippingMinorUnits: checkout.SHIPPING_FEE_MINOR_UNITS,
    totalMinorUnits: subtotal + checkout.SHIPPING_FEE_MINOR_UNITS,
    refundedMinorUnits: 0,
    shippingAddress: { ...checkout.shippingAddressSnapshot(address, allowedCountries) },
    paymentExpiresAt: new Date(now.getTime() + holdSeconds * 1000).toISOString(),
    createdAt: now.toISOString(),
    items: priced.map((l) => ({
      productId: l.productId, partnerId: l.partnerId, quantity: l.quantity,
      unitPriceMinorUnits: l.unitPriceMinorUnits, lineTotalMinorUnits: l.lineTotalMinorUnits,
    })),
    tickets,
    shipments: [],
    _cartId: cart.id,
    _reservations: reservations,
  };
  memory.orders.set(order.id, order);
  return order.id;
}

const SOLD_STATUSES = ['paid', 'fulfilling', 'fulfilled', 'partially_refunded', 'refunded'];

function publicOrder(order) {
  if (!order) return null;
  const { _cartId, _reservations, ...rest } = order;
  return JSON.parse(JSON.stringify(rest));
}

function getOrder(memory, orderId) {
  ensureState(memory);
  return publicOrder(memory.orders.get(orderId));
}

function listOrdersForClient(memory, clientUserId) {
  ensureState(memory);
  return [...memory.orders.values()]
    .filter((o) => o.clientUserId === clientUserId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(publicOrder);
}

function listOrdersForPartner(memory, partnerId) {
  ensureState(memory);
  return [...memory.orders.values()]
    .filter((o) => SOLD_STATUSES.includes(o.status) && o.tickets.some((t) => t.partnerId === partnerId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((o) => {
      const view = publicOrder(o);
      view.items = view.items.filter((i) => i.partnerId === partnerId);
      view.tickets = view.tickets.filter((t) => t.partnerId === partnerId);
      view.shipments = view.shipments.filter((s) => s.partnerId === partnerId);
      return view;
    });
}

function partnerSalesSince(memory, partnerId, since) {
  ensureState(memory);
  let gmv = 0; let commission = 0; let count = 0;
  for (const o of memory.orders.values()) {
    if (!SOLD_STATUSES.includes(o.status) || new Date(o.createdAt) < since) continue;
    for (const t of o.tickets) {
      if (t.partnerId !== partnerId) continue;
      gmv += t.subtotalMinorUnits; commission += t.commissionMinorUnits; count += 1;
    }
  }
  return { gmvMinorUnits: gmv, commissionMinorUnits: commission, ticketCount: count };
}

module.exports = {
  setCartItem, getOpenCart, checkoutCart, cancelUnpaidOrder, expirePendingOrders,
  getOrder, listOrdersForClient, listOrdersForPartner, partnerSalesSince,
};
