/* Run with: node apps/fashion/packages/fashion-domain/tests/style-group.test.js */

const assert = require('assert');
const { createProduct } = require('../src/product');
const { initStock, applyStockUpdate } = require('../src/stock');
const { groupByStyle, validateStyleGroups, buildStyleGroupViewModel } = require('../src/style-group');

const boot36 = createProduct({
  id: 'prod_boot_36', partnerId: 'partner_atelier', brandId: 'brand_atelier',
  names: { fr: 'Escarpins en cuir souple' }, gender: 'female',
  categories: ['footwear'], size: { system: 'EU', value: 36 }, styleId: 'style_escarpin_cuir',
});
const boot38 = createProduct({
  id: 'prod_boot_38', partnerId: 'partner_atelier', brandId: 'brand_atelier',
  names: { fr: 'Escarpins en cuir souple' }, gender: 'female',
  categories: ['footwear'], size: { system: 'EU', value: 38 }, styleId: 'style_escarpin_cuir',
});
const boot40 = createProduct({
  id: 'prod_boot_40', partnerId: 'partner_atelier', brandId: 'brand_atelier',
  names: { fr: 'Escarpins en cuir souple' }, gender: 'female',
  categories: ['footwear'], size: { system: 'EU', value: 40 }, styleId: 'style_escarpin_cuir',
});
const standaloneBag = createProduct({
  id: 'prod_bag', partnerId: 'partner_atelier', brandId: 'brand_atelier',
  names: { fr: 'Sac en cuir' }, gender: 'unisex', categories: ['accessories_leather_goods'],
  // no styleId — a standalone Product, never bucketed
});

const catalog = [boot36, boot38, boot40, standaloneBag];

// --- groupByStyle ---
const groups = groupByStyle(catalog);
assert.deepStrictEqual(Object.keys(groups), ['style_escarpin_cuir']);
assert.strictEqual(groups.style_escarpin_cuir.length, 3);

// --- validateStyleGroups: a consistent group passes ---
assert.strictEqual(validateStyleGroups(catalog), true);

// --- validateStyleGroups: a group disagreeing on Gender is rejected ---
const mismatchedGenderBoot = createProduct({
  id: 'prod_boot_41_wrong_gender', partnerId: 'partner_atelier', brandId: 'brand_atelier',
  names: { fr: 'Escarpins en cuir souple' }, gender: 'male',
  categories: ['footwear'], size: { system: 'EU', value: 41 }, styleId: 'style_escarpin_cuir',
});
assert.throws(
  () => validateStyleGroups([boot36, boot38, mismatchedGenderBoot]),
  /disagree on Partner\/Brand\/Gender\/Categories\/name/
);

// --- validateStyleGroups: a group disagreeing on name is rejected ---
const mismatchedNameBoot = createProduct({
  id: 'prod_boot_41_wrong_name', partnerId: 'partner_atelier', brandId: 'brand_atelier',
  names: { fr: 'Un tout autre nom' }, gender: 'female',
  categories: ['footwear'], size: { system: 'EU', value: 41 }, styleId: 'style_escarpin_cuir',
});
assert.throws(
  () => validateStyleGroups([boot36, boot38, mismatchedNameBoot]),
  /disagree on Partner\/Brand\/Gender\/Categories\/name/
);

// --- buildStyleGroupViewModel ---
const stockByProductId = {
  prod_boot_36: applyStockUpdate(initStock('prod_boot_36'), { quantityAvailable: 12, observedAt: '2026-08-21T10:00:00.000Z' }),
  prod_boot_38: applyStockUpdate(initStock('prod_boot_38'), { quantityAvailable: 2, observedAt: '2026-08-21T10:00:00.000Z' }),
  // prod_boot_40 deliberately has no Stock record — must read as out_of_stock
};

const vm = buildStyleGroupViewModel({
  styleId: 'style_escarpin_cuir',
  products: [boot40, boot36, boot38], // deliberately out of size order
  stockByProductId,
});

assert.strictEqual(vm.name, 'Escarpins en cuir souple');
assert.strictEqual(vm.gender, 'female');
assert.strictEqual(vm.partnerId, 'partner_atelier');

// Sorted smallest-to-largest regardless of input order.
assert.deepStrictEqual(vm.variants.map((v) => v.size.value), [36, 38, 40]);

assert.strictEqual(vm.variants[0].availability.label, 'in_stock');
assert.strictEqual(vm.variants[1].availability.label, 'low_stock');
// Missing Stock record: out_of_stock, never assumed available.
assert.strictEqual(vm.variants[2].availability.label, 'out_of_stock');
assert.strictEqual(vm.variants[2].availability.sellable, false);

// buildStyleGroupViewModel also throws on an inconsistent group — never
// silently builds a view model over Products that aren't really one style.
assert.throws(
  () => buildStyleGroupViewModel({
    styleId: 'style_escarpin_cuir', products: [boot36, mismatchedGenderBoot], stockByProductId: {},
  }),
  /disagree on Partner\/Brand\/Gender\/Categories\/name/
);

console.log('style-group.js: all invariant checks passed.');
