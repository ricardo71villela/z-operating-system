// packages/domain/src/rules/terminationTerms.test.ts
// Corre com: npx tsx packages/domain/src/rules/terminationTerms.test.ts
//
// Isto não testa factos legais — isso verifica-se por investigação,
// não por asserção em código. Testa consistência estrutural: que os
// cinco países têm a forma certa de dados, que ruleType corresponde
// aos campos presentes, e que a escala de antiguidade alemã (o único
// país com uma escala numérica completa) está ordenada corretamente.

import assert from 'node:assert/strict';
import { TERMINATION_TERMS_BY_COUNTRY, getTerminationTerms } from './terminationTerms';

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

console.log('terminationTerms — consistência estrutural');

test('os cinco países do bloco de lançamento estão todos presentes', () => {
  const codes = Object.keys(TERMINATION_TERMS_BY_COUNTRY).sort();
  assert.deepEqual(codes, ['DE', 'ES', 'FR', 'IT', 'PT']);
});

test('getTerminationTerms é case-insensitive e devolve null para país desconhecido', () => {
  assert.ok(getTerminationTerms('de'));
  assert.ok(getTerminationTerms('DE'));
  assert.equal(getTerminationTerms('XX'), null);
});

for (const code of Object.keys(TERMINATION_TERMS_BY_COUNTRY)) {
  const terms = TERMINATION_TERMS_BY_COUNTRY[code];

  test(`${code}: cada bloco tem fonte citada (probation, employerNotice) — nunca uma afirmação sem origem`, () => {
    assert.ok(terms.probation.source && terms.probation.sourceUrl, `${code} probation sem fonte`);
    assert.ok(terms.employerNotice.source && terms.employerNotice.sourceUrl, `${code} employerNotice sem fonte`);
  });

  test(`${code}: ruleType do aviso do empregador corresponde aos campos presentes (nunca promete uma escala que não tem)`, () => {
    if (terms.employerNotice.ruleType === 'statutory_tenure_scaled') {
      assert.ok(terms.employerNotice.tenureBands && terms.employerNotice.tenureBands.length > 0, `${code} diz tenure_scaled mas não tem tenureBands`);
    }
    if (terms.employerNotice.ruleType === 'statutory_fixed_minimum') {
      assert.ok(terms.employerNotice.fixedMinimum, `${code} diz fixed_minimum mas não tem fixedMinimum`);
    }
    if (terms.employerNotice.ruleType === 'cba_dependent') {
      assert.ok(!terms.employerNotice.tenureBands, `${code} diz cba_dependent mas ainda tem tenureBands — contradição`);
    }
  });

  test(`${code}: ruleType do período experimental corresponde ao que é dito`, () => {
    if (terms.probation.ruleType === 'statutory_fixed_maximum') {
      assert.ok(terms.probation.maxDuration, `${code} sem maxDuration`);
    }
  });
}

console.log('\nAlemanha — a única escala numérica completa, verificada por ordenação');

test('a escala de antiguidade alemã está em ordem crescente de anos', () => {
  const bands = TERMINATION_TERMS_BY_COUNTRY.DE.employerNotice.tenureBands!;
  for (let i = 1; i < bands.length; i++) {
    assert.ok(bands[i].minTenureYears > bands[i - 1].minTenureYears, `banda ${i} (${bands[i].minTenureYears} anos) não é maior que a anterior (${bands[i - 1].minTenureYears} anos)`);
  }
});

test('a escala alemã cobre desde o período experimental (0 anos) até 20+ anos', () => {
  const bands = TERMINATION_TERMS_BY_COUNTRY.DE.employerNotice.tenureBands!;
  assert.equal(bands[0].minTenureYears, 0);
  assert.equal(bands[bands.length - 1].minTenureYears, 20);
});

test('o aviso do trabalhador alemão é fixo (4 semanas), nunca escala com antiguidade — assimetria real, não erro', () => {
  const employeeNotice = TERMINATION_TERMS_BY_COUNTRY.DE.employeeNotice;
  assert.equal(employeeNotice.ruleType, 'statutory_fixed_minimum');
  assert.ok(!('tenureBands' in employeeNotice));
});

console.log('\nItália — o único país sem nenhum número nacional único (CBA-dependent nos dois avisos)');

test('Itália: aviso do empregador E do trabalhador são ambos cba_dependent — nenhum número nacional fingido', () => {
  assert.equal(TERMINATION_TERMS_BY_COUNTRY.IT.employerNotice.ruleType, 'cba_dependent');
  assert.equal(TERMINATION_TERMS_BY_COUNTRY.IT.employeeNotice.ruleType, 'cba_dependent');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
