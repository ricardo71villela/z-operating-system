/* Run with: node apps/fashion/packages/fashion-domain/tests/homepage.test.js */

const assert = require('assert');
const { createCampaign } = require('../src/campaign');
const { selectHero } = require('../src/homepage');

const soldesHiver2026 = createCampaign({
  id: 'campaign_soldes_hiver_2026', type: 'soldes', countryId: 'country_fr',
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

console.log('homepage.js: all invariant checks passed.');
