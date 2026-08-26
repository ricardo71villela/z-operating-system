/* ============================================================
   Z FASHION — UI STRINGS (bounded context: fashion-domain)
   ============================================================
   Owns: interface copy translation, distinct from Geography's
   names{lang} (which covers place names only — see MARKETS-AND-I18N.md's
   correction note). Ships 6 languages — FR, PT, ES, IT, EN, DE —
   matching Z Find's confirmed target set (their Geography database
   already supports this shape; the UI catching up to 6 is in progress
   there too, not yet shipped). Z Fashion builds this from day one
   rather than launching at 3 and expanding later.

   Same fallback discipline Geography's geoName() already established:
   missing translation falls back to French (the launch market default),
   never to a blank string or a thrown error.
   ============================================================ */

const SUPPORTED_LOCALES = Object.freeze(['fr', 'pt', 'es', 'it', 'en', 'de']);
const DEFAULT_LOCALE = 'fr';

const STRINGS = Object.freeze({
  'nav.segment.children': { fr: 'Enfants', pt: 'Crianças', es: 'Niños', it: 'Bambini', en: 'Children', de: 'Kinder' },
  'nav.segment.youth': { fr: 'Jeunes', pt: 'Jovens', es: 'Jóvenes', it: 'Giovani', en: 'Youth', de: 'Jugendliche' },
  'nav.segment.adults': { fr: 'Adultes', pt: 'Adultos', es: 'Adultos', it: 'Adulti', en: 'Adults', de: 'Erwachsene' },
  'category.clothing': { fr: 'Vêtements', pt: 'Vestuário', es: 'Ropa', it: 'Abbigliamento', en: 'Clothing', de: 'Bekleidung' },
  'category.footwear': { fr: 'Chaussures', pt: 'Calçado', es: 'Calzado', it: 'Calzature', en: 'Footwear', de: 'Schuhe' },
  'category.sportswear': { fr: 'Sport', pt: 'Desporto', es: 'Deporte', it: 'Sport', en: 'Sportswear', de: 'Sportbekleidung' },
  'category.accessories_leather_goods': { fr: 'Maroquinerie', pt: 'Acessórios e Marroquinaria', es: 'Marroquinería', it: 'Pelletteria', en: 'Accessories & Leather Goods', de: 'Lederwaren' },
  'category.cosmetics': { fr: 'Cosmétique', pt: 'Cosmética', es: 'Cosmética', it: 'Cosmetica', en: 'Cosmetics', de: 'Kosmetik' },
  'homepage.allsale_cta': { fr: 'Voir tout Z Fashion', pt: 'Ver tudo no Z Fashion', es: 'Ver todo Z Fashion', it: 'Vedi tutto Z Fashion', en: 'See all of Z Fashion', de: 'Alles bei Z Fashion ansehen' },
  'homepage.boutiques_title': { fr: 'Découvrez nos boutiques', pt: 'Descubra as nossas lojas', es: 'Descubre nuestras boutiques', it: 'Scopri le nostre boutique', en: 'Discover our boutiques', de: 'Entdecken Sie unsere Boutiquen' },
  'product.same_corner_label': { fr: 'Plus de cette boutique', pt: 'Mais desta loja', es: 'Más de esta tienda', it: 'Altro da questo negozio', en: 'More from this store', de: 'Mehr aus diesem Shop' },
  'product.fallback_label': { fr: 'Vous aimerez aussi', pt: 'Também pode gostar', es: 'También te puede gustar', it: 'Potrebbe piacerti anche', en: 'You may also like', de: 'Das könnte Ihnen auch gefallen' },
  'campaign.sponsored_label': { fr: 'Sponsorisé', pt: 'Patrocinado', es: 'Patrocinado', it: 'Sponsorizzato', en: 'Sponsored', de: 'Gesponsert' },
  'trust.return_policy': { fr: 'Retours sous 14 jours, article non porté', pt: 'Devoluções em 14 dias, artigo não usado', es: 'Devoluciones en 14 días, artículo sin usar', it: 'Resi entro 14 giorni, articolo non indossato', en: 'Returns within 14 days, item unworn', de: 'Rückgabe innerhalb von 14 Tagen, unbenutzter Artikel' },
  'trust.professional_seller': { fr: 'Vendeur professionnel vérifié', pt: 'Vendedor profissional verificado', es: 'Vendedor profesional verificado', it: 'Venditore professionale verificato', en: 'Verified professional seller', de: 'Verifizierter professioneller Verkäufer' },
});

function t(key, locale = DEFAULT_LOCALE) {
  const entry = STRINGS[key];
  if (!entry) {
    throw new Error(`t(): unknown UI string key "${key}" — add it to STRINGS before using it, never fall back to a raw key in the UI`);
  }
  return entry[locale] || entry[DEFAULT_LOCALE];
}

/** True if every supported locale has a translation for every key — a
 *  build-time/test-time check, not something to discover in production
 *  as a blank string on the page. */
function findMissingTranslations() {
  const missing = [];
  for (const [key, entry] of Object.entries(STRINGS)) {
    for (const locale of SUPPORTED_LOCALES) {
      if (!entry[locale]) missing.push(`${key} / ${locale}`);
    }
  }
  return missing;
}

module.exports = { SUPPORTED_LOCALES, DEFAULT_LOCALE, STRINGS, t, findMissingTranslations };
