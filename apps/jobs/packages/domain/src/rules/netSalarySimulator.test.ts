// packages/domain/src/rules/netSalarySimulator.test.ts
// Corre com: npx tsx packages/domain/src/rules/netSalarySimulator.test.ts

import assert from 'node:assert/strict';
import { calculateNetSalary, calculateGermanIncomeTax2026, calculateGermanSocialContributions, calculateGermanNetSalary } from './netSalarySimulator';
import type { TaxBracket } from './netSalarySimulator';

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

// Escalões reais do barème progressif francês 2026 (Loi de finances pour
// 2026) — ver seeds/dev_seed_labor_legislation.sql.
const FR_2026_BRACKETS: TaxBracket[] = [
  { bracketOrder: 1, incomeFrom: 0, incomeTo: 11600, marginalRate: 0.0 },
  { bracketOrder: 2, incomeFrom: 11600, incomeTo: 29579, marginalRate: 0.11 },
  { bracketOrder: 3, incomeFrom: 29579, incomeTo: 84580, marginalRate: 0.3 },
  { bracketOrder: 4, incomeFrom: 84580, incomeTo: 181916, marginalRate: 0.41 },
  { bracketOrder: 5, incomeFrom: 181916, incomeTo: null, marginalRate: 0.45 },
];
const FR_SOCIAL_RATE = 0.22;

console.log('netSalarySimulator.calculateNetSalary');

test('rendimento abaixo do 1.º escalão -> imposto zero', () => {
  const r = calculateNetSalary({ grossAnnual: 10000, employeeSocialContributionRate: FR_SOCIAL_RATE, brackets: FR_2026_BRACKETS });
  // taxableIncome = 10000 * 0.78 = 7800, abaixo de 11600 -> sem imposto
  assert.equal(r.incomeTax, 0);
  assert.equal(r.simplifiedEstimateOnly, true);
});

test('imposto é progressivo por escalão, não taxa única sobre o total', () => {
  // taxableIncome = 40000 (bruto ajustado para dar um número redondo)
  const r = calculateNetSalary({ grossAnnual: 40000 / 0.78, employeeSocialContributionRate: FR_SOCIAL_RATE, brackets: FR_2026_BRACKETS });
  // Escalão 1 (0-11600): 0€; Escalão 2 (11600-29579): 17979*0.11=1977.69;
  // Escalão 3 (29579-40000): 10421*0.30=3126.30
  const expected = 17979 * 0.11 + 10421 * 0.3;
  assert.ok(Math.abs(r.incomeTax - expected) < 0.01, `esperava ${expected}, obteve ${r.incomeTax}`);
});

test('contribuições sociais calculadas sobre o bruto, à taxa configurada', () => {
  const r = calculateNetSalary({ grossAnnual: 30000, employeeSocialContributionRate: 0.22, brackets: FR_2026_BRACKETS });
  assert.equal(r.socialContributions, 30000 * 0.22);
});

test('líquido anual = bruto - contribuições sociais - imposto', () => {
  const r = calculateNetSalary({ grossAnnual: 30000, employeeSocialContributionRate: 0.22, brackets: FR_2026_BRACKETS });
  assert.ok(Math.abs(r.netAnnual - (r.grossAnnual - r.socialContributions - r.incomeTax)) < 0.001);
});

test('líquido mensal = líquido anual / 12', () => {
  const r = calculateNetSalary({ grossAnnual: 30000, employeeSocialContributionRate: 0.22, brackets: FR_2026_BRACKETS });
  assert.ok(Math.abs(r.netMonthly - r.netAnnual / 12) < 0.001);
});

test('taxa efetiva de imposto nunca excede a taxa marginal mais alta aplicável', () => {
  const r = calculateNetSalary({ grossAnnual: 40000, employeeSocialContributionRate: 0.22, brackets: FR_2026_BRACKETS });
  assert.ok(r.effectiveTaxRate < 0.3); // a taxa efetiva é sempre menor que a marginal do topo
});

