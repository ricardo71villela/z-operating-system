/* ============================================================
   Z FASHION — BRAND (bounded context: fashion-domain)
   ============================================================
   Owns: the Brand entity and the mono/multi-brand PROFILE derivation
   for a Partner. Brand is never Partner (DOMAIN-SKETCH.md) — a
   Partner's own house label is still just a Brand record, referenced
   by its Products like any other. Whether a Partner "is" mono-brand
   or multi-brand is never stored anywhere; it is computed from which
   distinct Brands actually appear across that Partner's Product
   catalog, the same way Corner/All Sale are computed views, not
   stored copies (corner.js).
   ============================================================ */

/**
 * @param {object} input
 * @param {string} input.id
 * @param {string} input.name
 * @param {string} [input.houseLabelOfPartnerId] - set only when this Brand
 *   IS a Partner's own house label. One-directional: the Brand may point
 *   back at the Partner it belongs to; the Partner never points at a
 *   Brand (that would recreate the exact Partner-owns-Brand mistake
 *   already corrected once in this project).
 */
function createBrand(input) {
  const errors = [];
  if (!input || typeof input !== 'object') {
    throw new Error('createBrand: input must be an object');
  }
  if (!input.id) errors.push('id is required');
  if (!input.name) errors.push('name is required');

  if (errors.length > 0) {
    throw new Error(`createBrand: invalid Brand —\n  ${errors.join('\n  ')}`);
  }

  return Object.freeze({
    id: input.id,
    name: input.name,
    houseLabelOfPartnerId: input.houseLabelOfPartnerId || null,
  });
}

/**
 * Derives a Partner's Brand profile from its actual catalog — never read
 * from a stored field. 'mono' if every Product references the same single
 * Brand, 'multi' otherwise, 'none' if the Partner has no Products yet.
 *
 * @param {object[]} products
 * @param {string} partnerId
 * @returns {{ type: 'mono' | 'multi' | 'none', brandIds: string[] }}
 */
function partnerBrandProfile(products, partnerId) {
  const brandIds = [...new Set(
    products.filter((p) => p.partnerId === partnerId).map((p) => p.brandId)
  )];

  if (brandIds.length === 0) return { type: 'none', brandIds };
  if (brandIds.length === 1) return { type: 'mono', brandIds };
  return { type: 'multi', brandIds };
}

module.exports = { createBrand, partnerBrandProfile };
