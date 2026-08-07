'use strict';
const assert = require('assert');
const domain = require('../../packages/zfind-domain');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✅ ${name}`);
}

console.log('\n=== Z FIND — ZOS v1.1 ALIGNMENT TESTS ===');

test('Registry refs preserve local identity without creating a second canonical record', () => {
  const ref = domain.registryRef('property', 'property-123');
  assert.deepStrictEqual(ref, { entityType: 'property', id: 'property-123' });
  assert(domain.isRegistryRef(ref));
});

test('Listing and Representation have independent state machines', () => {
  assert(domain.STATE_MACHINES.listing.includes('published'));
  assert(!domain.STATE_MACHINES.representation.includes('published'));
  assert(domain.STATE_MACHINES.representation.includes('active'));
});

test('Observation preserves source, validity and provenance', () => {
  const obs = domain.createObservation({
    entityType: 'property', entityId: 'property-123', metricCode: 'real_estate.gross_private_area_sqm',
    value: 148, unit: 'sqm', sourceId: 'source-1', confidence: 0.98,
    provenance: { document: 'official-plan.pdf' },
  });
  assert.strictEqual(obs.value, 148);
  assert.strictEqual(obs.sourceId, 'source-1');
  assert.strictEqual(obs.provenance.document, 'official-plan.pdf');
});

test('Verification is separate from Property identity', () => {
  const assessment = domain.createVerificationAssessment({
    subjectType: 'property', subjectId: 'property-123', verificationKind: 'ownership_document', outcome: 'verified', confidence: 1,
  });
  assert.strictEqual(assessment.outcome, 'verified');
});

test('Listing is explicitly a Marketplace projection of Representation', () => {
  const listing = domain.listingProjection({
    listingId: 'listing-1', representationId: 'rep-1', channel: 'standard', status: 'published', price: 500000, currencyIso: 'EUR',
  });
  assert.strictEqual(listing.representationId, 'rep-1');
});

test('Integration message is a transport envelope, scoped to Z Find', () => {
  const msg = domain.createIntegrationMessage({ messageType: 'zfind.listing.published', subjectType: 'listing', subjectId: 'listing-1' });
  assert.strictEqual(msg.producer, 'zfind');
  assert.strictEqual(msg.schemaVersion, 1);
});

console.log(`\nRESULT: ${passed} passed, 0 failed\n`);
