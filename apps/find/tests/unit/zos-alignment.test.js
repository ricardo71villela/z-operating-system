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


test('Every future Z Find profile gets an Identity Bridge binding', () => {
  const fs = require('fs');
  const path = require('path');

  const migration = fs.readFileSync(
    path.join(__dirname, '../../supabase/migrations/0014_identity_binding_invariant.sql'),
    'utf8'
  );

  // Future profiles are covered automatically.
  assert(
    /create\s+trigger\s+profiles_create_identity_binding[\s\S]*after\s+insert\s+on\s+profiles/i.test(migration),
    'Identity binding invariant must be enforced by an AFTER INSERT trigger on profiles'
  );

  // The trigger preserves the local profile/Auth UUID and only creates a bridge.
  assert(
    /insert\s+into\s+identity_bindings\s*\(\s*profile_id\s*\)[\s\S]*values\s*\(\s*new\.id\s*\)[\s\S]*on\s+conflict\s*\(\s*profile_id\s*\)\s+do\s+nothing/i.test(migration),
    'New profiles must create an idempotent identity_bindings row using the same profile UUID'
  );

  // Profiles created in the gap between 0013 and 0014 are reconciled.
  assert(
    /insert\s+into\s+identity_bindings\s*\(\s*profile_id\s*\)[\s\S]*select\s+id[\s\S]*from\s+profiles[\s\S]*on\s+conflict\s*\(\s*profile_id\s*\)\s+do\s+nothing/i.test(migration),
    'Migration must defensively backfill any profiles missing an identity binding'
  );

  // The bridge must never rewrite the local application/Auth identity.
  assert(
    !/update\s+profiles[\s\S]*set\s+id\s*=/i.test(migration),
    'Identity convergence must never replace profiles.id'
  );
});

console.log(`\nRESULT: ${passed} passed, 0 failed\n`);
