/* ============================================================
   Z FASHION — RECOMMENDATIONS (bounded context: fashion-domain)
   ============================================================
   Owns: nothing stateful — pure query functions over the Product
   list, same discipline as corner.js. See FRAMES-AND-RECOMMENDATIONS.md
   for the full rationale behind the Product Page / All Sale asymmetry.
   ============================================================ */

const { allSale, corner } = require('./corner');

const DEFAULT_SAME_CORNER_THRESHOLD = 4;

function sharesCategory(a, b) {
  return a.categories.some((c) => b.categories.includes(c));
}

/**
 * Recommendations for a Product Page. Same-Corner by default (Partner
 * cross-sell); falls back to All Sale-style complementary matches,
 * clearly labeled, when the Corner doesn't have enough genuinely
 * related products — never silently, never mislabeled as same-store.
 *
 * @returns {{ label: 'same_corner' | 'fallback', products: object[] }}
 */
function productPageRecommendations(
  products,
  product,
  { threshold = DEFAULT_SAME_CORNER_THRESHOLD } = {}
) {
  const sameCorner = corner(products, product.partnerId)
    .filter((p) => p.id !== product.id && sharesCategory(p, product));

  if (sameCorner.length >= threshold) {
    return { label: 'same_corner', products: sameCorner };
  }

  const fallback = allSale(products)
    .filter((p) => p.id !== product.id && sharesCategory(p, product));

  return { label: 'fallback', products: fallback };
}

/**
 * Recommendations for the All Sale page: complementary/similar products
 * across Partners, genuine-Category-match only (never resemblance-based
 * — see DOMAIN-SKETCH.md's Sportswear correction, which applies here too).
 */
function allSaleRecommendations(products, product) {
  return allSale(products).filter(
    (p) => p.id !== product.id && sharesCategory(p, product)
  );
}

module.exports = {
  DEFAULT_SAME_CORNER_THRESHOLD,
  productPageRecommendations,
  allSaleRecommendations,
};
