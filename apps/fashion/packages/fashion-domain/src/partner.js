/* ============================================================
   Z FASHION — PARTNER (bounded context: 20-registry extension)
   ============================================================
   Owns: the Partner entity shape as it extends the shared ZOS
   Registry — a store/legal entity holding stock. Partner is NOT
   Brand (see DOMAIN-SKETCH.md): a Partner can be mono-brand or
   multi-brand, and never carries Category or Size — those live on
   Product.

   This module has zero knowledge of Product, Corner, Campaign, or
   any other Fashion context beyond validating the Partner shape
   itself. It is consumed by them; it never consumes them.

   Country/locale resolution is NOT reimplemented here. For pure
   offline tests this module validates countryIso against the shared
   repository fixture at packages/geography/geography.js. That fixture
   mirrors stable ISO conventions only; canonical runtime Geography
   remains the shared Supabase zos.geography_* authority. Callers
   never invent geography logic here.
   ============================================================ */

const { getCountryByIsoCode } = require('../../../../../packages/geography/geography');

const CATEGORIES = Object.freeze([
  'clothing',
  'footwear',
  'sportswear',
  'accessories_leather_goods',
  'cosmetics', // includes perfumes/fragrances — see DOMAIN-SKETCH.md
]);

const AGE_SEGMENTS = Object.freeze(['children', 'youth', 'adults']);

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
}

function assertStringArray(values, field) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${field} must be a non-empty array`);
  }
  for (const value of values) assertNonEmptyString(value, `${field}[]`);
}

function normalizeUnique(values) {
  return [...new Set(values)];
}

function assertCountryIso(countryIso) {
  assertNonEmptyString(countryIso, 'countryIso');
  const normalized = countryIso.trim().toUpperCase();
  if (!getCountryByIsoCode(normalized)) {
    throw new Error(`countryIso ${normalized} is not a recognized Country`);
  }
  return normalized;
}

function assertCategories(categories) {
  assertStringArray(categories, 'categories');
  for (const category of categories) {
    if (!CATEGORIES.includes(category)) {
      throw new Error(`Unknown category: ${category}`);
    }
  }
  return normalizeUnique(categories);
}

function assertAgeSegments(ageSegments) {
  if (ageSegments == null) return [];
  if (!Array.isArray(ageSegments)) throw new Error('ageSegments must be an array');
  for (const segment of ageSegments) {
    if (!AGE_SEGMENTS.includes(segment)) {
      throw new Error(`Unknown age segment: ${segment}`);
    }
  }
  return normalizeUnique(ageSegments);
}

function createPartner(input) {
  if (!input || typeof input !== 'object') throw new Error('Partner input is required');

  assertNonEmptyString(input.id, 'id');
  assertNonEmptyString(input.legalName, 'legalName');
  const countryIso = assertCountryIso(input.countryIso);
  assertStringArray(input.locales, 'locales');
  const categories = assertCategories(input.categories);
  const ageSegments = assertAgeSegments(input.ageSegments);

  if (
    (ageSegments.includes('children') || ageSegments.includes('youth')) &&
    input.minorSafeDataAcknowledged !== true
  ) {
    throw new Error('Partner serving children/youth must acknowledge minor-safe data rules');
  }

  return Object.freeze({
    id: input.id.trim(),
    legalName: input.legalName.trim(),
    countryIso,
    locales: Object.freeze(normalizeUnique(input.locales.map((value) => value.trim()))),
    categories: Object.freeze(categories),
    ageSegments: Object.freeze(ageSegments),
    minorSafeDataAcknowledged: input.minorSafeDataAcknowledged === true,
  });
}

function partnerSupportsCategory(partner, category) {
  if (!partner || !Array.isArray(partner.categories)) return false;
  return partner.categories.includes(category);
}

module.exports = {
  CATEGORIES,
  AGE_SEGMENTS,
  createPartner,
  partnerSupportsCategory,
};
