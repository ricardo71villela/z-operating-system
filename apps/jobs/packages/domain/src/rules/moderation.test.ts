// packages/domain/src/rules/moderation.test.ts
// Corre com: npx tsx packages/domain/src/rules/moderation.test.ts

import assert from 'node:assert/strict';
import { canTransitionReport, resolveReport, createAuditEntry } from './moderation';
import type { ReportRecord } from './moderation';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    failed++;
  }
}

console.log('moderation rules');

test('open -> reviewing permitido', () => {
  assert.equal(canTransitionReport('open', 'reviewing'), true);
});

test('resolved é terminal', () => {
  assert.equal(canTransitionReport('resolved', 'open'), false);
});

test('denúncia confirmada conta para ERI e sugere suspensão da oferta', () => {
  const report: ReportRecord = { id: 'r1', targetType: 'job_offer', targetId: 'offer1', reason: 'salário divergente', status: 'reviewing' };
  const result = resolveReport({ report, resolution: 'confirmed' });
  assert.equal(result.countsAsConfirmedComplaint, true);
  assert.equal(result.requiresOfferSuspension, true);
  assert.equal(result.status, 'resolved');
});

test('denúncia infundada NÃO conta para ERI nem sugere suspensão', () => {
  const report: ReportRecord = { id: 'r2', targetType: 'job_offer', targetId: 'offer1', reason: 'engano do candidato', status: 'open' };
  const result = resolveReport({ report, resolution: 'unfounded' });
  assert.equal(result.countsAsConfirmedComplaint, false);
  assert.equal(result.requiresOfferSuspension, false);
});

test('resolver denúncia já resolvida lança erro (estado terminal)', () => {
  const report: ReportRecord = { id: 'r3', targetType: 'job_offer', targetId: 'offer1', reason: 'x', status: 'resolved' };
  assert.throws(() => resolveReport({ report, resolution: 'confirmed' }));
});

test('denúncia sobre organização confirmada NÃO marca requiresOfferSuspension (não é uma oferta)', () => {
  const report: ReportRecord = { id: 'r4', targetType: 'organization', targetId: 'org1', reason: 'práticas enganosas', status: 'open' };
  const result = resolveReport({ report, resolution: 'confirmed' });
  assert.equal(result.countsAsConfirmedComplaint, true);
  assert.equal(result.requiresOfferSuspension, false);
});

test('createAuditEntry produz entrada com timestamp e ação corretos', () => {
  const entry = createAuditEntry('admin1', 'job_offer', 'offer1', 'suspend', { status: 'published' }, { status: 'suspended' });
  assert.equal(entry.action, 'suspend');
  assert.equal(entry.entityType, 'job_offer');
  assert.ok(entry.createdAt.length > 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
