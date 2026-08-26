// packages/domain/src/rules/matching.test.ts
// Corre com: npx tsx packages/domain/src/rules/matching.test.ts

import assert from 'node:assert/strict';
import { computeMatchScore, explainMatchFactors } from './matching';
import type { CandidateMatchingProfile, OfferMatchingProfile } from './matching';

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

function baseCandidate(overrides: Partial<CandidateMatchingProfile> = {}): CandidateMatchingProfile {
  return {
    skills: [],
    desiredContractTypes: [],
    desiredWorkRegime: null,
    desiredSalaryMin: null,
    desiredSalaryMax: null,
    desiredSalaryCurrency: null,
    interestedInFirstJob: false,
    interestedInSeniorRoles: false,
    interestedInInterim: false,
    locationId: null,
    isInternationallyMobile: false,
    ...overrides,
  };
}

function baseOffer(overrides: Partial<OfferMatchingProfile> = {}): OfferMatchingProfile {
  return {
    title: 'Engenheiro de Software Backend',
    description: 'Procuramos alguém com experiência em typescript, postgres e apis distribuídas.',
    contractType: 'permanent',
    workRegime: 'hybrid',
    salaryMin: 2000,
    salaryMax: 2500,
    salaryCurrency: 'EUR',
    pillar: 'professional_careers',
    locationId: 'loc-1',
    ...overrides,
  };
}

console.log('matching.computeMatchScore');

test('candidato sem qualquer preferência indicada -> score médio, tudo "unknown", nunca zero nem penalizado', () => {
  const r = computeMatchScore(baseCandidate(), baseOffer());
  assert.ok(r.score > 0, 'candidato sem dados nunca deve ficar a zero por omissão');
  assert.ok(r.factors.every((f) => f.level === 'unknown' || f.code === 'location'));
});

test('competências do candidato aparecem na descrição -> fator skills = match', () => {
  const r = computeMatchScore(baseCandidate({ skills: ['typescript', 'postgres'] }), baseOffer());
  const skillsFactor = r.factors.find((f) => f.code === 'skills');
  assert.equal(skillsFactor?.level, 'match');
  assert.equal(skillsFactor?.evidenceSource, 'description_fallback');
});

test('nenhuma competência em comum -> fator skills = mismatch', () => {
  const r = computeMatchScore(baseCandidate({ skills: ['culinária', 'jardinagem'] }), baseOffer());
  const skillsFactor = r.factors.find((f) => f.code === 'skills');
  assert.equal(skillsFactor?.level, 'mismatch');
});

test('qualificações obrigatórias explícitas tornam-se a autoridade de evidência de skills', () => {
  const r = computeMatchScore(
    baseCandidate({ skills: ['typescript', 'postgres'] }),
    baseOffer({
      description: 'Descrição genérica sem requisitos técnicos.',
      requiredQualifications: 'TypeScript PostgreSQL',
      preferredQualifications: null,
    }),
  );
  const skills = r.factors.find((f) => f.code === 'skills');
  assert.equal(skills?.level, 'match');
  assert.equal(skills?.evidenceSource, 'explicit_requirements');
  assert.equal(skills?.requiredMatchCount, 2);
  assert.equal(skills?.preferredMatchCount, 0);
});

test('match apenas em qualificações preferenciais é partial, nunca prova requisito obrigatório', () => {
  const r = computeMatchScore(
    baseCandidate({ skills: ['kubernetes'] }),
    baseOffer({
      description: 'Função de plataforma.',
      requiredQualifications: 'Java Spring Hibernate',
      preferredQualifications: 'Kubernetes',
    }),
  );
  const skills = r.factors.find((f) => f.code === 'skills');
  assert.equal(skills?.level, 'partial');
  assert.equal(skills?.evidenceSource, 'explicit_requirements');
  assert.equal(skills?.requiredMatchCount, 0);
  assert.equal(skills?.preferredMatchCount, 1);
});

test('descrição não pode mascarar incompatibilidade quando existem requisitos explícitos', () => {
  const r = computeMatchScore(
    baseCandidate({ skills: ['typescript'] }),
    baseOffer({
      description: 'A equipa trabalha diariamente com TypeScript.',
      requiredQualifications: 'Java Spring Hibernate',
      preferredQualifications: null,
    }),
  );
  const skills = r.factors.find((f) => f.code === 'skills');
  assert.equal(skills?.level, 'mismatch');
  assert.equal(skills?.evidenceSource, 'explicit_requirements');
});

