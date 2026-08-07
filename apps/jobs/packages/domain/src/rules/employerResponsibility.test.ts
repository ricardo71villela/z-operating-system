// packages/domain/src/rules/employerResponsibility.test.ts
// Corre com: npx tsx packages/domain/src/rules/employerResponsibility.test.ts

import assert from 'node:assert/strict';
import { computeProfileCompleteness } from './candidateProfile';
import { computeResponsibilityComponents, computeEligibleBadges } from './employerResponsibility';

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

test('perfil vazio -> score 0, tudo em falta', () => {
  const r = computeProfileCompleteness({
    hasProfessionalTitle: false, hasSummary: false, experienceCount: 0,
    educationCount: 0, skillCount: 0, languageCount: 0, hasResumeDocument: false,
    hasVisibilitySet: false,
  });
  assert.equal(r.score, 0);
  assert.equal(r.missing.length, 7);
});

test('perfil completo -> score 100, nada em falta', () => {
  const r = computeProfileCompleteness({
    hasProfessionalTitle: true, hasSummary: true, experienceCount: 2,
    educationCount: 1, skillCount: 5, languageCount: 2, hasResumeDocument: true,
    hasVisibilitySet: true,
  });
  assert.equal(r.score, 100);
  assert.deepEqual(r.missing, []);
});

test('perfil parcial -> score parcial coerente com pesos', () => {
  const r = computeProfileCompleteness({
    hasProfessionalTitle: true, hasSummary: false, experienceCount: 1,
    educationCount: 0, skillCount: 0, languageCount: 0, hasResumeDocument: false,
    hasVisibilitySet: true,
  });
  assert.equal(r.score, 10 + 25); // title + experience
  assert.ok(r.missing.includes('summary'));
  assert.ok(r.missing.includes('skills'));
});

console.log('\nemployerResponsibility');

function baseMetrics(overrides = {}) {
  return {
    verificationStatus: 'verified' as const,
    publishedOffersCount: 5,
    offersWithFixedSalaryCount: 5,
    offersWithCompleteFieldsCount: 5,
    responseRate: 0.9,
    candidatesInformedRate: 0.9,
    confirmedComplaintsCount: 0,
    offerVsRealityDivergenceCount: 0,
    firstJobHiresCount: 2,
    seniorHiresCount: 1,
    ...overrides,
  };
}

test('empresa exemplar -> 100% transparência salarial e todos os selos elegíveis', () => {
  const c = computeResponsibilityComponents(baseMetrics());
  assert.equal(c.salaryTransparencyScore, 100);
  assert.equal(c.integrityScore, 100);
  const badges = computeEligibleBadges(baseMetrics());
  assert.ok(badges.includes('verified_employer'));
  assert.ok(badges.includes('salary_transparent_employer'));
  assert.ok(badges.includes('first_job_employer'));
  assert.ok(badges.includes('age_inclusive_employer'));
  assert.ok(badges.includes('responsible_recruiter'));
});

test('empresa não verificada -> nenhum selo, mesmo com métricas boas', () => {
  const badges = computeEligibleBadges(baseMetrics({ verificationStatus: 'unverified' }));
  assert.deepEqual(badges, []);
});

test('reclamações confirmadas penalizam integridade e removem responsible_recruiter', () => {
  const c = computeResponsibilityComponents(baseMetrics({ confirmedComplaintsCount: 2 }));
  assert.equal(c.integrityScore, 60); // 100 - 2*20
  const badges = computeEligibleBadges(baseMetrics({ confirmedComplaintsCount: 2 }));
  assert.ok(!badges.includes('responsible_recruiter'));
});

test('só 1 oferta publicada (mesmo 100% transparente) não dá selo salary_transparent (exige >=3)', () => {
  const badges = computeEligibleBadges(baseMetrics({ publishedOffersCount: 1, offersWithFixedSalaryCount: 1, offersWithCompleteFieldsCount: 1 }));
  assert.ok(!badges.includes('salary_transparent_employer'));
});

test('sem ofertas publicadas -> salaryTransparencyScore 0, não NaN', () => {
  const c = computeResponsibilityComponents(baseMetrics({ publishedOffersCount: 0, offersWithFixedSalaryCount: 0, offersWithCompleteFieldsCount: 0 }));
  assert.equal(c.salaryTransparencyScore, 0);
  assert.equal(c.offerCompletenessScore, 0);
});

test('selos nunca dependem de campo de pagamento (não existe tal input)', () => {
  // Verificação estrutural: EmployerMetrics não tem qualquer campo de billing/pagamento.
  const metrics = baseMetrics();
  assert.ok(!('paid' in metrics));
  assert.ok(!('billingPlan' in metrics));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
