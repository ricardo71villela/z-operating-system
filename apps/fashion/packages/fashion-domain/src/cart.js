/* ============================================================
   Z FASHION — CART / CHECKOUT (bounded context: fashion-domain)
   ============================================================
   Owns: the unified multi-Partner Cart and the checkout reservation
   orchestration. Resolved as Fashion-owned, not a ZOS-shared
   primitive — see ZOS-ALIGNMENT.md "Resolved" for why (no second
   vertical needs a multi-seller cart yet).

   The single highest-risk decision in the whole project (Central
   Thesis, Z-FASHION-STRATEGY.md): the Client sees one cart and makes
   one payment; behind it, checkout must reserve stock across
   multiple Partners' inventories atomically. Reserving 3 of 4 items
   and leaving them held if the 4th fails is not acceptable — this
   module makes partial-reservation-on-failure structurally
   impossible, not just a documented risk.

   Depends only on stock.js (reservation primitives). Knows nothing
   about payment, shipping, or Partner settlement — those are Phase 2
   follow-on concerns, deliberately out of this module's scope.
   ============================================================ */

const { reserveStock, releaseReservation, sellableQuantity } = require('./stock');

function emptyCart() {
  return Object.freeze({ items: [] });
}

/**
 * @param {object} item - { productId, partnerId, quantity, unitPriceMinorUnits }
 */
function addItem(cart, item) {
  if (!item.productId || !item.partnerId) {
    throw new Error('addItem: productId and partnerId are required');
  }
  if (!(item.quantity > 0)) {
    throw new Error('addItem: quantity must be positive');
  }
  if (typeof item.unitPriceMinorUnits !== 'number' || item.unitPriceMinorUnits < 0) {
    throw new Error('addItem: unitPriceMinorUnits must be a non-negative number');
  }
  return Object.freeze({ items: [...cart.items, Object.freeze({ ...item })] });
}

function cartTotal(cart) {
  return cart.items.reduce((sum, i) => sum + i.unitPriceMinorUnits * i.quantity, 0);
}

/**
 * Groups the Cart's items by Partner — this is the data shape Corner-level
 * settlement and per-Partner order splitting both read from. A Client sees
 * one cart; a Partner only ever sees their own split.
 */
function partnerSplits(cart) {
  const splits = {};
  for (const item of cart.items) {
    if (!splits[item.partnerId]) splits[item.partnerId] = { partnerId: item.partnerId, items: [] };
    splits[item.partnerId].items.push(item);
  }
  for (const split of Object.values(splits)) {
    split.subtotalMinorUnits = split.items.reduce((sum, i) => sum + i.unitPriceMinorUnits * i.quantity, 0);
  }
  return splits;
}

/**
 * Attempts to reserve stock for every Cart line item, spanning however many
 * Partners the Cart touches. All-or-nothing: if any item cannot be
 * reserved, every reservation already made in this attempt is released
 * before returning — never leaves a partial hold across Partners.
 *
 * @param {object} cart
 * @param {Object.<string, object>} stockByProductId - productId -> Stock
 *   record (stock.js initStock()/applyStockUpdate() shape)
 * @param {object} [options] - passed through to stock.reserveStock
 *   (holdSeconds, now)
 * @returns {{ ok: true, stockByProductId: object, reservationsByProductId: object }
 *          | { ok: false, failedProductId: string, reason: string }}
 */
function attemptCheckoutReservation(cart, stockByProductId, options = {}) {
  const updatedStock = { ...stockByProductId };
  const reservations = {};
  const reservedSoFar = [];

  for (const item of cart.items) {
    const stock = updatedStock[item.productId];
    if (!stock) {
      rollback(updatedStock, reservedSoFar);
      return { ok: false, failedProductId: item.productId, reason: 'no stock record for this product' };
    }
    if (sellableQuantity(stock) < item.quantity) {
      rollback(updatedStock, reservedSoFar);
      return {
        ok: false,
        failedProductId: item.productId,
        reason: `insufficient stock — requested ${item.quantity}, ${sellableQuantity(stock)} sellable`,
      };
    }

    const { stock: newStock, reservation } = reserveStock(stock, item.quantity, options);
    updatedStock[item.productId] = newStock;
    reservations[item.productId] = reservation;
    reservedSoFar.push({ productId: item.productId, reservation });
  }

  return { ok: true, stockByProductId: updatedStock, reservationsByProductId: reservations };

  function rollback(stockMap, made) {
    for (const { productId, reservation } of made) {
      stockMap[productId] = releaseReservation(stockMap[productId], reservation);
    }
  }
}

module.exports = { emptyCart, addItem, cartTotal, partnerSplits, attemptCheckoutReservation };
