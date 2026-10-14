/* ============================================================
   Z FASHION — PARTNER APPLICATION (bounded context: fashion-domain)
   ============================================================
   Validates and normalises what a store submits on the Z Fashion
   adhesion page, before anything is written. Pure: no I/O.

   Scope decisions:
   - Only launched markets can apply (markets.js: France today), so the
     company registration number is a French SIRET (14 digits, Luhn,
     with the La Poste exception) and the postcode is French.
   - The contact e-mail is NOT part of the form: it is the verified
     e-mail of the signed-in account, supplied by the caller.
   - Category / age-segment / minor-safe rules are not re-implemented
     here: the result is shaped for createPartner() (partner.js), which
     the API still runs and which remains the single authority for them.
   - Acceptance of the Partner terms is mandatory and must name the
     exact terms version currently published (supplied by the caller).

   Errors are returned as { field, code } pairs (never prose) so each
   surface translates them; validatePartnerApplication() throws an Error
   carrying them in `.fieldErrors`.
   ============================================================ */

const { CATEGORIES, AGE_SEGMENTS } = require('./partner');
const { isLaunched } = require('./markets');

const SUPPORTED_LOCALES = Object.freeze(['fr', 'en']);

function digitsOnly(value) {
  return String(value == null ? '' : value).replace(/[\s.\-]/g, '');
}

