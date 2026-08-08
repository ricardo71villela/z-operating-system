// packages/domain/src/rules/companyClassification.test.ts
// Corre com: npx tsx packages/domain/src/rules/companyClassification.test.ts

import assert from 'node:assert/strict';
import { estimateSmeCategoryByEmployeeCount } from './companyClassification';

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

console.log('companyClassification.estimateSmeCategoryByEmployeeCount');

// Limiares exatos da Recomendação 2003/361/CE (Artigo 2.º do Anexo).
test('0 funcionários -> micro', () => {
  assert.equal(estimateSmeCategoryByEmployeeCount(0).category, 'micro');
});
test('9 funcionários -> micro (limite superior)', () => {
  assert.equal(estimateSmeCategoryByEmployeeCount(9).category, 'micro');
});
test('10 funcionários -> small (cruza o limiar)', () => {
  assert.equal(estimateSmeCategoryByEmployeeCount(10).category, 'small');
});
test('49 funcionários -> small (limite superior)', () => {
  assert.equal(estimateSmeCategoryByEmployeeCount(49).category, 'small');
});
test('50 funcionários -> medium (cruza o limiar)', () => {
  assert.equal(estimateSmeCategoryByEmployeeCount(50).category, 'medium');
});
test('249 funcionários -> medium (limite superior)', () => {
  assert.equal(estimateSmeCategoryByEmployeeCount(249).category, 'medium');
});
test('250 funcionários -> large (cruza o limiar)', () => {
  assert.equal(estimateSmeCategoryByEmployeeCount(250).category, 'large');
});
test('10000 funcionários -> large', () => {
  assert.equal(estimateSmeCategoryByEmployeeCount(10000).category, 'large');
});
test('null -> unknown', () => {
  assert.equal(estimateSmeCategoryByEmployeeCount(null).category, 'unknown');
});
test('undefined -> unknown', () => {
  assert.equal(estimateSmeCategoryByEmployeeCount(undefined).category, 'unknown');
});
test('valor negativo -> unknown (dado inválido, nunca classificado)', () => {
  assert.equal(estimateSmeCategoryByEmployeeCount(-5).category, 'unknown');
});
test('resultado inclui sempre o aviso de estimativa parcial', () => {
  const r = estimateSmeCategoryByEmployeeCount(20);
  assert.equal(r.partialEstimateOnly, true);
  assert.equal(r.criterionUsed, 'employee_count_only');
  assert.deepEqual(r.missingCriteria, ['turnover_or_balance_sheet']);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
