/* Run with: node apps/fashion/packages/fashion-domain/tests/public-locales.test.js */

const assert = require('assert');
const {
  PUBLIC_LOCALES, DEFAULT_PUBLIC_LOCALE, FULLY_TRANSLATED_LOCALES,
  normalizePublicLocale, persistedLocaleFor, publicLocaleForPersisted, formattingLocaleFor,
} = require('../src/public-locales');
const { findMissingTranslations } = require('../src/ui-strings');

assert.deepStrictEqual(PUBLIC_LOCALES, ['fr', 'en', 'pt', 'es', 'de', 'it']);
assert.strictEqual(DEFAULT_PUBLIC_LOCALE, 'fr');

// Unlike Z Find today, Z Fashion has no "legacy translated" subset —
// all 6 are real, verified against ui-strings.js's own coverage check.
assert.deepStrictEqual(FULLY_TRANSLATED_LOCALES, PUBLIC_LOCALES);
assert.deepStrictEqual(findMissingTranslations(), []);

// pt-PT normalizes to the public "pt" identity, same as Z Find.
assert.strictEqual(normalizePublicLocale('pt-PT'), 'pt');
assert.strictEqual(normalizePublicLocale('PT-pt'), 'pt');
assert.strictEqual(normalizePublicLocale('es-ES'), 'es');
assert.strictEqual(normalizePublicLocale('xx'), null);

// Portuguese persists as pt-PT internally even though its public
// identity is a single /pt/ — same distinction Z Find makes.
assert.strictEqual(persistedLocaleFor('pt'), 'pt-PT');
assert.strictEqual(persistedLocaleFor('fr'), 'fr');
assert.strictEqual(publicLocaleForPersisted('pt-PT'), 'pt');
assert.strictEqual(publicLocaleForPersisted('fr'), 'fr');
assert.strictEqual(publicLocaleForPersisted('xx'), null);

// English formats as en-IE, not en-US or en-GB — copied verbatim
// from Z Find's own convention, not re-derived or assumed.
assert.strictEqual(formattingLocaleFor('en'), 'en-IE');
assert.strictEqual(formattingLocaleFor('de'), 'de-DE');
assert.strictEqual(formattingLocaleFor('unknown'), 'fr-FR'); // falls back to default

console.log('public-locales.js: all invariant checks passed.');
