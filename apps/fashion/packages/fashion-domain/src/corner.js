/* ============================================================
   Z FASHION — CORNER / ALL SALE (bounded context: fashion-domain)
   ============================================================
   Owns: nothing stateful. Per DOMAIN-SKETCH.md, Corner and All Sale
   are two views over the same Product set, not two places a Partner
   uploads to separately — this module is deliberately just query
   functions over an in-memory Product list, never a second store.
   ============================================================ */

const { isInAllSale } = require('./product');

/** A Partner's Corner: every Product belonging to that Partner. */
function corner(products, partnerId) {
  return products.filter((p) => p.partnerId === partnerId);
}

/**
 * The cross-Partner All Sale view, filterable by Segment × Gender ×
 * Category × Brand × Partner (all optional). Excludes cornerExclusive
 * Products — All Sale is comprehensive by default (opt-out, not opt-in).
 */
function allSale(products, filter = {}) {
  return products.filter((p) => {
    if (!isInAllSale(p)) return false;
    if (filter.ageSegment && !p.ageSegments.includes(filter.ageSegment)) return false;
    if (filter.gender && p.gender !== filter.gender) return false;
    if (filter.category && !p.categories.includes(filter.category)) return false;
    if (filter.brandId && p.brandId !== filter.brandId) return false;
    if (filter.partnerId && p.partnerId !== filter.partnerId) return false;
    return true;
  });
}

module.exports = { corner, allSale };
