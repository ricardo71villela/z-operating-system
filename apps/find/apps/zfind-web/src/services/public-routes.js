/* ============================================================
   Z FIND — CANONICAL PUBLIC MARKETPLACE ROUTES
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./public-locales'));
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.publicRoutes = factory(
      root.ZFindServices.publicLocales
    );
  }
})(typeof window !== 'undefined' ? window : this, function (locales) {
  'use strict';

  if (!locales) {
    throw new Error(
      'Z Find public routes require public-locales.'
    );
  }

  const ROUTES = Object.freeze({
    fr: Object.freeze({
      market: 'marches',
      entity: Object.freeze({
        property: 'bien',
        development: 'programme',
        zone: 'zone'
      }),
      intent: Object.freeze({
        buy: 'acheter',
        rent: 'louer',
        invest: 'investir',
        developments: 'programmes-neufs'
      })
    }),

    en: Object.freeze({
      market: 'markets',
      entity: Object.freeze({
        property: 'property',
        development: 'development',
        zone: 'zone'
      }),
      intent: Object.freeze({
        buy: 'buy',
        rent: 'rent',
        invest: 'invest',
        developments: 'developments'
      })
    }),

    pt: Object.freeze({
      market: 'mercados',
      entity: Object.freeze({
        property: 'imovel',
        development: 'empreendimento',
        zone: 'zona'
      }),
      intent: Object.freeze({
        buy: 'comprar',
        rent: 'arrendar',
        invest: 'investir',
        developments: 'empreendimentos'
      })
    }),

    es: Object.freeze({
      market: 'mercados',
      entity: Object.freeze({
        property: 'inmueble',
        development: 'promocion',
        zone: 'zona'
      }),
      intent: Object.freeze({
        buy: 'comprar',
        rent: 'alquilar',
        invest: 'invertir',
        developments: 'promociones'
      })
    }),

    de: Object.freeze({
      market: 'maerkte',
      entity: Object.freeze({
        property: 'immobilie',
        development: 'neubauprojekt',
        zone: 'lage'
      }),
      intent: Object.freeze({
        buy: 'kaufen',
        rent: 'mieten',
        invest: 'investieren',
        developments: 'neubauprojekte'
      })
    }),

    it: Object.freeze({
      market: 'mercati',
      entity: Object.freeze({
        property: 'immobile',
        development: 'nuova-costruzione',
        zone: 'zona'
      }),
      intent: Object.freeze({
        buy: 'acquistare',
        rent: 'affittare',
        invest: 'investire',
        developments: 'nuove-costruzioni'
      })
    })
  });

  const ENTITY_KINDS = Object.freeze([
    'property',
    'development',
    'zone'
  ]);

  const INTENTS = Object.freeze([
    'buy',
    'rent',
    'invest',
    'developments'
  ]);

  function requireLocale(value) {
    const locale = locales.normalizePublicLocale(value);

    if (!locale) {
      throw new Error('Unsupported public locale.');
    }

    return locale;
  }

  function normalizeSlug(value) {
    if (typeof value !== 'string') return null;

    const slug = value.trim().toLowerCase();

    if (
      !slug ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    ) {
      return null;
    }

    return slug;
  }

  function requireSlug(value) {
    const slug = normalizeSlug(value);

    if (!slug) {
      throw new Error('Invalid public slug.');
    }

    return slug;
  }

  function buildMarketPath({ locale, slug }) {
    const L = requireLocale(locale);

    return (
      '/' +
      L +
      '/' +
      ROUTES[L].market +
      '/' +
      requireSlug(slug)
    );
  }

  function buildEntityPath({ locale, kind, slug }) {
    const L = requireLocale(locale);

    if (!ENTITY_KINDS.includes(kind)) {
      throw new Error(
        'Unsupported public entity kind.'
      );
    }

    return (
      '/' +
      L +
      '/' +
      ROUTES[L].entity[kind] +
      '/' +
      requireSlug(slug)
    );
  }

  function buildIntentPath({ locale, intent }) {
    const L = requireLocale(locale);

    if (!INTENTS.includes(intent)) {
      throw new Error(
        'Unsupported marketplace intent.'
      );
    }

    return (
      '/' +
      L +
      '/' +
      ROUTES[L].intent[intent]
    );
  }

  function parsePublicPath(pathname) {
    if (typeof pathname !== 'string') return null;

    const clean = pathname
      .split('?')[0]
      .split('#')[0]
      .replace(/^\/+|\/+$/g, '');

    const parts = clean ? clean.split('/') : [];

    if (parts.length < 2) return null;

    const locale =
      locales.normalizePublicLocale(parts[0]);

    if (!locale) return null;

    const segment = parts[1];

    if (ROUTES[locale].market === segment) {
      if (parts.length !== 3) return null;

      const slug = normalizeSlug(parts[2]);
      if (!slug) return null;

      return {
        type: 'market',
        locale,
        slug
      };
    }

    for (const kind of ENTITY_KINDS) {
      if (ROUTES[locale].entity[kind] === segment) {
        if (parts.length !== 3) return null;

        const slug = normalizeSlug(parts[2]);

        if (!slug) return null;

        return {
          type: 'entity',
          locale,
          kind,
          slug
        };
      }
    }

    for (const intent of INTENTS) {
      if (ROUTES[locale].intent[intent] === segment) {
        if (parts.length !== 2) return null;

        return {
          type: 'intent',
          locale,
          intent
        };
      }
    }

    return null;
  }

  return Object.freeze({
    ROUTES,
    ENTITY_KINDS,
    INTENTS,
    normalizeSlug,
    buildMarketPath,
    buildEntityPath,
    buildIntentPath,
    parsePublicPath
  });
});
