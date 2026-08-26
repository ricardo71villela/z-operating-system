/* ============================================================
   Z FASHION — CORNER PAGE VIEW MODEL (bounded context: fashion-domain)
   ============================================================
   Owns: assembling the data a Corner storefront page needs to
   render, from existing domain data — same bridging-function pattern
   Z Find already established in viewmodels.js (resolveAssetGeography),
   not a new architectural concept. Pure composition, no I/O, no new
   storage: everything here is derived from CornerConfig, Partner,
   Product and Brand records already defined elsewhere.
   ============================================================ */

const { corner } = require('./corner');
const { partnerBrandProfile } = require('./brand');

/**
 * @param {object} args
 * @param {object} args.cornerConfig - corner-config.js createCornerConfig() shape
 * @param {object[]} args.products - full Product list (corner() filters internally)
 * @param {Object.<string, object>} args.brandsById - brand.js createBrand()
 *   records, keyed by id — used to resolve each Product's brandId to a
 *   display name without duplicating Brand data onto Product itself.
 */
function buildCornerPageViewModel({ cornerConfig, products, brandsById }) {
  if (!cornerConfig) throw new Error('buildCornerPageViewModel: cornerConfig is required');

  const cornerProducts = corner(products, cornerConfig.partnerId);
  const brandProfile = partnerBrandProfile(products, cornerConfig.partnerId);

  const categories = [...new Set(cornerProducts.flatMap((p) => p.categories))].sort();

  const productCards = cornerProducts.map((p) => {
    const brand = brandsById[p.brandId];
    return Object.freeze({
      productId: p.id,
      categories: p.categories,
      brandName: brand ? brand.name : null,
      // cornerExclusive is deliberately NOT filtered out here — a Corner
      // shows everything the Partner has, including All-Sale-exclusive
      // drops; only the All Sale view excludes them (corner.js).
      cornerExclusive: p.cornerExclusive,
    });
  });

  return Object.freeze({
    header: {
      displayName: cornerConfig.displayName,
      byline: cornerConfig.byline,
      accentColor: cornerConfig.accentColor,
      logoUrl: cornerConfig.logoUrl,
    },
    brandProfile: brandProfile.type,
    categories,
    productCount: cornerProducts.length,
    products: productCards,
  });
}

module.exports = { buildCornerPageViewModel };
