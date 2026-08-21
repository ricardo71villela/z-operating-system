/* ============================================================
   Z FASHION — PRODUCT (bounded context: fashion-domain)
   ============================================================
   Owns: the Product entity — the unit that actually carries
   Category (multi-valued), Brand (single reference), Age Segment
   (multi-valued), and a Category-conditional size/format attribute.
   Belongs to exactly one Partner (the stock owner). See
   DOMAIN-SKETCH.md for the full rationale behind every invariant
   enforced below — this file makes those invariants impossible to
   bypass at runtime, not just documented.

   Depends on partner.js only for the shared CATEGORIES/AGE_SEGMENTS
   vocabulary, never for Partner-instance data — Product validates
   itself against the taxonomy, not against a specific Partner's
   declared eligibility (that cross-check is a Corner/catalog-
   ingestion concern, not this module's).
   ============================================================ */

const { CATEGORIES, AGE_SEGMENTS } = require('./partner');

/* Categories that carry a genuine size dimension at all. Cosmetics
   uses `format`, not `size` — a different concept, not a point on the
   same scale (DOMAIN-SKETCH.md). Accessories & Leather Goods is
   deliberately absent here: most items in that Category (bags,
   wallets) carry no size dimension; the subset that does (belts,
   gloves) is a future refinement, not assumed by default. */
const SIZED_CATEGORIES = Object.freeze(['clothing', 'footwear', 'sportswear']);

/**
 * Creates a Product record. Throws on any violation of the invariants
 * resolved in DOMAIN-SKETCH.md.
 *
 * @param {object} input
 * @param {string} input.id
 * @param {string} input.partnerId
 * @param {string} input.brandId          - always a Brand reference, even
 *                                           for a Partner's own house label
 *                                           (that label is still a Brand)
 * @param {string[]} input.categories     - multi-valued; if it includes
 *                                           'sportswear', input.technicalPurpose
 *                                           must be true — Sportswear is
 *                                           never assigned by resemblance
 * @param {boolean} [input.technicalPurpose] - required truthy iff
 *                                           categories includes 'sportswear'
 * @param {string[]} input.ageSegments    - multi-valued; if it includes
 *                                           'children' or 'youth',
 *                                           input.safetyCertifications must
 *                                           be a non-empty array — never
 *                                           inferred from size/appearance
 * @param {string[]} [input.safetyCertifications]
 * @param {object} [input.size]           - required iff categories
 *                                           intersects SIZED_CATEGORIES;
 *                                           forbidden for 'cosmetics'
 *                                           (use input.format instead)
 * @param {object} [input.format]         - Cosmetics-only: { volumeMl,
 *                                           shade } — a different concept
 *                                           from size, not interchangeable
 * @param {boolean} [input.cornerExclusive] - defaults false; opt-out of
 *                                           All Sale, never opt-in
 *                                           (DOMAIN-SKETCH.md "Resolved")
 */
function createProduct(input) {
  const errors = [];

  if (!input || typeof input !== 'object') {
    throw new Error('createProduct: input must be an object');
  }
  if (!input.id) errors.push('id is required');
  if (!input.partnerId) errors.push('partnerId is required');
  if (!input.title || !input.title.trim()) {
    errors.push('title is required — every discoverable Product must carry a stable human-readable title.');
  }
  if (!input.brandId) {
    errors.push(
      'brandId is required — even a Partner\'s own house label is a Brand, ' +
      'never a null/omitted field (see DOMAIN-SKETCH.md Partner-vs-Brand)'
    );
  }

  if (!Array.isArray(input.categories) || input.categories.length === 0) {
    errors.push('categories must be a non-empty array (multi-valued)');
  } else {
    const invalid = input.categories.filter((c) => !CATEGORIES.includes(c));
    if (invalid.length > 0) errors.push(`unknown categories: ${invalid.join(', ')}`);

    if (input.categories.includes('sportswear') && !input.technicalPurpose) {
      errors.push(
        'categories includes "sportswear" but technicalPurpose is not true — ' +
        'Sportswear requires genuine athletic/technical purpose, never ' +
        'aesthetic resemblance (a casual sneaker that merely looks athletic ' +
        'is Footwear only). See DOMAIN-SKETCH.md.'
      );
    }
  }

  const ageSegments = input.ageSegments || ['adults'];
  const invalidSegments = ageSegments.filter((s) => !AGE_SEGMENTS.includes(s));
  if (invalidSegments.length > 0) errors.push(`unknown ageSegments: ${invalidSegments.join(', ')}`);

  const needsCertification = ageSegments.includes('children') || ageSegments.includes('youth');
  if (needsCertification && (!Array.isArray(input.safetyCertifications) || input.safetyCertifications.length === 0)) {
    errors.push(
      'ageSegments includes children/youth but safetyCertifications is ' +
      'empty — Children/Youth eligibility is never inferred from size or ' +
      'appearance alone (see DOMAIN-SKETCH.md Age Segment).'
    );
  }

  const categories = Array.isArray(input.categories) ? input.categories : [];
  const isSized = categories.some((c) => SIZED_CATEGORIES.includes(c));
  const isCosmetics = categories.includes('cosmetics');

  if (isCosmetics && input.size) {
    errors.push('Cosmetics carries `format` (volume/shade), never `size` — do not set both.');
  }
  if (isSized && !input.size) {
    errors.push(`categories ${JSON.stringify(categories)} require a \`size\` (Category-conditional — see DOMAIN-SKETCH.md).`);
  }
  if (isCosmetics && !input.format) {
    errors.push('categories includes "cosmetics" but `format` (e.g. { volumeMl } or { shade }) is missing.');
  }

  if (errors.length > 0) {
    throw new Error(`createProduct: invalid Product —\n  ${errors.join('\n  ')}`);
  }

  return Object.freeze({
    id: input.id,
    partnerId: input.partnerId,
    brandId: input.brandId,
    title: input.title.trim(),
    shortDescription: input.shortDescription ? input.shortDescription.trim() : '',
    categories: [...categories],
    technicalPurpose: !!input.technicalPurpose,
    ageSegments: [...ageSegments],
    safetyCertifications: [...(input.safetyCertifications || [])],
    size: input.size ? { ...input.size } : null,
    format: input.format ? { ...input.format } : null,
    // Opt-out, not opt-in — a published Product is in All Sale by default.
    cornerExclusive: !!input.cornerExclusive,
    campaignIds: [...(input.campaignIds || [])],
  });
}

/** True if the Product is visible in the cross-Partner All Sale view. */
function isInAllSale(product) {
  return !product.cornerExclusive;
}

/**
 * Return eligibility per DOMAIN-SKETCH.md's Cosmetics exception
 * (EU CRD Article 16(e), hygiene-sealed goods once unsealed).
 * Every other Category in the initial catalog has no such exemption.
 */
function isReturnEligible(product, { sealBroken = false } = {}) {
  if (product.categories.includes('cosmetics') && sealBroken) return false;
  return true;
}

module.exports = {
  SIZED_CATEGORIES,
  createProduct,
  isInAllSale,
  isReturnEligible,
};
