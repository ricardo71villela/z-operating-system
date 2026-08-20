/* Plain Node assertions — no test framework dependency yet, mirrors the
   lightweight style of the rest of this pre-implementation package. Run
   with: node apps/fashion/packages/fashion-domain/tests/partner.test.js */

const assert = require('assert');
const { createPartner, isCategoryEligible, isAgeSegmentEligible } =
  require('../src/partner');

// A valid multi-brand, multi-category boutique Partner (the priority
// Sportswear/Accessories tier per Z-FASHION-COMPETITIVE-LANDSCAPE.md).
const boutique = createPartner({
  id: 'partner_atelier_du_cuir',
  legalName: 'Atelier du Cuir SARL',
  countryId: 'country_fr',
  locales: ['fr'],
  categories: ['accessories_leather_goods', 'clothing'],
});

assert.strictEqual(isCategoryEligible(boutique, 'accessories_leather_goods'), true);
assert.strictEqual(isCategoryEligible(boutique, 'sportswear'), false);
assert.strictEqual(isAgeSegmentEligible(boutique, 'adults'), true);
assert.strictEqual(isAgeSegmentEligible(boutique, 'children'), false);
assert.deepStrictEqual(boutique.ageSegments, ['adults']); // default, not forced

// Category is required and must be non-empty — this is the exact
// Category-on-Partner-vs-Product distinction from DOMAIN-SKETCH.md,
// re-expressed as "a Partner still declares eligibility, it's not
// exempt from having *some* categories."
assert.throws(
  () => createPartner({
    id: 'p2', legalName: 'X', countryId: 'country_fr', locales: ['fr'],
    categories: [],
  }),
  /categories must be a non-empty array/
);

// Unknown category is rejected, not silently accepted.
assert.throws(
  () => createPartner({
    id: 'p3', legalName: 'X', countryId: 'country_fr', locales: ['fr'],
    categories: ['furniture'],
  }),
  /unknown categories: furniture/
);

// Children/Youth eligibility without the minor-safe acknowledgment is
// rejected — this is the compliance gate from
// Z-FASHION-MINOR-SAFE-DATA.md made structurally impossible to skip.
assert.throws(
  () => createPartner({
    id: 'p4', legalName: 'Kids Corner', countryId: 'country_fr',
    locales: ['fr'], categories: ['clothing'], ageSegments: ['children'],
  }),
  /has not acknowledged the minor-safe data policy/
);

// With the acknowledgment, it succeeds.
const kidsPartner = createPartner({
  id: 'p5', legalName: 'Kids Corner', countryId: 'country_fr',
  locales: ['fr'], categories: ['clothing'], ageSegments: ['children'],
  minorSafeDataAcknowledged: true,
});
assert.strictEqual(isAgeSegmentEligible(kidsPartner, 'children'), true);

// countryId is required — no silent default, since a Partner is never
// "geography-less" (mirrors Geography's own zero-null-default discipline).
assert.throws(
  () => createPartner({
    id: 'p6', legalName: 'X', locales: ['fr'], categories: ['clothing'],
  }),
  /countryId is required/
);

console.log('partner.js: all invariant checks passed.');
