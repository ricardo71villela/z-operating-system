/* ============================================================
   Z FASHION — CORNER / ALL SALE (bounded context: fashion-domain)
   ============================================================
   Owns: nothing stateful. Per DOMAIN-SKETCH.md, Corner and All Sale
   are two views over the same Product set, not two places a Partner
   uploads to separately — this module is deliberately just query
   functions over an in-memory Product list, never a second store.
   ============================================================ */

const { isInAllSale } = require('./product');
const { productsVisibleInMarket } = require('./market');

/** A Partner's Corner: every Product belonging to that Partner. */
function corner(products, partnerId) {
  return products.filter((p) => p.partnerId === partnerId);
}

/**
 * The cross-Partner All Sale view, filterable by Segment × Gender ×
 * Category × Size × Brand × Partner (all optional). Excludes
 * cornerExclusive Products — All Sale is comprehensive by default
 * (opt-out, not opt-in).
 */
function allSale(products, filter = {}) {
  return products.filter((p) => {
    if (!isInAllSale(p)) return false;
    if (filter.ageSegment && !p.ageSegments.includes(filter.ageSegment)) return false;
    if (filter.gender && p.gender !== filter.gender) return false;
    if (filter.category && !p.categories.includes(filter.category)) return false;
    // Size match is deliberately loose (value only, not system) — this
    // catalog has no cross-system size-grid translation yet
    // (MARKETS-AND-I18N.md flags the translation itself as needed, not
    // yet built); filtering on the raw value is honest about that gap
    // rather than pretending a translated match exists.
    if (filter.sizeValue !== undefined && (!p.size || p.size.value !== filter.sizeValue)) return false;
    if (filter.brandId && p.brandId !== filter.brandId) return false;
    if (filter.partnerId && p.partnerId !== filter.partnerId) return false;
    return true;
  });
}

/**
 * Market-scoped All Sale — composes productsVisibleInMarket() (market.js)
 * with allSale() above, so a caller building the actual All Sale page
 * makes one call instead of remembering to chain the two correctly
 * every time. Market scoping always runs first: a Product from a
 * Partner outside the requested Market is excluded before any of
 * allSale()'s own filters even see it, never the other way round
 * (filtering first by Segment/Gender/etc. and only then by Market
 * would give the same final set here, but scoping by Market first is
 * the cheaper filter and the one that can never be skipped by a
 * caller who forgets to pass it — baking in the order removes that
 * failure mode entirely).
 *
 * @param {object[]} products
 * @param {Object.<string,object>} partnersById
 * @param {string} marketCountryIso
 * @param {object} [filter] - same shape allSale() accepts
 */
function allSaleInMarket(products, partnersById, marketCountryIso, filter = {}) {
  return allSale(productsVisibleInMarket(products, partnersById, marketCountryIso), filter);
}

module.exports = { corner, allSale, allSaleInMarket };
