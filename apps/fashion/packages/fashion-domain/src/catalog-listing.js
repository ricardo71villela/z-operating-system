/* ============================================================
   Z FASHION — CATALOG LISTING CARD (bounded context: fashion-domain)
   ============================================================
   Owns: decorating a Product with the two signals a Client needs
   *before* opening it, identified in the customer-side audit
   (2026-08-21, point 2): whether it's actually buyable right now, and
   its size — without which a Client routinely opens products that
   turn out to be sold out or the wrong size, the single most avoidable
   source of browsing frustration in a size-driven catalog.

   Deliberately reuses stockAvailabilityLabel() from product-page.js
   rather than re-deriving a second "what does this stock level mean"
   rule — the grid card and the Product Page must always agree on what
   counts as low stock, since disagreeing here is worse than not
   showing it at all (a Client who sees "in stock" on the grid and
   "low stock" on the page immediately distrusts both).
   ============================================================ */

const { stockAvailabilityLabel } = require('./stock');

/**
 * @param {object} args
 * @param {object} args.product - product.js createProduct() shape
 * @param {object} args.stock - stock.js shape for this exact Product
 * @param {object} [args.brand] - brand.js createBrand() shape, or null
 */
const { productName } = require('./product');

/**
 * @param {object} args
 * @param {object} args.product - product.js createProduct() shape
 * @param {object} args.stock - stock.js shape for this exact Product
 * @param {object} [args.brand] - brand.js createBrand() shape, or null
 * @param {string} [args.locale] - passed through to productName(),
 *   defaults to REQUIRED_NAME_LOCALE ('fr') same as everywhere else
 */
function buildListingCard({ product, stock, brand, locale }) {
  if (!product) throw new Error('buildListingCard: product is required');
  if (!stock) throw new Error('buildListingCard: stock is required');

  return Object.freeze({
    productId: product.id,
    partnerId: product.partnerId,
    // Fixed 2026-08-21: a listing card had every filterable attribute
    // but no display name at all — impossible to render an actual
    // product grid without one. Reuses productName()'s own fr-fallback,
    // never a second name-resolution rule invented here.
    name: productName(product, locale),
    brandName: brand ? brand.name : null,
    categories: product.categories,
    gender: product.gender,
    ageSegments: product.ageSegments,
    // Exposed as-is (Category-conditional shape from product.js) so the
    // grid's size filter can match on it directly — never re-derived or
    // normalized here, this module decorates, it does not reinterpret.
    size: product.size,
    format: product.format,
    availability: Object.freeze({
      label: stockAvailabilityLabel(stock),
      sellable: stockAvailabilityLabel(stock) !== 'out_of_stock',
    }),
  });
}

/**
 * Decorates a whole listing (the output of allSale()/corner() from
 * corner.js) with stock/availability, keyed by productId. A Product
 * with no matching Stock record is treated as out_of_stock, never
 * silently hidden or assumed available — missing stock data is a
 * data-quality problem to surface, not a reason to guess.
 *
 * @param {object[]} products
 * @param {Object.<string, object>} stockByProductId
 * @param {Object.<string, object>} [brandsById]
 */
function buildListingCards(products, stockByProductId, brandsById = {}, locale) {
  return products.map((p) => {
    const stock = stockByProductId[p.id] || { productId: p.id, quantityAvailable: 0, quantityReserved: 0, lastUpdatedAt: null };
    return buildListingCard({ product: p, stock, brand: brandsById[p.brandId], locale });
  });
}

module.exports = { buildListingCard, buildListingCards };