test('rendimento zero -> tudo zero, sem erro nem divisão por zero', () => {
  const r = calculateNetSalary({ grossAnnual: 0, employeeSocialContributionRate: 0.22, brackets: FR_2026_BRACKETS });
  assert.equal(r.incomeTax, 0);
  assert.equal(r.netAnnual, 0);
  assert.equal(r.effectiveTaxRate, 0);
});

test('rendimento muito alto (último escalão, sem limite superior) não rebenta', () => {
  const r = calculateNetSalary({ grossAnnual: 500000, employeeSocialContributionRate: 0.22, brackets: FR_2026_BRACKETS });
  assert.ok(r.incomeTax > 0);
  assert.ok(r.netAnnual > 0 && r.netAnnual < r.grossAnnual);
});

// --- Alemanha: fórmula contínua §32a EStG, verificada por continuidade ---

console.log('\ncalculateGermanIncomeTax2026 (§32a EStG, 2026)');

test('rendimento até ao Grundfreibetrag (12.348€) -> imposto zero', () => {
  assert.equal(calculateGermanIncomeTax2026(0), 0);
  assert.equal(calculateGermanIncomeTax2026(12348), 0);
});

test('fronteira zona 2 (12.349€) -> imposto positivo mas pequeno', () => {
  const tax = calculateGermanIncomeTax2026(12349);
  assert.ok(tax > 0 && tax < 20);
});

test('continuidade matemática entre zonas: saltos de poucos cêntimos, nunca grandes (prova que os coeficientes estão certos)', () => {
  const boundaries = [17799, 17800, 69878, 69879, 277825, 277826];
  const values = boundaries.map((zve) => calculateGermanIncomeTax2026(zve));
  for (let i = 0; i < values.length - 1; i += 2) {
    const jump = Math.abs(values[i + 1] - values[i]);
    assert.ok(jump < 1, `salto de ${jump.toFixed(2)}€ na fronteira ${boundaries[i]}->${boundaries[i + 1]} é grande demais — sugere coeficiente errado`);
  }
});

test('zona do topo (45%, a partir de 277.826€) aplica a taxa marginal mais alta', () => {
  const tax1 = calculateGermanIncomeTax2026(300000);
  const tax2 = calculateGermanIncomeTax2026(310000);
  const marginalRate = (tax2 - tax1) / 10000;
  assert.ok(Math.abs(marginalRate - 0.45) < 0.001, `taxa marginal calculada: ${marginalRate}, esperada 0.45`);
});

console.log('\ncalculateGermanSocialContributions (2026)');

test('contribuições sociais calculadas corretamente sobre um salário comum, sem atingir os tetos', () => {
  const social = calculateGermanSocialContributions(35000);
  // RV 9,3% + AV 1,3% + KV 8,75% + PV 2,4% = 21,75% do bruto, nenhum teto atingido a 35.000€
  assert.ok(Math.abs(social - 35000 * 0.2175) < 0.01);
});

test('teto de contribuição do ramo saúde/cuidados (69.750€) aplicado corretamente acima do limite', () => {
  const socialAtCap = calculateGermanSocialContributions(69750);
  const socialAboveCap = calculateGermanSocialContributions(100000);
  // Acima do teto de saúde/cuidados, só a pensão/desemprego continuam a crescer com o rendimento
  const expectedGrowth = (100000 - 69750) * (0.093 + 0.013);
  assert.ok(Math.abs((socialAboveCap - socialAtCap) - expectedGrowth) < 0.01);
});

console.log('\ncalculateGermanNetSalary (integração)');

test('35.000€ brutos -> resultado plausível, líquido positivo e inferior ao bruto', () => {
  const r = calculateGermanNetSalary(35000);
  assert.ok(r.netAnnual > 0 && r.netAnnual < 35000);
  assert.equal(r.simplifiedEstimateOnly, true);
});

test('rendimento zero -> tudo zero, sem erro', () => {
  const r = calculateGermanNetSalary(0);
  assert.equal(r.incomeTax, 0);
  assert.equal(r.netAnnual, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
