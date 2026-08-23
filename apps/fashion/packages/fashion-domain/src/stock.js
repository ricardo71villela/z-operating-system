/* ============================================================
   Z FASHION — STOCK (bounded context: fashion-domain)
   ============================================================
   Owns: stock update ingestion (rejecting stale data) and checkout-
   time reservations (preventing oversell between Partner feed
   pushes). See STOCK-FEED-CONTRACT.md for the full rationale — this
   is the highest-churn-risk contract in Phase 1, per the competitive
   review's reading of Miinto's own onboarding friction.
   ============================================================ */

const DEFAULT_RESERVATION_HOLD_SECONDS = 600;

/* Second of three "Still open" items closed (2026-08-21,
   STOCK-FEED-CONTRACT.md "Degraded feed mode"): a Partner feeding stock
   less frequently than near-real-time carries a wider real-world gap
   between "what the feed says" and "what's actually on the shelf" — a
   checkout reservation for that Partner's Product needs a longer hold
   to stay meaningfully protective, not the same 10-minute window a
   live-feed Partner gets. 30 minutes, not a precise SLA-derived number
   — a deliberately generous multiple of the default, revisitable once
   real feed-latency data exists. */
const DEGRADED_RESERVATION_HOLD_SECONDS = 1800;

/**
 * Resolves the reservation hold duration for a checkout, based on the
 * owning Partner's feedReliabilityTier (onboarding.js). Never defaults
 * upward to the wider window for an unrecognized/missing tier — only
 * an explicit 'degraded' value gets the extended hold; anything else
 * (including 'live' or an unexpected value) gets the standard,
 * shorter one, which is the safer failure direction.
 *
 * @param {string} feedReliabilityTier - onboarding.js
 *   FEED_RELIABILITY_TIERS value ('live' | 'degraded')
 * @returns {number} hold duration in seconds, to pass as reserveStock()'s
 *   holdSeconds option
 */
function reservationHoldSecondsFor(feedReliabilityTier) {
  return feedReliabilityTier === 'degraded'
    ? DEGRADED_RESERVATION_HOLD_SECONDS
    : DEFAULT_RESERVATION_HOLD_SECONDS;
}

/**
 * @param {string} productId
 * @returns {object} an empty Stock record for a Product with no data yet.
 */
function initStock(productId) {
  return Object.freeze({
    productId,
    quantityAvailable: 0,
    quantityReserved: 0,
    lastUpdatedAt: null,
  });
}

/**
 * Applies a Partner-pushed stock update. A stale update (observedAt at or
 * before the currently applied timestamp) is rejected, never silently
 * overwritten — protects a fresher in-store sale from being undone by an
 * out-of-order delivery.
 *
 * @param {object} stock - current Stock record (initStock() shape)
 * @param {object} update - { quantityAvailable, observedAt (ISO string) }
 * @returns {object} the new Stock record
 */
function applyStockUpdate(stock, update) {
  if (typeof update.quantityAvailable !== 'number' || update.quantityAvailable < 0) {
    throw new Error('applyStockUpdate: quantityAvailable must be a non-negative number');
  }
  if (!update.observedAt) {
    throw new Error('applyStockUpdate: observedAt is required — every update must be timestamped');
  }
  if (stock.lastUpdatedAt && update.observedAt <= stock.lastUpdatedAt) {
    throw new Error(
      `applyStockUpdate: stale update rejected — observedAt (${update.observedAt}) ` +
      `is not newer than the currently applied timestamp (${stock.lastUpdatedAt})`
    );
  }

  return Object.freeze({
    ...stock,
    quantityAvailable: update.quantityAvailable,
    lastUpdatedAt: update.observedAt,
  });
}

/**
 * The units actually purchasable right now — total minus what's already
 * held by other in-progress checkouts.
 */
function sellableQuantity(stock) {
  return stock.quantityAvailable - stock.quantityReserved;
}

/**
 * Reserves units at checkout start. Fails (throws) rather than silently
 * clamping the quantity — a caller must handle "not enough stock" as a
 * real checkout-flow case, not have it masked into a smaller-than-requested
 * silent reservation.
 *
 * @returns {{ stock: object, reservation: object }}
 */
function reserveStock(
  stock,
  quantity,
  { holdSeconds = DEFAULT_RESERVATION_HOLD_SECONDS, now = new Date(), reservationId } = {}
) {
  if (quantity <= 0) throw new Error('reserveStock: quantity must be positive');
  if (sellableQuantity(stock) < quantity) {
    throw new Error(
      `reserveStock: insufficient stock — requested ${quantity}, ` +
      `${sellableQuantity(stock)} sellable`
    );
  }

  const expiresAt = new Date(now.getTime() + holdSeconds * 1000).toISOString();
  const reservation = Object.freeze({
    id: reservationId || `res_${stock.productId}_${now.getTime()}`,
    productId: stock.productId,
    quantity,
    expiresAt,
  });

  const newStock = Object.freeze({
    ...stock,
    quantityReserved: stock.quantityReserved + quantity,
  });

  return { stock: newStock, reservation };
}

/** Releases a reservation without a sale (expired hold or abandoned checkout). */
function releaseReservation(stock, reservation) {
  return Object.freeze({
    ...stock,
    quantityReserved: Math.max(0, stock.quantityReserved - reservation.quantity),
  });
}

/** Confirms a reservation as a completed sale — commits the deduction. */
function confirmReservation(stock, reservation) {
  return Object.freeze({
    ...stock,
    quantityAvailable: Math.max(0, stock.quantityAvailable - reservation.quantity),
    quantityReserved: Math.max(0, stock.quantityReserved - reservation.quantity),
  });
}

/** True if a reservation's hold window has passed and it should be released. */
function isExpired(reservation, now = new Date()) {
  return now.toISOString() > reservation.expiresAt;
}

/* Moved here from product-page.js (2026-08-21) to break a circular
   require once style-group.js needed the same label logic — stock
   display banding genuinely belongs with the rest of Stock, not with
   the Product Page specifically; product-page.js re-exports these for
   backward compatibility with existing callers/tests. */

const STOCK_LABELS = Object.freeze({
  OUT_OF_STOCK: 'out_of_stock',
  LOW_STOCK: 'low_stock',
  IN_STOCK: 'in_stock',
});

const LOW_STOCK_THRESHOLD = 5;

/**
 * Never a raw number shown to the Client without interpretation — a
 * sellable quantity of 1 and 47 both just mean "in stock" for browsing
 * purposes, but the low-stock band is worth surfacing explicitly since
 * it changes Client behavior (buy now vs. can wait), while an exact
 * "3 left" count would leak Partner inventory precision the Platform
 * has no reason to expose.
 *
 * @param {object} stock - initStock()/applyStockUpdate() shape
 * @returns {string} one of STOCK_LABELS
 */
function stockAvailabilityLabel(stock) {
  const sellable = sellableQuantity(stock);
  if (sellable <= 0) return STOCK_LABELS.OUT_OF_STOCK;
  if (sellable <= LOW_STOCK_THRESHOLD) return STOCK_LABELS.LOW_STOCK;
  return STOCK_LABELS.IN_STOCK;
}

module.exports = {
  DEFAULT_RESERVATION_HOLD_SECONDS,
  DEGRADED_RESERVATION_HOLD_SECONDS,
  reservationHoldSecondsFor,
  initStock,
  applyStockUpdate,
  sellableQuantity,
  reserveStock,
  releaseReservation,
  confirmReservation,
  isExpired,
  STOCK_LABELS,
  LOW_STOCK_THRESHOLD,
  stockAvailabilityLabel,
};
