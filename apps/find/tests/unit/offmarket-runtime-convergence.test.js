'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const FIND_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(FIND_ROOT, '../..');

function readFind(relativePath) {
  return fs.readFileSync(
    path.join(FIND_ROOT, relativePath),
    'utf8'
  );
}

function readRepo(relativePath) {
  return fs.readFileSync(
    path.join(REPO_ROOT, relativePath),
    'utf8'
  );
}

const contract = JSON.parse(
  readFind('config/phase4r-architecture-contract.json')
);

assert.strictEqual(
  contract.offMarketIsProductCapability,
  false,
  'Off-market must remain excluded from the target product'
);

assert.strictEqual(
  contract.targetListingChannelDimension,
  false,
  'Target Listing model must remain channel-free'
);

const body = readFind('apps/zfind-web/src/body.html');
const i18n = readFind('apps/zfind-web/src/i18n.js');
const app = readFind('apps/zfind-web/src/app.js');
const viewmodels = readFind('apps/zfind-web/src/viewmodels.js');
const search = readFind('apps/zfind-web/src/services/search.js');

const adminService =
  readFind('apps/zfind-web/src/services/admin.js');

const properties =
  readFind('apps/zfind-web/src/services/properties.js');

const developments =
  readFind('apps/zfind-web/src/services/developments.js');

const partners =
  readFind('apps/zfind-web/src/services/partners.js');

const adminUi =
  readFind('apps/zfind-admin/src/app.js');

const partnerUi =
  readFind('apps/zfind-partner/src/app.js');

const browserCurrent =
  readFind('tests/browser/zfind-web/browser_test.js');

const offMarketPattern =
  /off[-_ ]?market|offmarket|hors marché/i;

[
  ['public body', body],
  ['public i18n', i18n],
  ['public app', app],
  ['public viewmodels', viewmodels],
  ['public search service', search],
  ['shared Admin service', adminService],
  ['Property read service', properties],
  ['Development read service', developments],
  ['Partner read service', partners],
  ['Admin UI', adminUi],
  ['Partner UI', partnerUi],
  ['current browser fixture', browserCurrent]
].forEach(([label, source]) => {
  assert.ok(
    !offMarketPattern.test(source),
    `${label} must contain no current Off-market product semantics`
  );
});

[
  ['public app', app],
  ['public viewmodels', viewmodels],
  ['public search service', search],
  ['shared Admin service', adminService],
  ['Property read service', properties],
  ['Development read service', developments],
  ['Partner read service', partners],
  ['Admin UI', adminUi],
  ['Partner UI', partnerUi]
].forEach(([label, source]) => {
  assert.ok(
    !/\blisting\.channel\b|\binput\.channel\b|\bpatch\.channel\b|listings\.channel|listing-channel|partner-listing-channel/.test(
      source
    ),
    `${label} must not depend on historical Listing channel`
  );
});

assert.ok(
  !body.includes('data-cat="offmarket"') &&
  !body.includes('value="offmarket"') &&
  !body.includes('data-filter="offmarket"'),
  'Public controls must not expose Off-market'
);

assert.ok(
  !app.includes('q.channel') &&
  !app.includes("channel:'offmarket'") &&
  !app.includes('channel: q.channel'),
  'Public search state must not carry Listing channel'
);

assert.ok(
  !search.includes('representations.listings.channel'),
  'Current public search service must not filter Listing channel'
);

assert.ok(
  !viewmodels.includes('listing.channel') &&
  !viewmodels.includes('Off-market'),
  'Current cards must not expose Listing channel or Off-market badge'
);

assert.ok(
  !adminUi.includes('listing-channel'),
  'Admin must not expose Listing channel authoring'
);

assert.ok(
  !partnerUi.includes('partner-listing-channel'),
  'Partner must not expose Listing channel authoring'
);

assert.ok(
  !adminService.includes('input.channel') &&
  !adminService.includes('patch.channel'),
  'Current Listing terms service must not author channel'
);

assert.ok(
  adminService.includes("['sale', 'rent']"),
  'Sale/rent transaction vocabulary must remain authorable'
);

assert.ok(
  adminService.includes("['monthly', 'seasonal', 'yearly']"),
  'Rental period vocabulary must remain intact'
);

assert.ok(
  adminService.includes('patch.rental_period = null'),
  'Switching a Listing to sale must still clear rental_period'
);

assert.ok(
  search.includes(
    'representations.listings.transaction_type'
  ),
  'Public search must retain transaction_type filtering'
);

assert.ok(
  search.includes(
    'representations.listings.rental_period'
  ),
  'Public search must retain rental_period filtering'
);

const historicalListingMigration = readRepo(
  'infrastructure/supabase/migrations/' +
  '20260812120000_z_find_operational_baseline_v1.sql'
);

assert.ok(
  historicalListingMigration.includes(
    "channel text not null check (channel in ('standard', 'offmarket'))"
  ),
  'Historical Listing channel migration must remain intact'
);

const browserSmoke =
  readFind('tests/browser/zfind-web/staging-smoke-test.js');

assert.ok(
  browserSmoke.includes("channel: 'chrome'"),
  'Playwright browser channel is unrelated and must remain valid'
);

const consentMigration = readRepo(
  'infrastructure/supabase/migrations/' +
  '20260808201000_zos_consent_preferences.sql'
);

assert.ok(
  consentMigration.includes('preferred channel'),
  'ZOS communication channel semantics are unrelated and remain valid'
);

console.log(
  'PASS: Phase 4R R3 Off-market runtime convergence — ' +
  'public, Admin and Partner current code is Listing-channel independent'
);
