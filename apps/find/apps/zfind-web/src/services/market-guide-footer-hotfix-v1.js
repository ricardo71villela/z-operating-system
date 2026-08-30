/* ============================================================
   Z FIND — MARKET GUIDE FOOTER + FR CTA HOTFIX V2
   ============================================================
   Corrects public presentation issues without changing legal
   content, listing data, or jurisdiction semantics:

   1) Footer Legal Guide / Short-Term Rental links follow the active
      marketplace jurisdiction from Market Registry instead of being
      hard-wired to Portugal.
   2) The real anchor href + inline fallback are synchronised, so
      touch navigation on physical mobile devices does not depend on
      delegated click interception.
   3) Safari/iOS page restoration re-synchronises the market links.
   4) The French Property contact CTA uses the approved shorter copy.

   UI locale and legal jurisdiction remain deliberately independent.
   ============================================================ */

(function (root) {
  'use strict';

  if (!root || !root.document) return;

  const services = root.ZFindServices = root.ZFindServices || {};
  const registry = services.marketRegistry;

  if (!registry) {
    throw new Error(
      'Z Find market guide footer hotfix requires marketRegistry.'
    );
  }

  const document = root.document;
  const MARKET_STORAGE_KEY = 'zfind_market';
  const FRENCH_CONTACT_COPY =
    'CONTACTER POUR CETTE OPPORTUNITÉ';

  const GUIDE_SELECTOR =
    'footer.site a[data-i18n="footer.legalGuide"], ' +
    'footer.site a[data-i18n="footer.alManual"]';

  function knownMarketKey(value) {
    return (
      typeof value === 'string' &&
      value.length > 0 &&
      !!registry.getMarket(value)
    );
  }

  function parsedHash() {
    const raw = String(
      root.location && root.location.hash || ''
    ).replace(/^#\/?/, '');

    const splitIndex = raw.indexOf('?');
    const pathPart =
      splitIndex >= 0 ? raw.slice(0, splitIndex) : raw;
    const queryPart =
      splitIndex >= 0 ? raw.slice(splitIndex + 1) : '';

    return {
      parts: pathPart.split('/').filter(Boolean),
      query: new URLSearchParams(queryPart)
    };
  }

  function localeFromRoute() {
    const locale = parsedHash().parts[0];
    return (
      typeof locale === 'string' &&
      locale.length > 0
    )
      ? locale
      : 'fr';
  }

  function marketKeyFromQuery(query) {
    if (!query) return null;

    const direct = query.get('market');
    if (knownMarketKey(direct)) return direct;

    const returnQuery = query.get('returnQuery');
    if (!returnQuery) return null;

    try {
      const nested = new URLSearchParams(returnQuery);
      const nestedMarket = nested.get('market');
      return knownMarketKey(nestedMarket)
        ? nestedMarket
        : null;
    } catch (_) {
      return null;
    }
  }

  function marketKeyFromRoute() {
    const parsed = parsedHash();
    const parts = parsed.parts;
    const view = parts[1] || 'home';
    const id = parts[2] || null;

    if (view === 'market' && knownMarketKey(id)) {
      return id;
    }

    const jurisdictionMarket =
      registry.listMarkets().find(market =>
        market &&
        (
          market.legalRoute === view ||
          market.touristRentalRoute === view
        )
      );

    if (jurisdictionMarket) {
      return jurisdictionMarket.key;
    }

    return marketKeyFromQuery(parsed.query);
  }

  function storedMarketKey() {
    try {
      const value =
        root.localStorage.getItem(MARKET_STORAGE_KEY);
      return knownMarketKey(value) ? value : null;
    } catch (_) {
      return null;
    }
  }

  function rememberMarket(marketKey) {
    if (!knownMarketKey(marketKey)) return false;

    try {
      root.localStorage.setItem(
        MARKET_STORAGE_KEY,
        marketKey
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  function fallbackMarketKey() {
    if (knownMarketKey('PT')) return 'PT';

    const first = registry.listMarkets()[0];
    return first && knownMarketKey(first.key)
      ? first.key
      : null;
  }

  function currentMarketKey() {
    return (
      marketKeyFromRoute() ||
      storedMarketKey() ||
      fallbackMarketKey()
    );
  }

  function targetRoute(kind) {
    const marketKey = currentMarketKey();
    const market = marketKey
      ? registry.getMarket(marketKey)
      : null;

    if (!market) return null;

    if (kind === 'legal') {
      return market.legalRoute || null;
    }

    if (kind === 'rental') {
      return market.touristRentalRoute || null;
    }

    return null;
  }

  function navigateGuide(kind) {
    const marketKey = currentMarketKey();
    const route = targetRoute(kind);

    if (!route) return false;

    if (marketKey) rememberMarket(marketKey);

    if (typeof root.navigate === 'function') {
      root.navigate(route);
      return true;
    }

    root.location.hash =
      '/' + localeFromRoute() + '/' + route;
    return true;
  }

  function footerGuideKind(anchor) {
    const explicit = anchor &&
      anchor.getAttribute('data-market-guide-kind');

    if (explicit === 'legal' || explicit === 'rental') {
      return explicit;
    }

    const key = anchor &&
      anchor.getAttribute('data-i18n');

    if (key === 'footer.legalGuide') return 'legal';
    if (key === 'footer.alManual') return 'rental';
    return null;
  }

  function syncFooterGuideTargets() {
    const marketKey = currentMarketKey();
    const market = marketKey
      ? registry.getMarket(marketKey)
      : null;

    if (!market) return false;

    const locale = localeFromRoute();
    let patched = 0;

    document
      .querySelectorAll(GUIDE_SELECTOR)
      .forEach(anchor => {
        const kind = footerGuideKind(anchor);
        const route =
          kind === 'legal'
            ? market.legalRoute
            : (
                kind === 'rental'
                  ? market.touristRentalRoute
                  : null
              );

        if (!route) return;

        anchor.setAttribute(
          'href',
          '#/' + locale + '/' + route
        );
        anchor.setAttribute(
          'onclick',
          "navigate('" + route + "');return false;"
        );
        anchor.setAttribute(
          'data-market-guide-kind',
          kind
        );
        anchor.setAttribute(
          'data-market-guide-route',
          route
        );
        anchor.setAttribute(
          'data-market-guide-market',
          marketKey
        );
        patched += 1;
      });

    return patched > 0;
  }

  function onFooterGuideClick(event) {
    const target = event && event.target;
    if (!target || typeof target.closest !== 'function') {
      return;
    }

    const anchor = target.closest(GUIDE_SELECTOR);
    if (!anchor) return;

    const kind = footerGuideKind(anchor);
    if (!kind) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    navigateGuide(kind);
  }

  function patchFrenchContactCopy() {
    try {
      if (
        typeof I18N !== 'undefined' &&
        I18N.fr &&
        I18N.fr.property
      ) {
        I18N.fr.property.contactBtn =
          FRENCH_CONTACT_COPY;
      }
    } catch (_) {
      // Presentation hotfix must never break page routing.
    }
  }

  function syncFrenchPropertyCta() {
    patchFrenchContactCopy();

    const locale = localeFromRoute();
    if (locale !== 'fr') return;

    document
      .querySelectorAll(
        '#view-property .sidebar-card ' +
        'button.btn.btn-gold[onclick^="openModal("]'
      )
      .forEach(button => {
        button.textContent = FRENCH_CONTACT_COPY;
      });
  }

  function syncMarketContextFromRoute() {
    const marketKey = marketKeyFromRoute();
    if (marketKey) rememberMarket(marketKey);
  }

  function sync() {
    patchFrenchContactCopy();
    syncMarketContextFromRoute();
    syncFooterGuideTargets();
    syncFrenchPropertyCta();
  }

  document.addEventListener(
    'click',
    onFooterGuideClick,
    true
  );

  document.addEventListener(
    'DOMContentLoaded',
    function () {
      root.setTimeout(sync, 0);
    },
    { once: true }
  );

  root.addEventListener(
    'hashchange',
    function () {
      root.setTimeout(sync, 0);
    }
  );

  root.addEventListener(
    'pageshow',
    function () {
      root.setTimeout(sync, 0);
    }
  );

  sync();

  services.marketGuideFooterHotfix = Object.freeze({
    FRENCH_CONTACT_COPY,
    currentMarketKey,
    targetRoute,
    navigateGuide,
    syncFooterGuideTargets,
    syncFrenchPropertyCta
  });
})(typeof window !== 'undefined' ? window : this);
