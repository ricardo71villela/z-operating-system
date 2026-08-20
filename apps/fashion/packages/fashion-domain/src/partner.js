/* ============================================================
   Z FASHION — PARTNER (bounded context: 20-registry extension)
   ============================================================
   Owns: the Partner entity shape as it extends the shared ZOS
   Registry — a store/legal entity holding stock. Partner is NOT
   Brand (see DOMAIN-SKETCH.md): a Partner can be mono-brand or
   multi-brand, and never carries Category or Size — those live on
   Product (packages/fashion-domain/src/product.js, not yet built).

   This module has zero knowledge of Product, Corner, Campaign, or
   any other Fashion context beyond validating the Partner shape
   itself. It is consumed by them; it never consumes them — same
   discipline apps/find/packages/geography/geography.js already
   established for this codebase.

   Country/locale resolution is NOT reimplemented here. This module
   expects a countryId that resolves through the shared Geography
   package (apps/find/packages/geography) once promoted per the
   open question in ZOS-ALIGNMENT.md — until that promotion happens,
   callers must resolve countryId externally; this module only
   validates that one is present, never invents geography logic.
   ============================================================ */

const CATEGORIES = Object.freeze([
  'clothing',
  'footwear',
  'sportswear',
  'accessories_leather_goods',
  'cosmetics', // includes perfumes/fragrances — see DOMAIN-SKETCH.md
]);

const AGE_SEGMENTS = Object.freeze(['children', 'youth', 'adults']);

/**
 * Creates a Partner record. Throws on any violation of the invariants
 * already resolved in DOMAIN-SKETCH.md — this is a validating
 * constructor, not a passthrough object literal, precisely because
 * every invariant here was previously gotten wrong once in this
 * project's own design conversation (Category-on-Partner, then
 * Brand-on-Partner) and should not be re-learnable by a future
 * caller through a runtime bug.
 *
 * @param {object} input
 * @param {string} input.id
 * @param {string} input.legalName
 * @param {string} input.countryId       - resolved via shared Geography
 * @param {string[]} input.locales       - e.g. ['fr'], extensible per market
 * @param {string[]} input.categories    - subset of CATEGORIES this Partner
 *                                          operates in (taxonomy/eligibility
 *                                          only — NOT a constraint on what
 *                                          Category an individual Product
 *                                          carries beyond "must be one of
 *                                          these")
 * @param {string[]} [input.ageSegments] - subset of AGE_SEGMENTS this
 *                                          Partner is eligible to sell into;
 *                                          defaults to ['adults'] since
 *                                          Children/Youth eligibility is a
 *                                          deliberate opt-in gated by minor-
 *                                          safe compliance
 *                                          (160-legal-and-compliance/
 *                                          Z-FASHION-MINOR-SAFE-DATA.md),
 *                                          never a default.
 */
function createPartner(input) {
  const errors = [];

  if (!input || typeof input !== 'object') {
    throw new Error('createPartner: input must be an object');
  }
  if (!input.id) errors.push('id is required');
  if (!input.legalName) errors.push('legalName is required');
  if (!input.countryId) {
    errors.push('countryId is required (resolved via shared Geography)');
  }
  if (!Array.isArray(input.locales) || input.locales.length === 0) {
    errors.push('locales must be a non-empty array (e.g. ["fr"])');
  }
  if (!Array.isArray(input.categories) || input.categories.length === 0) {
    errors.push('categories must be a non-empty array — a Partner declares ' +
      'eligibility, it is never category-less');
  } else {
    const invalid = input.categories.filter((c) => !CATEGORIES.includes(c));
    if (invalid.length > 0) {
      errors.push(`unknown categories: ${invalid.join(', ')}`);
    }
  }

  const ageSegments = input.ageSegments || ['adults'];
  const invalidSegments = ageSegments.filter((s) => !AGE_SEGMENTS.includes(s));
  if (invalidSegments.length > 0) {
    errors.push(`unknown ageSegments: ${invalidSegments.join(', ')}`);
  }
  if (
    (ageSegments.includes('children') || ageSegments.includes('youth')) &&
    !input.minorSafeDataAcknowledged
  ) {
    errors.push(
      'Partner declares children/youth eligibility but has not ' +
      'acknowledged the minor-safe data policy ' +
      '(160-legal-and-compliance/Z-FASHION-MINOR-SAFE-DATA.md) — this is ' +
      'a compliance gate, not a formality, and must not be bypassable by ' +
      'omitting the flag.'
    );
  }

  if (errors.length > 0) {
    throw new Error(`createPartner: invalid Partner —\n  ${errors.join('\n  ')}`);
  }

  return Object.freeze({
    id: input.id,
    legalName: input.legalName,
    countryId: input.countryId,
    locales: [...input.locales],
    categories: [...input.categories],
    ageSegments: [...ageSegments],
    minorSafeDataAcknowledged: !!input.minorSafeDataAcknowledged,
    // Brand relationship is deliberately NOT modeled here. A Partner's
    // mono-brand/multi-brand nature is derived from which Brands its
    // Products reference (see product.js, not yet built) — never stored
    // as a Partner-level flag, or it would re-create the exact
    // Category-on-Partner mistake one level up.
  });
}

/** True if every Category the Partner declares is a recognized Category. */
function isCategoryEligible(partner, category) {
  return partner.categories.includes(category);
}

/** True if the Partner may sell into the given Age Segment. */
function isAgeSegmentEligible(partner, ageSegment) {
  return partner.ageSegments.includes(ageSegment);
}

module.exports = {
  CATEGORIES,
  AGE_SEGMENTS,
  createPartner,
  isCategoryEligible,
  isAgeSegmentEligible,
};
