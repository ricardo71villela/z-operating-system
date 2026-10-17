/* ============================================================
   Z FASHION — CHECKOUT RULES (bounded context: fashion-domain)
   ============================================================
   The rules the API applies around the multi-store Cart and the
   pending-payment Order, shared by the in-memory API and mirrored by
   fashion.checkout_cart() in SQL
   (migration 20261016090000_z_fashion_checkout_v2.sql):

   - one line per product in a Cart, quantity 1..MAX_LINE_QUANTITY;
   - the Cart is priced with each product's CURRENT price, never the
     price seen when the item was added;
   - a line is buyable only if its store is active, the product has a
     price and enough sellable stock;
   - an Order is split into one ticket per store; the commission is
     computed on each ticket with the ticket tiers (commission.js);
   - delivery is included in the price for the launch
     (SHIPPING_FEE_MINOR_UNITS = 0) and shipping is limited to the
     configured countries (France by default);
   - the stock is held for PAYMENT_HOLD_SECONDS while the Client pays;
     after that an unpaid Order is cancelled and the stock released.

   Pure: no I/O, no clock unless passed in.
   ============================================================ */

const { ticketCommissionRatePercent, ticketCommissionOwedMinorUnits } = require('./commission');
const { isApproved } = require('./moderation');

const MAX_LINE_QUANTITY = 10;
const SHIPPING_FEE_MINOR_UNITS = 0;
const PAYMENT_HOLD_SECONDS = 30 * 60;
const DEFAULT_SHIPPING_COUNTRIES = Object.freeze(['FR']);

const LINE_STATUSES = Object.freeze({
  OK: 'ok',
  UNAVAILABLE: 'unavailable', // store not active or product gone
  NO_PRICE: 'no_price',
  INSUFFICIENT_STOCK: 'insufficient_stock',
});

/** Quantity for a Cart line. 0 means "remove". Returns an error string or null. */
function lineQuantityError(quantity) {
  if (!Number.isInteger(quantity)) return 'quantity must be an integer';
  if (quantity < 0) return 'quantity must be zero or positive';
  if (quantity > MAX_LINE_QUANTITY) return `quantity must be at most ${MAX_LINE_QUANTITY}`;
  return null;
}

/** Countries a Client may ship to, from a comma-separated env value. */
function parseShippingCountries(value) {
  const list = String(value || '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
  return list.length ? Object.freeze([...new Set(list)]) : DEFAULT_SHIPPING_COUNTRIES;
}

/**
 * Frozen shipping address copied onto the Order, so a later edit of
 * the Client's address book never changes where a paid Order goes.
 */
function shippingAddressSnapshot(address, allowedCountries = DEFAULT_SHIPPING_COUNTRIES) {
  if (!address) throw new Error('shippingAddressSnapshot: address is required');
  if (address.type !== 'shipping') throw new Error('shippingAddressSnapshot: address must be a shipping address');
  if (!allowedCountries.includes(address.countryIso)) {
    const err = new Error(`shipping_country_not_served: ${address.countryIso}`);
    err.code = 'shipping_country_not_served';
    throw err;
  }
  return Object.freeze({
    recipientName: address.recipientName || null,
    line1: address.line1,
    line2: address.line2 || null,
    postalCode: address.postalCode,
    city: address.city,
    countryIso: address.countryIso,
  });
}

/**
 * Prices and checks every Cart line against the current catalogue.
 *
 * @param {object} args
 * @param {{productId:string, quantity:number}[]} args.items
 * @param {Object.<string, object>} args.productsById   product.js shape (needs partnerId)
 * @param {Object.<string, number|null>} args.pricesById current price, minor units
 * @param {Object.<string, object>} args.stockById      stock.js shape
 * @param {Set<string>|string[]} args.activePartnerIds
 * @returns {{ lines: object[], tickets: object[], subtotalMinorUnits: number,
 *             shippingMinorUnits: number, totalMinorUnits: number,
 *             itemCount: number, canCheckout: boolean }}
 */
function priceCart({ items, productsById, pricesById, stockById, activePartnerIds }) {
  const active = activePartnerIds instanceof Set ? activePartnerIds : new Set(activePartnerIds || []);
  const lines = (items || []).map((item) => {
    const product = productsById[item.productId] || null;
    const partnerId = product ? product.partnerId : item.partnerId || null;
    const price = pricesById[item.productId];
    const stock = stockById[item.productId];
    const sellable = stock ? Math.max(0, stock.quantityAvailable - stock.quantityReserved) : 0;

    let status = LINE_STATUSES.OK;
    if (!product || !active.has(partnerId) || !isApproved(product)) status = LINE_STATUSES.UNAVAILABLE;
    else if (price === null || price === undefined) status = LINE_STATUSES.NO_PRICE;
    else if (sellable < item.quantity) status = LINE_STATUSES.INSUFFICIENT_STOCK;

    const unitPriceMinorUnits = typeof price === 'number' ? price : null;
    return Object.freeze({
      productId: item.productId,
      partnerId,
      quantity: item.quantity,
      unitPriceMinorUnits,
      lineTotalMinorUnits: unitPriceMinorUnits === null ? 0 : unitPriceMinorUnits * item.quantity,
      sellableQuantity: sellable,
      status,
    });
  });

  const buyable = lines.filter((l) => l.status === LINE_STATUSES.OK);
  const tickets = ticketsFor(buyable);
  const subtotalMinorUnits = buyable.reduce((sum, l) => sum + l.lineTotalMinorUnits, 0);
  const shippingMinorUnits = buyable.length ? SHIPPING_FEE_MINOR_UNITS : 0;

  return Object.freeze({
    lines: Object.freeze(lines),
    tickets,
    subtotalMinorUnits,
    shippingMinorUnits,
    totalMinorUnits: subtotalMinorUnits + shippingMinorUnits,
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    canCheckout: lines.length > 0 && lines.every((l) => l.status === LINE_STATUSES.OK),
  });
}

/**
 * One ticket per store: what the store sells in this Order, and the
 * commission Z Fashion takes on it (rate chosen by the ticket amount).
 */
function ticketsFor(lines) {
  const byPartner = new Map();
  for (const line of lines) {
    const t = byPartner.get(line.partnerId) || { partnerId: line.partnerId, subtotalMinorUnits: 0, itemCount: 0 };
    t.subtotalMinorUnits += line.lineTotalMinorUnits;
    t.itemCount += line.quantity;
    byPartner.set(line.partnerId, t);
  }
  return Object.freeze([...byPartner.values()].map((t) => Object.freeze({
    ...t,
    commissionRatePercent: ticketCommissionRatePercent(t.subtotalMinorUnits),
    commissionMinorUnits: ticketCommissionOwedMinorUnits(t.subtotalMinorUnits),
  })));
}

/** True when an unpaid Order's hold has run out and it should be cancelled. */
function isPaymentHoldExpired(order, now = new Date()) {
  if (!order || order.status !== 'pending_payment' || !order.paymentExpiresAt) return false;
  if (['processing', 'succeeded'].includes(order.paymentStatus)) return false;
  return new Date(order.paymentExpiresAt).getTime() <= now.getTime();
}

module.exports = {
  MAX_LINE_QUANTITY,
  SHIPPING_FEE_MINOR_UNITS,
  PAYMENT_HOLD_SECONDS,
  DEFAULT_SHIPPING_COUNTRIES,
  LINE_STATUSES,
  lineQuantityError,
  parseShippingCountries,
  shippingAddressSnapshot,
  priceCart,
  ticketsFor,
  isPaymentHoldExpired,
};
