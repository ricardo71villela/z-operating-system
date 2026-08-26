/* ============================================================
   Z FIND — PUBLIC LOCALE AUTHORITY

   Public language contract:
     fr · en · pt · es · de · it

   French is the default public language.

   Portuguese has ONE public identity: /pt/.
   Persisted Portuguese content remains pt-PT for compatibility.

   All six public locales now have complete public interface
   translations. LEGACY_TRANSLATED_LOCALES is retained as a
   compatibility export for older consumers, but its value now
   reflects the complete six-language public contract.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.publicLocales = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const PUBLIC_LOCALES = Object.freeze([
    'fr',
    'en',
    'pt',
    'es',
    'de',
    'it'
  ]);

  const DEFAULT_PUBLIC_LOCALE = 'fr';

  const TRANSLATED_PUBLIC_LOCALES = Object.freeze(
    PUBLIC_LOCALES.slice()
  );

  // Compatibility export used by the existing public runtime.
  const LEGACY_TRANSLATED_LOCALES = TRANSLATED_PUBLIC_LOCALES;

  const PERSISTED_LOCALE_BY_PUBLIC = Object.freeze({
    fr: 'fr',
    en: 'en',
    pt: 'pt-PT',
    es: 'es',
    de: 'de',
    it: 'it'
  });

  const FORMAT_LOCALE_BY_PUBLIC = Object.freeze({
    fr: 'fr-FR',
    en: 'en-IE',
    pt: 'pt-PT',
    es: 'es-ES',
    de: 'de-DE',
    it: 'it-IT'
  });

  function normalizePublicLocale(value) {
    if (typeof value !== 'string') return null;

    const normalized = value.trim().toLowerCase();

    if (!normalized) return null;
    if (normalized === 'pt-pt') return 'pt';

    const short = normalized.split(/[-_]/)[0];

    return PUBLIC_LOCALES.includes(short)
      ? short
      : null;
  }

  function persistedLocaleFor(value) {
    const locale = normalizePublicLocale(value);

    return locale
      ? PERSISTED_LOCALE_BY_PUBLIC[locale]
      : null;
  }

  function formattingLocaleFor(value) {
    const locale = normalizePublicLocale(value);

    return locale
      ? FORMAT_LOCALE_BY_PUBLIC[locale]
      : FORMAT_LOCALE_BY_PUBLIC[DEFAULT_PUBLIC_LOCALE];
  }

  function publicLocaleForPersisted(value) {
    if (typeof value !== 'string') return null;

    const normalized = value.trim().toLowerCase();

    for (const locale of PUBLIC_LOCALES) {
      if (
        PERSISTED_LOCALE_BY_PUBLIC[locale].toLowerCase() ===
        normalized
      ) {
        return locale;
      }
    }

    return normalizePublicLocale(value);
  }

  return Object.freeze({
    PUBLIC_LOCALES,
    DEFAULT_PUBLIC_LOCALE,
    TRANSLATED_PUBLIC_LOCALES,
    LEGACY_TRANSLATED_LOCALES,
    PERSISTED_LOCALE_BY_PUBLIC,
    FORMAT_LOCALE_BY_PUBLIC,
    normalizePublicLocale,
    persistedLocaleFor,
    formattingLocaleFor,
    publicLocaleForPersisted
  });
});
