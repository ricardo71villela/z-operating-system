// packages/domain/src/rules/netSalarySimulator.test.ts
// Corre com: npx tsx packages/domain/src/rules/netSalarySimulator.test.ts

import assert from 'node:assert/strict';
import { calculateNetSalary, calculateGermanIncomeTax2026, calculateGermanSocialContributions, calculateGermanNetSalary, calculateLuxembourgNetSalary, luxembourgCIS2026, luxembourgCICO2_2026, LU_TAX_BRACKETS_2026 } from './netSalarySimulator';
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

// --- Luxemburgo: classe 1, 2026 ---

console.log('\nLuxemburgo (classe 1, 2026)');

test('tarifa LU: escalões contíguos e taxas crescentes até 42 %', () => {
  for (let i = 1; i < LU_TAX_BRACKETS_2026.length; i++) {
    assert.equal(LU_TAX_BRACKETS_2026[i].incomeFrom, LU_TAX_BRACKETS_2026[i - 1].incomeTo);
    assert.ok(LU_TAX_BRACKETS_2026[i].marginalRate > LU_TAX_BRACKETS_2026[i - 1].marginalRate);
  }
  assert.equal(LU_TAX_BRACKETS_2026.at(-1)!.marginalRate, 0.42);
});

test('CIS contínuo nas fronteiras (≈600 € a 11 265 €, 0 € a 80 000 €)', () => {
  assert.ok(Math.abs(luxembourgCIS2026(11265) - 600) < 1);
  assert.equal(luxembourgCIS2026(20000), 600);
  assert.ok(Math.abs(luxembourgCIS2026(79999)) < 0.02);
  assert.equal(luxembourgCIS2026(80000), 0);
});

test('CI-CO2 contínuo: 216 € até 40 000 €, ~0 € a 80 000 €', () => {
  assert.equal(luxembourgCICO2_2026(40000), 216);
  assert.ok(Math.abs(luxembourgCICO2_2026(79999)) < 0.01);
});

test('50 000 € brutos -> cálculo à mão (cotisations 6 358,64 €, net ≈ 38 760 €)', () => {
  const r = calculateLuxembourgNetSalary(50000);
  const dep = 0.014 * (50000 - 12 * 692.83);
  assert.ok(Math.abs(r.socialContributions - (50000 * 0.1155 + dep)) < 0.01);
  assert.equal(r.taxableIncome, 50000 - 5775 - 1020);
  assert.equal(r.taxCredits, 450 + 162);
  assert.ok(r.netAnnual > 38500 && r.netAnnual < 39000, `net ${r.netAnnual}`);
});

test('salário baixo: créditos superiores ao imposto -> imposto negativo (reembolsado)', () => {
  const r = calculateLuxembourgNetSalary(15000);
  assert.ok(r.incomeTax < 0);
  assert.ok(r.netAnnual > 15000 - r.socialContributions);
});

test('teto de cotisação pensão/saúde aplicado acima de 12 × 13 856,63 €', () => {
  const a = calculateLuxembourgNetSalary(200000);
  const b = calculateLuxembourgNetSalary(210000);
  assert.ok(Math.abs((b.socialContributions - a.socialContributions) - 10000 * 0.014) < 0.01);
});

test('rendimento zero -> tudo zero', () => {
  const r = calculateLuxembourgNetSalary(0);
  assert.equal(r.netAnnual, 0);
  assert.equal(r.incomeTax, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
