/* Run with: node apps/fashion/packages/fashion-domain/tests/size-grid.test.js */

const assert = require('assert');
const { createProduct } = require('../src/product');
const {
  translateFootwearSize,
  translateWomensClothingSize,
  translateProductSize,
} = require('../src/size-grid');

// --- Footwear: Gender genuinely changes the table, same EU number,
// different real answer. ---
const womensEu38 = translateFootwearSize(38, 'female');
assert.strictEqual(womensEu38.uk, 5);
assert.strictEqual(womensEu38.us, 7.5);

const mensEu42 = translateFootwearSize(42, 'male');
assert.strictEqual(mensEu42.uk, 8);
assert.strictEqual(mensEu42.us, 10);

// unisex falls back to the men's table (documented default), never a
// silent guess — same EU 42 gives the men's row, not a blended one.
const unisexEu42 = translateFootwearSize(42, 'unisex');
assert.deepStrictEqual(unisexEu42, mensEu42);

// A size outside the reference table returns null — never interpolated.
assert.strictEqual(translateFootwearSize(50, 'female'), null);

// --- Clothing: FR38 = IT42 = DE36 = UK10 = US8 (women's), cross-sourced. ---
const frM = translateWomensClothingSize(38);
assert.strictEqual(frM.alpha, 'M');
assert.strictEqual(frM.it, 42);
assert.strictEqual(frM.de, 36);
assert.strictEqual(frM.uk, 10);
assert.strictEqual(frM.us, 8);
assert.strictEqual(translateWomensClothingSize(37), null); // not a real FR clothing size in this table

// --- translateProductSize: reads Category+Gender off the Product itself ---
const womensBoot = createProduct({
  id: 'prod_boot', partnerId: 'p1', brandId: 'b1', names: { fr: 'Bottine' },
  gender: 'female', categories: ['footwear'], size: { system: 'EU', value: 38 },
});
const bootTranslation = translateProductSize(womensBoot);
assert.strictEqual(bootTranslation.uk, 5);

const mensJacket = createProduct({
  id: 'prod_jacket', partnerId: 'p1', brandId: 'b1', names: { fr: 'Veste' },
  gender: 'male', categories: ['clothing'], size: { system: 'alpha', value: 'L' },
});
const jacketTranslation = translateProductSize(mensJacket);
assert.strictEqual(jacketTranslation.alpha, 'L');
assert.strictEqual(jacketTranslation.fr, null); // menswear: Alpha is the canonical system, no numeric table invented

const womensDress = createProduct({
  id: 'prod_dress', partnerId: 'p1', brandId: 'b1', names: { fr: 'Robe' },
  gender: 'female', categories: ['clothing'], size: { system: 'FR', value: 40 },
});
const dressTranslation = translateProductSize(womensDress);
assert.strictEqual(dressTranslation.alpha, 'L');
assert.strictEqual(dressTranslation.us, 10);

// Cosmetics (no `size` at all — uses `format`) resolves to null, never throws.
const perfume = createProduct({
  id: 'prod_perfume', partnerId: 'p1', brandId: 'b1', names: { fr: 'Parfum' },
  gender: 'unisex', categories: ['cosmetics'], format: { volumeMl: 50 },
});
assert.strictEqual(translateProductSize(perfume), null);

console.log('size-grid.js: all invariant checks passed.');
