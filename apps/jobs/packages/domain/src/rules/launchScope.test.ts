// packages/domain/src/rules/launchScope.test.ts
// Corre com: npx tsx packages/domain/src/rules/launchScope.test.ts

import assert from 'node:assert/strict';
import { LAUNCH_COUNTRIES, LAUNCH_LOCALES, DEFAULT_LOCALE, isLaunchCountry, isLaunchLocale, launchLocaleOrDefault } from './launchScope';
import { SUPPORTED_LOCALES } from './i18n';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; } catch (err) { console.error(`  ✗ ${name}`); console.error(err); failed++; }
}

console.log('launch scope (FR/BE/LU, fr/en)');

test('countries: France, Belgium, Luxembourg only', () => {
  assert.deepEqual([...LAUNCH_COUNTRIES], ['FR', 'BE', 'LU']);
  for (const c of ['FR', 'be', ' lu ']) assert.equal(isLaunchCountry(c), true, c);
  for (const c of ['PT', 'IT', 'ES', 'DE', 'CH', '', null, undefined]) assert.equal(isLaunchCountry(c as string), false, String(c));
});

test('languages: French and English only, French by default', () => {
  assert.deepEqual([...LAUNCH_LOCALES], ['fr', 'en']);
  assert.equal(DEFAULT_LOCALE, 'fr');
  assert.equal(isLaunchLocale('EN'), true);
  for (const l of ['pt', 'es', 'it', 'de', 'nl']) assert.equal(isLaunchLocale(l), false, l);
});

test('requested language falls back to French outside the scope', () => {
  assert.equal(launchLocaleOrDefault('en'), 'en');
  assert.equal(launchLocaleOrDefault('en-GB'), 'en');
  assert.equal(launchLocaleOrDefault('fr_BE'), 'fr');
  assert.equal(launchLocaleOrDefault('pt'), 'fr');
  assert.equal(launchLocaleOrDefault('nl-BE'), 'fr');
  assert.equal(launchLocaleOrDefault(''), 'fr');
  assert.equal(launchLocaleOrDefault(null), 'fr');
});

test('translatable content uses the same languages', () => {
  assert.deepEqual([...SUPPORTED_LOCALES], [...LAUNCH_LOCALES]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
