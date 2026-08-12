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


test('Verification assessments are immutable audit records', () => {
  const fs = require('fs');
  const path = require('path');

  const trustMigration = fs.readFileSync(
    path.join(__dirname, '../../supabase/migrations/0009_state_and_trust_history.sql'),
    'utf8'
  );

  const auditMigration = fs.readFileSync(
    path.join(__dirname, '../../supabase/migrations/0016_verification_audit_invariant.sql'),
    'utf8'
  );

  // Verification remains its own durable assessment model.
  assert(
    /create\s+table\s+verification_assessments/i.test(trustMigration),
    'Verification truth must remain represented by verification_assessments'
  );

  // Legacy partner trust is not promoted back into canonical truth.
  assert(
    /partners\.trust_level[\s\S]*Legacy marketplace projection/i.test(trustMigration),
    'partners.trust_level must remain explicitly documented as a legacy marketplace projection'
  );

  // Application roles may not rewrite or delete past assessments.
  assert(
    /revoke\s+update\s*,\s*delete[\s\S]*on\s+verification_assessments[\s\S]*from\s+authenticated/i.test(auditMigration),
    'Authenticated application roles must not UPDATE or DELETE verification assessments'
  );

  // Defense in depth: the database itself rejects mutation.
  assert(
    /create\s+trigger\s+verification_assessments_append_only[\s\S]*before\s+update\s+or\s+delete\s+on\s+verification_assessments/i.test(auditMigration),
    'Verification assessments must be protected by an append-only database trigger'
  );

  assert(
    /raise\s+exception[\s\S]*append-only/i.test(auditMigration),
    'Attempts to mutate historical verification assessments must fail explicitly'
  );

  // The invariant must not block the creation of new assessments.
  assert(
    !/revoke\s+insert[\s\S]*on\s+verification_assessments/i.test(auditMigration),
    'Verification history must remain appendable through new assessment rows'
  );
});


test('Observation payload remains immutable while lifecycle may evolve', () => {
  const fs = require('fs');
  const path = require('path');

  const observationMigration = fs.readFileSync(
    path.join(__dirname, '../../supabase/migrations/0010_data_observations_and_provenance.sql'),
    'utf8'
  );

  const auditMigration = fs.readFileSync(
    path.join(__dirname, '../../supabase/migrations/0017_observation_audit_invariant.sql'),
    'utf8'
  );

  // Observations remain provenance/history records that complement
  // operational Property / Development / Listing projections.
  assert(
    /observations preserve source, time, validity and provenance/i.test(observationMigration),
    'Observations must preserve source, time, validity and provenance'
  );

  // Observation lifecycle remains explicit and independent.
  assert(
    /status\s+text[\s\S]*recorded[\s\S]*validated[\s\S]*superseded[\s\S]*archived/i.test(observationMigration),
    'Observation lifecycle states must remain explicit'
  );

  // Historical observations cannot be deleted.
  assert(
    /revoke\s+delete[\s\S]*on\s+data_observations[\s\S]*from\s+authenticated/i.test(auditMigration),
    'Authenticated application roles must not delete data observations'
  );

  // Database guard must protect factual payload.
  assert(
    /create\s+trigger\s+data_observations_audit_guard[\s\S]*before\s+update\s+or\s+delete\s+on\s+data_observations/i.test(auditMigration),
    'Observation factual payload must be protected by a database audit guard'
  );

  assert(
    /new\.value_jsonb\s+is\s+distinct\s+from\s+old\.value_jsonb/i.test(auditMigration),
    'Observation value payload must be immutable'
  );

  assert(
    /new\.source_id\s+is\s+distinct\s+from\s+old\.source_id/i.test(auditMigration),
    'Observation source must be immutable'
  );

  assert(
    /new\.provenance\s+is\s+distinct\s+from\s+old\.provenance/i.test(auditMigration),
    'Observation provenance must be immutable'
  );

  // Lifecycle fields deliberately remain mutable.
  assert(
    /Only status and valid_to may change/i.test(auditMigration),
    'Observation lifecycle must allow status and valid_to evolution'
  );

  // Evidence is append-only.
  assert(
    /revoke\s+update\s*,\s*delete[\s\S]*on\s+observation_evidence[\s\S]*from\s+authenticated/i.test(auditMigration),
    'Observation evidence must not be updated or deleted'
  );

  assert(
    /create\s+trigger\s+observation_evidence_append_only[\s\S]*before\s+update\s+or\s+delete\s+on\s+observation_evidence/i.test(auditMigration),
    'Observation evidence must be protected as append-only audit material'
  );
});


