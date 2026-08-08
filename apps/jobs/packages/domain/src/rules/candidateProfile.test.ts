// packages/domain/src/rules/candidateProfile.test.ts
// Corre com: npx tsx packages/domain/src/rules/candidateProfile.test.ts
//
// Nota: já existiam 3 testes básicos de computeProfileCompleteness dentro
// de employerResponsibility.test.ts. Este ficheiro é a suite dedicada do
// módulo (como todos os outros módulos de domínio têm), com cobertura mais
// a fundo — não substitui os testes existentes, complementa-os.

import assert from 'node:assert/strict';
import { computeProfileCompleteness } from './candidateProfile';

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

console.log('candidateProfile.computeProfileCompleteness');

function baseInput(overrides: Partial<Parameters<typeof computeProfileCompleteness>[0]> = {}) {
  return {
    hasProfessionalTitle: false,
    hasSummary: false,
    experienceCount: 0,
    educationCount: 0,
    skillCount: 0,
    languageCount: 0,
    hasResumeDocument: false,
    hasVisibilitySet: false,
    ...overrides,
  };
}

test('perfil vazio -> score 0, 7 campos em falta', () => {
  const r = computeProfileCompleteness(baseInput());
  assert.equal(r.score, 0);
  assert.equal(r.missing.length, 7);
});

test('perfil completo -> score 100, nada em falta', () => {
  const r = computeProfileCompleteness(
    baseInput({
      hasProfessionalTitle: true,
      hasSummary: true,
      experienceCount: 2,
      educationCount: 1,
      skillCount: 5,
      languageCount: 2,
      hasResumeDocument: true,
      hasVisibilitySet: true,
    }),
  );
  assert.equal(r.score, 100);
  assert.deepEqual(r.missing, []);
});

test('os pesos de todos os campos somam exatamente 100', () => {
  // Se isto alguma vez deixar de somar 100, um perfil "completo" deixa de
  // dar score 100 — apanhar isso aqui é mais barato do que em produção.
  const r = computeProfileCompleteness(
    baseInput({
      hasProfessionalTitle: true,
      hasSummary: true,
      experienceCount: 1,
      educationCount: 1,
      skillCount: 1,
      languageCount: 1,
      hasResumeDocument: true,
    }),
  );
  assert.equal(r.score, 100);
});

test('cada campo em falta aparece na lista de "missing" com o nome esperado', () => {
  const r = computeProfileCompleteness(baseInput());
  for (const key of [
    'professional_title',
    'summary',
    'experience',
    'education',
    'skills',
    'languages',
    'resume',
  ]) {
    assert.ok(r.missing.includes(key), `esperava "${key}" em missing`);
  }
});

test('experienceCount e educationCount só importam como > 0, não a quantidade', () => {
  const umaExperiencia = computeProfileCompleteness(baseInput({ experienceCount: 1 }));
  const dezExperiencias = computeProfileCompleteness(baseInput({ experienceCount: 10 }));
  assert.equal(umaExperiencia.score, dezExperiencias.score);
});

test('hasVisibilitySet não influencia a pontuação (campo presente na interface mas não usado no cálculo)', () => {
  const semVisibilidade = computeProfileCompleteness(
    baseInput({ hasProfessionalTitle: true, hasVisibilitySet: false }),
  );
  const comVisibilidade = computeProfileCompleteness(
    baseInput({ hasProfessionalTitle: true, hasVisibilitySet: true }),
  );
  assert.equal(semVisibilidade.score, comVisibilidade.score);
  // Documenta o comportamento atual — se `hasVisibilitySet` for suposto
  // contar para o score no futuro, este teste falha e obriga a decisão
  // consciente, em vez de a lacuna passar despercebida.
});

test('perfil parcial -> score é soma exata dos pesos dos campos presentes', () => {
  const r = computeProfileCompleteness(
    baseInput({ hasProfessionalTitle: true, experienceCount: 1, hasVisibilitySet: true }),
  );
  assert.equal(r.score, 10 + 25); // title (10) + experience (25)
  assert.deepEqual(r.missing, ['summary', 'education', 'skills', 'languages', 'resume']);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
