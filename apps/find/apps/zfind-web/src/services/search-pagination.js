(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./public-locales')
    );
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.searchPagination = factory(
      root.ZFindServices.publicLocales
    );
  }
})(typeof window !== 'undefined' ? window : this, function (
  publicLocales
) {
  'use strict';

  if (!publicLocales) {
    throw new Error(
      'Z Find Search pagination requires public-locales.'
    );
  }

  const SEARCH_PAGE_SIZE = 6;

  const REQUIRED_LOCALES =
    Object.freeze(['fr', 'en', 'pt', 'es', 'de', 'it']);

  const COPY = Object.freeze({
    fr: Object.freeze({
      previous: 'Précédent',
      next: 'Suivant',
      page: 'Page {page} sur {pageCount}'
    }),
    en: Object.freeze({
      previous: 'Previous',
      next: 'Next',
      page: 'Page {page} of {pageCount}'
    }),
    pt: Object.freeze({
      previous: 'Anterior',
      next: 'Seguinte',
      page: 'Página {page} de {pageCount}'
    }),
    es: Object.freeze({
      previous: 'Anterior',
      next: 'Siguiente',
      page: 'Página {page} de {pageCount}'
    }),
    de: Object.freeze({
      previous: 'Zurück',
      next: 'Weiter',
      page: 'Seite {page} von {pageCount}'
    }),
    it: Object.freeze({
      previous: 'Precedente',
      next: 'Successiva',
      page: 'Pagina {page} di {pageCount}'
    })
  });

  const actualLocales =
    Array.isArray(publicLocales.PUBLIC_LOCALES)
      ? publicLocales.PUBLIC_LOCALES.slice()
      : [];

  if (
    actualLocales.length !== REQUIRED_LOCALES.length ||
    REQUIRED_LOCALES.some(
      locale => !actualLocales.includes(locale)
    )
  ) {
    throw new Error(
      'Z Find Search pagination requires exact six-language public authority.'
    );
  }

  for (const locale of REQUIRED_LOCALES) {
    const copy = COPY[locale];

    if (
      !copy ||
      !copy.previous ||
      !copy.next ||
      !copy.page
    ) {
      throw new Error(
        `Incomplete Search pagination copy: ${locale}`
      );
    }
  }

  function parsePage(value) {
    if (
      value === undefined ||
      value === null ||
      value === ''
    ) {
      return 1;
    }

    const text = String(value);

    if (!/^[1-9]\d*$/.test(text)) {
      return 1;
    }

    const parsed = Number(text);

    return Number.isSafeInteger(parsed)
      ? parsed
      : 1;
  }

  function sourceBucket(card) {
    return card && card.kind === 'Development'
      ? 1
      : 0;
  }

  function compareText(a, b) {
    const left = String(a || '');
    const right = String(b || '');

    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }

  function compareOrganicCards(a, b) {
    const bucket =
      sourceBucket(a) -
      sourceBucket(b);

    if (bucket) return bucket;

    const asset =
      compareText(
        a && a.assetId,
        b && b.assetId
      );

    if (asset) return asset;

    return compareText(
      a && a.listingId,
      b && b.listingId
    );
  }

  function orderCards(cards) {
    return (Array.isArray(cards) ? cards : [])
      .slice()
      .sort(compareOrganicCards);
  }

  function paginate(cards, rawPage) {
    const orderedCards =
      orderCards(cards);

    const totalCount =
      orderedCards.length;

    const pageCount =
      Math.max(
        1,
        Math.ceil(
          totalCount / SEARCH_PAGE_SIZE
        )
      );

    const page =
      Math.min(
        parsePage(rawPage),
        pageCount
      );

    const start =
      (page - 1) * SEARCH_PAGE_SIZE;

    return Object.freeze({
      cards: orderedCards.slice(
        start,
        start + SEARCH_PAGE_SIZE
      ),
      totalCount,
      page,
      pageCount,
      pageSize: SEARCH_PAGE_SIZE
    });
  }

  function format(template, values) {
    return template.replace(
      /\{(\w+)\}/g,
      function (_, key) {
        return values[key] === undefined
          ? ''
          : String(values[key]);
      }
    );
  }

  function presentation(localeValue, values) {
    const locale =
      String(localeValue || '');

    if (!REQUIRED_LOCALES.includes(locale)) {
      throw new Error(
        'Unsupported Search pagination locale.'
      );
    }

    const copy =
      COPY[locale];

    return Object.freeze({
      previous: copy.previous,
      next: copy.next,
      page: format(
        copy.page,
        {
          page: values && values.page,
          pageCount: values && values.pageCount
        }
      )
    });
  }

  return Object.freeze({
    SEARCH_PAGE_SIZE,
    REQUIRED_LOCALES,
    parsePage,
    compareOrganicCards,
    orderCards,
    paginate,
    presentation
  });
});
