/* ============================================================
   Z FIND — MARKETPLACE MARKET REGISTRY

   Product-market authority is deliberately separate from:
   - Geography truth
   - Legal-guide routes
   - UI language

   One stable market key drives runtime navigation and SEO generation.
   New Market Page presentation is complete in all six public locales.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./public-locales'),
      require('./public-routes')
    );
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.marketRegistry = factory(
      root.ZFindServices.publicLocales,
      root.ZFindServices.publicRoutes
    );
  }
})(typeof window !== 'undefined' ? window : this, function (
  publicLocales,
  publicRoutes
) {
  'use strict';

  if (!publicLocales || !publicRoutes) {
    throw new Error(
      'Z Find market registry requires public-locales and public-routes.'
    );
  }

  const MARKET_LOCALES = Object.freeze(
    publicLocales.PUBLIC_LOCALES.slice()
  );

  const COPY = Object.freeze({
    fr: Object.freeze({
      heroEyebrow: 'Marché immobilier international',
      heroTitle: label => `Explorez les opportunités immobilières — ${label}`,
      heroLead: label => `Découvrez biens, programmes neufs et terrains sur Z Find pour ${label}, avec une lecture claire du marché et un accès direct aux partenaires qui les représentent.`,
      featuredTitle: 'À la une cette semaine',
      featuredIntro: 'Jusqu’à six opportunités publiées mises en avant sur ce marché. L’attribution commerciale des emplacements sera activée dans une phase dédiée.',
      featuredBadge: 'À la une',
      featuredLoading: 'Chargement de la sélection…',
      featuredEmptyTitle: 'Emplacement disponible',
      featuredEmptyBody: 'Aucune opportunité publiée n’est actuellement attribuée à cet emplacement.',
      featuredErrorTitle: 'Sélection indisponible',
      featuredErrorBody: 'Impossible de charger les opportunités mises en avant pour le moment.',
      searchTitle: 'Rechercher sur ce marché',
      searchIntro: 'Affinez votre recherche sans quitter le marché sélectionné.',
      guidesTitle: 'Comprendre le marché',
      guidesIntro: 'Accédez aux guides spécialisés disponibles pour cette juridiction.',
      legalLabel: 'Guide juridique',
      rentalLabel: 'Location de courte durée',
      backHome: 'Retour à l’accueil',
      openInteractive: 'Explorer le marketplace',
      seoTitle: label => `Immobilier — ${label} | Z Find`,
      seoDescription: label => `Biens, programmes neufs, terrains et informations de marché pour ${label}. Explorez le marketplace immobilier international Z Find.`
    }),

    en: Object.freeze({
      heroEyebrow: 'International real-estate market',
      heroTitle: label => `Explore real-estate opportunities — ${label}`,
      heroLead: label => `Discover properties, developments and land on Z Find for ${label}, with clearer market context and direct access to the partners representing them.`,
      featuredTitle: 'Featured this week',
      featuredIntro: 'Up to six published opportunities highlighted in this market. Commercial slot assignment will be activated in a dedicated phase.',
      featuredBadge: 'Featured',
      featuredLoading: 'Loading the selection…',
      featuredEmptyTitle: 'Slot available',
      featuredEmptyBody: 'No published opportunity is currently assigned to this slot.',
      featuredErrorTitle: 'Selection unavailable',
      featuredErrorBody: 'The featured opportunities cannot be loaded right now.',
      searchTitle: 'Search this market',
      searchIntro: 'Refine your search without leaving the selected market.',
      guidesTitle: 'Understand the market',
      guidesIntro: 'Access the specialist guides available for this jurisdiction.',
      legalLabel: 'Legal guide',
      rentalLabel: 'Short-term rental',
      backHome: 'Back to home',
      openInteractive: 'Explore the marketplace',
      seoTitle: label => `Real estate — ${label} | Z Find`,
      seoDescription: label => `Properties, developments, land and market information for ${label}. Explore the international Z Find real-estate marketplace.`
    }),

    pt: Object.freeze({
      heroEyebrow: 'Mercado imobiliário internacional',
      heroTitle: label => `Explore oportunidades imobiliárias — ${label}`,
      heroLead: label => `Descubra imóveis, empreendimentos e terrenos no Z Find para ${label}, com maior contexto de mercado e acesso direto aos parceiros que os representam.`,
      featuredTitle: 'Destaques da semana',
      featuredIntro: 'Até seis oportunidades publicadas em destaque neste mercado. A atribuição comercial dos lugares será ativada numa fase própria.',
      featuredBadge: 'Em destaque',
      featuredLoading: 'A carregar a seleção…',
      featuredEmptyTitle: 'Lugar disponível',
      featuredEmptyBody: 'Nenhuma oportunidade publicada está atualmente atribuída a este lugar.',
      featuredErrorTitle: 'Seleção indisponível',
      featuredErrorBody: 'Não foi possível carregar agora as oportunidades em destaque.',
      searchTitle: 'Pesquisar neste mercado',
      searchIntro: 'Refine a sua pesquisa sem sair do mercado selecionado.',
      guidesTitle: 'Conhecer o mercado',
      guidesIntro: 'Aceda aos guias especializados disponíveis para esta jurisdição.',
      legalLabel: 'Guia jurídico',
      rentalLabel: 'Arrendamento de curta duração',
      backHome: 'Voltar à página inicial',
      openInteractive: 'Explorar o marketplace',
      seoTitle: label => `Imobiliário — ${label} | Z Find`,
      seoDescription: label => `Imóveis, empreendimentos, terrenos e informação de mercado para ${label}. Explore o marketplace imobiliário internacional Z Find.`
    }),

    es: Object.freeze({
      heroEyebrow: 'Mercado inmobiliario internacional',
      heroTitle: label => `Explore oportunidades inmobiliarias — ${label}`,
      heroLead: label => `Descubra inmuebles, promociones y terrenos en Z Find para ${label}, con más contexto de mercado y acceso directo a los socios que los representan.`,
      featuredTitle: 'Destacados de la semana',
      featuredIntro: 'Hasta seis oportunidades publicadas destacadas en este mercado. La asignación comercial de los espacios se activará en una fase específica.',
      featuredBadge: 'Destacado',
      featuredLoading: 'Cargando la selección…',
      featuredEmptyTitle: 'Espacio disponible',
      featuredEmptyBody: 'Actualmente no hay ninguna oportunidad publicada asignada a este espacio.',
      featuredErrorTitle: 'Selección no disponible',
      featuredErrorBody: 'No se pueden cargar ahora las oportunidades destacadas.',
      searchTitle: 'Buscar en este mercado',
      searchIntro: 'Afine su búsqueda sin salir del mercado seleccionado.',
      guidesTitle: 'Conocer el mercado',
      guidesIntro: 'Acceda a las guías especializadas disponibles para esta jurisdicción.',
      legalLabel: 'Guía jurídica',
      rentalLabel: 'Alquiler de corta duración',
      backHome: 'Volver al inicio',
      openInteractive: 'Explorar el marketplace',
      seoTitle: label => `Inmobiliario — ${label} | Z Find`,
      seoDescription: label => `Inmuebles, promociones, terrenos e información de mercado para ${label}. Explore el marketplace inmobiliario internacional Z Find.`
    }),

    de: Object.freeze({
      heroEyebrow: 'Internationaler Immobilienmarkt',
      heroTitle: label => `Immobilienchancen entdecken — ${label}`,
      heroLead: label => `Entdecken Sie Immobilien, Neubauprojekte und Grundstücke auf Z Find für ${label} – mit klarem Marktkontext und direktem Zugang zu den vertretenden Partnern.`,
      featuredTitle: 'Highlights der Woche',
      featuredIntro: 'Bis zu sechs veröffentlichte Angebote werden in diesem Markt hervorgehoben. Die kommerzielle Vergabe der Plätze wird in einer eigenen Phase aktiviert.',
      featuredBadge: 'Im Fokus',
      featuredLoading: 'Auswahl wird geladen…',
      featuredEmptyTitle: 'Platz verfügbar',
      featuredEmptyBody: 'Diesem Platz ist derzeit kein veröffentlichtes Angebot zugeordnet.',
      featuredErrorTitle: 'Auswahl nicht verfügbar',
      featuredErrorBody: 'Die hervorgehobenen Angebote können derzeit nicht geladen werden.',
      searchTitle: 'Diesen Markt durchsuchen',
      searchIntro: 'Verfeinern Sie Ihre Suche, ohne den ausgewählten Markt zu verlassen.',
      guidesTitle: 'Den Markt verstehen',
      guidesIntro: 'Rufen Sie die für diese Rechtsordnung verfügbaren Fachleitfäden auf.',
      legalLabel: 'Rechtlicher Leitfaden',
      rentalLabel: 'Kurzzeitvermietung',
      backHome: 'Zur Startseite',
      openInteractive: 'Marketplace erkunden',
      seoTitle: label => `Immobilien — ${label} | Z Find`,
      seoDescription: label => `Immobilien, Neubauprojekte, Grundstücke und Marktinformationen für ${label}. Entdecken Sie den internationalen Immobilien-Marktplatz Z Find.`
    }),

    it: Object.freeze({
      heroEyebrow: 'Mercato immobiliare internazionale',
      heroTitle: label => `Esplora opportunità immobiliari — ${label}`,
      heroLead: label => `Scopri immobili, nuove costruzioni e terreni su Z Find per ${label}, con un contesto di mercato più chiaro e accesso diretto ai partner che li rappresentano.`,
      featuredTitle: 'In evidenza questa settimana',
      featuredIntro: 'Fino a sei opportunità pubblicate in evidenza in questo mercato. L’assegnazione commerciale degli spazi sarà attivata in una fase dedicata.',
      featuredBadge: 'In evidenza',
      featuredLoading: 'Caricamento della selezione…',
      featuredEmptyTitle: 'Spazio disponibile',
      featuredEmptyBody: 'Al momento nessuna opportunità pubblicata è assegnata a questo spazio.',
      featuredErrorTitle: 'Selezione non disponibile',
      featuredErrorBody: 'Al momento non è possibile caricare le opportunità in evidenza.',
      searchTitle: 'Cerca in questo mercato',
      searchIntro: 'Affina la ricerca senza uscire dal mercato selezionato.',
      guidesTitle: 'Conoscere il mercato',
      guidesIntro: 'Accedi alle guide specialistiche disponibili per questa giurisdizione.',
      legalLabel: 'Guida legale',
      rentalLabel: 'Locazione breve',
      backHome: 'Torna alla home',
      openInteractive: 'Esplora il marketplace',
      seoTitle: label => `Immobiliare — ${label} | Z Find`,
      seoDescription: label => `Immobili, nuove costruzioni, terreni e informazioni di mercato per ${label}. Esplora il marketplace immobiliare internazionale Z Find.`
    })
  });

  function market(
    key,
    geography,
    searchScope,
    legalRoute,
    touristRentalRoute,
    labels,
    slugs
  ) {
    return Object.freeze({
      key,
      mapAsset: 'brand/markets/' + key.toLowerCase() + '.svg',
      geography: Object.freeze(geography),
      searchScope: Object.freeze(searchScope),
      legalRoute,
      touristRentalRoute,
      labels: Object.freeze(labels),
      slugs: Object.freeze(slugs)
    });
  }

  const MARKETS = Object.freeze([
    market(
      'PT',
      { kind:'country', code:'PT' },
      { kind:'country_iso', value:'PT' },
      'legal',
      'al-manual',
      { fr:'Portugal', en:'Portugal', pt:'Portugal', es:'Portugal', de:'Portugal', it:'Portogallo' },
      { fr:'portugal', en:'portugal', pt:'portugal', es:'portugal', de:'portugal', it:'portogallo' }
    ),
    market(
      'ES',
      { kind:'country', code:'ES' },
      { kind:'country_iso', value:'ES' },
      'legal-es',
      'al-manual-es',
      { fr:'Espagne', en:'Spain', pt:'Espanha', es:'España', de:'Spanien', it:'Spagna' },
      { fr:'espagne', en:'spain', pt:'espanha', es:'espana', de:'spanien', it:'spagna' }
    ),
    market(
      'FR',
      { kind:'country', code:'FR' },
      { kind:'country_iso', value:'FR' },
      'legal-fr',
      'tourist-rental-fr',
      { fr:'France', en:'France', pt:'França', es:'Francia', de:'Frankreich', it:'Francia' },
      { fr:'france', en:'france', pt:'franca', es:'francia', de:'frankreich', it:'francia' }
    ),
    market(
      'DE',
      { kind:'country', code:'DE' },
      { kind:'country_iso', value:'DE' },
      'legal-de',
      'tourist-rental-de',
      { fr:'Allemagne', en:'Germany', pt:'Alemanha', es:'Alemania', de:'Deutschland', it:'Germania' },
      { fr:'allemagne', en:'germany', pt:'alemanha', es:'alemania', de:'deutschland', it:'germania' }
    ),
    market(
      'IT',
      { kind:'country', code:'IT' },
      { kind:'country_iso', value:'IT' },
      'legal-it',
      'tourist-rental-it',
      { fr:'Italie', en:'Italy', pt:'Itália', es:'Italia', de:'Italien', it:'Italia' },
      { fr:'italie', en:'italy', pt:'italia', es:'italia', de:'italien', it:'italia' }
    ),
    market(
      'IE',
      { kind:'country', code:'IE' },
      { kind:'country_iso', value:'IE' },
      'legal-ie',
      'tourist-rental-ie',
      { fr:'Irlande', en:'Ireland', pt:'Irlanda', es:'Irlanda', de:'Irland', it:'Irlanda' },
      { fr:'irlande', en:'ireland', pt:'irlanda', es:'irlanda', de:'irland', it:'irlanda' }
    ),

    market(
      'GB-ENG',
      { kind:'constituent-country', code:'GB-ENG', parentCountryIso:'GB' },
      { kind:'exact_market', value:'GB-ENG' },
      'legal-england',
      'tourist-rental-england',
      { fr:'Angleterre', en:'England', pt:'Inglaterra', es:'Inglaterra', de:'England', it:'Inghilterra' },
      { fr:'angleterre', en:'england', pt:'inglaterra', es:'inglaterra', de:'england', it:'inghilterra' }
    ),
    market(
      'GB-SCT',
      { kind:'constituent-country', code:'GB-SCT', parentCountryIso:'GB' },
      { kind:'exact_market', value:'GB-SCT' },
      'legal-scotland',
      'tourist-rental-scotland',
      { fr:'Écosse', en:'Scotland', pt:'Escócia', es:'Escocia', de:'Schottland', it:'Scozia' },
      { fr:'ecosse', en:'scotland', pt:'escocia', es:'escocia', de:'schottland', it:'scozia' }
    ),
    market(
      'GB-WLS',
      { kind:'constituent-country', code:'GB-WLS', parentCountryIso:'GB' },
      { kind:'exact_market', value:'GB-WLS' },
      'legal-wales',
      'tourist-rental-wales',
      { fr:'Pays de Galles', en:'Wales', pt:'País de Gales', es:'Gales', de:'Wales', it:'Galles' },
      { fr:'pays-de-galles', en:'wales', pt:'pais-de-gales', es:'gales', de:'wales', it:'galles' }
    ),
    market(
      'GB-NIR',
      { kind:'constituent-country', code:'GB-NIR', parentCountryIso:'GB' },
      { kind:'exact_market', value:'GB-NIR' },
      'legal-northern-ireland',
      'tourist-rental-northern-ireland',
      { fr:'Irlande du Nord', en:'Northern Ireland', pt:'Irlanda do Norte', es:'Irlanda del Norte', de:'Nordirland', it:'Irlanda del Nord' },
      { fr:'irlande-du-nord', en:'northern-ireland', pt:'irlanda-do-norte', es:'irlanda-del-norte', de:'nordirland', it:'irlanda-del-nord' }
    ),

    market(
      'NL',
      { kind:'country', code:'NL' },
      { kind:'country_iso', value:'NL' },
      'legal-netherlands',
      'tourist-rental-netherlands',
      { fr:'Pays-Bas', en:'Netherlands', pt:'Países Baixos', es:'Países Bajos', de:'Niederlande', it:'Paesi Bassi' },
      { fr:'pays-bas', en:'netherlands', pt:'paises-baixos', es:'paises-bajos', de:'niederlande', it:'paesi-bassi' }
    ),
    market(
      'BE',
      { kind:'country', code:'BE' },
      { kind:'country_iso', value:'BE' },
      'legal-belgium',
      'tourist-rental-belgium',
      { fr:'Belgique', en:'Belgium', pt:'Bélgica', es:'Bélgica', de:'Belgien', it:'Belgio' },
      { fr:'belgique', en:'belgium', pt:'belgica', es:'belgica', de:'belgien', it:'belgio' }
    ),

    market(
      'US',
      { kind:'country', code:'US' },
      { kind:'country_iso', value:'US' },
      'legal-united-states',
      'tourist-rental-united-states',
      { fr:'États-Unis', en:'United States', pt:'Estados Unidos', es:'Estados Unidos', de:'Vereinigte Staaten', it:'Stati Uniti' },
      { fr:'etats-unis', en:'united-states', pt:'estados-unidos', es:'estados-unidos', de:'vereinigte-staaten', it:'stati-uniti' }
    ),
    market(
      'CA',
      { kind:'country', code:'CA' },
      { kind:'country_iso', value:'CA' },
      'legal-canada',
      'tourist-rental-canada',
      { fr:'Canada', en:'Canada', pt:'Canadá', es:'Canadá', de:'Kanada', it:'Canada' },
      { fr:'canada', en:'canada', pt:'canada', es:'canada', de:'kanada', it:'canada' }
    ),
    market(
      'MX',
      { kind:'country', code:'MX' },
      { kind:'country_iso', value:'MX' },
      'legal-mexico',
      'tourist-rental-mexico',
      { fr:'Mexique', en:'Mexico', pt:'México', es:'México', de:'Mexiko', it:'Messico' },
      { fr:'mexique', en:'mexico', pt:'mexico', es:'mexico', de:'mexiko', it:'messico' }
    ),
    market(
      'BR',
      { kind:'country', code:'BR' },
      { kind:'country_iso', value:'BR' },
      'legal-brazil',
      'tourist-rental-brazil',
      { fr:'Brésil', en:'Brazil', pt:'Brasil', es:'Brasil', de:'Brasilien', it:'Brasile' },
      { fr:'bresil', en:'brazil', pt:'brasil', es:'brasil', de:'brasilien', it:'brasile' }
    ),
    market(
      'AR',
      { kind:'country', code:'AR' },
      { kind:'country_iso', value:'AR' },
      'legal-argentina',
      'tourist-rental-argentina',
      { fr:'Argentine', en:'Argentina', pt:'Argentina', es:'Argentina', de:'Argentinien', it:'Argentina' },
      { fr:'argentine', en:'argentina', pt:'argentina', es:'argentina', de:'argentinien', it:'argentina' }
    ),

    market(
      'CL',
      { kind:'country', code:'CL' },
      { kind:'country_iso', value:'CL' },
      'legal-chile',
      'tourist-rental-chile',
      { fr:'Chili', en:'Chile', pt:'Chile', es:'Chile', de:'Chile', it:'Cile' },
      { fr:'chili', en:'chile', pt:'chile', es:'chile', de:'chile', it:'cile' }
    ),
    market(
      'DO',
      { kind:'country', code:'DO' },
      { kind:'country_iso', value:'DO' },
      'legal-dominican-republic',
      'tourist-rental-dominican-republic',
      { fr:'République dominicaine', en:'Dominican Republic', pt:'República Dominicana', es:'República Dominicana', de:'Dominikanische Republik', it:'Repubblica Dominicana' },
      { fr:'republique-dominicaine', en:'dominican-republic', pt:'republica-dominicana', es:'republica-dominicana', de:'dominikanische-republik', it:'repubblica-dominicana' }
    ),
    market(
      'PL',
      { kind:'country', code:'PL' },
      { kind:'country_iso', value:'PL' },
      'legal-poland',
      'tourist-rental-poland',
      { fr:'Pologne', en:'Poland', pt:'Polónia', es:'Polonia', de:'Polen', it:'Polonia' },
      { fr:'pologne', en:'poland', pt:'polonia', es:'polonia', de:'polen', it:'polonia' }
    ),
    market(
      'GR',
      { kind:'country', code:'GR' },
      { kind:'country_iso', value:'GR' },
      'legal-greece',
      'tourist-rental-greece',
      { fr:'Grèce', en:'Greece', pt:'Grécia', es:'Grecia', de:'Griechenland', it:'Grecia' },
      { fr:'grece', en:'greece', pt:'grecia', es:'grecia', de:'griechenland', it:'grecia' }
    ),
    market(
      'HR',
      { kind:'country', code:'HR' },
      { kind:'country_iso', value:'HR' },
      'legal-croatia',
      'tourist-rental-croatia',
      { fr:'Croatie', en:'Croatia', pt:'Croácia', es:'Croacia', de:'Kroatien', it:'Croazia' },
      { fr:'croatie', en:'croatia', pt:'croacia', es:'croacia', de:'kroatien', it:'croazia' }
    ),
    market(
      'CY',
      { kind:'country', code:'CY' },
      { kind:'country_iso', value:'CY' },
      'legal-cyprus',
      'tourist-rental-cyprus',
      { fr:'Chypre', en:'Cyprus', pt:'Chipre', es:'Chipre', de:'Zypern', it:'Cipro' },
      { fr:'chypre', en:'cyprus', pt:'chipre', es:'chipre', de:'zypern', it:'cipro' }
    ),
    market(
      'AE-DU',
      { kind:'emirate', code:'AE-DU', parentCountryIso:'AE' },
      { kind:'exact_market', value:'AE-DU' },
      'legal-dubai',
      'tourist-rental-dubai',
      { fr:'Dubaï', en:'Dubai', pt:'Dubai', es:'Dubái', de:'Dubai', it:'Dubai' },
      { fr:'dubai', en:'dubai', pt:'dubai', es:'dubai', de:'dubai', it:'dubai' }
    )
  ]);

  const MARKET_BY_KEY = Object.freeze(
    Object.fromEntries(MARKETS.map(item => [item.key, item]))
  );

  function requireLocale(value) {
    const locale = publicLocales.normalizePublicLocale(value);
    if (!locale || !MARKET_LOCALES.includes(locale)) {
      throw new Error('Unsupported market locale.');
    }
    return locale;
  }

  function getMarket(key) {
    return typeof key === 'string'
      ? (MARKET_BY_KEY[key] || null)
      : null;
  }

  function listMarkets() {
    return MARKETS.slice();
  }

  function marketLabel(key, localeValue) {
    const marketValue = getMarket(key);
    if (!marketValue) throw new Error('Unknown Z Find market.');
    const locale = requireLocale(localeValue);
    const label = marketValue.labels[locale];
    if (!label) throw new Error('Missing localized market label.');
    return label;
  }

  function marketPath(key, localeValue) {
    const marketValue = getMarket(key);
    if (!marketValue) throw new Error('Unknown Z Find market.');
    const locale = requireLocale(localeValue);
    const slug = marketValue.slugs[locale];
    if (!slug) throw new Error('Missing localized market slug.');
    return publicRoutes.buildMarketPath({ locale, slug });
  }

  function marketBySlug(localeValue, slug) {
    const locale = requireLocale(localeValue);
    return MARKETS.find(item => item.slugs[locale] === slug) || null;
  }

  function marketPresentation(key, localeValue) {
    const locale = requireLocale(localeValue);
    const label = marketLabel(key, locale);
    const copy = COPY[locale];

    if (!copy) {
      throw new Error('Missing market presentation locale.');
    }

    return Object.freeze({
      locale,
      label,
      heroEyebrow: copy.heroEyebrow,
      heroTitle: copy.heroTitle(label),
      heroLead: copy.heroLead(label),
      featuredTitle: copy.featuredTitle,
      featuredIntro: copy.featuredIntro,
      featuredBadge: copy.featuredBadge,
      featuredLoading: copy.featuredLoading,
      featuredEmptyTitle: copy.featuredEmptyTitle,
      featuredEmptyBody: copy.featuredEmptyBody,
      featuredErrorTitle: copy.featuredErrorTitle,
      featuredErrorBody: copy.featuredErrorBody,
      searchTitle: copy.searchTitle,
      searchIntro: copy.searchIntro,
      guidesTitle: copy.guidesTitle,
      guidesIntro: copy.guidesIntro,
      legalLabel: copy.legalLabel,
      rentalLabel: copy.rentalLabel,
      backHome: copy.backHome,
      openInteractive: copy.openInteractive,
      seoTitle: copy.seoTitle(label),
      seoDescription: copy.seoDescription(label)
    });
  }

  // Hard fail at module initialization if any new-market public surface
  // is not genuinely complete in the six approved locales.
  for (const item of MARKETS) {
    for (const locale of MARKET_LOCALES) {
      if (!item.labels[locale] || !item.slugs[locale]) {
        throw new Error(
          `Incomplete market localization: ${item.key}/${locale}`
        );
      }
      if (!COPY[locale]) {
        throw new Error(
          `Incomplete market presentation copy: ${locale}`
        );
      }
    }
  }

  return Object.freeze({
    MARKET_LOCALES,
    MARKETS,
    getMarket,
    listMarkets,
    marketLabel,
    marketPath,
    marketBySlug,
    marketPresentation
  });
});
