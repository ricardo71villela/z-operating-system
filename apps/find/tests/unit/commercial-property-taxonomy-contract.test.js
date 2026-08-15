'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');

const contractPath = path.join(
  ROOT,
  'apps/find/config/commercial-property-taxonomy-v1.json'
);

const phase4rPath = path.join(
  ROOT,
  'apps/find/config/phase4r-architecture-contract.json'
);

const docPath = path.join(
  ROOT,
  'apps/find/docs/architecture/COMMERCIAL-PROPERTY-TAXONOMY-v1.md'
);

const contract = JSON.parse(
  fs.readFileSync(contractPath, 'utf8')
);

const phase4r = JSON.parse(
  fs.readFileSync(phase4rPath, 'utf8')
);

const doc = fs.readFileSync(docPath, 'utf8');

const canonicalCodes =
  contract.canonicalSubtypes.map(item => item.code);

assert.strictEqual(
  contract.version,
  1,
  'Commercial taxonomy contract version must be v1'
);

assert.strictEqual(
  contract.propertyClass,
  'commercial',
  'Commercial taxonomy must belong to Property class commercial'
);

assert.deepStrictEqual(
  phase4r.propertyClasses,
  ['residential', 'commercial', 'land'],
  'R2.4 must preserve locked Phase 4R Property classes'
);

assert.strictEqual(
  phase4r.commercialIsPropertyClass,
  true,
  'Commercial must remain a Property class'
);

assert.strictEqual(
  phase4r.commercialIsPropertySubtype,
  false,
  'Commercial must never become subtype=commercial'
);

assert.deepStrictEqual(
  canonicalCodes,
  [
    'office',
    'retail',
    'industrial_logistics',
    'hospitality'
  ],
  'Commercial v1 subtype vocabulary changed unexpectedly'
);

assert.deepStrictEqual(
  contract.canonicalSubtypes.map(item => item.sortOrder),
  [1, 2, 3, 4],
  'Commercial subtype sort order must be deterministic'
);

assert.strictEqual(
  new Set(canonicalCodes).size,
  canonicalCodes.length,
  'Commercial subtype codes must be globally unique within v1'
);

[
  'commercial',
  'development',
  'building',
  'mixed_use',
  'btr',
  'pbsa',
  'senior_living'
].forEach(code => {
  assert.ok(
    !canonicalCodes.includes(code),
    `${code} must not become a Commercial Property subtype`
  );
});

assert.deepStrictEqual(
  contract.orthogonalOperatingModels,
  ['btr', 'pbsa', 'senior_living'],
  'Operating-model boundary changed unexpectedly'
);

assert.deepStrictEqual(
  contract.nonSubtypeStructuralConcepts,
  [
    'commercial',
    'development',
    'building',
    'mixed_use'
  ],
  'Structural non-subtype boundary changed unexpectedly'
);

const expectedAliases = {
  shop: 'retail',
  store: 'retail',
  warehouse: 'industrial_logistics',
  logistics: 'industrial_logistics',
  industrial: 'industrial_logistics',
  hotel: 'hospitality',
  aparthotel: 'hospitality',
  hostel: 'hospitality',
  resort: 'hospitality'
};

assert.deepStrictEqual(
  contract.normalizationAliases,
  expectedAliases,
  'Commercial normalization aliases changed unexpectedly'
);

Object.values(
  contract.normalizationAliases
).forEach(target => {
  assert.ok(
    canonicalCodes.includes(target),
    `Normalization alias points to non-canonical subtype: ${target}`
  );
});

assert.strictEqual(
  contract.labelsArePresentationLayer,
  true,
  'Localized labels must not become DB taxonomy truth'
);

assert.strictEqual(
  contract.propertyClassDerivedServerSide,
  true,
  'Browser must not become Property-class authority'
);

assert.strictEqual(
  contract.listingTransactionIndependent,
  true,
  'Property subtype must remain independent from sale/rent'
);

assert.strictEqual(
  contract.listingDistributionIndependent,
  true,
  'Property subtype must remain independent from Listing distribution'
);

assert.strictEqual(
  contract.developmentRemainsFirstClassEntity,
  true,
  'Development must remain a first-class entity'
);

[
  'healthcare',
  'clinic',
  'medical',
  'coworking',
  'restaurant',
  'serviced_apartments'
].forEach(code => {
  assert.ok(
    contract.deferredConcepts.includes(code),
    `${code} must remain explicitly deferred in v1`
  );
});

assert.ok(
  /property_class = commercial[\s\S]*subtype\s+= hospitality/i.test(doc),
  'Architecture document must record Hospitality under Commercial'
);

assert.ok(
  /industrial_logistics/i.test(doc),
  'Architecture document must explain Industrial/Logistics decision'
);

assert.ok(
  /BTR[\s\S]*PBSA[\s\S]*Senior Living/i.test(doc),
  'Architecture document must preserve operating-model boundary'
);

assert.ok(
  /R2\.4A locks semantics only[\s\S]*mutate the database/i.test(doc),
  'R2.4A must remain semantics-only'
);

assert.ok(
  /Development remains a first-class domain entity/i.test(doc),
  'Development boundary must remain explicit'
);

console.log(
  'PASS: Phase 4R R2.4A Commercial Property taxonomy contract — office, retail, industrial_logistics, hospitality'
);
