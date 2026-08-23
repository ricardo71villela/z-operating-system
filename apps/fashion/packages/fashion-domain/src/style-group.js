/* ============================================================
   Z FASHION — STYLE GROUP (bounded context: fashion-domain)
   ============================================================
   Owns: grouping the size variants of "the same style" (a Product row
   is one size, per DOMAIN-SKETCH.md's Product entity — a genuine
   architectural gap flagged twice during the customer-side audit,
   2026-08-21: the Product Page size-selector prototype assumed
   multiple sizes lived under one product, which the domain did not
   actually support). Nothing here changes that Product-is-one-size
   shape — it adds a way to say "these N Products are the same style,
   different sizes" on top of it, via the optional `styleId` field
   (product.js).

   Deliberately nothing stateful, same discipline as corner.js and
   recommendations.js — pure query/validation functions over the
   existing Product list, grouped by `styleId`.
   ============================================================ */

const { stockAvailabilityLabel } = require('./stock');

/**
 * Fields that must be identical across every Product sharing a
 * styleId — everything that defines "the same style," as opposed to
 * `size` and stock, which are exactly what's allowed (expected) to
 * differ between variants. `names.fr` is compared as the France-first
 * canonical name (product.js REQUIRED_NAME_LOCALE) — a style's other
 * locale translations could in principle lag behind on one variant
 * without that being a real inconsistency, so only `fr` is checked.
 */
function styleIdentityFingerprint(product) {
  return JSON.stringify({
    partnerId: product.partnerId,
    brandId: product.brandId,
    gender: product.gender,
    categories: [...product.categories].sort(),
    frName: product.names.fr,
  });
}

/**
 * Groups Products by styleId. Products with no styleId are excluded
 * entirely — they are standalone, not part of any style group, never
 * silently bucketed under a fabricated key.
 *
 * @param {object[]} products
 * @returns {Object.<string, object[]>} styleId -> Products sharing it
 */
function groupByStyle(products) {
  const groups = {};
  for (const p of products) {
    if (!p.styleId) continue;
    if (!groups[p.styleId]) groups[p.styleId] = [];
    groups[p.styleId].push(p);
  }
  return groups;
}

/**
 * Validates that every Product sharing a styleId genuinely is the same
 * style — same Partner, Brand, Gender, Categories, and France-first
 * name — only `size` (and, by extension, stock/availability) may
 * differ. Throws with every offending styleId listed at once, never
 * stopping at the first one found, so a catalog-wide data-quality pass
 * gets the full picture in one run rather than one error per fix.
 *
 * @param {object[]} products
 * @returns {true} if every group is internally consistent
 */
function validateStyleGroups(products) {
  const groups = groupByStyle(products);
  const errors = [];

  for (const [styleId, groupProducts] of Object.entries(groups)) {
    const fingerprints = new Set(groupProducts.map(styleIdentityFingerprint));
    if (fingerprints.size > 1) {
      errors.push(
        `styleId "${styleId}": Products ${groupProducts.map((p) => p.id).join(', ')} disagree on ` +
        'Partner/Brand/Gender/Categories/name — a style group may only differ by size.'
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`validateStyleGroups: inconsistent style group(s) —\n  ${errors.join('\n  ')}`);
  }

  return true;
}

/**
 * Assembles the view model a Product Page's size-selector needs: the
 * shared style identity once, plus each size variant with its own
 * availability — the piece that was missing when the Product Page
 * prototype first assumed a size-picker without this data existing.
 *
 * @param {object} args
 * @param {string} args.styleId
 * @param {object[]} args.products - every Product sharing this styleId
 *   (caller's responsibility to pre-filter via groupByStyle — this
 *   function does not search the full catalog itself)
 * @param {Object.<string,object>} args.stockByProductId
 * @throws if the group is internally inconsistent (validateStyleGroups)
 */
function buildStyleGroupViewModel({ styleId, products, stockByProductId }) {
  if (!products || products.length === 0) {
    throw new Error('buildStyleGroupViewModel: products must be a non-empty array');
  }
  validateStyleGroups(products);

  const [first] = products;

  const variants = products
    .map((p) => {
      const stock = stockByProductId[p.id];
      return Object.freeze({
        productId: p.id,
        size: p.size,
        availability: stock
          ? Object.freeze({ label: stockAvailabilityLabel(stock), sellable: stockAvailabilityLabel(stock) !== 'out_of_stock' })
          : Object.freeze({ label: 'out_of_stock', sellable: false }),
      });
    })
    // Never a fabricated order — sorted by size value when present, so
    // the size-selector reads left-to-right smallest-to-largest, the
    // one presentation decision worth making here since "catalog
    // order" would otherwise be arbitrary insertion order.
    .sort((a, b) => {
      const av = a.size ? a.size.value : null;
      const bv = b.size ? b.size.value : null;
      if (av === null || bv === null) return 0;
      return av < bv ? -1 : av > bv ? 1 : 0;
    });

  return Object.freeze({
    styleId,
    partnerId: first.partnerId,
    brandId: first.brandId,
    gender: first.gender,
    categories: first.categories,
    name: first.names.fr,
    variants,
  });
}

module.exports = {
  groupByStyle,
  validateStyleGroups,
  buildStyleGroupViewModel,
};
