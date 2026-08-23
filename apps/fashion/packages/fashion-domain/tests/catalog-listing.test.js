/* Run with: node apps/fashion/packages/fashion-domain/tests/catalog-listing.test.js */

const assert = require('assert');
const { createProduct } = require('../src/product');
const { createBrand } = require('../src/brand');
const { initStock, applyStockUpdate } = require('../src/stock');
const { buildListingCard, buildListingCards } = require('../src/catalog-listing');

const brand = createBrand({ id: 'brand_atelier', name: 'Atelier Rive Gauche' });
const shoe = createProduct({
  id: 'prod_shoe', partnerId: 'partner_atelier', brandId: 'brand_atelier',
  names: { fr: 'Produit test' }, gender: 'female', categories: ['footwear'], size: { system: 'EU', value: 38 },
});

const inStock = applyStockUpdate(initStock('prod_shoe'), { quantityAvailable: 20, observedAt: '2026-08-21T10:00:00.000Z' });
const card = buildListingCard({ product: shoe, stock: inStock, brand });
assert.strictEqual(card.productId, 'prod_shoe');
assert.strictEqual(card.brandName, 'Atelier Rive Gauche');
assert.strictEqual(card.availability.label, 'in_stock');
assert.strictEqual(card.availability.sellable, true);
assert.deepStrictEqual(card.size, { system: 'EU', value: 38 });

// Out of stock is sellable:false, never hidden by this module — hiding is
// a listing/filter decision made by the caller, not this decorator's job.
const cardOOS = buildListingCard({ product: shoe, stock: initStock('prod_shoe'), brand });
assert.strictEqual(cardOOS.availability.sellable, false);

// Missing Stock record entirely: treated as out_of_stock, never assumed
// available — a data-quality gap must never silently read as "in stock".
const bagNoStockRecord = createProduct({
  id: 'prod_bag_no_stock', partnerId: 'partner_atelier', brandId: 'brand_atelier',
  names: { fr: 'Produit test' }, gender: 'unisex', categories: ['accessories_leather_goods'],
});
const cardsFromListing = buildListingCards([bagNoStockRecord], {}, { brand_atelier: brand });
assert.strictEqual(cardsFromListing[0].availability.label, 'out_of_stock');
assert.strictEqual(cardsFromListing[0].availability.sellable, false);

// buildListingCards decorates a whole batch, degrades gracefully without a
// brand lookup entry.
const cardsNoBrandMap = buildListingCards([shoe], { prod_shoe: inStock });
assert.strictEqual(cardsNoBrandMap[0].brandName, null);
assert.strictEqual(cardsNoBrandMap[0].availability.label, 'in_stock');

// --- name: fixed 2026-08-21 — a listing card previously had no display
// name at all, impossible to actually render a product grid with it. ---
const namedShoe = createProduct({
  id: 'prod_named_shoe', partnerId: 'partner_atelier', brandId: 'brand_atelier',
  names: { fr: 'Escarpins en cuir souple', en: 'Leather pumps' }, gender: 'female',
  categories: ['footwear'], size: { system: 'EU', value: 38 },
});
const namedCard = buildListingCard({ product: namedShoe, stock: inStock, brand });
assert.strictEqual(namedCard.name, 'Escarpins en cuir souple'); // default locale ('fr')

const namedCardEn = buildListingCard({ product: namedShoe, stock: inStock, brand, locale: 'en' });
assert.strictEqual(namedCardEn.name, 'Leather pumps');

// Falls back to 'fr' when the requested locale has no translation —
// same fallback productName() already guarantees, never a second rule.
const namedCardDe = buildListingCard({ product: namedShoe, stock: inStock, brand, locale: 'de' });
assert.strictEqual(namedCardDe.name, 'Escarpins en cuir souple');

console.log('catalog-listing.js: all invariant checks passed.');
