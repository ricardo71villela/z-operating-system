/* Run with: node apps/fashion/packages/fashion-domain/tests/corner-page.test.js */

const assert = require('assert');
const { createCornerConfig } = require('../src/corner-config');
const { createProduct } = require('../src/product');
const { createBrand } = require('../src/brand');
const { buildCornerPageViewModel } = require('../src/corner-page');

const config = createCornerConfig({
  partnerId: 'partner_atelier', displayName: 'Atelier du Marais',
  byline: 'Atelier fondé en 2015 à Paris', accentColor: '#c9a227',
  logoUrl: 'https://cdn.example.com/logo.png',
});

const brandsById = {
  brand_atelier: createBrand({ id: 'brand_atelier', name: 'Atelier du Marais', houseLabelOfPartnerId: 'partner_atelier' }),
};

const products = [
  createProduct({ title: 'Test Product', id: 'p1', partnerId: 'partner_atelier', brandId: 'brand_atelier', categories: ['accessories_leather_goods'] }),
  createProduct({ title: 'Test Product', id: 'p2', partnerId: 'partner_atelier', brandId: 'brand_atelier', categories: ['clothing'], size: { system: 'FR', value: 38 } }),
  createProduct({ title: 'Test Product', id: 'p3', partnerId: 'partner_other', brandId: 'brand_other', categories: ['footwear'], size: { system: 'EU', value: 40 } }),
];

const vm = buildCornerPageViewModel({ cornerConfig: config, products, brandsById });

// Only this Partner's products appear, regardless of what other Partners sell.
assert.strictEqual(vm.productCount, 2);
assert.deepStrictEqual(vm.categories, ['accessories_leather_goods', 'clothing']);
assert.strictEqual(vm.brandProfile, 'mono');
assert.strictEqual(vm.header.displayName, 'Atelier du Marais');
assert.strictEqual(vm.products[0].brandName, 'Atelier du Marais');

// A cornerExclusive product still shows on the Corner page — only All Sale
// excludes it (corner.js already covers the All Sale side of this).
const withExclusive = [
  ...products.slice(0, 2),
  createProduct({ title: 'Test Product', id: 'p4', partnerId: 'partner_atelier', brandId: 'brand_atelier', categories: ['clothing'], size: { system: 'FR', value: 40 }, cornerExclusive: true }),
];
const vmExclusive = buildCornerPageViewModel({ cornerConfig: config, products: withExclusive, brandsById });
assert.strictEqual(vmExclusive.productCount, 3);
assert.ok(vmExclusive.products.some((p) => p.productId === 'p4' && p.cornerExclusive === true));

// An unknown brandId resolves to null, not a crash.
const orphanProducts = [createProduct({ title: 'Test Product', id: 'p5', partnerId: 'partner_atelier', brandId: 'brand_unknown', categories: ['clothing'], size: { system: 'FR', value: 38 } })];
const vmOrphan = buildCornerPageViewModel({ cornerConfig: config, products: orphanProducts, brandsById });
assert.strictEqual(vmOrphan.products[0].brandName, null);

console.log('corner-page.js: all invariant checks passed.');
