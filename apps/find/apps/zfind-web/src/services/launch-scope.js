/* ============================================================
   Z FIND — PUBLIC LAUNCH SCOPE

   Single switch for what the public site exposes at launch:
     markets : France, Belgique, Luxembourg
     locales : fr, en

   Everything else (other markets, legal guides, locales) stays in the
   source and keeps its tests; it is only hidden from the public
   surface. To reactivate a market or a locale, add it here — no other
   file needs to change.

   Build-time: scripts/build.js uses this module to leave hidden
   jurisdictions out of the published HTML (set ZFIND_LAUNCH_SCOPE=all
   to build the complete historical surface, e.g. for browser tests).
   Runtime: app code asks this module which markets/locales are public.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.launchScope = factory(root.ZFIND_LAUNCH_SCOPE_MODE);
  }
})(typeof window !== 'undefined' ? window : this, function (mode) {
  'use strict';

  // 'all' (browser-test builds only) exposes the complete historical surface.
  const ALL = mode === 'all';

  const LAUNCH_MARKET_KEYS = Object.freeze(['FR', 'BE', 'LU']);
  const LAUNCH_LOCALES = Object.freeze(['fr', 'en']);
  const DEFAULT_MARKET_KEY = 'FR';
  const DEFAULT_LEGAL_ROUTE = 'legal-fr';

  function isLaunchMarketKey(key) {
    return typeof key === 'string' && (ALL || LAUNCH_MARKET_KEYS.includes(key));
  }

  function isLaunchLocale(locale) {
    return typeof locale === 'string' && (ALL || LAUNCH_LOCALES.includes(locale));
  }

  function filterMarkets(markets) {
    return (markets || []).filter(market => market && isLaunchMarketKey(market.key));
  }

  /* Legal/tourist routes that stay public: the guides of launch markets. */
  function publicGuideRoutes(markets) {
    const routes = new Set();
    filterMarkets(markets).forEach(market => {
      if (market.legalRoute) routes.add(market.legalRoute);
      if (market.touristRentalRoute) routes.add(market.touristRentalRoute);
    });
    return routes;
  }

  /* Runtime: hide language choices that are not part of the launch. */
  function applyToDocument(doc) {
    if (!doc || typeof doc.querySelectorAll !== 'function') return 0;
    let hidden = 0;
    doc.querySelectorAll('[data-lang]').forEach(el => {
      const locale = el.getAttribute('data-lang');
      if (!locale || isLaunchLocale(locale)) return;
      if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'OPTION') {
        el.hidden = true;
        el.setAttribute('aria-hidden', 'true');
        el.style.display = 'none';
        if ('disabled' in el) el.disabled = true;
        hidden += 1;
      }
    });
    return hidden;
  }

  return Object.freeze({
    MODE: ALL ? 'all' : 'launch',
    LAUNCH_MARKET_KEYS,
    LAUNCH_LOCALES,
    DEFAULT_MARKET_KEY,
    DEFAULT_LEGAL_ROUTE,
    isLaunchMarketKey,
    isLaunchLocale,
    filterMarkets,
    publicGuideRoutes,
    applyToDocument
  });
});
