/* ============================================================
   Z FIND — INTERNATIONAL WELCOME MARKET PICKER
   ============================================================
   Restores the Phase-4 welcome contract as an additive layer:
   - market/country choice is visual and uses the canonical market registry
   - language choice is independent from market choice
   - all six public locales are available for the welcome -> market route
   - the existing hero <select> remains the native accessible fallback
   - internal market entry stays inside the SPA; clean public market routes
     remain SEO/discovery authorities and are never an intermediate UX hop.
   ============================================================ */

(function (root) {
  'use strict';

  if (!root || !root.document) return;

  const services = root.ZFindServices || {};
  const publicLocales = services.publicLocales;
  const marketRegistry = services.marketRegistry;

  if (!publicLocales || !marketRegistry) {
    throw new Error(
      'Z Find international welcome requires public-locales and market-registry.'
    );
  }

  const document = root.document;
  const STORAGE_KEY = 'zfind_welcome_locale';

  const LOCALE_LABELS = Object.freeze({
    fr: 'Français',
    en: 'English',
    pt: 'Português',
    es: 'Español',
    de: 'Deutsch',
    it: 'Italiano'
  });

  const COPY = Object.freeze({
    fr: Object.freeze({
      eyebrow: 'Bienvenue sur Z Find',
      title: 'Choisissez votre langue et votre marché',
      lead: 'Sélectionnez la langue de consultation puis le pays ou marché immobilier dans lequel vous souhaitez entrer.',
      language: 'Langue',
      market: 'Pays ou marché',
      chooseMarket: 'Choisissez un pays ou marché',
      enter: label => `Entrer sur le marché — ${label}`,
      mapAlt: label => `Carte de ${label}`
    }),
    en: Object.freeze({
      eyebrow: 'Welcome to Z Find',
      title: 'Choose your language and market',
      lead: 'Select the language you want to use, then choose the country or real-estate market you want to enter.',
      language: 'Language',
      market: 'Country or market',
      chooseMarket: 'Choose a country or market',
      enter: label => `Enter market — ${label}`,
      mapAlt: label => `Map of ${label}`
    }),
    pt: Object.freeze({
      eyebrow: 'Bem-vindo ao Z Find',
      title: 'Escolha o idioma e o mercado',
      lead: 'Selecione o idioma de consulta e depois o país ou mercado imobiliário onde pretende entrar.',
      language: 'Idioma',
      market: 'País ou mercado',
      chooseMarket: 'Escolha um país ou mercado',
      enter: label => `Entrar no mercado — ${label}`,
      mapAlt: label => `Mapa de ${label}`
    }),
    es: Object.freeze({
      eyebrow: 'Bienvenido a Z Find',
      title: 'Elige tu idioma y mercado',
      lead: 'Selecciona el idioma de consulta y después el país o mercado inmobiliario en el que deseas entrar.',
      language: 'Idioma',
      market: 'País o mercado',
      chooseMarket: 'Elige un país o mercado',
      enter: label => `Entrar en el mercado — ${label}`,
      mapAlt: label => `Mapa de ${label}`
    }),
    de: Object.freeze({
      eyebrow: 'Willkommen bei Z Find',
      title: 'Wählen Sie Sprache und Markt',
      lead: 'Wählen Sie zuerst die Sprache und danach das Land oder den Immobilienmarkt, den Sie öffnen möchten.',
      language: 'Sprache',
      market: 'Land oder Markt',
      chooseMarket: 'Land oder Markt wählen',
      enter: label => `Markt öffnen — ${label}`,
      mapAlt: label => `Karte von ${label}`
    }),
    it: Object.freeze({
      eyebrow: 'Benvenuto su Z Find',
      title: 'Scegli la lingua e il mercato',
      lead: 'Seleziona la lingua di consultazione e poi il Paese o mercato immobiliare in cui desideri entrare.',
      language: 'Lingua',
      market: 'Paese o mercato',
      chooseMarket: 'Scegli un Paese o mercato',
      enter: label => `Entra nel mercato — ${label}`,
      mapAlt: label => `Mappa di ${label}`
    })
  });

  let selectedLocale = resolveInitialLocale();

  function safeStorageGet(key) {
    try {
      return root.localStorage ? root.localStorage.getItem(key) : null;
    } catch (_) {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      if (root.localStorage) root.localStorage.setItem(key, value);
    } catch (_) {
      // Storage can be unavailable in privacy-restricted contexts.
    }
  }

  function localeFromLocation() {
    const pathname = String(root.location && root.location.pathname || '');
    const pathLocale = publicLocales.normalizePublicLocale(
      pathname.split('/').filter(Boolean)[0] || ''
    );
    if (pathLocale) return pathLocale;

    const hash = String(root.location && root.location.hash || '')
      .replace(/^#\/?/, '');
    const hashLocale = publicLocales.normalizePublicLocale(
      hash.split('/').filter(Boolean)[0] || ''
    );
    return hashLocale;
  }

  function resolveInitialLocale() {
    return (
      localeFromLocation() ||
      publicLocales.normalizePublicLocale(safeStorageGet(STORAGE_KEY)) ||
      publicLocales.DEFAULT_PUBLIC_LOCALE
    );
  }

  function copy() {
    return COPY[selectedLocale] || COPY.fr;
  }

  function selectLocale(localeValue) {
    const locale = publicLocales.normalizePublicLocale(localeValue);
    if (!locale || !publicLocales.PUBLIC_LOCALES.includes(locale)) return;

    selectedLocale = locale;
    safeStorageSet(STORAGE_KEY, locale);
    render();
  }

  function enterMarket(marketKey) {
    if (!marketRegistry.getMarket(marketKey) || !root.location) return;
    safeStorageSet(STORAGE_KEY, selectedLocale);

    // Internal navigation must stay inside the interactive SPA. Clean public
    // market paths remain indexable SEO entry points, never an intermediate
    // page between the Z Find shell and the selected market.
    const targetHash = `/${selectedLocale}/market/${marketKey}`;
    root.location.hash = targetHash;
  }

  function ensureStyles() {
    if (document.getElementById('zfind-international-welcome-styles')) return;

    const style = document.createElement('style');
    style.id = 'zfind-international-welcome-styles';
    style.textContent = `
      .market-explorer .zfind-international-welcome {
        flex:1 0 100%;
        width:100%;
        margin:0 0 18px;
        padding:22px;
        border:1px solid rgba(183,147,74,.26);
        border-radius:18px;
        background:
          linear-gradient(135deg,rgba(255,255,255,.98),rgba(249,247,241,.94));
        box-shadow:0 18px 48px rgba(24,28,34,.08);
      }
      .zfind-international-welcome-head {
        display:grid;
        grid-template-columns:minmax(0,1fr) auto;
        gap:22px;
        align-items:end;
        margin-bottom:18px;
      }
      .zfind-international-welcome-eyebrow {
        display:block;
        margin-bottom:5px;
        color:var(--gold,#a98745);
        font-size:.72rem;
        font-weight:750;
        letter-spacing:.12em;
        text-transform:uppercase;
      }
      .zfind-international-welcome-title {
        margin:0;
        font-size:clamp(1.15rem,2.4vw,1.65rem);
        line-height:1.12;
      }
      .zfind-international-welcome-lead {
        max-width:760px;
        margin:8px 0 0;
        color:var(--gray-500,#667085);
        font-size:.88rem;
        line-height:1.55;
      }
      .zfind-welcome-language-label,
      .zfind-welcome-market-label {
        display:block;
        margin-bottom:7px;
        color:var(--gray-500,#667085);
        font-size:.7rem;
        font-weight:700;
        letter-spacing:.08em;
        text-transform:uppercase;
      }
      .zfind-welcome-languages {
        display:flex;
        flex-wrap:wrap;
        justify-content:flex-end;
        gap:6px;
        max-width:350px;
      }
      .zfind-welcome-language {
        appearance:none;
        border:1px solid var(--gray-200,#e5e7eb);
        border-radius:999px;
        background:#fff;
        color:var(--gray-700,#344054);
        cursor:pointer;
        padding:7px 10px;
        font:inherit;
        font-size:.75rem;
        line-height:1;
      }
      .zfind-welcome-language:hover,
      .zfind-welcome-language:focus-visible {
        border-color:var(--gold,#a98745);
        outline:none;
      }
      .zfind-welcome-language[aria-pressed="true"] {
        border-color:var(--gold,#a98745);
        background:var(--gold,#a98745);
        color:#fff;
      }
      .zfind-welcome-market-label {
        margin:0 0 10px;
      }
      .zfind-welcome-market-grid {
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(132px,1fr));
        gap:10px;
        max-height:390px;
        overflow:auto;
        padding:2px 4px 4px 2px;
        scrollbar-width:thin;
      }
      .zfind-welcome-market {
        appearance:none;
        min-width:0;
        border:1px solid var(--gray-200,#e5e7eb);
        border-radius:14px;
        background:#fff;
        cursor:pointer;
        padding:10px;
        text-align:left;
        transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease;
      }
      .zfind-welcome-market:hover,
      .zfind-welcome-market:focus-visible {
        transform:translateY(-2px);
        border-color:rgba(183,147,74,.7);
        box-shadow:0 10px 24px rgba(24,28,34,.09);
        outline:none;
      }
      .zfind-welcome-market img {
        display:block;
        width:100%;
        height:76px;
        margin:0 auto 8px;
        object-fit:contain;
      }
      .zfind-welcome-market-name {
        display:block;
        overflow:hidden;
        color:var(--gray-900,#101828);
        font-size:.78rem;
        font-weight:700;
        text-overflow:ellipsis;
        white-space:nowrap;
      }
      .zfind-welcome-market-code {
        display:block;
        margin-top:2px;
        color:var(--gray-400,#98a2b3);
        font-size:.64rem;
        font-weight:650;
        letter-spacing:.06em;
      }
      @media (max-width:760px) {
        .market-explorer .zfind-international-welcome {
          padding:17px;
          border-radius:14px;
        }
        .zfind-international-welcome-head {
          grid-template-columns:1fr;
          gap:15px;
          align-items:start;
        }
        .zfind-welcome-languages {
          justify-content:flex-start;
          max-width:none;
        }
        .zfind-welcome-market-grid {
          grid-template-columns:repeat(2,minmax(0,1fr));
          max-height:430px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function languageControls() {
    const wrapper = document.createElement('div');
    const label = document.createElement('span');

    label.className = 'zfind-welcome-language-label';
    label.textContent = copy().language;
    wrapper.appendChild(label);

    const row = document.createElement('div');
    row.className = 'zfind-welcome-languages';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', copy().language);

    for (const locale of publicLocales.PUBLIC_LOCALES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'zfind-welcome-language';
      button.dataset.welcomeLocale = locale;
      button.setAttribute(
        'aria-pressed',
        locale === selectedLocale ? 'true' : 'false'
      );
      button.textContent = LOCALE_LABELS[locale] || locale.toUpperCase();
      button.addEventListener('click', function () {
        selectLocale(locale);
      });
      row.appendChild(button);
    }

    wrapper.appendChild(row);
    return wrapper;
  }

  function marketCard(market) {
    const label = marketRegistry.marketLabel(
      market.key,
      selectedLocale
    );

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'zfind-welcome-market';
    button.dataset.welcomeMarket = market.key;
    button.setAttribute('aria-label', copy().enter(label));

    const image = document.createElement('img');
    image.src = market.mapAsset;
    image.alt = copy().mapAlt(label);
    image.loading = 'lazy';
    image.decoding = 'async';

    const name = document.createElement('span');
    name.className = 'zfind-welcome-market-name';
    name.textContent = label;

    const code = document.createElement('span');
    code.className = 'zfind-welcome-market-code';
    code.textContent = market.key;

    button.appendChild(image);
    button.appendChild(name);
    button.appendChild(code);
    button.addEventListener('click', function () {
      enterMarket(market.key);
    });

    return button;
  }

  function rebindNativeFallback(select) {
    if (!select) return;

    // Remove the Phase-3 inline navigation so this native control follows the
    // six-locale welcome choice just like the visual map cards.
    select.removeAttribute('onchange');

    if (select.dataset.welcomeBound !== '1') {
      select.addEventListener('change', function () {
        if (!select.value) return;
        enterMarket(select.value);
      });
      select.dataset.welcomeBound = '1';
    }

    const firstOption = select.querySelector('option[value=""]');
    if (firstOption) firstOption.textContent = copy().chooseMarket;

    for (const option of select.querySelectorAll('option[value]:not([value=""])')) {
      const market = marketRegistry.getMarket(option.value);
      if (!market) continue;
      option.textContent = marketRegistry.marketLabel(
        market.key,
        selectedLocale
      );
    }

    select.setAttribute('aria-label', copy().chooseMarket);
  }

  function render() {
    const host = document.querySelector('#view-home .market-explorer');
    if (!host) return;

    ensureStyles();

    const previous = host.querySelector('.zfind-international-welcome');
    if (previous) previous.remove();

    const panel = document.createElement('section');
    panel.className = 'zfind-international-welcome';
    panel.setAttribute('aria-labelledby', 'zfind-welcome-title');

    const head = document.createElement('div');
    head.className = 'zfind-international-welcome-head';

    const intro = document.createElement('div');

    const eyebrow = document.createElement('span');
    eyebrow.className = 'zfind-international-welcome-eyebrow';
    eyebrow.textContent = copy().eyebrow;

    const title = document.createElement('h2');
    title.className = 'zfind-international-welcome-title';
    title.id = 'zfind-welcome-title';
    title.textContent = copy().title;

    const lead = document.createElement('p');
    lead.className = 'zfind-international-welcome-lead';
    lead.textContent = copy().lead;

    intro.appendChild(eyebrow);
    intro.appendChild(title);
    intro.appendChild(lead);
    head.appendChild(intro);
    head.appendChild(languageControls());

    const marketLabel = document.createElement('span');
    marketLabel.className = 'zfind-welcome-market-label';
    marketLabel.textContent = copy().market;

    const grid = document.createElement('div');
    grid.className = 'zfind-welcome-market-grid';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', copy().market);

    for (const market of marketRegistry.listMarkets()) {
      grid.appendChild(marketCard(market));
    }

    panel.appendChild(head);
    panel.appendChild(marketLabel);
    panel.appendChild(grid);

    const copyBlock = host.querySelector('.market-explorer-copy');
    if (copyBlock && copyBlock.nextSibling) {
      host.insertBefore(panel, copyBlock.nextSibling);
    } else {
      host.insertBefore(panel, host.firstChild);
    }

    rebindNativeFallback(host.querySelector('#hero-market'));
  }

  document.addEventListener('DOMContentLoaded', render);

  root.addEventListener('hashchange', function () {
    // The interactive shell can return to Home without a page reload.
    root.setTimeout(render, 0);
  });

  services.internationalWelcome = Object.freeze({
    locales: publicLocales.PUBLIC_LOCALES,
    selectLocale,
    enterMarket,
    render
  });
})(typeof window !== 'undefined' ? window : this);
