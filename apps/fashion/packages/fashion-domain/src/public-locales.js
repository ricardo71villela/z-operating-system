/* ============================================================
   Z FASHION — PUBLIC LOCALE AUTHORITY (bounded context: fashion-domain)
   ============================================================
   Mirrors apps/find/apps/zfind-web/src/services/public-locales.js
   structure exactly — same 6-language contract (fr, en, pt, es, de,
   it), same default (French), same normalization/formatting-locale
   pattern. Copied rather than reinvented, per instruction to reuse
   Z Find's real structure wherever applicable.

   One deliberate difference from Z Find's current state, not an
   oversight: Z Find's PUBLIC_LOCALES includes all 6 but its
   LEGACY_TRANSLATED_LOCALES is only [fr, en, pt] — the other 3 are
   contracted but not yet shipped in its UI. Z Fashion's
   ui-strings.js already has real translations for all 6 from day
   one (verified by findMissingTranslations() in that file), so there
   is no "legacy translated" subset here — FULLY_TRANSLATED_LOCALES
   equals PUBLIC_LOCALES. This is Z Fashion building ahead of Z Find
   on this one dimension, matching the same contract more completely,
   not a divergence from it.
   ============================================================ */

const PUBLIC_LOCALES = Object.freeze(['fr', 'en', 'pt', 'es', 'de', 'it']);

const DEFAULT_PUBLIC_LOCALE = 'fr';

const FULLY_TRANSLATED_LOCALES = PUBLIC_LOCALES;

const PERSISTED_LOCALE_BY_PUBLIC = Object.freeze({
  fr: 'fr', en: 'en', pt: 'pt-PT', es: 'es', de: 'de', it: 'it',
});

const FORMAT_LOCALE_BY_PUBLIC = Object.freeze({
  fr: 'fr-FR', en: 'en-IE', pt: 'pt-PT', es: 'es-ES', de: 'de-DE', it: 'it-IT',
});

function normalizePublicLocale(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'pt-pt') return 'pt';
  const short = normalized.split(/[-_]/)[0];
  return PUBLIC_LOCALES.includes(short) ? short : null;
}

function persistedLocaleFor(value) {
  const locale = normalizePublicLocale(value);
  return locale ? PERSISTED_LOCALE_BY_PUBLIC[locale] : null;
}

function publicLocaleForPersisted(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  for (const [publicLocale, persistedLocale] of Object.entries(PERSISTED_LOCALE_BY_PUBLIC)) {
    if (persistedLocale.toLowerCase() === normalized) return publicLocale;
  }
  return normalizePublicLocale(value);
}

function formattingLocaleFor(value) {
  const locale = normalizePublicLocale(value);
  return locale ? FORMAT_LOCALE_BY_PUBLIC[locale] : FORMAT_LOCALE_BY_PUBLIC[DEFAULT_PUBLIC_LOCALE];
}

module.exports = {
  PUBLIC_LOCALES,
  DEFAULT_PUBLIC_LOCALE,
  FULLY_TRANSLATED_LOCALES,
  PERSISTED_LOCALE_BY_PUBLIC,
  FORMAT_LOCALE_BY_PUBLIC,
  normalizePublicLocale,
  persistedLocaleFor,
  publicLocaleForPersisted,
  formattingLocaleFor,
};
