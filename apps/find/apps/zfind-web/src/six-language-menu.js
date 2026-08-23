/* Z FIND — six-language menu activation. Body markup stays progressive-enhancement safe; the production build enables all translated locales before app initialization. */
(function () {
  'use strict';
  const translated = ['fr', 'en', 'pt', 'es', 'de', 'it'];
  const panel = document.querySelector('#language-menu .lang-menu-panel');
  if (!panel) throw new Error('Z Find language menu missing.');

  for (const locale of translated) {
    const button = panel.querySelector(`button[data-lang="${locale}"]`);
    if (!button) throw new Error(`Z Find language menu missing ${locale}.`);
    button.disabled = false;
    button.removeAttribute('disabled');
    const planned = button.querySelector('[data-i18n="language.planned"]');
    if (planned) planned.remove();
  }
})();
