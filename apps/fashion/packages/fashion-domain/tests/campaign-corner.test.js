/* Run with: node apps/fashion/packages/fashion-domain/tests/campaign-corner.test.js */

const assert = require('assert');
const { createCampaign, isActiveOn } = require('../src/campaign');
const { createProduct } = require('../src/product');
const { corner, allSale } = require('../src/corner');

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
  categories: ['footwear', 'sportswear'], technicalPurpose: true,
  size: { system: 'EU', value: 42 },
});
const perfume = createProduct({
  id: 'prod_perfume', partnerId: 'partner_a', brandId: 'brand_house_label',
  categories: ['cosmetics'], format: { volumeMl: 50 },
});
const exclusiveBag = createProduct({
  id: 'prod_bag', partnerId: 'partner_b', brandId: 'brand_longchamp',
  categories: ['accessories_leather_goods'], cornerExclusive: true,
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

// Corner B still shows the exclusive bag — Corner is not filtered by
// All Sale eligibility, only by Partner.
assert.deepStrictEqual(
  corner(catalog, 'partner_b').map((p) => p.id),
  ['prod_bag']
);

console.log('campaign.js + corner.js: all invariant checks passed.');
