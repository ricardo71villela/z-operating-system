/* Run with: node apps/fashion/packages/fashion-domain/tests/homepage.test.js */

const assert = require('assert');
const { createCampaign } = require('../src/campaign');
const { selectHero } = require('../src/homepage');

const soldesHiver2026 = createCampaign({
  id: 'campaign_soldes_hiver_2026', type: 'soldes', countryIso: 'FR',
  startDate: '2026-01-07', endDate: '2026-02-03',
});
const destaques = [{ id: 'destaque_1', title: 'Nova Coleção Outono' }];

// An active Campaign wins the hero slot over editorial content.
const duringSoldes = selectHero([soldesHiver2026], destaques, '2026-01-20');
assert.strictEqual(duringSoldes.type, 'campaign');
assert.strictEqual(duringSoldes.campaign.id, 'campaign_soldes_hiver_2026');

// Outside any Campaign window, falls back to the lead Destaque.
const outsideSoldes = selectHero([soldesHiver2026], destaques, '2026-03-15');
assert.strictEqual(outsideSoldes.type, 'destaque');
assert.strictEqual(outsideSoldes.destaque.id, 'destaque_1');

// No Campaign active and no Destaques at all: null, not a crash.
assert.strictEqual(selectHero([soldesHiver2026], [], '2026-03-15'), null);

// --- Sponsored Destaques ---
const { selectSponsoredDestaque, isEligibleForSponsorship } = require('../src/homepage');

// A low-PQS Partner's paid slot is active in-window but fails the quality
// gate — curation-over-price must hold even when money is on the table.
const lowQualitySlot = {
  id: 'sponsored_1', partnerId: 'partner_low', startDate: '2026-06-01',
  endDate: '2026-06-07', partnerQualityScore: 40,
};
assert.strictEqual(isEligibleForSponsorship(40), false);
assert.strictEqual(selectSponsoredDestaque([lowQualitySlot], '2026-06-03'), null);

// A high-PQS Partner's paid slot, active in-window, is selected.
const highQualitySlot = {
  id: 'sponsored_2', partnerId: 'partner_high', startDate: '2026-06-01',
  endDate: '2026-06-07', partnerQualityScore: 85,
};
assert.strictEqual(isEligibleForSponsorship(85), true);
const result = selectSponsoredDestaque([lowQualitySlot, highQualitySlot], '2026-06-03');
assert.strictEqual(result.id, 'sponsored_2');

// Outside the purchased window: null, even for a high-PQS Partner —
// paid slots are not evergreen.
assert.strictEqual(selectSponsoredDestaque([highQualitySlot], '2026-08-01'), null);

console.log('homepage.js: all invariant checks passed.');
