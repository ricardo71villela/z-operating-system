/* Run with: node apps/fashion/packages/fashion-domain/tests/search.test.js */

const assert = require('assert');
const { createProduct } = require('../src/product');
const { createBrand } = require('../src/brand');
const { createPartner } = require('../src/partner');
const { searchProducts, searchWithinAllSale, searchInMarket } = require('../src/search');

const brandNike = createBrand({ id: 'brand_nike', name: 'Nike' });
const brandsById = { brand_nike: brandNike };

const shoe = createProduct({
  id: 'prod_shoe', partnerId: 'partner_a', brandId: 'brand_nike',
  names: { fr: 'Baskets running technique', en: 'Technical running sneakers' },
  gender: 'male', categories: ['footwear', 'sportswear'], technicalPurpose: true,
  size: { system: 'EU', value: 42 },
});
const bag = createProduct({
  id: 'prod_bag', partnerId: 'partner_b', brandId: 'brand_corbin',
  names: { fr: 'Sac besace en cuir pleine fleur' },
  gender: 'unisex', categories: ['accessories_leather_goods'],
});
const exclusiveDrop = createProduct({
  id: 'prod_exclusive', partnerId: 'partner_b', brandId: 'brand_corbin',
  names: { fr: 'Édition limitée besace' },
  gender: 'unisex', categories: ['accessories_leather_goods'], cornerExclusive: true,
});
const catalog = [shoe, bag, exclusiveDrop];

// Matches by name, case- and accent-insensitive.
assert.deepStrictEqual(searchProducts(catalog, 'besace').map((p) => p.id), ['prod_bag']);
assert.deepStrictEqual(searchProducts(catalog, 'BESACE').map((p) => p.id), ['prod_bag']);
assert.deepStrictEqual(searchProducts(catalog, 'cuir').map((p) => p.id), ['prod_bag']);

// Matches by Brand name when brandsById is supplied.
assert.deepStrictEqual(searchProducts(catalog, 'nike', { brandsById }).map((p) => p.id), ['prod_shoe']);
assert.deepStrictEqual(searchProducts(catalog, 'nike').map((p) => p.id), []); // no brandsById supplied — never matches Brand text it wasn't given

// Matches by Category label.
assert.deepStrictEqual(searchProducts(catalog, 'footwear').map((p) => p.id), ['prod_shoe']);

// Locale-aware: searching in 'en' matches the English name even though
// the French one wouldn't contain the same substring.
assert.deepStrictEqual(searchProducts(catalog, 'sneakers', { locale: 'en' }).map((p) => p.id), ['prod_shoe']);
// Falls back to 'fr' when the requested locale has no translation —
// still findable, never silently unsearchable just because a locale
// hasn't been translated yet.
assert.deepStrictEqual(searchProducts(catalog, 'besace', { locale: 'de' }).map((p) => p.id), ['prod_bag']);

// cornerExclusive Products are excluded from search, same
// comprehensiveness rule as All Sale — "besace" also appears in the
// exclusive drop's name, but it must never surface here.
const besaceMatches = searchProducts(catalog, 'besace').map((p) => p.id);
assert.ok(!besaceMatches.includes('prod_exclusive'));

// Empty/whitespace query returns nothing — never "everything" by default.
assert.deepStrictEqual(searchProducts(catalog, ''), []);
assert.deepStrictEqual(searchProducts(catalog, '   '), []);

// searchWithinAllSale: combines a filter (e.g. already-selected gender)
// with a text query — a male-only search for "besace" excludes the
// unisex bag even though its name matches, because the filter narrows
// first.
assert.deepStrictEqual(
  searchWithinAllSale(catalog, 'besace', { gender: 'male' }).map((p) => p.id),
  []
);
assert.deepStrictEqual(
  searchWithinAllSale(catalog, 'besace', { gender: 'unisex' }).map((p) => p.id),
  ['prod_bag']
);

// searchInMarket: the bag's Partner (partner_b) is based in France — an
// FR-market search for "besace" finds it, a PT-market search finds
// nothing at all from this catalog, even though the text would
// otherwise match everywhere.
const partnerB = createPartner({
  id: 'partner_b', legalName: 'Maison Corbin', countryIso: 'FR', locales: ['fr'], categories: ['accessories_leather_goods'],
});
const partnersById = { partner_b: partnerB };

assert.deepStrictEqual(
  searchInMarket(catalog, partnersById, 'FR', 'besace').map((p) => p.id),
  ['prod_bag']
);
assert.deepStrictEqual(
  searchInMarket(catalog, partnersById, 'PT', 'besace').map((p) => p.id),
  []
);

console.log('search.js: all invariant checks passed.');
