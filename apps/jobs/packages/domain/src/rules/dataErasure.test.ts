// packages/domain/src/rules/dataErasure.test.ts
// Corre com: npx tsx packages/domain/src/rules/dataErasure.test.ts

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

console.log('dataErasure.planCandidateErasure');

test('candidato sem processos em curso nem faturação -> apagamento total, fullyErased=true', () => {
  const plan = planCandidateErasure({
    candidateId: 'c1',
    hasActiveBillingRecords: false,
    hasOpenLegalClaim: false,
    hasAuditLogEntriesUnderLegalRetention: false,
  });
  assert.equal(plan.fullyErased, true);
  assert.ok(!plan.actions.some((a) => a.action === 'retain'));
});

test('todos os dados de perfil são sempre "delete", nunca "retain" — sem exceção legal que os justifique', () => {
  const plan = planCandidateErasure({
    candidateId: 'c1',
    hasActiveBillingRecords: true,
    hasOpenLegalClaim: true,
    hasAuditLogEntriesUnderLegalRetention: true,
  });
  const profileTables = ['candidate_experiences', 'candidate_education', 'candidate_skills', 'candidate_languages', 'candidate_documents'];
  for (const table of profileTables) {
    const action = plan.actions.find((a) => a.table === table);
    assert.equal(action?.action, 'delete', `${table} devia ser delete`);
  }
});

test('faturação ativa -> retida, com base legal explícita citada, nunca "porque sim"', () => {
  const plan = planCandidateErasure({
    candidateId: 'c1',
    hasActiveBillingRecords: true,
    hasOpenLegalClaim: false,
    hasAuditLogEntriesUnderLegalRetention: false,
  });
  const billing = plan.actions.find((a) => a.table === 'billing_records');
  assert.equal(billing?.action, 'retain');
  assert.ok(billing && 'legalBasis' in billing && billing.legalBasis.length > 0);
  assert.equal(plan.fullyErased, false);
});

test('processo de denúncia em curso -> retido, nunca apagado a meio de um processo', () => {
  const plan = planCandidateErasure({
    candidateId: 'c1',
    hasActiveBillingRecords: false,
    hasOpenLegalClaim: true,
    hasAuditLogEntriesUnderLegalRetention: false,
  });
  const reports = plan.actions.find((a) => a.table === 'job_offer_reports');
  assert.equal(reports?.action, 'retain');
  assert.equal(plan.fullyErased, false);
});

test('auditoria do AI Act dentro do prazo mínimo -> retida, não é opcional', () => {
  const plan = planCandidateErasure({
    candidateId: 'c1',
    hasActiveBillingRecords: false,
    hasOpenLegalClaim: false,
    hasAuditLogEntriesUnderLegalRetention: true,
  });
  const audit = plan.actions.find((a) => a.table === 'audit_log');
  assert.equal(audit?.action, 'retain');
  assert.ok(audit && 'legalBasis' in audit && audit.legalBasis.includes('AI Act'));
});

test('candidate_profiles é sempre "anonymize", nunca "delete" — para não quebrar candidaturas já existentes', () => {
  const plan = planCandidateErasure({
    candidateId: 'c1',
    hasActiveBillingRecords: false,
    hasOpenLegalClaim: false,
    hasAuditLogEntriesUnderLegalRetention: false,
  });
  const profile = plan.actions.find((a) => a.table === 'candidate_profiles');
  assert.equal(profile?.action, 'anonymize');
});

test('applications é sempre "anonymize", nunca "delete" — mantém o histórico útil ao empregador, sem identificar a pessoa', () => {
  const plan = planCandidateErasure({
    candidateId: 'c1',
    hasActiveBillingRecords: false,
    hasOpenLegalClaim: false,
    hasAuditLogEntriesUnderLegalRetention: false,
  });
  const apps = plan.actions.find((a) => a.table === 'applications');
  assert.equal(apps?.action, 'anonymize');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
