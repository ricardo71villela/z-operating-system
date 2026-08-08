// packages/domain/src/i18n/messages.test.ts
// Corre com: npx tsx packages/domain/src/i18n/messages.test.ts

import assert from 'node:assert/strict';
import { renderMessage } from './messages';
import type { MessageLocale } from './messages';

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

const LOCALES: MessageLocale[] = ['pt', 'en', 'es', 'fr', 'de', 'it'];

// As mesmas chaves usadas em matching.ts e candidateScore.ts — mantidas
// aqui em duplicado deliberadamente: se alguém adicionar uma chave nova
// num desses ficheiros e esquecer de a catalogar, ESTE teste é que devia
// ser atualizado (força a decisão consciente), não um import automático
// que esconderia a omissão.
const EXPECTED_KEYS = [
  'matching.skills.unknown', 'matching.skills.match', 'matching.skills.partial', 'matching.skills.mismatch',
  'matching.contract_type.unknown', 'matching.contract_type.match', 'matching.contract_type.mismatch',
  'matching.work_regime.unknown', 'matching.work_regime.match', 'matching.work_regime.partial', 'matching.work_regime.mismatch',
  'matching.salary_fit.unknown', 'matching.salary_fit.match', 'matching.salary_fit.below',
  'matching.life_stage.unknown', 'matching.life_stage.match', 'matching.life_stage.partial',
  'matching.location.match_remote', 'matching.location.unknown', 'matching.location.match_same', 'matching.location.partial_mobile', 'matching.location.mismatch',
  'score.skills.unknown', 'score.skills.strong', 'score.skills.moderate', 'score.skills.weak',
  'score.experience.unknown', 'score.experience.strong', 'score.experience.moderate', 'score.experience.weak',
  'score.language.unknown', 'score.language.strong', 'score.language.moderate', 'score.language.weak',
  'score.completeness.strong', 'score.completeness.moderate', 'score.completeness.weak',
  'score.availability.unknown', 'score.availability.strong', 'score.availability.moderate',
  'score.disclaimer',
];

console.log('messages.renderMessage — completude do catálogo (6 línguas)');

test(`todas as ${EXPECTED_KEYS.length} chaves esperadas existem e nenhuma devolve a chave crua em nenhuma das 6 línguas`, () => {
  const missing: string[] = [];
  for (const key of EXPECTED_KEYS) {
    for (const locale of LOCALES) {
      const rendered = renderMessage(key, locale);
      if (rendered === key) missing.push(`${key} [${locale}]`);
    }
  }
  assert.deepEqual(missing, [], `chaves/línguas em falta: ${missing.join(', ')}`);
});

test('cada língua produz texto DIFERENTE para a mesma chave (nenhuma ficou copiada de outra por engano)', () => {
  const sampleKey = 'score.disclaimer';
  const rendered = LOCALES.map((l) => renderMessage(sampleKey, l));
  const unique = new Set(rendered);
  assert.equal(unique.size, LOCALES.length, 'pelo menos duas línguas devolveram exatamente o mesmo texto — provavelmente uma cópia por engano');
});

test('chave desconhecida devolve a própria chave (nunca rebenta, nunca esconde o problema)', () => {
  assert.equal(renderMessage('chave.que.nao.existe', 'pt'), 'chave.que.nao.existe');
});

test('parâmetros em falta ficam visíveis como {placeholder}, nunca substituídos por texto errado', () => {
  const rendered = renderMessage('matching.salary_fit.below', 'pt', {});
  assert.ok(rendered.includes('{gap}') && rendered.includes('{currency}'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
