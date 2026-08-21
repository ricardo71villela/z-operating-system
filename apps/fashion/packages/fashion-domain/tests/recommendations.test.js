/* Run with: node apps/fashion/packages/fashion-domain/tests/recommendations.test.js */

const assert = require('assert');
const { createProduct } = require('../src/product');
const { productPageRecommendations, allSaleRecommendations } = require('../src/recommendations');

// partner_big: a well-stocked multi-brand Corner with 5 sportswear items.
const bigPartnerProducts = Array.from({ length: 5 }, (_, i) => createProduct({
  title: 'Test Product',
  id: `prod_big_${i}`, partnerId: 'partner_big', brandId: 'brand_x',
  categories: ['footwear', 'sportswear'], technicalPurpose: true,
  size: { system: 'EU', value: 40 + i },
}));
const viewedBig = bigPartnerProducts[0];

// partner_small: an independent boutique with only 1 other related item.
const smallPartnerProducts = [
  createProduct({
    title: 'Test Product',
    id: 'prod_small_0', partnerId: 'partner_small', brandId: 'brand_atelier',
    categories: ['accessories_leather_goods'],
  }),
  createProduct({
    title: 'Test Product',
    id: 'prod_small_1', partnerId: 'partner_small', brandId: 'brand_atelier',
    categories: ['accessories_leather_goods'],
  }),
];
const viewedSmall = smallPartnerProducts[0];

// An unrelated cross-partner product available for fallback discovery.
const otherPartnerBag = createProduct({
  title: 'Test Product',
  id: 'prod_other_bag', partnerId: 'partner_other', brandId: 'brand_y',
  categories: ['accessories_leather_goods'],
});

const catalog = [...bigPartnerProducts, ...smallPartnerProducts, otherPartnerBag];

// Well-stocked Corner: stays same_corner, never falls back.
const bigResult = productPageRecommendations(catalog, viewedBig, { threshold: 4 });
assert.strictEqual(bigResult.label, 'same_corner');
assert.strictEqual(bigResult.products.length, 4); // 5 minus itself

// Thin Corner (1 related item, below threshold of 4): falls back,
// and the fallback surfaces the cross-partner bag — never silently
// relabeled as same-store.
const smallResult = productPageRecommendations(catalog, viewedSmall, { threshold: 4 });
assert.strictEqual(smallResult.label, 'fallback');
assert.ok(
  smallResult.products.some((p) => p.id === 'prod_other_bag'),
  'fallback must include genuinely complementary cross-partner products'
);

// All Sale recommendations are always cross-partner by design, regardless
// of Corner size — no threshold logic here at all.
const allSaleResult = allSaleRecommendations(catalog, viewedSmall);
assert.ok(allSaleResult.some((p) => p.id === 'prod_other_bag'));
assert.ok(allSaleResult.some((p) => p.id === 'prod_small_1'));

console.log('recommendations.js: all invariant checks passed.');