test('responsabilidades não são silenciosamente tratadas como requisitos', () => {
  const r = computeMatchScore(
    baseCandidate({ skills: ['kubernetes'] }),
    baseOffer({
      title: 'Platform Engineer',
      description: 'Função de engenharia de plataforma.',
      responsibilities: 'Operar Kubernetes em produção.',
      requiredQualifications: null,
      preferredQualifications: null,
    }),
  );
  const skills = r.factors.find((f) => f.code === 'skills');
  assert.equal(skills?.evidenceSource, 'description_fallback');
  assert.equal(skills?.level, 'mismatch');
});

test('tipo de contrato desejado corresponde -> match; não corresponde -> mismatch', () => {
  const match = computeMatchScore(baseCandidate({ desiredContractTypes: ['permanent'] }), baseOffer({ contractType: 'permanent' }));
  const mismatch = computeMatchScore(baseCandidate({ desiredContractTypes: ['permanent'] }), baseOffer({ contractType: 'fixed_term' }));
  assert.equal(match.factors.find((f) => f.code === 'contract_type')?.level, 'match');
  assert.equal(mismatch.factors.find((f) => f.code === 'contract_type')?.level, 'mismatch');
});

test('regime de trabalho: remoto desejado vs oferta híbrida -> partial (compatível), não mismatch', () => {
  const r = computeMatchScore(baseCandidate({ desiredWorkRegime: 'remote' }), baseOffer({ workRegime: 'hybrid' }));
  assert.equal(r.factors.find((f) => f.code === 'work_regime')?.level, 'partial');
});

test('regime de trabalho: presencial desejado vs oferta remota -> mismatch (não compatível)', () => {
  const r = computeMatchScore(baseCandidate({ desiredWorkRegime: 'on_site' }), baseOffer({ workRegime: 'remote' }));
  assert.equal(r.factors.find((f) => f.code === 'work_regime')?.level, 'mismatch');
});

test('salário mínimo desejado é atingido -> salary_fit = match', () => {
  const r = computeMatchScore(
    baseCandidate({ desiredSalaryMin: 2000, desiredSalaryCurrency: 'EUR' }),
    baseOffer({ salaryMin: 2000, salaryMax: 2500, salaryCurrency: 'EUR' }),
  );
  assert.equal(r.factors.find((f) => f.code === 'salary_fit')?.level, 'match');
});

test('salário desejado muito acima da oferta -> salary_fit = mismatch', () => {
  const r = computeMatchScore(
    baseCandidate({ desiredSalaryMin: 5000, desiredSalaryCurrency: 'EUR' }),
    baseOffer({ salaryMin: 2000, salaryMax: 2200, salaryCurrency: 'EUR' }),
  );
  assert.equal(r.factors.find((f) => f.code === 'salary_fit')?.level, 'mismatch');
});

test('moedas diferentes -> salary_fit = unknown, nunca comparado incorretamente', () => {
  const r = computeMatchScore(
    baseCandidate({ desiredSalaryMin: 2000, desiredSalaryCurrency: 'USD' }),
    baseOffer({ salaryCurrency: 'EUR' }),
  );
  assert.equal(r.factors.find((f) => f.code === 'salary_fit')?.level, 'unknown');
});

test('candidato interessado em primeiro emprego + oferta pillar first_jobs -> life_stage match', () => {
  const r = computeMatchScore(baseCandidate({ interestedInFirstJob: true }), baseOffer({ pillar: 'first_jobs' }));
  assert.equal(r.factors.find((f) => f.code === 'life_stage')?.level, 'match');
});

test('pilar "professional_careers" nunca desqualifica, mesmo sem preferência explícita alinhada', () => {
  const r = computeMatchScore(baseCandidate({ interestedInSeniorRoles: true }), baseOffer({ pillar: 'professional_careers' }));
  assert.equal(r.factors.find((f) => f.code === 'life_stage')?.level, 'match');
});

test('oferta remota -> location sempre match, independentemente da localização do candidato', () => {
  const r = computeMatchScore(baseCandidate({ locationId: 'loc-999' }), baseOffer({ workRegime: 'remote', locationId: 'loc-1' }));
  assert.equal(r.factors.find((f) => f.code === 'location')?.level, 'match');
});

test('localizações diferentes, candidato móvel -> partial; não móvel -> mismatch', () => {
  const mobile = computeMatchScore(baseCandidate({ locationId: 'loc-2', isInternationallyMobile: true }), baseOffer({ locationId: 'loc-1' }));
  const notMobile = computeMatchScore(baseCandidate({ locationId: 'loc-2', isInternationallyMobile: false }), baseOffer({ locationId: 'loc-1' }));
  assert.equal(mobile.factors.find((f) => f.code === 'location')?.level, 'partial');
  assert.equal(notMobile.factors.find((f) => f.code === 'location')?.level, 'mismatch');
});