test('Outbox envelope is immutable while transport state may evolve', () => {
  const fs = require('fs');
  const path = require('path');

  const outboxMigration = fs.readFileSync(
    path.join(__dirname, '../../supabase/migrations/0011_integration_outbox.sql'),
    'utf8'
  );

  const invariantMigration = fs.readFileSync(
    path.join(__dirname, '../../supabase/migrations/0018_outbox_envelope_invariant.sql'),
    'utf8'
  );

  const integrationDomain = fs.readFileSync(
    path.join(__dirname, '../../packages/zfind-domain/integration.js'),
    'utf8'
  );

  // Outbox remains transport infrastructure, never a universal Event model.
  assert(
    /not a universal semantic Event[\s\S]*?model/i.test(outboxMigration),
    'Integration outbox must remain explicitly scoped as technical transport infrastructure'
  );

  assert(
    /transport metadata, not a[\s\S]*universal semantic ZOS Event model/i.test(integrationDomain),
    'Domain integration envelope must not become a universal semantic ZOS Event model'
  );

  // Database-level guard protects the existing message envelope.
  assert(
    /create\s+trigger\s+integration_outbox_envelope_guard[\s\S]*before\s+update\s+on\s+integration_outbox/i.test(invariantMigration),
    'Outbox message envelope must be protected by a database UPDATE guard'
  );

  assert(
    /new\.message_type\s+is\s+distinct\s+from\s+old\.message_type/i.test(invariantMigration),
    'Outbox message type must be immutable'
  );

  assert(
    /new\.subject_id\s+is\s+distinct\s+from\s+old\.subject_id/i.test(invariantMigration),
    'Outbox subject identity must be immutable'
  );

  assert(
    /new\.payload\s+is\s+distinct\s+from\s+old\.payload/i.test(invariantMigration),
    'Outbox payload must be immutable'
  );

  assert(
    /new\.occurred_at\s+is\s+distinct\s+from\s+old\.occurred_at/i.test(invariantMigration),
    'Outbox occurrence time must be immutable'
  );

  // Transport state deliberately remains mutable.
  assert(
    /available_at,\s*processed_at,\s*attempts,\s*last_error/i.test(invariantMigration),
    'Outbox invariant must explicitly preserve mutable transport state'
  );

  for (const field of ['available_at', 'processed_at', 'attempts', 'last_error']) {
    const mutationGuard = new RegExp(
      `new\\.${field}\\s+is\\s+distinct\\s+from\\s+old\\.${field}`,
      'i'
    );

    assert(
      !mutationGuard.test(invariantMigration),
      `${field} must remain mutable transport state`
    );
  }

  // No retention policy is invented at this stage.
  assert(
    !/revoke\s+delete[\s\S]*on\s+integration_outbox/i.test(invariantMigration),
    'Outbox envelope invariant must not invent a retention/delete policy'
  );
});


test('Public runtime cannot define an authoritative Trust scoring policy', () => {
  const fs = require('fs');
  const path = require('path');

  const trustDomain = fs.readFileSync(
    path.join(__dirname, '../../packages/zfind-domain/trust.js'),
    'utf8'
  );

  const trustMigration = fs.readFileSync(
    path.join(__dirname, '../../supabase/migrations/0009_state_and_trust_history.sql'),
    'utf8'
  );

  const publicBuild = fs.readFileSync(
    path.join(__dirname, '../../apps/zfind-web/scripts/build.js'),
    'utf8'
  );

  const publicViewModels = fs.readFileSync(
    path.join(__dirname, '../../apps/zfind-web/src/viewmodels.js'),
    'utf8'
  );

  const publicApp = fs.readFileSync(
    path.join(__dirname, '../../apps/zfind-web/src/app.js'),
    'utf8'
  );

  const fixturePath = path.join(
    __dirname,
    '../../apps/zfind-web/src/db.js'
  );

  // Verification assessments remain the durable source of verification truth.
  assert(
    /partners\.trust_level[\s\S]*Legacy marketplace projection[\s\S]*verification_assessments/i.test(trustMigration),
    'partners.trust_level must remain a legacy projection backed by verification truth'
  );

  // The domain deliberately defines Verification primitives only.
  assert(
    /createVerificationAssessment/.test(trustDomain),
    'Trust domain must retain explicit Verification assessment primitives'
  );

  assert(
    !/\b(?:derive|calculate|compute|create)TrustScore\b/i.test(trustDomain),
    'Trust domain must not invent a Trust Score algorithm before policy exists'
  );

  assert(
    !/\bTRUST_LEVELS\b|\bTRUST_SCORE\b|\btrustScore\b/.test(trustDomain),
    'Trust domain must not introduce authoritative score/level semantics implicitly'
  );

  // Sprint 1.10: the prototype fixture is retired completely rather than
  // remaining available as a second presentation-truth source.
  assert(
    !fs.existsSync(fixturePath),
    'Public Web runtime must not retain the prototype db.js fixture'
  );

  assert(
    !/read\(['"]db\.js['"]\)/.test(publicBuild) &&
    !/\+\s*db\s*\+/.test(publicBuild),
    'Public Web build must not load or concatenate db.js'
  );

  const publicRuntime = publicViewModels + '\n' + publicApp;

  const executablePublicRuntime = publicRuntime
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  assert(
    !/\bDB\.trust\b|\bgetTrustViewModel\b/.test(executablePublicRuntime),
    'Public runtime must not recover Trust presentation data from the retired fixture'
  );

  assert(
    !/\b(?:derive|calculate|compute|create)TrustScore\b/i.test(executablePublicRuntime),
    'Public runtime must not invent an authoritative Trust Score algorithm'
  );
});

console.log(`\nRESULT: ${passed} passed, 0 failed\n`);
