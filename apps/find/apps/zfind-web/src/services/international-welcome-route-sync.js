/* ============================================================
   Z FIND — INTERNATIONAL WELCOME ROUTE LOCALE SYNC
   ============================================================
   The welcome module is loaded before the legacy hash router has
   necessarily settled its initial route. This adapter aligns the
   welcome locale with the canonical locale in the current URL once
   routing has settled, while preserving an explicit language choice
   made by the visitor afterwards.
   ============================================================ */

(function (root) {
  'use strict';

  if (!root || !root.document) return;

  const services = root.ZFindServices || {};
  const publicLocales = services.publicLocales;
  const welcome = services.internationalWelcome;

  if (!publicLocales || !welcome) {
    throw new Error(
      'Z Find welcome route sync requires public-locales and international-welcome.'
    );
  }

  const document = root.document;
  let visitorSelectedLocale = false;

  function routeLocale() {
    const pathname = String(root.location && root.location.pathname || '');
    const pathSegment = pathname.split('/').filter(Boolean)[0] || '';
    const pathLocale = publicLocales.normalizePublicLocale(pathSegment);
    if (pathLocale) return pathLocale;

    const hash = String(root.location && root.location.hash || '')
      .replace(/^#\/?/, '');
    const hashSegment = hash.split('/').filter(Boolean)[0] || '';
    return publicLocales.normalizePublicLocale(hashSegment);
  }

  function syncFromRoute() {
    if (visitorSelectedLocale) return;

    const locale = routeLocale();
    if (!locale) return;

    welcome.selectLocale(locale);
  }

  document.addEventListener('click', function (event) {
    const target = event.target && event.target.closest
      ? event.target.closest('[data-welcome-locale]')
      : null;

    if (target) visitorSelectedLocale = true;
  }, true);

  document.addEventListener('DOMContentLoaded', function () {
    root.setTimeout(syncFromRoute, 0);
  });

  root.addEventListener('hashchange', function () {
    root.setTimeout(syncFromRoute, 0);
  });

  services.internationalWelcomeRouteSync = Object.freeze({
    routeLocale,
    syncFromRoute
  });
})(typeof window !== 'undefined' ? window : this);
