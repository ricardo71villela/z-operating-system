/* ============================================================
   Z FIND — MARKET SEARCH SCOPE

   Market identity is independent from UI language.

   Current searchable authority:
   - sovereign markets: zones_lite.country_iso
   - exact sub-country markets: canonical Geography RPC projection

   Exact-market runtime authority is restricted to the five registry
   keys bootstrapped and verified in A4.R2. Never infer England from
   GB, or Dubai from AE.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.marketSearchScope = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const SUPPORTED_LOCALES = Object.freeze(
    ['fr','en','pt','es','de','it']
  );

  const EXACT_MARKET_KEYS = Object.freeze([
    'GB-ENG',
    'GB-SCT',
    'GB-WLS',
    'GB-NIR',
    'AE-DU'
  ]);

  const COPY = Object.freeze({
    fr: Object.freeze({
      buy:'Acheter',
      rent:'Louer',
      locationPlaceholder:'Ville, zone ou mot-clé',
      typeAny:'Tous les types',
      typeResidential:'Résidentiel',
      typeCommercial:'Commercial',
      typeDevelopment:'Programmes neufs',
      typeLand:'Terrains et développement',
      search:'Rechercher',
      exactPendingTitle:'Recherche bientôt disponible',
      exactPendingBody:'Ce marché nécessite un périmètre géographique exact. Z Find n’utilisera pas le pays parent comme substitut.'
    }),
    en: Object.freeze({
      buy:'Buy',
      rent:'Rent',
      locationPlaceholder:'City, area or keyword',
      typeAny:'All types',
      typeResidential:'Residential',
      typeCommercial:'Commercial',
      typeDevelopment:'Developments',
      typeLand:'Land and development',
      search:'Search',
      exactPendingTitle:'Search coming soon',
      exactPendingBody:'This market requires an exact geographic scope. Z Find will not use the parent country as a substitute.'
    }),
    pt: Object.freeze({
      buy:'Comprar',
      rent:'Arrendar',
      locationPlaceholder:'Cidade, zona ou palavra-chave',
      typeAny:'Todos os tipos',
      typeResidential:'Residencial',
      typeCommercial:'Comercial',
      typeDevelopment:'Empreendimentos',
      typeLand:'Terrenos e desenvolvimento',
      search:'Pesquisar',
      exactPendingTitle:'Pesquisa brevemente disponível',
      exactPendingBody:'Este mercado exige um perímetro geográfico exato. O Z Find não utilizará o país-pai como substituto.'
    }),
    es: Object.freeze({
      buy:'Comprar',
      rent:'Alquilar',
      locationPlaceholder:'Ciudad, zona o palabra clave',
      typeAny:'Todos los tipos',
      typeResidential:'Residencial',
      typeCommercial:'Comercial',
      typeDevelopment:'Promociones',
      typeLand:'Terrenos y desarrollo',
      search:'Buscar',
      exactPendingTitle:'Búsqueda próximamente disponible',
      exactPendingBody:'Este mercado requiere un ámbito geográfico exacto. Z Find no utilizará el país superior como sustituto.'
    }),
    de: Object.freeze({
      buy:'Kaufen',
      rent:'Mieten',
      locationPlaceholder:'Stadt, Gebiet oder Suchbegriff',
      typeAny:'Alle Typen',
      typeResidential:'Wohnen',
      typeCommercial:'Gewerbe',
      typeDevelopment:'Neubauprojekte',
      typeLand:'Grundstücke und Entwicklung',
      search:'Suchen',
      exactPendingTitle:'Suche bald verfügbar',
      exactPendingBody:'Dieser Markt benötigt einen exakten geografischen Geltungsbereich. Z Find verwendet das übergeordnete Land nicht als Ersatz.'
    }),
    it: Object.freeze({
      buy:'Acquistare',
      rent:'Affittare',
      locationPlaceholder:'Città, zona o parola chiave',
      typeAny:'Tutti i tipi',
      typeResidential:'Residenziale',
      typeCommercial:'Commerciale',
      typeDevelopment:'Nuove costruzioni',
      typeLand:'Terreni e sviluppo',
      search:'Cerca',
      exactPendingTitle:'Ricerca disponibile a breve',
      exactPendingBody:'Questo mercato richiede un perimetro geografico esatto. Z Find non utilizzerà il Paese di appartenenza come sostituto.'
    })
  });

  function presentation(locale) {
    if (!SUPPORTED_LOCALES.includes(locale)) {
      throw new Error('Unsupported Market Search locale.');
    }
    return COPY[locale];
  }

  function typeOptions(locale) {
    const copy = presentation(locale);
    return Object.freeze([
      Object.freeze({
        key:'all',
        value:'',
        label:copy.typeAny
      }),
      Object.freeze({
        key:'residential',
        value:'apartment,villa',
        label:copy.typeResidential
      }),
      Object.freeze({
        key:'commercial',
        value:'office,retail,industrial_logistics,hospitality',
        label:copy.typeCommercial
      }),
      Object.freeze({
        key:'development',
        value:'development',
        label:copy.typeDevelopment
      }),
      Object.freeze({
        key:'land',
        value:'land',
        label:copy.typeLand
      })
    ]);
  }

  function resolveMarketScope(market) {
    if (!market || !market.searchScope) {
      return Object.freeze({
        supported:false,
        reason:'unknown_market'
      });
    }

    if (market.searchScope.kind === 'country_iso') {
      return Object.freeze({
        supported:true,
        kind:'country_iso',
        marketKey:market.key,
        countryIso:market.searchScope.value
      });
    }

    if (market.searchScope.kind === 'exact_market') {
      if (
        market.searchScope.value !== market.key ||
        !EXACT_MARKET_KEYS.includes(market.key)
      ) {
        return Object.freeze({
          supported:false,
          kind:'exact_market',
          marketKey:market.key,
          reason:'unsupported_exact_market'
        });
      }

      return Object.freeze({
        supported:true,
        kind:'exact_market',
        marketKey:market.key,
        exactMarketKey:market.searchScope.value
      });
    }

    return Object.freeze({
      supported:false,
      reason:'unsupported_scope_kind'
    });
  }

  return Object.freeze({
    SUPPORTED_LOCALES,
    EXACT_MARKET_KEYS,
    presentation,
    typeOptions,
    resolveMarketScope
  });
});
