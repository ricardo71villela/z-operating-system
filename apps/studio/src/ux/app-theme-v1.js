// ZSTUDIO_APP_THEME_RUNTIME_V1
// Product-shell theme only. This runtime never reads or mutates state.bg,
// CATEGORY_PALETTES, pal(), draw(), or any post-rendering authority.
(() => {
  'use strict';

  const STORAGE_KEY = 'zstudio-app-theme-v1';
  const THEMES = Object.freeze({ DARK: 'dark', LIGHT: 'light' });
  const COLORS = Object.freeze({ dark: '#0A0A0A', light: '#F4F3EF' });
  const STATUS_BAR = Object.freeze({ dark: 'black-translucent', light: 'default' });

  const LABELS = Object.freeze({
    en: { toLight: 'Switch to light app theme', toDark: 'Switch to dark app theme' },
    pt: { toLight: 'Mudar a aplicação para tema claro', toDark: 'Mudar a aplicação para tema escuro' },
    fr: { toLight: 'Passer l’application en thème clair', toDark: 'Passer l’application en thème sombre' },
    es: { toLight: 'Cambiar la aplicación al tema claro', toDark: 'Cambiar la aplicación al tema oscuro' },
    de: { toLight: 'App auf helles Design umstellen', toDark: 'App auf dunkles Design umstellen' },
    it: { toLight: 'Passa l’app al tema chiaro', toDark: 'Passa l’app al tema scuro' },
  });

  function normalize(value) {
    return value === THEMES.LIGHT ? THEMES.LIGHT : THEMES.DARK;
  }

  function readStoredTheme() {
    try { return normalize(localStorage.getItem(STORAGE_KEY)); }
    catch (_) { return THEMES.DARK; }
  }

  function writeStoredTheme(theme) {
    try { localStorage.setItem(STORAGE_KEY, theme); }
    catch (_) { /* Storage can be unavailable in hardened/private contexts. */ }
  }

  function currentLanguage() {
    const raw = String(document.documentElement.lang || 'en').toLowerCase();
    const base = raw.split('-')[0];
    return LABELS[base] ? base : 'en';
  }

  function ensureThemeColorMeta() {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    return meta;
  }

  function ensureStatusBarMeta() {
    let meta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'apple-mobile-web-app-status-bar-style';
      document.head.appendChild(meta);
    }
    return meta;
  }

  function syncChrome(theme) {
    ensureThemeColorMeta().setAttribute('content', COLORS[theme]);
    ensureStatusBarMeta().setAttribute('content', STATUS_BAR[theme]);
    document.documentElement.style.colorScheme = theme;
  }

  function syncButton(theme) {
    const button = document.getElementById('btnAppTheme');
    if (!button) return;
    const target = theme === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
    const lang = currentLanguage();
    const label = target === THEMES.LIGHT ? LABELS[lang].toLight : LABELS[lang].toDark;
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.setAttribute('aria-pressed', theme === THEMES.LIGHT ? 'true' : 'false');
    button.dataset.theme = theme;
    const icon = button.querySelector('.zs-theme-icon');
    if (icon) icon.textContent = theme === THEMES.DARK ? '☀' : '☾';
  }

  function apply(theme, options = {}) {
    const normalized = normalize(theme);
    const previous = normalize(document.documentElement.getAttribute('data-zstudio-app-theme'));
    document.documentElement.setAttribute('data-zstudio-app-theme', normalized);
    syncChrome(normalized);
    if (options.persist !== false) writeStoredTheme(normalized);
    syncButton(normalized);

    if (previous !== normalized || options.forceEvent) {
      window.dispatchEvent(new CustomEvent('zstudio:app-theme-change', {
        detail: Object.freeze({ theme: normalized, previous })
      }));
    }
    return normalized;
  }

  function toggle() {
    const current = normalize(document.documentElement.getAttribute('data-zstudio-app-theme'));
    return apply(current === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK);
  }

  function mountToggle() {
    const host = document.querySelector('.header-actions');
    if (!host) return false;
    let button = document.getElementById('btnAppTheme');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.id = 'btnAppTheme';
      button.className = 'zs-app-theme-toggle';
      button.dataset.productShellControl = 'app-theme';
      button.innerHTML = '<span class="zs-theme-icon" aria-hidden="true"></span>';
      button.addEventListener('click', toggle);

      const langControl = host.querySelector('.lang-switch, .lang-select, #langSwitch');
      if (langControl) host.insertBefore(button, langControl);
      else host.appendChild(button);
    }
    syncButton(normalize(document.documentElement.getAttribute('data-zstudio-app-theme')));
    return true;
  }

  function boot() {
    const stored = readStoredTheme();
    apply(stored, { persist: false });
    mountToggle();

    const langControl = document.getElementById('langSwitch');
    if (langControl && langControl.dataset.appThemeObserved !== 'true') {
      langControl.dataset.appThemeObserved = 'true';
      langControl.addEventListener('change', () => syncButton(normalize(document.documentElement.getAttribute('data-zstudio-app-theme'))));
    }

    const languageObserver = new MutationObserver(() => {
      syncButton(normalize(document.documentElement.getAttribute('data-zstudio-app-theme')));
    });
    languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }

  window.ZStudioAppTheme = Object.freeze({
    storageKey: STORAGE_KEY,
    get: () => normalize(document.documentElement.getAttribute('data-zstudio-app-theme')),
    set: theme => apply(theme),
    toggle,
    mount: mountToggle,
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
