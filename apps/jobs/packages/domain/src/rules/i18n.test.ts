// packages/domain/src/rules/i18n.test.ts
// Corre com: npx tsx packages/domain/src/rules/i18n.test.ts

import assert from 'node:assert/strict';
import { resolveTranslation, computeTranslationCoverage, isSupportedLocale } from './i18n';

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

console.log('i18n rules');

test('pt é suportado, de (alemão) ainda não', () => {
  assert.equal(isSupportedLocale('pt'), true);
  assert.equal(isSupportedLocale('de'), false);
});

test('resolve tradução exata quando existe', () => {
  const r = resolveTranslation([{ locale: 'fr', value: 'Ingénieur' }, { locale: 'en', value: 'Engineer' }], 'fr', 'Engenheiro', 'pt');
  assert.equal(r.value, 'Ingénieur');
  assert.equal(r.isFallback, false);
});

test('sem tradução no locale pedido -> cai para o locale original', () => {
  const r = resolveTranslation([{ locale: 'pt', value: 'Engenheiro' }], 'es', 'Engenheiro', 'pt');
  assert.equal(r.value, 'Engenheiro');
  assert.equal(r.locale, 'pt');
  assert.equal(r.isFallback, true);
});

test('sem original nem locale pedido -> cai para inglês', () => {
  const r = resolveTranslation([{ locale: 'en', value: 'Engineer' }, { locale: 'fr', value: 'Ingénieur' }], 'es', 'fallback', 'pt');
  // 'pt' não está nas entries, por isso salta para inglês
  assert.equal(r.value, 'Engineer');
  assert.equal(r.locale, 'en');
});

test('sem qualquer tradução -> devolve o valor original', () => {
  const r = resolveTranslation([], 'fr', 'Engenheiro', 'pt');
  assert.equal(r.value, 'Engenheiro');
  assert.equal(r.locale, 'pt');
  assert.equal(r.isFallback, true);
});

test('nunca lança erro mesmo sem qualquer contexto de locale', () => {
  assert.doesNotThrow(() => resolveTranslation([], 'xx', 'valor'));
});

test('cobertura de tradução: 100% quando todos os campos obrigatórios estão traduzidos', () => {
  const r = computeTranslationCoverage({
    requiredFields: ['title', 'description'],
    translatedFieldsByLocale: { pt: ['title', 'description'], en: ['title'], fr: [], es: [] },
  });
  assert.equal(r.coverageByLocale.pt, 100);
  assert.equal(r.coverageByLocale.en, 50);
  assert.equal(r.coverageByLocale.fr, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
