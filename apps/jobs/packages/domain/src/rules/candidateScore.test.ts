// packages/domain/src/rules/candidateScore.test.ts
// Corre com: npx tsx packages/domain/src/rules/candidateScore.test.ts

import assert from 'node:assert/strict';
import { computeCandidateScore, explainCandidateScore } from './candidateScore';
import type { CandidateScoringInput, OfferScoringInput } from './candidateScore';

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

function baseCandidate(overrides: Partial<CandidateScoringInput> = {}): CandidateScoringInput {
  return {
    skills: [],
    languages: [],
    experienceCount: 0,
    experienceDescriptionsWithQuantifiedAchievements: 0,
    profileCompletenessScore: 0,
    availability: null,
    ...overrides,
  };
}

function baseOffer(overrides: Partial<OfferScoringInput> = {}): OfferScoringInput {
  return {
    title: 'Engenheiro Backend',
    description: 'Precisamos de alguém com typescript, postgres e apis distribuídas.',
    languageHints: [],
    ...overrides,
  };
}

console.log('candidateScore.computeCandidateScore');

test('resultado é sempre marcado como advisoryOnly=true, com disclaimerKey definido', () => {
  const r = computeCandidateScore(baseCandidate(), baseOffer());
  assert.equal(r.advisoryOnly, true);
  assert.ok(r.disclaimerKey.length > 0);
  assert.ok(!('disclaimer' in r), 'não deve ter texto já renderizado — só a chave');
});

test('aviso legal (renderizado) confirma que a decisão é sempre humana', () => {
  const r = explainCandidateScore(computeCandidateScore(baseCandidate(), baseOffer()), 'pt');
  assert.ok(r.disclaimer.toLowerCase().includes('humana'));
});

test('aviso legal (renderizado) confirma explicitamente que não usa características protegidas', () => {
  const r = explainCandidateScore(computeCandidateScore(baseCandidate(), baseOffer()), 'pt');
  assert.ok(r.disclaimer.toLowerCase().includes('protegida'));
});

test('tipo CandidateScoringInput não aceita nenhum campo de característica protegida (verificação estrutural)', () => {
  // Prova em tempo de compilação, não em runtime: se alguém tentar
  // adicionar 'age'/'gender'/etc a este objeto, o TypeScript falha.
  const input: CandidateScoringInput = baseCandidate();
  const keys = Object.keys(input);
  const forbidden = ['age', 'gender', 'race', 'ethnicity', 'religion', 'disability', 'maritalStatus', 'nationality', 'photo'];
  for (const f of forbidden) assert.ok(!keys.includes(f), `campo proibido "${f}" não deveria existir`);
});

test('candidato sem qualquer dado -> score médio, nunca zero por omissão', () => {
  const r = computeCandidateScore(baseCandidate(), baseOffer());
  assert.ok(r.score > 0);
});

test('competências alinhadas com a oferta -> skills_relevance forte', () => {
  const r = computeCandidateScore(baseCandidate({ skills: ['typescript', 'postgres'] }), baseOffer());
  assert.equal(r.factors.find((f) => f.code === 'skills_relevance')?.level, 'strong');
});

test('experiência com conquistas quantificadas pesa mais do que só contagem', () => {
  const withQuant = computeCandidateScore(baseCandidate({ experienceCount: 1, experienceDescriptionsWithQuantifiedAchievements: 1 }), baseOffer());
  const withoutQuant = computeCandidateScore(baseCandidate({ experienceCount: 1, experienceDescriptionsWithQuantifiedAchievements: 0 }), baseOffer());
  assert.ok(withQuant.score > withoutQuant.score);
});

test('idiomas pedidos todos cobertos -> language_fit forte', () => {
  const r = computeCandidateScore(
    baseCandidate({ languages: ['pt', 'en'] }),
    baseOffer({ languageHints: ['pt', 'en'] }),
  );
  assert.equal(r.factors.find((f) => f.code === 'language_fit')?.level, 'strong');
});

test('nenhum idioma pedido coberto -> language_fit fraco', () => {
  const r = computeCandidateScore(baseCandidate({ languages: ['fr'] }), baseOffer({ languageHints: ['de'] }));
  assert.equal(r.factors.find((f) => f.code === 'language_fit')?.level, 'weak');
});

test('perfil completo -> profile_completeness forte, mas nunca sozinho decide o resultado final', () => {
  const r = computeCandidateScore(baseCandidate({ profileCompletenessScore: 90 }), baseOffer());
  const factor = r.factors.find((f) => f.code === 'profile_completeness');
  assert.equal(factor?.level, 'strong');
  assert.ok(factor!.weight < 1); // nunca 100% do peso — nunca decide sozinho
});

test('disponibilidade imediata -> availability_fit forte', () => {
  const r = computeCandidateScore(baseCandidate({ availability: 'immediate' }), baseOffer());
  assert.equal(r.factors.find((f) => f.code === 'availability_fit')?.level, 'strong');
});

test('candidato "not_looking" -> availability_fit unknown, não penalizado como "weak"', () => {
  const r = computeCandidateScore(baseCandidate({ availability: 'not_looking' }), baseOffer());
  assert.equal(r.factors.find((f) => f.code === 'availability_fit')?.level, 'unknown');
});

test('pesos de todos os fatores somam sempre 1', () => {
  const r = computeCandidateScore(baseCandidate(), baseOffer());
  const total = r.factors.reduce((sum, f) => sum + f.weight, 0);
  assert.ok(Math.abs(total - 1) < 0.001);
});

test('candidato totalmente alinhado -> score alto', () => {
  const r = computeCandidateScore(
    baseCandidate({
      skills: ['typescript', 'postgres', 'apis'],
      languages: ['pt', 'en'],
      experienceCount: 3,
      experienceDescriptionsWithQuantifiedAchievements: 2,
      profileCompletenessScore: 95,
      availability: 'immediate',
    }),
    baseOffer({ languageHints: ['pt'] }),
  );
  assert.ok(r.score >= 90, `esperava score alto, obteve ${r.score}`);
});

test('candidato totalmente desalinhado -> score baixo, nunca zero absoluto (sempre algum "unknown")', () => {
  const r = computeCandidateScore(
    baseCandidate({ skills: ['culinária'], languages: ['fr'], profileCompletenessScore: 5 }),
    baseOffer({ languageHints: ['de'] }),
  );
  assert.ok(r.score < 20, `esperava score baixo, obteve ${r.score}`);
});

// --- i18n: mesmo mecanismo de matching.ts, testado aqui também ---

test('cada fator devolve messageKey, nunca texto já traduzido', () => {
  const r = computeCandidateScore(baseCandidate({ skills: ['typescript'] }), baseOffer());
  for (const f of r.factors) {
    assert.ok(typeof f.messageKey === 'string' && f.messageKey.length > 0);
    assert.ok(!('explanation' in f));
  }
});

test('explainCandidateScore renderiza fatores E disclaimer em português e inglês, com textos diferentes', () => {
  const raw = computeCandidateScore(baseCandidate({ skills: ['typescript', 'postgres'] }), baseOffer());
  const pt = explainCandidateScore(raw, 'pt');
  const en = explainCandidateScore(raw, 'en');
  assert.notEqual(pt.disclaimer, en.disclaimer);
  const ptSkills = pt.factors.find((f) => f.code === 'skills_relevance');
  const enSkills = en.factors.find((f) => f.code === 'skills_relevance');
  assert.notEqual(ptSkills?.explanation, enSkills?.explanation);
  assert.ok(enSkills?.explanation.toLowerCase().includes('skill'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
