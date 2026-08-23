/* Run with: node apps/fashion/packages/fashion-domain/tests/brand.test.js */

const assert = require('assert');
const { createBrand, partnerBrandProfile } = require('../src/brand');
const { createProduct } = require('../src/product');

const nike = createBrand({ id: 'brand_nike', name: 'Nike' });
assert.strictEqual(nike.houseLabelOfPartnerId, null);

const houseLabel = createBrand({
  id: 'brand_atelier_du_marais', name: 'Atelier du Marais',
  houseLabelOfPartnerId: 'partner_atelier_du_marais',
});
assert.strictEqual(houseLabel.houseLabelOfPartnerId, 'partner_atelier_du_marais');

// name/id required.
assert.throws(() => createBrand({ id: 'b1' }), /name is required/);

// Multi-brand Partner (JD Sports style): several distinct Brands in catalog.
const jdSportsProducts = [
  createProduct({ id: 'p1', partnerId: 'partner_jd', brandId: 'brand_nike', names: { fr: 'Produit test' }, gender: 'unisex', categories: ['footwear', 'sportswear'], technicalPurpose: true, size: { system: 'EU', value: 42 } }),
  createProduct({ id: 'p2', partnerId: 'partner_jd', brandId: 'brand_adidas', names: { fr: 'Produit test' }, gender: 'unisex', categories: ['footwear', 'sportswear'], technicalPurpose: true, size: { system: 'EU', value: 43 } }),
];
const jdProfile = partnerBrandProfile(jdSportsProducts, 'partner_jd');
assert.strictEqual(jdProfile.type, 'multi');
assert.deepStrictEqual(jdProfile.brandIds.sort(), ['brand_adidas', 'brand_nike']);

// Mono-brand Partner (an artisan atelier selling only its own house label).
const atelierProducts = [
  createProduct({ id: 'p3', partnerId: 'partner_atelier_du_marais', brandId: 'brand_atelier_du_marais', names: { fr: 'Produit test' }, gender: 'unisex', categories: ['accessories_leather_goods'] }),
  createProduct({ id: 'p4', partnerId: 'partner_atelier_du_marais', brandId: 'brand_atelier_du_marais', names: { fr: 'Produit test' }, gender: 'unisex', categories: ['accessories_leather_goods'] }),
];
const atelierProfile = partnerBrandProfile(atelierProducts, 'partner_atelier_du_marais');
assert.strictEqual(atelierProfile.type, 'mono');
assert.deepStrictEqual(atelierProfile.brandIds, ['brand_atelier_du_marais']);

// A Partner with no Products yet: 'none', not an error and not 'mono'.
const emptyProfile = partnerBrandProfile([...jdSportsProducts, ...atelierProducts], 'partner_new');
assert.strictEqual(emptyProfile.type, 'none');
assert.deepStrictEqual(emptyProfile.brandIds, []);

console.log('brand.js: all invariant checks passed.');
