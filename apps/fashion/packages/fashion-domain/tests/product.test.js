/* Run with: node apps/fashion/packages/fashion-domain/tests/product.test.js */

const assert = require('assert');
const { createProduct, isInAllSale, isReturnEligible } = require('../src/product');

// A genuine performance running shoe: Footwear + Sportswear, marked
// technicalPurpose — the case that should succeed.
const runningShoe = createProduct({
  title: 'Test Product',
  id: 'prod_running_shoe',
  partnerId: 'partner_atelier_du_cuir',
  brandId: 'brand_x',
  categories: ['footwear', 'sportswear'],
  technicalPurpose: true,
  size: { system: 'EU', value: 42 },
});
assert.deepStrictEqual(runningShoe.categories, ['footwear', 'sportswear']);
assert.strictEqual(isInAllSale(runningShoe), true);
assert.strictEqual(runningShoe.title, 'Test Product');

// Title is a required discovery/content invariant and text is normalized.
assert.throws(
  () => createProduct({
    id: 'prod_missing_title', partnerId: 'p1', brandId: 'b1',
    categories: ['footwear'], size: { system: 'EU', value: 42 },
  }),
  /title is required/
);
const describedProduct = createProduct({
  id: 'prod_described', partnerId: 'p1', brandId: 'b1',
  title: '  Leather Runner  ', shortDescription: '  Lightweight city sneaker  ',
  categories: ['footwear'], size: { system: 'EU', value: 41 },
});
assert.strictEqual(describedProduct.title, 'Leather Runner');
assert.strictEqual(describedProduct.shortDescription, 'Lightweight city sneaker');

// A casual sneaker that merely looks athletic: Footwear only. Tagging
// it Sportswear WITHOUT technicalPurpose must be rejected — this is
// the exact correction from the conversation, enforced in code.
assert.throws(
  () => createProduct({
    title: 'Test Product',
    id: 'prod_casual_sneaker', partnerId: 'p1', brandId: 'b1',
    categories: ['footwear', 'sportswear'], size: { system: 'EU', value: 42 },
    // technicalPurpose omitted on purpose
  }),
  /never aesthetic resemblance/
);

// The same casual sneaker, correctly tagged Footwear only, succeeds.
const casualSneaker = createProduct({
  title: 'Test Product',
  id: 'prod_casual_sneaker', partnerId: 'p1', brandId: 'b1',
  categories: ['footwear'], size: { system: 'EU', value: 42 },
});
assert.deepStrictEqual(casualSneaker.categories, ['footwear']);

// Children's clothing without safety certifications is rejected.
assert.throws(
  () => createProduct({
    title: 'Test Product',
    id: 'prod_kids_jacket', partnerId: 'p1', brandId: 'b1',
    categories: ['clothing'], ageSegments: ['children'],
    size: { system: 'age', value: '4-5y' },
  }),
  /never inferred from size or appearance alone/
);

// With certification, it succeeds.
const kidsJacket = createProduct({
  title: 'Test Product',
  id: 'prod_kids_jacket', partnerId: 'p1', brandId: 'b1',
  categories: ['clothing'], ageSegments: ['children'],
  safetyCertifications: ['EN 14682'],
  size: { system: 'age', value: '4-5y' },
});
assert.deepStrictEqual(kidsJacket.safetyCertifications, ['EN 14682']);

// Cosmetics (including a perfume) requires `format`, forbids `size`.
assert.throws(
  () => createProduct({
    title: 'Test Product',
    id: 'prod_perfume',
    partnerId: 'p1', brandId: 'b1',
    categories: ['cosmetics'],
    // format omitted on purpose
  }),
  /`format`.*is missing/
);
assert.throws(
  () => createProduct({
    title: 'Test Product',
    id: 'prod_perfume', partnerId: 'p1', brandId: 'b1',
    categories: ['cosmetics'], format: { volumeMl: 50 },
    size: { system: 'EU', value: 42 }, // wrong — cosmetics never has size
  }),
  /never `size`/
);
const perfume = createProduct({
  title: 'Test Product',
  id: 'prod_perfume', partnerId: 'p1', brandId: 'b1',
  categories: ['cosmetics'], format: { volumeMl: 50 },
});
assert.strictEqual(perfume.size, null);

// Return eligibility: cosmetics with a broken seal is not returnable;
// unsealed cosmetics and every other category are.
assert.strictEqual(isReturnEligible(perfume, { sealBroken: true }), false);
assert.strictEqual(isReturnEligible(perfume, { sealBroken: false }), true);
assert.strictEqual(isReturnEligible(runningShoe, { sealBroken: true }), true);

// cornerExclusive defaults false — All Sale is comprehensive by default.
assert.strictEqual(isInAllSale(perfume), true);
const exclusiveDrop = createProduct({
  title: 'Test Product',
  id: 'prod_exclusive', partnerId: 'p1', brandId: 'b1',
  categories: ['footwear'], size: { system: 'EU', value: 40 },
  cornerExclusive: true,
});
assert.strictEqual(isInAllSale(exclusiveDrop), false);

// Sized category without a size is rejected.
assert.throws(
  () => createProduct({
    title: 'Test Product',
    id: 'prod_no_size',
    partnerId: 'p1', brandId: 'b1', categories: ['clothing'],
  }),
  /require a `size`/
);

console.log('product.js: all invariant checks passed.');
