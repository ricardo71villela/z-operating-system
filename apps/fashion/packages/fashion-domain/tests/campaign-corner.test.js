/* Run with: node apps/fashion/packages/fashion-domain/tests/campaign-corner.test.js */

const assert = require('assert');
const { createCampaign, isActiveOn } = require('../src/campaign');
const { createProduct } = require('../src/product');
const { createPartner } = require('../src/partner');
const { corner, allSale, allSaleInMarket } = require('../src/corner');

// Real Soldes d'hiver 2026 window — must match exactly, or reject.
const soldesHiver2026 = createCampaign({
  id: 'campaign_soldes_hiver_2026',
  type: 'soldes',
  countryIso: 'FR',
  startDate: '2026-01-07',
  endDate: '2026-02-03',
});
assert.strictEqual(isActiveOn(soldesHiver2026, '2026-01-20'), true);
assert.strictEqual(isActiveOn(soldesHiver2026, '2026-03-01'), false);

// An invented Soldes date (not a real decreed window) must be rejected —
// Soldes dates are fixed by law, never chosen by the platform.
assert.throws(
  () => createCampaign({
    id: 'campaign_fake_soldes', type: 'soldes', countryIso: 'FR',
    startDate: '2026-05-01', endDate: '2026-05-15',
  }),
  /do not match any registered official window/
);

// Black Friday has no legal-window constraint — any date range is valid.
const blackFriday2026 = createCampaign({
  id: 'campaign_black_friday_2026', type: 'black_friday',
  startDate: '2026-11-27', endDate: '2026-11-30',
});
assert.strictEqual(blackFriday2026.countryIso, null);

// Corner and All Sale over a small fixture catalog.
const shoe = createProduct({
  id: 'prod_shoe', partnerId: 'partner_a', brandId: 'brand_nike',
  names: { fr: 'Produit test' }, gender: 'female', categories: ['footwear', 'sportswear'], technicalPurpose: true,
  size: { system: 'EU', value: 42 },
});
const perfume = createProduct({
  id: 'prod_perfume', partnerId: 'partner_a', brandId: 'brand_house_label',
  names: { fr: 'Produit test' }, gender: 'unisex', categories: ['cosmetics'], format: { volumeMl: 50 },
});
const exclusiveBag = createProduct({
  id: 'prod_bag', partnerId: 'partner_b', brandId: 'brand_longchamp',
  names: { fr: 'Produit test' }, gender: 'unisex', categories: ['accessories_leather_goods'], cornerExclusive: true,
});
const catalog = [shoe, perfume, exclusiveBag];

// Corner A: everything partner_a owns, regardless of All Sale status.
assert.deepStrictEqual(
  corner(catalog, 'partner_a').map((p) => p.id).sort(),
  ['prod_perfume', 'prod_shoe']
);

// All Sale: excludes the cornerExclusive bag by default.
assert.deepStrictEqual(
  allSale(catalog).map((p) => p.id).sort(),
  ['prod_perfume', 'prod_shoe']
);

// All Sale filtered by category: only the shoe is Sportswear.
assert.deepStrictEqual(
  allSale(catalog, { category: 'sportswear' }).map((p) => p.id),
  ['prod_shoe']
);

// All Sale filtered by gender: exact match only — the female shoe shows
// under 'female', not under 'unisex' (perfume), and vice versa. Unisex
// is its own explicit bucket, never a silent match-all.
assert.deepStrictEqual(
  allSale(catalog, { gender: 'female' }).map((p) => p.id),
  ['prod_shoe']
);
assert.deepStrictEqual(
  allSale(catalog, { gender: 'unisex' }).map((p) => p.id),
  ['prod_perfume']
);
assert.deepStrictEqual(
  allSale(catalog, { gender: 'male' }).map((p) => p.id),
  []
);

// All Sale filtered by size: value-only match (no cross-system
// translation yet — see the comment in corner.js). The shoe is EU 42;
// filtering for that exact value returns it, any other value excludes
// it, and a Product without a `size` at all (the perfume) never matches.
assert.deepStrictEqual(
  allSale(catalog, { sizeValue: 42 }).map((p) => p.id),
  ['prod_shoe']
);
assert.deepStrictEqual(
  allSale(catalog, { sizeValue: 40 }).map((p) => p.id),
  []
);

// Corner B still shows the exclusive bag — Corner is not filtered by
// All Sale eligibility, only by Partner.
assert.deepStrictEqual(
  corner(catalog, 'partner_b').map((p) => p.id),
  ['prod_bag']
);

// All Sale scoped to a Market: partner_a is FR, so an FR-market view sees
// the shoe (assuming filters otherwise match), a PT-market view sees
// nothing from this catalog at all — even though every other allSale()
// filter would otherwise match.
const partnerAFrance = createPartner({
  id: 'partner_a', legalName: 'Partner A', countryIso: 'FR', locales: ['fr'], categories: ['footwear'],
});
const partnersById = { partner_a: partnerAFrance };

assert.deepStrictEqual(
  allSaleInMarket(catalog, partnersById, 'FR', { gender: 'female' }).map((p) => p.id),
  ['prod_shoe']
);
assert.deepStrictEqual(
  allSaleInMarket(catalog, partnersById, 'PT', { gender: 'female' }).map((p) => p.id),
  []
);

console.log('campaign.js + corner.js: all invariant checks passed.');
