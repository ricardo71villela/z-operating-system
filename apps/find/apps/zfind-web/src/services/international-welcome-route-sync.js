/* ============================================================
   Z FIND — INTERNATIONAL WELCOME ROUTE LOCALE SYNC
   ============================================================
   The welcome module is loaded before the legacy hash router has
   necessarily settled its initial route. This adapter aligns the
   welcome locale with the canonical locale in the current URL once
   routing has settled, while preserving an explicit language choice
   made by the visitor afterwards.

   The visual welcome is an explicit-action surface:
   - passive initial load must not leave it open;
   - passive hash navigation must not reopen it;
   - the existing Home market CTA remains the explicit open authority;
   - the native market selects remain available independently.
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

  function closePassiveWelcome() {
    const panel = document.querySelector(
      '#view-home .market-explorer .zfind-international-welcome'
    );

    if (panel) panel.remove();
  }

  function bindExplicitOpenControls() {
    const cta = document.getElementById('home-status-market-cta');
    if (!cta || cta.dataset.welcomeOpenBound === '1') return;

    cta.addEventListener('click', welcome.render);
    cta.dataset.welcomeOpenBound = '1';
  }

  function settlePassiveRoute() {
    // international-welcome.js may render while its own passive route
    // listeners settle. Route locale synchronization is allowed, but the
    // visual panel must finish closed unless the visitor explicitly opens it.
    syncFromRoute();
    closePassiveWelcome();
    bindExplicitOpenControls();
  }

  document.addEventListener('click', function (event) {
    const target = event.target && event.target.closest
      ? event.target.closest('[data-welcome-locale]')
      : null;

    if (target) visitorSelectedLocale = true;
  }, true);

  document.addEventListener('DOMContentLoaded', function () {
    root.setTimeout(settlePassiveRoute, 0);
  });

  root.addEventListener('hashchange', function () {
    root.setTimeout(settlePassiveRoute, 0);
  });

  services.internationalWelcomeRouteSync = Object.freeze({
    routeLocale,
    syncFromRoute,
    closePassiveWelcome,
    bindExplicitOpenControls,
    settlePassiveRoute
  });
})(typeof window !== 'undefined' ? window : this);
