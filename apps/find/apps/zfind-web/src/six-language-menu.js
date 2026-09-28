/* Z FIND — language menu activation. Body markup stays progressive-enhancement safe; the production build enables the translated locales before app initialization.
   Launch scope: only the launch locales (fr, en) are shown; the other translated locales stay in the source, hidden. */
(function () {
  'use strict';
  const translated = ['fr', 'en', 'pt', 'es', 'de', 'it'];
  const launchScope = window.ZFindServices && window.ZFindServices.launchScope;
  const panel = document.querySelector('#language-menu .lang-menu-panel');
  if (!panel) throw new Error('Z Find language menu missing.');

  for (const locale of translated) {
    const button = panel.querySelector(`button[data-lang="${locale}"]`);
    // Launch builds leave non-launch locales out of the published HTML.
    if (!button && launchScope && !launchScope.isLaunchLocale(locale)) continue;
    if (!button) throw new Error(`Z Find language menu missing ${locale}.`);
    button.disabled = false;
    button.removeAttribute('disabled');
    const planned = button.querySelector('[data-i18n="language.planned"]');
    if (planned) planned.remove();
  }

  if (launchScope) launchScope.applyToDocument(panel);
})();