function luhnValid(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

/** French SIRET: 14 digits, Luhn — except La Poste establishments
 *  (SIREN 356000000), whose SIRET digit sum is a multiple of 5. */
function isValidSiret(raw) {
  const s = digitsOnly(raw);
  if (!/^[0-9]{14}$/.test(s)) return false;
  if (s.startsWith('356000000')) {
    return s.split('').reduce((n, d) => n + Number(d), 0) % 5 === 0;
  }
  return luhnValid(s);
}

/** French VAT number for a given SIREN: FR + 2-digit key + SIREN,
 *  key = (12 + 3 × (SIREN mod 97)) mod 97. */
function frenchVatForSiren(siren) {
  const key = (12 + 3 * (Number(siren) % 97)) % 97;
  return `FR${String(key).padStart(2, '0')}${siren}`;
}

function normaliseFrenchPhone(raw) {
  const s = String(raw == null ? '' : raw).replace(/[\s.\-()]/g, '');
  if (/^0[1-9][0-9]{8}$/.test(s)) return `+33${s.slice(1)}`;
  if (/^\+33[1-9][0-9]{8}$/.test(s)) return s;
  if (/^0033[1-9][0-9]{8}$/.test(s)) return `+${s.slice(2)}`;
  return null;
}

function cleanText(value, max) {
  const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return s.length > max ? null : s;
}

/**
 * @param {object} input       raw form payload
 * @param {object} ctx
 * @param {string} ctx.accountEmail          verified e-mail of the signed-in account
 * @param {string} ctx.currentTermsVersion   version of the published Partner terms
 * @returns {object} normalised application
 */
function validatePartnerApplication(input, ctx) {
  const errors = [];
  const add = (field, code) => errors.push({ field, code });
  const body = input && typeof input === 'object' ? input : {};
  const context = ctx || {};

  if (!context.currentTermsVersion) add('terms', 'terms_not_published');
  if (!context.accountEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(context.accountEmail)) add('account', 'account_email_missing');

  const tradeName = cleanText(body.tradeName, 120);
  if (!tradeName || tradeName.length < 2) add('tradeName', tradeName === null ? 'too_long' : 'required');

  const legalName = cleanText(body.legalName, 200);
  if (!legalName || legalName.length < 2) add('legalName', legalName === null ? 'too_long' : 'required');

  const countryIso = String(body.countryIso || '').trim().toUpperCase();
  if (!countryIso) add('countryIso', 'required');
  else if (!isLaunched(countryIso)) add('countryIso', 'market_not_open');

  const siret = digitsOnly(body.registrationNumber);
  if (!siret) add('registrationNumber', 'required');
  else if (!isValidSiret(siret)) add('registrationNumber', 'invalid_siret');

  let vatNumber = null;
  if (body.vatNumber != null && String(body.vatNumber).trim() !== '') {
    vatNumber = String(body.vatNumber).replace(/\s+/g, '').toUpperCase();
    if (!/^FR[0-9A-Z]{2}[0-9]{9}$/.test(vatNumber)) add('vatNumber', 'invalid_vat');
    else if (isValidSiret(siret) && vatNumber !== frenchVatForSiren(siret.slice(0, 9))) add('vatNumber', 'vat_does_not_match_siret');
  }

  const addressLine1 = cleanText(body.addressLine1, 200);
  if (!addressLine1 || addressLine1.length < 3) add('addressLine1', addressLine1 === null ? 'too_long' : 'required');

  const postalCode = String(body.postalCode || '').replace(/\s+/g, '');
  if (!postalCode) add('postalCode', 'required');
  else if (!/^[0-9]{5}$/.test(postalCode)) add('postalCode', 'invalid_postal_code');

  const city = cleanText(body.city, 120);
  if (!city || city.length < 2) add('city', city === null ? 'too_long' : 'required');

  const contactPhone = normaliseFrenchPhone(body.contactPhone);
  if (!body.contactPhone) add('contactPhone', 'required');
  else if (!contactPhone) add('contactPhone', 'invalid_phone');

  let website = null;
  if (body.website != null && String(body.website).trim() !== '') {
    try {
      const u = new URL(String(body.website).trim());
      if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocol');
      website = u.toString();
    } catch (e) {
      add('website', 'invalid_url');
    }
  }

  const categories = Array.isArray(body.categories) ? [...new Set(body.categories)] : [];
  if (categories.length === 0) add('categories', 'required');
  else if (categories.some((c) => !CATEGORIES.includes(c))) add('categories', 'unknown_value');

  const ageSegments = Array.isArray(body.ageSegments) && body.ageSegments.length > 0 ? [...new Set(body.ageSegments)] : [];
  if (ageSegments.length === 0) add('ageSegments', 'required');
  else if (ageSegments.some((s) => !AGE_SEGMENTS.includes(s))) add('ageSegments', 'unknown_value');

  const servesMinors = ageSegments.some((s) => s === 'baby' || s === 'children' || s === 'youth');
  const minorSafeDataAcknowledged = body.minorSafeDataAcknowledged === true;
  if (servesMinors && !minorSafeDataAcknowledged) add('minorSafeDataAcknowledged', 'required_for_minors');

  const locales = Array.isArray(body.locales) && body.locales.length > 0 ? [...new Set(body.locales)] : ['fr'];
  if (locales.some((l) => !SUPPORTED_LOCALES.includes(l))) add('locales', 'unknown_value');

  if (body.acceptTerms !== true) add('acceptTerms', 'required');
  else if (context.currentTermsVersion && body.termsVersion !== context.currentTermsVersion) add('acceptTerms', 'terms_version_changed');

  if (errors.length > 0) {
    const err = new Error(`validatePartnerApplication: ${errors.map((e) => `${e.field}:${e.code}`).join(', ')}`);
    err.fieldErrors = errors;
    throw err;
  }

  return Object.freeze({
    tradeName,
    legalName,
    countryIso,
    registrationNumber: siret,
    vatNumber,
    addressLine1,
    postalCode,
    city,
    contactEmail: context.accountEmail.toLowerCase(),
    contactPhone,
    website,
    categories,
    ageSegments,
    minorSafeDataAcknowledged,
    locales,
    termsVersion: context.currentTermsVersion,
  });
}

module.exports = { validatePartnerApplication, isValidSiret, frenchVatForSiren, normaliseFrenchPhone, SUPPORTED_LOCALES };
