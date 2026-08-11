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


test('Every future Registry-eligible Z Find entity gets a Registry Bridge binding', () => {
  const fs = require('fs');
  const path = require('path');

  const migration = fs.readFileSync(
    path.join(__dirname, '../../supabase/migrations/0015_registry_binding_invariant.sql'),
    'utf8'
  );

  const entities = [
    ['organisations', 'organisation_id'],
    ['partners', 'partner_id'],
    ['properties', 'property_id'],
    ['developments', 'development_id'],
  ];

  for (const [table, targetColumn] of entities) {
    const triggerPattern = new RegExp(
      `create\\s+trigger\\s+${table}_create_registry_binding[\\s\\S]*?after\\s+insert\\s+on\\s+${table}`,
      'i'
    );

    assert(
      triggerPattern.test(migration),
      `Registry binding invariant must be enforced by an AFTER INSERT trigger on ${table}`
    );

    const backfillPattern = new RegExp(
      `insert\\s+into\\s+registry_bindings\\s*\\(\\s*entity_type\\s*,\\s*${targetColumn}\\s*\\)[\\s\\S]*?select[\\s\\S]*?id[\\s\\S]*?from\\s+${table}[\\s\\S]*?on\\s+conflict\\s+do\\s+nothing`,
      'i'
    );

    assert(
      backfillPattern.test(migration),
      `${table} must be defensively reconciled into registry_bindings`
    );
  }

  assert(
    /when\s+'organisations'[\s\S]*values\s*\(\s*'organisation'\s*,\s*new\.id\s*\)/i.test(migration),
    'Organisation bindings must preserve organisations.id'
  );

  assert(
    /when\s+'partners'[\s\S]*values\s*\(\s*'partner'\s*,\s*new\.id\s*\)/i.test(migration),
    'Partner bindings must preserve partners.id'
  );

  assert(
    /when\s+'properties'[\s\S]*values\s*\(\s*'property'\s*,\s*new\.id\s*\)/i.test(migration),
    'Property bindings must preserve properties.id'
  );

  assert(
    /when\s+'developments'[\s\S]*values\s*\(\s*'development'\s*,\s*new\.id\s*\)/i.test(migration),
    'Development bindings must preserve developments.id'
  );

  assert(
    !/update\s+(organisations|partners|properties|developments)[\s\S]*set\s+id\s*=/i.test(migration),
    'Registry convergence must never replace local entity UUIDs'
  );
});


test('Geography binding remains optional and command-owned', () => {
  const fs = require('fs');
  const path = require('path');

  const migration = fs.readFileSync(
    path.join(__dirname, '../../supabase/migrations/0012_geography_registry_bridge.sql'),
    'utf8'
  );

  const geographyPort = fs.readFileSync(
    path.join(__dirname, '../../packages/import-engine/geography-port.js'),
    'utf8'
  );

  // zones_lite remains a marketplace projection and may legitimately
  // exist without a canonical Geography binding.
  assert(
    /geography_entity_id\s+text/i.test(migration),
    'zones_lite must expose an optional canonical Geography reference'
  );

  assert(
    /geography_binding_status\s+text\s+not\s+null\s+default\s+'unbound'/i.test(migration),
    'New zones_lite rows must remain unbound by default'
  );

  assert(
    /check\s*\(\s*geography_binding_status\s+in\s*\(\s*'unbound'\s*,\s*'linked'\s*,\s*'superseded'\s*\)\s*\)/i.test(migration),
    'Geography binding lifecycle must explicitly preserve the unbound state'
  );

  // No database trigger should invent or auto-link canonical Geography.
  assert(
    !/create\s+trigger[\s\S]*?(before|after)\s+insert\s+on\s+zones_lite/i.test(migration),
    'zones_lite must not auto-bind to canonical Geography on insert'
  );

  // Canonical Geography mutations remain behind the command port.
  assert(
    /function\s+createGeographyPort\s*\(/i.test(geographyPort),
    'Canonical Geography writes must remain behind the Geography command port'
  );

  assert(
    /function\s+submit\s*\(\s*command\s*\)/i.test(geographyPort),
    'Geography port must accept explicit commands'
  );

  assert(
    /processedKeys\s*=\s*new\s+Map\s*\(\s*\)/i.test(geographyPort),
    'Geography command boundary must preserve idempotency'
  );

  assert(
    /succession_proposal_logged_not_executed/i.test(geographyPort),
    'Succession proposals must never be auto-executed by the Geography port'
  );

  assert(
    !/zones_lite|ZFindServices|renderZone|Marketplace/i.test(geographyPort),
    'Canonical Geography port must remain decoupled from Z Find marketplace/UI projections'
  );
});

console.log(`\nRESULT: ${passed} passed, 0 failed\n`);
