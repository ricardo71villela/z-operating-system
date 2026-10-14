const assert = require('assert');
const {
  validatePartnerApplication, isValidSiret, frenchVatForSiren, normaliseFrenchPhone,
} = require('../src/partner-application');

// Build a Luhn-valid SIRET from 13 digits.
function withLuhn(thirteen) {
  for (let d = 0; d <= 9; d += 1) if (isValidSiret(thirteen + d)) return thirteen + d;
  throw new Error('no check digit');
}
const SIRET = withLuhn('8812345670001');
const SIREN = SIRET.slice(0, 9);

// --- SIRET
assert.ok(isValidSiret(SIRET));
assert.ok(isValidSiret(SIRET.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, '$1 $2 $3 $4')), 'spaces accepted');
assert.ok(!isValidSiret(SIRET.slice(0, 13) + ((Number(SIRET[13]) + 1) % 10)), 'wrong check digit');
assert.ok(!isValidSiret('1234567890123'), '13 digits');
assert.ok(!isValidSiret('ABCDEFGHIJKLMN'));
assert.ok(isValidSiret('35600000012340') === false && isValidSiret('35600000012341'), 'La Poste exception: digit sum multiple of 5, not Luhn');

// --- VAT key (known: SIREN 404833048 → FR83404833048)
assert.strictEqual(frenchVatForSiren('404833048'), 'FR83404833048');

// --- phone
assert.strictEqual(normaliseFrenchPhone('06 12 34 56 78'), '+33612345678');
assert.strictEqual(normaliseFrenchPhone('+33 4 50 00 00 00'), '+33450000000');
assert.strictEqual(normaliseFrenchPhone('0033612345678'), '+33612345678');
assert.strictEqual(normaliseFrenchPhone('12345'), null);

const ctx = { accountEmail: 'Contact@Boutique.fr', currentTermsVersion: 'partner-terms-2027-01' };
const valid = {
  tradeName: '  Maison   Léman ', legalName: 'Maison Léman SARL', countryIso: 'fr',
  registrationNumber: SIRET, vatNumber: frenchVatForSiren(SIREN).toLowerCase(),
  addressLine1: '12 rue Nationale', postalCode: '74200', city: 'Thonon-les-Bains',
  contactPhone: '04 50 00 00 00', website: 'https://maison-leman.fr',
  categories: ['clothing', 'footwear', 'clothing'], ageSegments: ['adults'],
  acceptTerms: true, termsVersion: 'partner-terms-2027-01',
};

// --- happy path: normalised
const app = validatePartnerApplication(valid, ctx);
assert.strictEqual(app.tradeName, 'Maison Léman');
assert.strictEqual(app.countryIso, 'FR');
assert.strictEqual(app.registrationNumber, SIRET);
assert.strictEqual(app.vatNumber, frenchVatForSiren(SIREN));
assert.strictEqual(app.contactPhone, '+33450000000');
assert.strictEqual(app.contactEmail, 'contact@boutique.fr', 'contact e-mail comes from the verified account');
assert.deepStrictEqual(app.categories, ['clothing', 'footwear'], 'deduplicated');
assert.deepStrictEqual(app.locales, ['fr'], 'default locale');
assert.strictEqual(app.termsVersion, 'partner-terms-2027-01');
assert.ok(Object.isFrozen(app));

function codes(input, context = ctx) {
  try { validatePartnerApplication(input, context); } catch (e) { return e.fieldErrors.map((f) => `${f.field}:${f.code}`); }
  return [];
}

// --- each rule
assert.deepStrictEqual(codes({ ...valid, registrationNumber: '12345678901234' }), ['registrationNumber:invalid_siret']);
assert.deepStrictEqual(codes({ ...valid, countryIso: 'BE' }), ['countryIso:market_not_open'], 'only launched markets');
assert.deepStrictEqual(codes({ ...valid, vatNumber: 'FR00' + SIREN }), ['vatNumber:vat_does_not_match_siret']);
assert.deepStrictEqual(codes({ ...valid, vatNumber: 'DE123' }), ['vatNumber:invalid_vat']);
assert.deepStrictEqual(codes({ ...valid, vatNumber: '' }), [], 'VAT optional');
assert.deepStrictEqual(codes({ ...valid, postalCode: '742' }), ['postalCode:invalid_postal_code']);
assert.deepStrictEqual(codes({ ...valid, contactPhone: '123' }), ['contactPhone:invalid_phone']);
assert.deepStrictEqual(codes({ ...valid, website: 'javascript:alert(1)' }), ['website:invalid_url']);
assert.deepStrictEqual(codes({ ...valid, website: '' }), [], 'website optional');
assert.deepStrictEqual(codes({ ...valid, categories: [] }), ['categories:required']);
assert.deepStrictEqual(codes({ ...valid, categories: ['jewellery'] }), ['categories:unknown_value']);
assert.deepStrictEqual(codes({ ...valid, ageSegments: ['children'] }), ['minorSafeDataAcknowledged:required_for_minors']);
assert.deepStrictEqual(codes({ ...valid, ageSegments: ['children'], minorSafeDataAcknowledged: true }), []);
assert.deepStrictEqual(codes({ ...valid, locales: ['pt'] }), ['locales:unknown_value']);
assert.deepStrictEqual(codes({ ...valid, acceptTerms: false }), ['acceptTerms:required']);
assert.deepStrictEqual(codes({ ...valid, acceptTerms: 'yes' }), ['acceptTerms:required'], 'only literal true');
assert.deepStrictEqual(codes({ ...valid, termsVersion: 'partner-terms-2026-12' }), ['acceptTerms:terms_version_changed']);
assert.deepStrictEqual(codes({ ...valid, tradeName: 'x'.repeat(121) }), ['tradeName:too_long']);
assert.deepStrictEqual(codes(valid, { accountEmail: ctx.accountEmail }), ['terms:terms_not_published'], 'no published terms => refused');
assert.deepStrictEqual(codes(valid, { currentTermsVersion: 'v' }).includes('account:account_email_missing'), true);

// --- everything missing reports every field at once
const all = codes({}, ctx);
for (const f of ['tradeName', 'legalName', 'countryIso', 'registrationNumber', 'addressLine1', 'postalCode', 'city', 'contactPhone', 'categories', 'ageSegments', 'acceptTerms']) {
  assert.ok(all.some((c) => c.startsWith(f + ':')), `missing error for ${f}`);
}

console.log('partner-application.js: all invariant checks passed.');