test('candidato totalmente alinhado em todos os fatores -> score próximo de 100', () => {
  const r = computeMatchScore(
    baseCandidate({
      skills: ['typescript', 'postgres', 'apis'],
      desiredContractTypes: ['permanent'],
      desiredWorkRegime: 'hybrid',
      desiredSalaryMin: 2000,
      desiredSalaryCurrency: 'EUR',
      interestedInSeniorRoles: false,
      locationId: 'loc-1',
    }),
    baseOffer(),
  );
  assert.ok(r.score >= 90, `esperava score alto, obteve ${r.score}`);
});

test('candidato totalmente desalinhado em todos os fatores -> score baixo', () => {
  const r = computeMatchScore(
    baseCandidate({
      skills: ['culinária'],
      desiredContractTypes: ['fixed_term'],
      desiredWorkRegime: 'on_site',
      desiredSalaryMin: 5000,
      desiredSalaryCurrency: 'EUR',
      locationId: 'loc-2',
      isInternationallyMobile: false,
    }),
    baseOffer(),
  );
  assert.ok(r.score <= 20, `esperava score baixo, obteve ${r.score}`);
});

test('pesos dos fatores somam sempre 1 (soma dos pesos devolvidos = 1)', () => {
  const r = computeMatchScore(baseCandidate(), baseOffer());
  const totalWeight = r.factors.reduce((sum, f) => sum + f.weight, 0);
  assert.ok(Math.abs(totalWeight - 1) < 0.001, `pesos somam ${totalWeight}, esperava 1`);
});

// --- i18n: as explicações nunca podem ficar presas a um único idioma ---

test('cada fator devolve messageKey, nunca texto já traduzido', () => {
  const r = computeMatchScore(baseCandidate({ skills: ['typescript'] }), baseOffer());
  for (const f of r.factors) {
    assert.ok(typeof f.messageKey === 'string' && f.messageKey.length > 0);
    assert.ok(!('explanation' in f), 'MatchFactor não deve ter texto já renderizado');
  }
});

test('explainMatchFactors renderiza em português', () => {
  const r = computeMatchScore(baseCandidate({ skills: ['typescript', 'postgres'] }), baseOffer());
  const explained = explainMatchFactors(r.factors, 'pt');
  const skillsFactor = explained.find((f) => f.code === 'skills');
  assert.ok(skillsFactor?.explanation.includes('competência'));
});

test('explainMatchFactors renderiza a MESMA informação em inglês, não texto diferente', () => {
  const r = computeMatchScore(baseCandidate({ skills: ['typescript', 'postgres'] }), baseOffer());
  const pt = explainMatchFactors(r.factors, 'pt').find((f) => f.code === 'skills');
  const en = explainMatchFactors(r.factors, 'en').find((f) => f.code === 'skills');
  assert.notEqual(pt?.explanation, en?.explanation);
  assert.ok(en?.explanation.toLowerCase().includes('skill'));
});

test('parâmetros interpolados corretamente em ambos os idiomas (contagem de competências)', () => {
  const r = computeMatchScore(baseCandidate({ skills: ['typescript', 'postgres', 'node'] }), baseOffer({
    description: 'typescript postgres node apis',
  }));
  const explained = explainMatchFactors(r.factors, 'pt');
  const skillsFactor = explained.find((f) => f.code === 'skills');
  assert.ok(!skillsFactor?.explanation.includes('{count}'), 'parâmetro não interpolado: ' + skillsFactor?.explanation);
});

test('alemão tem tradução real, não cai para inglês (cobertura completa das 6 línguas)', () => {
  const r = computeMatchScore(baseCandidate({ skills: ['typescript'] }), baseOffer());
  const explained = explainMatchFactors(r.factors, 'de');
  const skillsFactor = explained.find((f) => f.code === 'skills');
  assert.ok(!skillsFactor?.explanation.startsWith('matching.'), 'não devia devolver a chave crua');
  assert.ok(skillsFactor?.explanation.includes('Kompetenz'), 'esperava texto alemão real, obteve: ' + skillsFactor?.explanation);
});

test('locale verdadeiramente desconhecido (fora das 6 línguas suportadas) cai para inglês, nunca rebenta', () => {
  const r = computeMatchScore(baseCandidate({ skills: ['typescript'] }), baseOffer());
  const explained = explainMatchFactors(r.factors, 'xx' as any);
  const skillsFactor = explained.find((f) => f.code === 'skills');
  assert.ok(skillsFactor?.explanation.toLowerCase().includes('skill'), 'esperava fallback para inglês');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
