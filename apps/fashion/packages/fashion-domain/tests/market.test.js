/* Run with: node apps/fashion/packages/fashion-domain/tests/market.test.js */

const assert = require('assert');
const { createProduct } = require('../src/product');
const { createPartner } = require('../src/partner');
const { productsVisibleInMarket, marketsWithPresence } = require('../src/market');

const partnerFr = createPartner({
  id: 'partner_fr', legalName: 'Atelier Rive Gauche', countryIso: 'FR',
  locales: ['fr'], categories: ['clothing'],
});
const partnerPt = createPartner({
  id: 'partner_pt', legalName: 'Boutique Lisboa', countryIso: 'PT',
  locales: ['pt'], categories: ['clothing'],
});
const partnersById = { partner_fr: partnerFr, partner_pt: partnerPt };

const frDress = createProduct({
  id: 'prod_fr_dress', partnerId: 'partner_fr', brandId: 'brand_a',
  names: { fr: 'Robe portefeuille' }, gender: 'female', categories: ['clothing'],
  size: { system: 'FR', value: 38 },
});
const ptShirt = createProduct({
  id: 'prod_pt_shirt', partnerId: 'partner_pt', brandId: 'brand_b',
  names: { fr: 'Chemise', pt: 'Camisa' }, gender: 'male', categories: ['clothing'],
  size: { system: 'alpha', value: 'M' },
});
const orphanProduct = createProduct({
  id: 'prod_orphan', partnerId: 'partner_unknown', brandId: 'brand_c',
  names: { fr: 'Produit orphelin' }, gender: 'unisex', categories: ['accessories_leather_goods'],
});

const catalog = [frDress, ptShirt, orphanProduct];

// --- productsVisibleInMarket ---
assert.throws(() => productsVisibleInMarket(catalog, partnersById), /marketCountryIso is required/);

assert.deepStrictEqual(
  productsVisibleInMarket(catalog, partnersById, 'FR').map((p) => p.id),
  ['prod_fr_dress']
);
assert.deepStrictEqual(
  productsVisibleInMarket(catalog, partnersById, 'PT').map((p) => p.id),
  ['prod_pt_shirt']
);

// A Market with no Partners present returns an empty list, never throws.
assert.deepStrictEqual(productsVisibleInMarket(catalog, partnersById, 'DE'), []);

// A Product whose Partner isn't in partnersById is excluded, never
// assumed to belong to any Market by default.
const allMarkets = [
  ...productsVisibleInMarket(catalog, partnersById, 'FR'),
  ...productsVisibleInMarket(catalog, partnersById, 'PT'),
];
assert.ok(!allMarkets.some((p) => p.id === 'prod_orphan'));

// --- marketsWithPresence ---
assert.deepStrictEqual(marketsWithPresence([partnerFr, partnerPt]), ['FR', 'PT']);
assert.deepStrictEqual(marketsWithPresence([]), []);

// Duplicates collapse — presence is per-country, not per-Partner count.
const secondFrPartner = createPartner({
  id: 'partner_fr_2', legalName: 'Maison Solstice', countryIso: 'FR',
  locales: ['fr'], categories: ['clothing'],
});
assert.deepStrictEqual(marketsWithPresence([partnerFr, secondFrPartner, partnerPt]), ['FR', 'PT']);

console.log('market.js: all invariant checks passed.');
