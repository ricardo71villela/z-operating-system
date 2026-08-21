/* Run with: node apps/fashion/packages/fashion-domain/tests/ui-strings.test.js */

const assert = require('assert');
const { t, findMissingTranslations, SUPPORTED_LOCALES } = require('../src/ui-strings');

assert.strictEqual(t('nav.segment.children', 'pt'), 'Crianças');
assert.strictEqual(t('nav.segment.children', 'en'), 'Children');
assert.strictEqual(t('nav.segment.children', 'fr'), 'Enfants');

// Missing locale falls back to French — never a blank string.
assert.strictEqual(t('nav.segment.children', 'ja'), 'Enfants');

// Real translation for each of the 6 supported locales, not just a
// French default disguised as coverage.
assert.strictEqual(t('nav.segment.children', 'es'), 'Niños');
assert.strictEqual(t('nav.segment.children', 'it'), 'Bambini');
assert.strictEqual(t('nav.segment.children', 'de'), 'Kinder');

// Unknown key throws rather than silently returning the raw key —
// a translation gap should be caught immediately, not shipped as
// literal "product.same_corner_label" text on the page.
assert.throws(() => t('this.key.does.not.exist'), /unknown UI string key/);

// Every string has all 6 supported locales — this is the actual
// "did we translate the site" check, runnable in CI.
const missing = findMissingTranslations();
assert.deepStrictEqual(missing, [], `Missing translations: ${missing.join(', ')}`);
assert.deepStrictEqual(SUPPORTED_LOCALES, ['fr', 'pt', 'es', 'it', 'en', 'de']);

console.log('ui-strings.js: all invariant checks passed. Real coverage: 6 locales, 0 missing translations.');
