'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const FIND_ROOT = path.resolve(__dirname, '../..');

const contractPath = path.join(
  FIND_ROOT,
  'config',
  'phase4r-architecture-contract.json'
);

const docPath = path.join(
  FIND_ROOT,
  'docs',
  'architecture',
  'PHASE-4R-ARCHITECTURE-CONTRACT.md'
);

const contract = JSON.parse(
  fs.readFileSync(contractPath, 'utf8')
);

const doc = fs.readFileSync(docPath, 'utf8');

assert.strictEqual(contract.version, 1);
assert.strictEqual(contract.status, 'locked');
assert.strictEqual(contract.phase, '4R');

assert.deepStrictEqual(
  contract.publicLocales,
  ['fr', 'en', 'pt', 'es', 'de', 'it'],
  'Phase 4 public locale set/order must remain FR EN PT ES DE IT'
);

assert.deepStrictEqual(
  contract.persistedLocaleByPublicLocale,
  {
    fr: 'fr',
    en: 'en',
    pt: 'pt-PT',
    es: 'es',
    de: 'de',
    it: 'it'
  },
  'Public→persisted locale mapping changed unexpectedly'
);

assert.strictEqual(
  contract.defaultPublicLocale,
  'fr',
  'French must remain the default public locale'
);

assert.strictEqual(
  contract.xDefaultLocale,
  'fr',
  'x-default must remain French'
);

assert.strictEqual(
  new Set(contract.publicLocales).size,
  6,
  'Exactly six unique public locales are required'
);

assert.ok(
  !JSON.stringify(contract).includes('pt-BR'),
  'pt-BR must not become a Phase 4 public locale'
);

assert.deepStrictEqual(
  contract.propertyClasses,
  ['residential', 'commercial', 'land'],
  'Locked Property classes changed unexpectedly'
);

assert.strictEqual(contract.commercialIsPropertyClass, true);
assert.strictEqual(contract.commercialIsPropertySubtype, false);

assert.strictEqual(contract.developmentIsFirstClassEntity, true);
assert.strictEqual(contract.developmentIsPropertySubtype, false);
assert.strictEqual(contract.unitIsProperty, true);

assert.strictEqual(
  contract.propertyListingRepresentationAreDistinct,
  true
);

assert.deepStrictEqual(
  contract.transactionTypes,
  ['sale', 'rent']
);

assert.deepStrictEqual(
  contract.rentalPeriods,
  ['monthly', 'seasonal', 'yearly']
);

assert.strictEqual(contract.saleRequiresNullRentalPeriod, true);
assert.strictEqual(contract.rentRequiresRentalPeriod, true);

assert.strictEqual(
  contract.offMarketIsProductCapability,
  false,
  'Off-market must not return as a Z Find product capability'
);

assert.strictEqual(
  contract.targetListingChannelDimension,
  false,
  'Final Listing model must not retain a meaningless standard-only channel axis'
);

assert.strictEqual(contract.canonicalPublicEntity, 'property');
assert.strictEqual(contract.canonicalOwnedByListing, false);
assert.strictEqual(contract.leadTarget, 'listing_id');

assert.deepStrictEqual(
  contract.publicIntents,
  ['buy', 'rent', 'invest', 'developments']
);

assert.strictEqual(
  contract.sixLanguagePhase4SurfaceRequired,
  true
);

assert.strictEqual(
  contract.historicalMigrationsImmutable,
  true
);

assert.strictEqual(
  contract.databaseChangeStrategy,
  'forward-only-expand-migrate-contract'
);

[
  'Property != Listing != Representation',
  'Commercial is a Property class.',
  'A Development is a first-class domain entity.',
  'A unit inside a Development is a Property.',
  'Off-market is not part of the target Z Find product.',
  'Historical migrations are immutable.',
  'expand -> migrate -> validate -> contract',
  'FR — French',
  'EN — English',
  'PT — Portuguese',
  'ES — Spanish',
  'DE — German',
  'IT — Italian'
].forEach((requiredText) => {
  assert.ok(
    doc.includes(requiredText),
    `Architecture document missing locked statement: ${requiredText}`
  );
});

console.log(
  'PASS: Phase 4R architecture contract locked — 6 locales, Commercial class, zero Off-market target'
);
