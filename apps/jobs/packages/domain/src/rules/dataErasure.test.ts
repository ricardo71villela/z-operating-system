// packages/domain/src/rules/dataErasure.test.ts

import assert from 'node:assert/strict';
import { planCandidateErasure } from './dataErasure';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${(err as Error).message}`);
    failed++;
  }
}

const context = { candidateId: 'c1' };

console.log('dataErasure.planCandidateErasure');

test('candidate erasure é sempre completo dentro da persona de candidato', () => {
  const plan = planCandidateErasure(context);

  assert.equal(plan.fullyErased, true);
  assert.equal(plan.actions.some((a) => a.action === ('retain' as any)), false);
});

test('dados candidate-only são apagados', () => {
  const plan = planCandidateErasure(context);

  const expected = [
    'candidate_profiles',
    'candidate_private_data',
    'candidate_experiences',
    'candidate_education',
    'candidate_skills',
    'candidate_languages',
    'candidate_documents',
    'candidate_data_consents',
    'job_alerts',
    'saved_job_offers',
    'institution_affiliations',
    'application_notes',
  ];

  for (const table of expected) {
    assert.equal(
      plan.actions.find((a) => a.table === table)?.action,
      'delete',
      `${table} devia ser delete`,
    );
  }
});

test('applications preserva apenas histórico anónimo', () => {
  const plan = planCandidateErasure(context);

  assert.equal(
    plan.actions.find((a) => a.table === 'applications')?.action,
    'anonymize',
  );

  assert.equal(
    plan.actions.find((a) => a.table === 'application_status_history')?.action,
    'anonymize',
  );
});

test('não toca dados transversais de outros papéis', () => {
  const plan = planCandidateErasure(context);
  const tables = plan.actions.map((a) => a.table as string);

  for (const forbidden of [
    'persons',
    'billing_events',
    'job_offer_reports',
    'organization_reports',
    'audit_logs',
    'auth.users',
    'auth.sessions',
  ]) {
    assert.equal(
      tables.includes(forbidden),
      false,
      `${forbidden} não pertence ao candidate erasure`,
    );
  }
});

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exitCode = 1;
}
