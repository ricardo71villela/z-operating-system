// packages/domain/src/rules/salaryReference.test.ts
// Corre com: npx tsx packages/domain/src/rules/salaryReference.test.ts

import assert from 'node:assert/strict';
import { compareSalaryToReference } from './salaryReference';
import type { SalaryLevel } from './salaryReference';

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

// Valores reais da tabela CCT AHRESP/SITESE (BTE n.º 2, 15 jan. 2025),
// vigente 1 jan. a 31 dez. 2025 — ver seeds/dev_seed_occupations_and_salaries.sql.
const AHRESP_LEVELS: SalaryLevel[] = [
  { levelCode: 'I', levelRank: 1, monthlyMinimum: 870.0, currency: 'EUR' },
  { levelCode: 'II', levelRank: 2, monthlyMinimum: 873.0, currency: 'EUR' },
  { levelCode: 'V', levelRank: 5, monthlyMinimum: 886.0, currency: 'EUR' },
  { levelCode: 'VII', levelRank: 7, monthlyMinimum: 924.0, currency: 'EUR' },
  { levelCode: 'VIII', levelRank: 8, monthlyMinimum: 978.0, currency: 'EUR' },
  { levelCode: 'XI', levelRank: 11, monthlyMinimum: 1381.0, currency: 'EUR' },
];

console.log('salaryReference.compareSalaryToReference');

test('salário abaixo do nível mínimo da convenção -> below_reference', () => {
  const r = compareSalaryToReference(800, 'EUR', AHRESP_LEVELS);
  assert.equal(r.signal, 'below_reference');
  assert.equal(r.closestLevel?.levelCode, 'I');
  assert.equal(r.referenceRange?.min, 870);
  assert.equal(r.referenceRange?.max, 1381);
});

test('salário acima do nível máximo da convenção -> above_reference', () => {
  const r = compareSalaryToReference(2000, 'EUR', AHRESP_LEVELS);
  assert.equal(r.signal, 'above_reference');
  assert.equal(r.closestLevel?.levelCode, 'XI');
});

test('salário exatamente igual a um nível -> within_reference, corresponde a esse nível', () => {
  const r = compareSalaryToReference(924, 'EUR', AHRESP_LEVELS);
  assert.equal(r.signal, 'within_reference');
  assert.equal(r.closestLevel?.levelCode, 'VII');
});

test('salário entre dois níveis -> within_reference, corresponde ao nível mais próximo por baixo', () => {
  const r = compareSalaryToReference(950, 'EUR', AHRESP_LEVELS);
  assert.equal(r.signal, 'within_reference');
  assert.equal(r.closestLevel?.levelCode, 'VII'); // 924 <= 950 < 978
});

test('salário no limite inferior exato da convenção -> within_reference (não below)', () => {
  const r = compareSalaryToReference(870, 'EUR', AHRESP_LEVELS);
  assert.equal(r.signal, 'within_reference');
  assert.equal(r.closestLevel?.levelCode, 'I');
});

test('moeda sem correspondência nos níveis fornecidos -> no_reference_available', () => {
  const r = compareSalaryToReference(1000, 'USD', AHRESP_LEVELS);
  assert.equal(r.signal, 'no_reference_available');
  assert.equal(r.closestLevel, undefined);
});

test('sem níveis nenhuns -> no_reference_available', () => {
  const r = compareSalaryToReference(1000, 'EUR', []);
  assert.equal(r.signal, 'no_reference_available');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
