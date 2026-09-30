/* ============================================================
   Z FIND — APP (router, i18n binding, render)
   ============================================================ */

const PUBLIC_LOCALE_CONFIG =
  (
    typeof ZFindServices !== 'undefined' &&
    ZFindServices.publicLocales
  )
    ? ZFindServices.publicLocales
    : {
        DEFAULT_PUBLIC_LOCALE: 'fr',
        LEGACY_TRANSLATED_LOCALES: ['fr','en','pt']
      };

const SUPPORTED_LANGS =
  PUBLIC_LOCALE_CONFIG.LEGACY_TRANSLATED_LOCALES.slice();

const DEFAULT_LANG =
  PUBLIC_LOCALE_CONFIG.DEFAULT_PUBLIC_LOCALE;

const state = { lang:DEFAULT_LANG, view:'home', id:null, query:{} };

// COUNTRY MARKET A1 — product-market authority is now independent
// from legal-guide routing. Stable market keys drive one reusable Market
// renderer; Legal/Tourist Rental remain secondary routes in the registry.
const MARKET_REGISTRY_SERVICE =
  window.ZFindServices && window.ZFindServices.marketRegistry;

if (!MARKET_REGISTRY_SERVICE) {
  throw new Error('Z Find market registry unavailable.');
}

// LAUNCH SCOPE — only France, Belgique and Luxembourg (fr/en) are public.
// Other markets stay in the registry but are not listed nor rendered.
const LAUNCH_SCOPE_SERVICE =
  window.ZFindServices && window.ZFindServices.launchScope;

if (!LAUNCH_SCOPE_SERVICE) {
  throw new Error('Z Find launch scope unavailable.');
}

function publicMarkets() {
  return LAUNCH_SCOPE_SERVICE.filterMarkets(
    MARKET_REGISTRY_SERVICE.listMarkets()
  );
}

function getPublicMarket(marketKey) {
  const market = MARKET_REGISTRY_SERVICE.getMarket(marketKey);
  return market && LAUNCH_SCOPE_SERVICE.isLaunchMarketKey(market.key)
    ? market
    : null;
}

const MARKET_GUIDES_PENDING = Object.freeze({
  fr: 'Le guide juridique de ce marché est en préparation.',
  en: 'The legal guide for this market is in preparation.',
  pt: 'O guia jurídico deste mercado está em preparação.',
  es: 'La guía jurídica de este mercado está en preparación.',
  de: 'Der Rechtsleitfaden für diesen Markt ist in Vorbereitung.',
  it: 'La guida giuridica di questo mercato è in preparazione.'
});

function marketGuideButtonsHTML(market, copy) {
  const buttons = [];
  if (market.legalRoute) {
    buttons.push(`
              <button
                class="btn btn-outline"
                type="button"
                onclick="navigate('${market.legalRoute}')"
              >${copy.legalLabel}</button>`);
  }
  if (market.touristRentalRoute) {
    buttons.push(`
              <button
                class="btn btn-outline"
                type="button"
                onclick="navigate('${market.touristRentalRoute}')"
              >${copy.rentalLabel}</button>`);
  }
  if (!buttons.length) {
    return `<p class="market-guides-pending">${MARKET_GUIDES_PENDING[state.lang] || MARKET_GUIDES_PENDING.en}</p>`;
  }
  return buttons.join('');
}

const FEATURED_MARKET_SERVICE =
  window.ZFindServices && window.ZFindServices.marketFeatured;

if (!FEATURED_MARKET_SERVICE) {
  throw new Error('Z Find market Featured service unavailable.');
}

const MARKET_SEARCH_SCOPE_SERVICE =
  window.ZFindServices && window.ZFindServices.marketSearchScope;

if (!MARKET_SEARCH_SCOPE_SERVICE) {
  throw new Error('Z Find Market Search scope service unavailable.');
}

const SEARCH_PAGINATION_SERVICE =
  window.ZFindServices &&
  window.ZFindServices.searchPagination;

if (!SEARCH_PAGINATION_SERVICE) {
  throw new Error(
    'Z Find Search pagination service unavailable.'
  );
}

const searchResultsCache = {
  key: null,
  result: null
};

function clearSearchResultsCache() {
  searchResultsCache.key = null;
  searchResultsCache.result = null;
}

function searchResultsCacheKey(
  lang,
  q,
  transactionType,
  rentalPeriod
) {
  return JSON.stringify([
    lang || '',
    q && q.market || '',
    q && q.q || '',
    q && q.subtype || '',
    transactionType || '',
    rentalPeriod || '',
    q && q.budget || ''
  ].concat(ADVANCED_SEARCH_KEYS.map(key => (q && q[key]) || '')));
}

function clearSearchPagination() {
  const root =
    document.getElementById(
      'search-results-pagination'
    );

  if (!root) return;

  root.innerHTML = '';
  root.style.display = 'none';
  root.dataset.paginationState = 'hidden';
  root.removeAttribute('data-pagination-page');
  root.removeAttribute('data-pagination-page-count');
  root.removeAttribute('data-pagination-total-count');
}

function goToSearchPage(targetPage) {
  const page =
    SEARCH_PAGINATION_SERVICE.parsePage(
      targetPage
    );

  const next =
    Object.assign(
      {},
      state.query || {}
    );

  if (page <= 1) {
    delete next.page;
  } else {
    next.page = String(page);
  }

  navigate(
    'search',
    null,
    next
  );
}

function normalizeSearchPageQuery(
  pagination,
  query
) {
  const raw =
    query && query.page
      ? String(query.page)
      : '';

  const canonical =
    pagination.page > 1
      ? String(pagination.page)
      : '';

  if (raw === canonical) {
    return false;
  }

  const next =
    Object.assign(
      {},
      query || {}
    );

  if (canonical) {
    next.page = canonical;
  } else {
    delete next.page;
  }

  navigate(
    'search',
    null,
    next
  );

  return true;
}

function searchPaginationHTML(pagination) {
  const copy =
    SEARCH_PAGINATION_SERVICE.presentation(
      state.lang,
      {
        page: pagination.page,
        pageCount: pagination.pageCount
      }
    );

  const previousDisabled =
    pagination.page <= 1;

  const nextDisabled =
    pagination.page >= pagination.pageCount;

  return `
    <button
      id="search-pagination-previous"
      class="search-pagination-button"
      type="button"
      ${previousDisabled ? 'disabled' : ''}
      aria-disabled="${previousDisabled ? 'true' : 'false'}"
      onclick="goToSearchPage(${pagination.page - 1})"
    >${copy.previous}</button>
    <span
      class="search-pagination-label"
      aria-live="polite"
    >${copy.page}</span>
    <button
      id="search-pagination-next"
      class="search-pagination-button"
      type="button"
      ${nextDisabled ? 'disabled' : ''}
      aria-disabled="${nextDisabled ? 'true' : 'false'}"
      onclick="goToSearchPage(${pagination.page + 1})"
    >${copy.next}</button>
  `;
}

function renderSearchPagination(pagination) {
  clearSearchPagination();

  if (
    !pagination ||
    pagination.pageCount <= 1 ||
    pagination.totalCount <= 0
  ) {
    return;
  }

  const root =
    document.getElementById(
      'search-results-pagination'
    );

  if (!root) return;

  root.dataset.paginationState = 'ready';
  root.dataset.paginationPage =
    String(pagination.page);
  root.dataset.paginationPageCount =
    String(pagination.pageCount);
  root.dataset.paginationTotalCount =
    String(pagination.totalCount);

  root.innerHTML =
    searchPaginationHTML(pagination);

  root.style.display = '';
}

function marketSortLocale(lang) {
  return PUBLIC_LOCALE_CONFIG.formattingLocaleFor(lang);
}

function syncMarketSelects() {
  const currentKey =
    state.view === 'market' && getPublicMarket(state.id)
      ? state.id
      : '';

  document
    .querySelectorAll('[data-market-select]')
    .forEach(select => {
      select.replaceChildren();

      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = t(state.lang, 'market.choose');
      select.appendChild(placeholder);

      publicMarkets()
        .map(market => ({
          market,
          label: MARKET_REGISTRY_SERVICE.marketLabel(
            market.key,
            state.lang
          )
        }))
        .sort((a, b) => a.label.localeCompare(
          b.label,
          marketSortLocale(state.lang),
          { sensitivity:'base' }
        ))
        .forEach(({ market, label }) => {
          const option = document.createElement('option');
          option.value = market.key;
          option.textContent = label;
          select.appendChild(option);
        });

      select.value = currentKey;
      select.setAttribute(
        'aria-label',
        t(state.lang, 'market.aria')
      );
    });
}

function navigateMarket(marketKey) {
  if (!marketKey) return;
  if (!getPublicMarket(marketKey)) return;

  // Entering a market intentionally starts a market context from zero;
  // arbitrary query state from the prior page must not leak across markets.
  navigate('market', marketKey, {});
}

function focusMarketExplorer() {
  const explorer = document.getElementById('market-explorer');
  const select = document.getElementById('hero-market');

  if (explorer) {
    explorer.scrollIntoView({
      behavior:'smooth',
      block:'center'
    });
  }

  if (select) {
    setTimeout(() => select.focus(), 250);
  }
}

let currentListingIdForEnquiry = null;
let currentUnitContext = null;

/* ---------------- Router ----------------
   Hash shape: #/{lang}/{view}/{id}?{queryString}
   The query string carries search state (q, category, subtype, transactionType, rentalPeriod, budget,
   unit) so it survives back/forward navigation and language switching.
   Note: in-page wayfinding (land quick-nav chips) never touches the
   hash — it uses scrollIntoView — because the router treats the whole
   hash as route state and a bare fragment would be misparsed as a
   route segment. */
function parseHash() {
  const full = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = full.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  let lang = parts[0];
  if (!SUPPORTED_LANGS.includes(lang) || !LAUNCH_SCOPE_SERVICE.isLaunchLocale(lang)) {
    // Launch scope: only fr/en are public. A hidden locale in the URL
    // (/pt/, /es/, /de/, /it/) is replaced by the stored or default locale.
    const hiddenLocale = SUPPORTED_LANGS.includes(lang);
    const storedLang =
      localStorage.getItem('zfind_lang');

    lang =
      SUPPORTED_LANGS.includes(storedLang) && LAUNCH_SCOPE_SERVICE.isLaunchLocale(storedLang)
        ? storedLang
        : DEFAULT_LANG;
    const rest = hiddenLocale ? parts.slice(1) : parts;
    location.hash = '/' + lang + (rest.length ? '/'+rest.join('/') : '/home') + (queryPart ? '?'+queryPart : '');
    return; // hashchange will re-fire parseHash
  }
  const view = parts[1] || 'home';
  const id = parts[2] || null;
  const query = {};
  if (queryPart) { new URLSearchParams(queryPart).forEach((v,k) => { query[k] = v; }); }

  if (
    state.view === 'search' &&
    view !== 'search'
  ) {
    clearSearchResultsCache();
  }

  state.lang = lang; state.view = view; state.id = id; state.query = query;
  localStorage.setItem('zfind_lang', lang);
  render();
}

function buildQueryString(query) {
  const usp = new URLSearchParams();
  Object.keys(query || {}).forEach(k => { if (query[k]) usp.set(k, query[k]); });
  const s = usp.toString();
  return s ? '?' + s : '';
}

function navigate(view, id, query) {
  const q = query !== undefined ? query : (view === state.view ? state.query : {});
  location.hash = '/' + state.lang + '/' + view + (id ? '/' + id : '') + buildQueryString(q);
}

/* ---------------- Phase C: Search -> detail return context ---------------- */
const SEARCH_RETURN_QUERY_KEYS = Object.freeze([
  'market',
  'q',
  'subtype',
  'transactionType',
  'rentalPeriod',
  'budget',
  'page',
  // Advanced search (2026-09-30)
  'commune',
  'priceMin',
  'priceMax',
  'areaMin',
  'rooms',
  'beds',
  'dpe',
  'outdoor',
  'parking',
  'lift',
  'sort'
]);

// Advanced search parameters, in the address and in the results cache key.
const ADVANCED_SEARCH_KEYS = Object.freeze(['commune', 'priceMin', 'priceMax', 'areaMin', 'rooms', 'beds', 'dpe', 'outdoor', 'parking', 'lift', 'sort']);

function canonicalSearchReturnQuery(query) {
  const source =
    query && typeof query === 'object'
      ? query
      : {};

  const canonical = {};

  SEARCH_RETURN_QUERY_KEYS.forEach(key => {
    if (
      !Object.prototype.hasOwnProperty.call(
        source,
        key
      )
    ) {
      return;
    }

    let value =
      source[key] == null
        ? ''
        : String(source[key]).trim();

    if (!value) return;

    if (key === 'page') {
      if (!/^[1-9]\d*$/.test(value)) return;

      const page = Number(value);

      if (
        !Number.isSafeInteger(page) ||
        page < 2
      ) {
        return;
      }

      value = String(page);
    }

    canonical[key] = value;
  });

  return canonical;
}

function searchReturnDetailQuery(query) {
  const canonical =
    canonicalSearchReturnQuery(query);

  const nested =
    new URLSearchParams();

  SEARCH_RETURN_QUERY_KEYS.forEach(key => {
    if (
      Object.prototype.hasOwnProperty.call(
        canonical,
        key
      )
    ) {
      nested.set(
        key,
        canonical[key]
      );
    }
  });

  return {
    returnTo: 'search',
    returnQuery: nested.toString()
  };
}

function searchReturnQueryFromDetail(query) {
  const source =
    query && typeof query === 'object'
      ? query
      : {};

  if (
    source.returnTo !== 'search' ||
    typeof source.returnQuery !== 'string'
  ) {
    return {};
  }

  const parsed = {};

  try {
    new URLSearchParams(
      source.returnQuery
    ).forEach((value, key) => {
      if (
        SEARCH_RETURN_QUERY_KEYS.includes(
          key
        )
      ) {
        parsed[key] = value;
      }
    });
  } catch (_) {
    return {};
  }

  return canonicalSearchReturnQuery(
    parsed
  );
}

function navigateSearchOriginDetail(view, id) {
  navigate(
    view,
    id,
    searchReturnDetailQuery(
      state.query || {}
    )
  );
}

function navigateBackToSearchResults() {
  navigate(
    'search',
    null,
    searchReturnQueryFromDetail(
      state.query || {}
    )
  );
}
/* ---------------- End Phase C return context ---------------- */


function setLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  // preserve current view + id + query, only swap the language segment
  location.hash = '/' + lang + '/' + state.view + (state.id ? '/' + state.id : '') + buildQueryString(state.query);
}

window.addEventListener('hashchange', parseHash);

/* ---------------- i18n application ---------------- */
function applyI18n() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(state.lang, el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(state.lang, el.getAttribute('data-i18n-html')).replace(/\n/g, '<br>');
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    el.setAttribute('placeholder', t(state.lang, el.getAttribute('data-i18n-ph')));
  });
  document.querySelectorAll('.lang-menu button[data-lang]').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === state.lang);
  });
  const currentLangLabel = document.getElementById('current-lang-label');
  if (currentLangLabel) currentLangLabel.textContent = state.lang.toUpperCase();
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === state.view);
  });
  syncMarketSelects();
  syncHomeTypeOptions(
    document.getElementById('home-type')
      ? document.getElementById('home-type').value
      : ''
  );
}

/* ---------------- Card rendering (shared by Home / Search / Partner) ---------------- */
function cardHTML(vm, searchOrigin = false) {
  const target =
    vm.kind === 'Development'
      ? 'development'
      : (
          vm.kind === 'Land'
            ? 'land'
            : 'property'
        );

  const detailNavigation =
    searchOrigin
      ? `navigateSearchOriginDetail('${target}','${vm.assetId}')`
      : `navigate('${target}','${vm.assetId}')`;

  return `<div class="card" onclick="${detailNavigation}">
    <div class="thumb"><span class="badge ${vm.badgeGold?'gold':''}">${vm.badgeLabel}</span></div>
    <div class="body">
      <div class="price">${vm.priceLabel}</div>
      <div class="loc">${vm.title} — ${vm.locationLabel}</div>
      <div class="meta">${vm.meta.map(m=>`<span>${m}</span>`).join('')}</div>
      <div class="facts-count">${vm.factsLine}</div>
    </div>
  </div>`;
}


/**
 * Search-only organic result renderer.
 *
 * Shared cardHTML() remains untouched for Home, Partner and
 * Country Market Featured.
 */
function searchResultRowHTML(vm) {
  const target =
    vm.kind === 'Development'
      ? 'development'
      : (
          vm.kind === 'Land'
            ? 'land'
            : 'property'
        );

  const hasImage =
    typeof vm.imageUrl === 'string' &&
    vm.imageUrl.trim();

  const imageHTML =
    hasImage
      ? `<img
          src="${vm.imageUrl}"
          alt=""
          loading="lazy"
          decoding="async"
        >`
      : '';

  return `
    <article
      class="card search-result-row"
      data-search-result-kind="${vm.kind}"
      data-search-result-asset-id="${vm.assetId}"
      data-search-image-state="${hasImage ? 'resolved' : 'placeholder'}"
      onclick="navigateSearchOriginDetail('${target}','${vm.assetId}')"
    >
      <div class="search-result-thumb">
        ${imageHTML}
        <span class="badge ${vm.badgeGold ? 'gold' : ''}">
          ${vm.badgeLabel}
        </span>
      </div>

      <div class="search-result-body">
        <div class="price">${vm.priceLabel}</div>
        <div class="search-result-title">${vm.title}</div>
        <div class="loc">${vm.locationLabel}</div>
        <div class="meta">
          ${vm.meta
            .map(item => `<span>${item}</span>`)
            .join('')}
        </div>
        <div class="facts-count">${vm.factsLine}</div>
      </div>
    </article>
  `;
}

/* ---------------- Sprint 1.2: Home status (loading / empty / error) ----------------
   One shared status container reused across all three states, same
   pattern already established by #search-empty (see body.html) — no
   new CSS classes, just the existing inline-style convention. */
function setHomeStatus(kind, titleKey, bodyKey) {
  const statusEl = document.getElementById('home-status');
  const gridsWrap = document.getElementById('home-grids-wrap');
  const marketCta = document.getElementById('home-status-market-cta');

  if (kind === 'none') {
    statusEl.style.display = 'none';
    gridsWrap.style.display = '';
    if (marketCta) marketCta.style.display = 'none';
    return;
  }

  gridsWrap.style.display = 'none';
  statusEl.style.display = '';
  document.getElementById('home-status-title').textContent = t(state.lang, titleKey);
  document.getElementById('home-status-body').textContent = t(state.lang, bodyKey);

  if (marketCta) {
    marketCta.style.display = kind === 'empty' ? 'inline-flex' : 'none';
  }
}

// Official price statistics (DVF / Statbel / Observatoire de l'Habitat).
function scrollToMarketSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function marketEstimationCtaHTML(market) {
  const fr = state.lang === 'fr';
  const base = '#/' + state.lang + '/estimation?market=' + encodeURIComponent(market.key);
  return `
    <div class="mec">
      <div>
        <span class="eyebrow">${fr ? 'Estimation gratuite' : 'Free valuation'}</span>
        <h2>${fr ? 'Combien vaut un bien ici ?' : 'What is a property worth here?'}</h2>
        <p>${fr ? 'Une fourchette immédiate à partir des prix de vente officiels, commune par commune.' : 'An instant range from official sale prices, municipality by municipality.'}</p>
      </div>
      <div class="mec-actions">
        <a class="mec-primary" href="${base}&mode=owner">${fr ? 'Estimer mon bien' : 'Value my property'}</a>
        <a class="mec-secondary" href="${base}&mode=buyer">${fr ? 'Vérifier un prix' : 'Check a price'}</a>
      </div>
    </div>`;
}

function renderMarketDivisions(market) {
  const root = document.getElementById('market-divisions-root');
  const service = window.ZFindServices && window.ZFindServices.marketDivisions;
  if (!root || !service) return;
  const initial = (state.query && state.query.div) || '';
  if (!window.__zfindBaseTitle) window.__zfindBaseTitle = document.title;
  const baseTitle = window.__zfindBaseTitle;
  service.render(root, market.key, state.lang, {
    path: initial,
    // Each level has its own address: #/fr/market/FR?div=84.74 (shareable, back button).
    onPath(keys, labels) {
      const div = keys.join('.');
      const target = '#/' + state.lang + '/market/' + market.key + (div ? '?div=' + div : '');
      if (location.hash !== target) history.pushState(null, '', target);
      state.query = Object.assign({}, state.query, { div: div || undefined });
      if (!div) delete state.query.div;
      document.title = labels.length ? labels[labels.length - 1] + ' — ' + baseTitle : baseTitle;
    }
  });
  if (initial || (state.query && state.query.go === 'regions')) {
    setTimeout(() => scrollToMarketSection('market-divisions-root'), 50);
  }
}

function renderMarketPrices(market) {
  const root = document.getElementById('market-prices-root');
  const service = window.ZFindServices && window.ZFindServices.marketPrices;
  if (!root || !service) return;
  service.render(root, market.key, state.lang);
}

function renderMarketSearch(market) {
  const root = document.getElementById('market-search-root');
  if (!root) return;

  const scope =
    MARKET_SEARCH_SCOPE_SERVICE.resolveMarketScope(
      market
    );

  const copy =
    MARKET_SEARCH_SCOPE_SERVICE.presentation(
      state.lang
    );

  if (!scope.supported) {
    root.dataset.marketSearchState =
      'exact-scope-pending';

    root.innerHTML = `
      <div class="market-search-pending">
        <strong>${copy.exactPendingTitle}</strong>
        <p>${copy.exactPendingBody}</p>
      </div>
    `;
    return;
  }

  root.dataset.marketSearchState = 'ready';

  const typeOptions =
    MARKET_SEARCH_SCOPE_SERVICE
      .typeOptions(state.lang)
      .map(row =>
        `<option value="${row.value}">${row.label}</option>`
      )
      .join('');

  root.innerHTML = `
    <div
      class="market-scoped-search"
      data-market-key="${market.key}"
      data-country-iso="${scope.countryIso}"
    >
      <div class="market-search-fields">
        <select
          id="market-search-transaction"
          aria-label="${copy.buy} / ${copy.rent}"
        >
          <option value="sale">${copy.buy}</option>
          <option value="rent">${copy.rent}</option>
        </select>

        <input
          id="market-search-q"
          type="text"
          placeholder="${copy.locationPlaceholder}"
          aria-label="${copy.locationPlaceholder}"
        >

        <select
          id="market-search-type"
          aria-label="${copy.typeAny}"
        >
          ${typeOptions}
        </select>

        <button
          class="btn btn-gold"
          type="button"
          onclick="submitMarketSearch('${market.key}')"
        >${copy.search}</button>
      </div>
    </div>
  `;
}

function submitMarketSearch(marketKey) {
  const market =
    MARKET_REGISTRY_SERVICE.getMarket(
      marketKey
    );

  const scope =
    MARKET_SEARCH_SCOPE_SERVICE
      .resolveMarketScope(market);

  if (!scope.supported) {
    return;
  }

  const transaction =
    document.getElementById(
      'market-search-transaction'
    );

  const location =
    document.getElementById(
      'market-search-q'
    );

  const type =
    document.getElementById(
      'market-search-type'
    );

  navigate(
    'search',
    null,
    {
      market: market.key,
      transactionType:
        transaction && transaction.value === 'rent'
          ? 'rent'
          : 'sale',
      q: location ? location.value : '',
      subtype: type ? type.value : ''
    }
  );
}

function featuredEmptySlotHTML(position, title, body, stateClass) {
  return `
    <article
      class="market-featured-slot market-featured-empty ${stateClass || ''}"
      data-featured-slot="${position}"
      aria-label="${title}"
    >
      <span class="market-featured-slot-number">
        ${String(position).padStart(2, '0')}
      </span>
      <div>
        <strong>${title}</strong>
        <p>${body}</p>
      </div>
    </article>
  `;
}

function featuredCardSlotHTML(slot, copy) {
  return `
    <div
      class="market-featured-slot market-featured-card"
      data-featured-slot="${slot.position}"
      data-featured-asset-id="${slot.card.assetId}"
      data-featured-kind="${slot.card.kind}"
    >
      <span class="market-featured-label">
        ${copy.featuredBadge}
      </span>
      ${cardHTML(slot.card)}
    </div>
  `;
}

async function renderMarketFeatured(market) {
  const root = document.getElementById('market-featured-root');
  if (!root) return;

  const copy =
    MARKET_REGISTRY_SERVICE.marketPresentation(
      market.key,
      state.lang
    );

  root.dataset.featuredState = 'loading';
  root.dataset.featuredCount = '0';

  root.innerHTML =
    FEATURED_MARKET_SERVICE
      .buildSlots([])
      .map(slot =>
        featuredEmptySlotHTML(
          slot.position,
          copy.featuredLoading,
          '',
          'market-featured-loading'
        )
      )
      .join('');

  const result =
    await loadFeaturedCandidateCards(state.lang);

  // Ignore an obsolete async response if the visitor moved away while
  // the read was in flight.
  if (
    state.view !== 'market' ||
    state.id !== market.key
  ) {
    return;
  }

  if (result.error) {
    console.error(
      'Market Featured data load failed:',
      result.error
    );

    root.dataset.featuredState = 'error';
    root.innerHTML =
      FEATURED_MARKET_SERVICE
        .buildSlots([])
        .map(slot =>
          featuredEmptySlotHTML(
            slot.position,
            copy.featuredErrorTitle,
            copy.featuredErrorBody,
            'market-featured-error'
          )
        )
        .join('');
    return;
  }

  const selected =
    FEATURED_MARKET_SERVICE.selectPreviewCards(
      result.cards,
      market
    );

  const slots =
    FEATURED_MARKET_SERVICE.buildSlots(selected);

  root.dataset.featuredState = 'ready';
  root.dataset.featuredCount = String(selected.length);

  const demoSlots = demoModeOn();

  root.innerHTML = slots
    .map(slot =>
      slot.card
        ? featuredCardSlotHTML(slot, copy)
        : demoSlots
          ? window.ZFindServices.demoMode.featuredSlotHTML(market.key, slot.position, state.lang, 'market-featured-slot market-featured-card')
          : featuredEmptySlotHTML(
            slot.position,
            copy.featuredEmptyTitle,
            copy.featuredEmptyBody,
            ''
          )
    )
    .join('');

  // Visitors only see real listings: empty slots stay in the DOM (slot
  // positions are part of the featured contract) but are not shown, and
  // the whole block disappears while the market has nothing to feature.
  root.querySelectorAll('.market-featured-empty').forEach(node => {
    node.hidden = true;
  });
  const section = root.closest('section');
  if (section) section.hidden = selected.length === 0 && !demoSlots;
}

function renderMarket(marketKey) {
  const root = document.getElementById('market-root');
  if (!root) return;

  const market = getPublicMarket(marketKey);

  if (!market) {
    root.innerHTML = `
      <div class="wrap market-foundation-page">
        <button class="btn btn-ghost" type="button"
          onclick="navigate('home')">
          ${t(state.lang, 'navigation.home')}
        </button>
        <div class="empty" style="margin-top:24px;">
          <h3>${t(state.lang, 'home.errorTitle')}</h3>
          <p>${t(state.lang, 'home.errorBody')}</p>
        </div>
      </div>
    `;
    return;
  }

  const copy = MARKET_REGISTRY_SERVICE.marketPresentation(
    market.key,
    state.lang
  );

  root.innerHTML = `
    <div class="market-foundation-page">
      <section class="market-foundation-hero">
        <div class="wrap market-foundation-hero-grid">
          <div class="market-foundation-copy">
            <button
              class="btn btn-ghost market-back-home"
              type="button"
              onclick="navigate('home')"
            >← ${copy.backHome}</button>

            <span class="eyebrow">${copy.heroEyebrow}</span>
            <h1>${copy.heroTitle}</h1>
            <p class="lead">${copy.heroLead}</p>

            <div class="market-foundation-actions market-jump-actions">
              <button class="btn btn-gold" type="button" onclick="scrollToMarketSection('market-divisions-root')">${state.lang === 'fr' ? 'Explorer par région' : 'Explore by region'}</button>
              <button class="btn btn-outline" type="button" onclick="scrollToMarketSection('market-prices-root')">${state.lang === 'fr' ? 'Prix de l’immobilier' : 'Property prices'}</button>
            </div>
            <div class="market-foundation-actions">${marketGuideButtonsHTML(market, copy)}
            </div>
          </div>

          <div
            class="market-map-slot"
            data-market-map-key="${market.geography.code}"
            data-market-map-kind="${market.geography.kind}"
            data-map-relief-v1="true"
            data-map-note-required="${market.mapOmitsNonMainland ? 'true' : 'false'}"
            aria-hidden="true"
          >
            <img
              class="market-map-visual"
              src="${market.mapAsset}"
              alt=""
              width="1000"
              height="760"
              loading="eager"
              decoding="async"
              fetchpriority="high"
              aria-hidden="true"
            >
              ${market.mapOmitsNonMainland ? '<p class="market-map-omission-note" data-market-map-omission-note="' + market.key + '">' + copy.mapOmissionNote + '</p>' : ''}
          </div>
        </div>
      </section>

      <section
        class="wrap market-foundation-section market-divisions-section"
        id="market-divisions-root"
        data-market-key="${market.key}"
      ></section>

      <section
        class="wrap market-foundation-section market-prices-section"
        id="market-prices-root"
        data-market-key="${market.key}"
      ></section>

      <section class="wrap market-foundation-section market-estimation-cta" id="market-estimation-cta">
        ${marketEstimationCtaHTML(market)}
      </section>

      <section class="wrap market-foundation-section">
        <div class="block-head">
          <div>
            <span class="eyebrow">${copy.searchTitle}</span>
            <p>${copy.searchIntro}</p>
          </div>
        </div>
        <div
          id="market-search-root"
          data-market-key="${market.key}"
          data-market-search-scope-kind="${market.searchScope.kind}"
          data-market-search-scope-value="${market.searchScope.value}"
        ></div>
      </section>

      <section class="wrap market-foundation-section">
        <div class="block-head">
          <div>
            <span class="eyebrow">${copy.featuredTitle}</span>
            <p>${copy.featuredIntro}</p>
          </div>
        </div>
        <div
          id="market-featured-root"
          data-featured-slot-capacity="6"
          data-featured-commercial-model="pending-dedicated-phase"
          data-featured-selection-mode="source-backed-market-preview"
        ></div>
      </section>

      <section class="wrap market-foundation-section market-guide-links">
        <div class="block-head">
          <div>
            <span class="eyebrow">${copy.guidesTitle}</span>
            <p>${copy.guidesIntro}</p>
          </div>
        </div>

        <div class="market-foundation-actions">${marketGuideButtonsHTML(market, copy)}
        </div>
      </section>
    </div>
  `;

  renderMarketFeatured(market);
  renderMarketSearch(market);
  renderMarketDivisions(market);
  renderMarketPrices(market);
}

/* Home: the free valuation, first thing under the search (owners and buyers). */
function homeEstimationCtaHTML() {
  const fr = state.lang === 'fr';
  const base = '#/' + state.lang + '/estimation?market=FR';
  return `
    <div class="mec">
      <div>
        <span class="eyebrow">${fr ? 'Estimation gratuite' : 'Free valuation'}</span>
        <h2>${fr ? 'Combien vaut votre bien ?' : 'What is your property worth?'}</h2>
        <p>${fr
          ? 'Une fourchette de prix immédiate, calculée à partir des ventes officielles de votre commune, en France, en Belgique et au Luxembourg.'
          : 'An instant price range, based on the official sales in your municipality, in France, Belgium and Luxembourg.'}</p>
      </div>
      <div class="mec-actions">
        <a class="mec-primary" href="${base}&mode=owner">${fr ? 'Estimer mon bien' : 'Value my property'}</a>
        <a class="mec-secondary" href="${base}&mode=buyer">${fr ? 'Vérifier le prix d’un bien' : 'Check an asking price'}</a>
      </div>
    </div>`;
}

function renderHomeEstimationCta() {
  const root = document.getElementById('home-estimation-root');
  if (root) root.innerHTML = homeEstimationCtaHTML();
}

function renderHomeMarkets() {
  const root = document.getElementById('home-markets-root');
  const service = window.ZFindServices && window.ZFindServices.homeMarkets;
  if (root && service) service.render(root, state.lang);
}

async function renderHome() {
  renderHomeEstimationCta();
  renderHomeMarkets();
  syncTransactionTabs('home-transaction-tabs', homeTransactionType);
  syncRentalPeriodControl(
    'home-rental-period',
    'home-rental-period-wrap',
    homeTransactionType,
    homeRentalPeriod
  );
  syncBudgetOptions(
    'home-budget',
    homeTransactionType,
    homeRentalPeriod,
    document.getElementById('home-budget')
      ? document.getElementById('home-budget').value
      : ''
  );
  setHomeStatus('loading', 'home.loadingTitle', 'home.loadingBody');

  const result = await loadHomeCards(state.lang);

  if (result.error) {
    console.error('Home data load failed:', result.error);
    setHomeStatus('error', 'home.errorTitle', 'home.errorBody');
    return;
  }

  const propertyCards = result.properties.filter(c => c.subtype !== 'land');
  const landCards = result.properties.filter(c => c.subtype === 'land');
  const developmentCards = result.developments;
  const allNonLand = propertyCards.concat(developmentCards);

  if (allNonLand.length === 0 && landCards.length === 0) {
    setHomeStatus('empty', 'home.emptyTitle', 'home.emptyBody');
    return;
  }

  setHomeStatus('none');
  document.getElementById('home-grid').innerHTML = allNonLand.map(cardHTML).join('');
  document.getElementById('home-land-grid').innerHTML = landCards.map(cardHTML).join('');
}

/* ---------------- Search page: filters, empty state, control sync ---------------- */
function budgetToRange(code) {
  // Sale budgets.
  if (code === 'u400') return { budgetMin:null, budgetMax:400000 };
  if (code === '400-700') return { budgetMin:400000, budgetMax:700000 };
  if (code === 'o700') return { budgetMin:700000, budgetMax:null };

  // Monthly rental budgets. These codes are intentionally distinct
  // from sale budgets. Seasonal/yearly rents do not use these ranges.
  if (code === 'r-u1500') return { budgetMin:null, budgetMax:1500 };
  if (code === 'r-1500-2500') return { budgetMin:1500, budgetMax:2500 };
  if (code === 'r-2500-4000') return { budgetMin:2500, budgetMax:4000 };
  if (code === 'r-o4000') return { budgetMin:4000, budgetMax:null };

  return { budgetMin:null, budgetMax:null };
}

const HOME_CATEGORY_SUBTYPES = Object.freeze({
  residential:Object.freeze(['apartment','villa']),
  commercial:Object.freeze(['office','retail','industrial_logistics','hospitality']),
  developments:Object.freeze(['development']),
  land:Object.freeze(['land'])
});

const HOME_CATEGORY_TYPE_LABEL_KEYS = Object.freeze({
  residential:Object.freeze([
    ['apartment','search.typeApartment'],
    ['villa','search.typeVilla']
  ]),
  commercial:Object.freeze([
    ['office','search.typeOffice'],
    ['retail','search.typeRetail'],
    ['industrial_logistics','search.typeIndustrialLogistics'],
    ['hospitality','search.typeHospitality']
  ]),
  developments:Object.freeze([
    ['development','search.typeDevelopment']
  ]),
  land:Object.freeze([
    ['land','search.typeLand']
  ])
});

let homeCategory = 'residential';

function syncHomeTypeOptions(selectedValue = '') {
  const select = document.getElementById('home-type');
  if (!select) return;

  const rows =
    HOME_CATEGORY_TYPE_LABEL_KEYS[homeCategory] || [];

  select.innerHTML = [
    `<option value="">${t(state.lang, 'search.typeAny')}</option>`,
    ...rows.map(
      ([value, labelKey]) =>
        `<option value="${value}">${t(state.lang, labelKey)}</option>`
    )
  ].join('');

  const allowed =
    new Set(rows.map(([value]) => value));

  select.value =
    allowed.has(selectedValue) ? selectedValue : '';
}

function setHomeCategory(category) {
  homeCategory =
    Object.prototype.hasOwnProperty.call(
      HOME_CATEGORY_SUBTYPES,
      category
    )
      ? category
      : 'residential';

  document
    .querySelectorAll(
      '#view-home .cat-tabs button[data-cat]'
    )
    .forEach(button => {
      button.classList.toggle(
        'active',
        button.dataset.cat === homeCategory
      );
    });

  syncHomeTypeOptions('');
}

let homeTransactionType = 'sale';
let homeRentalPeriod = 'monthly';

function effectiveTransactionType(query) {
  return query && query.transactionType === 'rent' ? 'rent' : 'sale';
}

function effectiveRentalPeriod(query, transactionType) {
  if (transactionType !== 'rent') return null;

  const value = query && query.rentalPeriod;
  return ['monthly', 'seasonal', 'yearly'].includes(value)
    ? value
    : 'monthly';
}

function syncTransactionTabs(containerId, transactionType) {
  const root = document.getElementById(containerId);
  if (!root) return;

  root.querySelectorAll('.transaction-tab').forEach(button => {
    button.classList.toggle(
      'active',
      button.dataset.transaction === transactionType
    );
  });
}

function rentalPeriodOptions() {
  return [
    ['monthly', t(state.lang, 'search.monthly')],
    ['seasonal', t(state.lang, 'search.seasonal')],
    ['yearly', t(state.lang, 'search.yearly')],
  ];
}

function syncRentalPeriodControl(selectId, wrapperId, transactionType, rentalPeriod) {
  const wrapper = document.getElementById(wrapperId);
  const select = document.getElementById(selectId);

  if (!wrapper || !select) return;

  const isRent = transactionType === 'rent';
  wrapper.style.display = isRent ? '' : 'none';

  if (!isRent) return;

  select.innerHTML = rentalPeriodOptions()
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join('');

  select.value = rentalPeriod || 'monthly';
}

function budgetOptionsFor(transactionType, rentalPeriod) {
  if (transactionType === 'rent' && rentalPeriod === 'monthly') {
    return [
      ['', t(state.lang, 'search.anyBudget')],
      ['r-u1500', t(state.lang, 'search.rentBudgetUnder1500')],
      ['r-1500-2500', t(state.lang, 'search.rentBudget1500to2500')],
      ['r-2500-4000', t(state.lang, 'search.rentBudget2500to4000')],
      ['r-o4000', t(state.lang, 'search.rentBudgetOver4000')],
    ];
  }

  if (transactionType === 'rent') {
    // Comparing seasonal or annual amounts against monthly thresholds
    // would be dimensionally wrong, so no numeric budget is offered.
    return [
      ['', t(state.lang, 'search.anyBudget')],
    ];
  }

  return [
    ['', t(state.lang, 'search.anyBudget')],
    ['u400', t(state.lang, 'search.budgetUnder400')],
    ['400-700', t(state.lang, 'search.budget400to700')],
    ['o700', t(state.lang, 'search.budgetOver700')],
  ];
}

function syncBudgetOptions(selectId, transactionType, rentalPeriod, selectedValue) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const options = budgetOptionsFor(transactionType, rentalPeriod);

  select.innerHTML = options
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join('');

  const allowed = new Set(options.map(([value]) => value));
  select.value = allowed.has(selectedValue) ? selectedValue : '';
}

function setHomeTransaction(transactionType) {
  homeTransactionType = transactionType === 'rent' ? 'rent' : 'sale';

  syncTransactionTabs(
    'home-transaction-tabs',
    homeTransactionType
  );

  syncRentalPeriodControl(
    'home-rental-period',
    'home-rental-period-wrap',
    homeTransactionType,
    homeRentalPeriod
  );

  syncBudgetOptions(
    'home-budget',
    homeTransactionType,
    homeRentalPeriod,
    ''
  );
}

function setHomeRentalPeriod(rentalPeriod) {
  homeRentalPeriod = ['monthly', 'seasonal', 'yearly'].includes(rentalPeriod)
    ? rentalPeriod
    : 'monthly';

  syncBudgetOptions(
    'home-budget',
    homeTransactionType,
    homeRentalPeriod,
    ''
  );
}

function setSearchTransaction(transactionType) {
  const next = Object.assign({}, state.query || {});
  delete next.page;
  next.transactionType = transactionType === 'rent' ? 'rent' : 'sale';
  next.budget = '';

  if (next.transactionType === 'rent') {
    next.rentalPeriod = next.rentalPeriod || 'monthly';
  } else {
    delete next.rentalPeriod;
  }

  navigate('search', null, next);
}

function setSearchRentalPeriod(rentalPeriod) {
  const next = Object.assign({}, state.query || {});
  delete next.page;
  next.transactionType = 'rent';
  next.rentalPeriod = ['monthly', 'seasonal', 'yearly'].includes(rentalPeriod)
    ? rentalPeriod
    : 'monthly';

  // A budget from one rental period must never leak into another.
  next.budget = '';

  navigate('search', null, next);
}

function pillFilterToQuery(filterKey) {
  if (filterKey === 'all') return { subtype:'' };

  if (filterKey === 'commercial') {
    return {
      subtype:HOME_CATEGORY_SUBTYPES.commercial.join(',')
    };
  }

  return { subtype:filterKey };
}

function currentPillForQuery(q) {
  if (q.subtype === 'apartment') return 'apartment';
  if (q.subtype === 'villa') return 'villa';

  if (
    q.subtype ===
    HOME_CATEGORY_SUBTYPES.commercial.join(',')
  ) {
    return 'commercial';
  }

  if (q.subtype === 'development') return 'development';
  if (q.subtype === 'land') return 'land';
  return 'all';
}

function setSearchStatus(kind, titleKey, bodyKey) {
  const emptyEl = document.getElementById('search-empty');
  const gridEl = document.getElementById('search-grid');
  if (kind === 'none') { emptyEl.style.display = 'none'; return; }
  gridEl.style.display = 'none';
  emptyEl.style.display = '';
  document.getElementById('search-empty-title').textContent = t(state.lang, titleKey);
  document.getElementById('search-empty-body').textContent = t(state.lang, bodyKey);
}


/* ============================================================
   PHASE B3/B4 — SEARCH FEATURED RAIL
   ============================================================ */

/**
 * Search-only empty/loading/error Featured slot.
 *
 * Copy is reused from the six-language Market presentation
 * authority. No new Search-only public wording is introduced.
 */
function searchFeaturedEmptySlotHTML(
  position,
  title,
  body,
  stateClass
) {
  return `
    <article
      class="search-featured-slot search-featured-empty ${stateClass || ''}"
      data-search-featured-slot="${position}"
      aria-label="${title}"
    >
      <span class="search-featured-slot-number">
        ${String(position).padStart(2, '0')}
      </span>
      <div>
        <strong>${title}</strong>
        ${body ? `<p>${body}</p>` : ''}
      </div>
    </article>
  `;
}

/**
 * Search-only Featured wrapper around the shared vertical card.
 *
 * Organic Search remains owned by searchResultRowHTML().
 */
function searchFeaturedCardSlotHTML(slot, copy) {
  return `
    <div
      class="search-featured-slot search-featured-card"
      data-search-featured-slot="${slot.position}"
      data-search-featured-asset-id="${slot.card.assetId}"
      data-search-featured-kind="${slot.card.kind}"
    >
      <span class="search-featured-label">
        ${copy.featuredBadge}
      </span>
      ${cardHTML(slot.card, true)}
    </div>
  `;
}

function searchFeaturedRailShellHTML(copy, slotsHTML) {
  return `
    <div
      class="search-featured-rail"
      data-search-featured-rail="market-scoped"
    >
      <div class="search-featured-rail-head">
        <span class="eyebrow">${copy.featuredTitle}</span>
      </div>
      <div class="search-featured-slots">
        ${slotsHTML}
      </div>
    </div>
  `;
}

function hideSearchFeaturedRail(stateValue) {
  const aside =
    document.getElementById('search-results-aside');

  if (!aside) return;

  aside.dataset.searchAsideState =
    stateValue || 'unscoped';

  delete aside.dataset.searchFeaturedMarket;
  aside.setAttribute('aria-hidden', 'true');
  aside.innerHTML = '';
}

/**
 * Three-slot Search Featured rail.
 *
 * Authority is explicit q.market only. Candidate inventory uses the
 * existing passive published read and the exact same deterministic
 * market selection primitive as the Country Market Page. Organic
 * Search filters never influence this rail.
 */
async function renderSearchFeaturedRail(marketKey) {
  const aside =
    document.getElementById('search-results-aside');

  if (!aside) return;

  if (!marketKey) {
    hideSearchFeaturedRail('unscoped');
    return;
  }

  const market =
    MARKET_REGISTRY_SERVICE.getMarket(marketKey);

  if (!market) {
    hideSearchFeaturedRail('invalid-market');
    return;
  }

  const copy =
    MARKET_REGISTRY_SERVICE.marketPresentation(
      market.key,
      state.lang
    );

  const loadingSlots =
    FEATURED_MARKET_SERVICE
      .buildSlots([])
      .slice(0, 3);

  aside.dataset.searchAsideState = 'loading';
  aside.dataset.searchFeaturedMarket = market.key;
  aside.setAttribute('aria-hidden', 'false');

  aside.innerHTML =
    searchFeaturedRailShellHTML(
      copy,
      loadingSlots
        .map(slot =>
          searchFeaturedEmptySlotHTML(
            slot.position,
            copy.featuredLoading,
            '',
            'search-featured-loading'
          )
        )
        .join('')
    );

  const result =
    await loadFeaturedCandidateCards(state.lang);

  // Ignore a stale async response after navigation or market change.
  if (
    state.view !== 'search' ||
    !state.query ||
    state.query.market !== market.key
  ) {
    return;
  }

  if (result.error) {
    console.error(
      'Search Featured rail data load failed:',
      result.error
    );

    const errorSlots =
      FEATURED_MARKET_SERVICE
        .buildSlots([])
        .slice(0, 3);

    aside.dataset.searchAsideState = 'error';

    aside.innerHTML =
      searchFeaturedRailShellHTML(
        copy,
        errorSlots
          .map(slot =>
            searchFeaturedEmptySlotHTML(
              slot.position,
              copy.featuredErrorTitle,
              copy.featuredErrorBody,
              'search-featured-error'
            )
          )
          .join('')
      );

    return;
  }

  const selected =
    FEATURED_MARKET_SERVICE.selectPreviewCards(
      result.cards,
      market
    );

  const slots =
    FEATURED_MARKET_SERVICE
      .buildSlots(selected)
      .slice(0, 3);

  aside.dataset.searchAsideState =
    selected.length ? 'ready' : 'empty';

  const demoSlots = demoModeOn();

  aside.innerHTML =
    searchFeaturedRailShellHTML(
      copy,
      slots
        .map(slot =>
          slot.card
            ? searchFeaturedCardSlotHTML(slot, copy)
            : demoSlots
              ? window.ZFindServices.demoMode.featuredSlotHTML(market.key, slot.position, state.lang, 'search-featured-slot search-featured-card')
              : searchFeaturedEmptySlotHTML(
                slot.position,
                copy.featuredEmptyTitle,
                copy.featuredEmptyBody,
                'search-featured-open'
              )
        )
        .join('')
    );
}

async function renderSearch() {
  const q = state.query || {};

  const transactionType =
    effectiveTransactionType(q);

  const rentalPeriod =
    effectiveRentalPeriod(
      q,
      transactionType
    );

  const cacheKey =
    searchResultsCacheKey(
      state.lang,
      q,
      transactionType,
      rentalPeriod
    );

  const cacheHit =
    searchResultsCache.key === cacheKey &&
    Boolean(searchResultsCache.result);

  clearSearchPagination();

  // Phase B5 page-only navigation must touch only the organic
  // presentation contract. The Featured rail depends on market,
  // never page, so a cache hit must not refetch/re-render it.
  if (!cacheHit) {
    renderSearchFeaturedRail(q.market || null)
      .catch(error => {
        console.error(
          'Search Featured rail failed:',
          error
        );
      });
  }

  const range = (
    transactionType === 'rent' && rentalPeriod !== 'monthly'
  )
    ? { budgetMin:null, budgetMax:null }
    : budgetToRange(q.budget);

  const qInput =
    document.getElementById('search-q');

  if (qInput) {
    qInput.value = q.q || '';
  }

  syncTransactionTabs(
    'search-transaction-tabs',
    transactionType
  );

  syncRentalPeriodControl(
    'search-rental-period',
    'search-rental-period-wrap',
    transactionType,
    rentalPeriod
  );

  syncBudgetOptions(
    'search-budget',
    transactionType,
    rentalPeriod,
    q.budget || ''
  );

  syncAdvancedFilters(q);
  if (qInput) qInput.dataset.commune = q.commune || '';

  const activePill =
    currentPillForQuery(q);

  document
    .querySelectorAll(
      '#view-search .tabs-row .pill'
    )
    .forEach(
      button => button.classList.toggle(
        'active',
        button.dataset.filter === activePill
      )
    );

  const searchFilterInput =
    {
      q: q.q || '',
      subtype:
        (q.subtype || '')
          .split(',')
          .filter(Boolean),
      transactionType,
      rentalPeriod,
      budgetMin: q.priceMin ? Number(q.priceMin) : range.budgetMin,
      budgetMax: q.priceMax ? Number(q.priceMax) : range.budgetMax,
      marketKey: q.market || undefined,
      areaMin: q.areaMin || null,
      roomsMin: q.rooms || null,
      bedsMin: q.beds || null,
      energyMax: q.dpe || null,
      outdoor: q.outdoor === '1',
      parking: q.parking === '1',
      lift: q.lift === '1',
      sort: q.sort || '',
      // Resolved only when the results are fetched (a cache hit already has them).
      place: !cacheHit && q.commune && window.ZFindServices.placeSearch
        ? await window.ZFindServices.placeSearch.byCode(q.commune).catch(() => null)
        : null
    };

  let result;

  if (cacheHit) {
    result =
      searchResultsCache.result;
  } else {
    clearSearchResultsCache();

    document
      .getElementById('search-grid')
      .style.display = 'none';

    setSearchStatus(
      'loading',
      'home.loadingTitle',
      'home.loadingBody'
    );

    result =
      await loadSearchResults(
        state.lang,
        searchFilterInput
      );

    // Async Search results may complete after the user has changed
    // Search intent or left Search. Never cache/render a stale result.
    const currentQ =
      state.query || {};

    const currentTransactionType =
      effectiveTransactionType(
        currentQ
      );

    const currentRentalPeriod =
      effectiveRentalPeriod(
        currentQ,
        currentTransactionType
      );

    const currentCacheKey =
      searchResultsCacheKey(
        state.lang,
        currentQ,
        currentTransactionType,
        currentRentalPeriod
      );

    if (
      state.view !== 'search' ||
      currentCacheKey !== cacheKey
    ) {
      return;
    }

    if (!result.error) {
      searchResultsCache.key = cacheKey;
      searchResultsCache.result = result;
    }
  }

  if (result.error) {
    console.error(
      'Search failed:',
      result.error
    );

    setSearchStatus(
      'error',
      'home.errorTitle',
      'home.errorBody'
    );

    return;
  }

  const presentationQuery =
    state.query || q;

  if (result.scopeUnavailable) {
    // Scope-unavailable has no organic pages. Canonicalize any
    // stale/forged page query to page 1 without re-fetching.
    if (presentationQuery.page) {
      goToSearchPage(1);
      return;
    }

    const copy =
      MARKET_SEARCH_SCOPE_SERVICE.presentation(
        state.lang
      );

    const emptyEl =
      document.getElementById(
        'search-empty'
      );

    const gridEl =
      document.getElementById(
        'search-grid'
      );

    gridEl.innerHTML = '';
    gridEl.style.display = 'none';
    emptyEl.style.display = '';

    document.getElementById(
      'search-empty-title'
    ).textContent =
      copy.exactPendingTitle;

    document.getElementById(
      'search-empty-body'
    ).textContent =
      copy.exactPendingBody;

    return;
  }

  renderSearchAlert(searchFilterInput, presentationQuery);

  const fullCards =
    Array.isArray(result.cards)
      ? result.cards
      : [];

  const selectedMarket =
    presentationQuery.market
      ? MARKET_REGISTRY_SERVICE
          .getMarket(
            presentationQuery.market
          )
      : null;

  // "{{count}} opportunités{{market}}": the market part carries its own
  // separator (" · France"), like computeMarketLabel's " · Lyon".
  const selectedMarketLabel =
    selectedMarket
      ? ' · ' + MARKET_REGISTRY_SERVICE
          .marketLabel(
            selectedMarket.key,
            state.lang
          )
      : computeMarketLabel(fullCards);

  document.getElementById(
    'search-results-title'
  ).textContent =
    t(
      state.lang,
      fullCards.length === 1 && I18N[state.lang] && I18N[state.lang].search && I18N[state.lang].search.resultsTitleOne
        ? 'search.resultsTitleOne'
        : 'search.resultsTitle',
      {
        count: fullCards.length,
        market: selectedMarketLabel
      }
    );

  const pagination =
    SEARCH_PAGINATION_SERVICE.paginate(
      fullCards,
      presentationQuery.page,
      { keepOrder: Boolean((state.query || {}).sort) }
    );

  // Canonical URL authority:
  // - page 1 => no page parameter
  // - invalid input => page 1
  // - overflow => exact last page
  // The cache is already populated, so normalization cannot re-run
  // the underlying Search or its analytics write.
  if (
    normalizeSearchPageQuery(
      pagination,
      presentationQuery
    )
  ) {
    return;
  }

  if (!fullCards.length) {
    const emptyGridEl =
      document.getElementById(
        'search-grid'
      );

    emptyGridEl.innerHTML = '';
    emptyGridEl.style.display = 'none';

    setSearchStatus(
      'empty',
      'search.noResultsTitle',
      'search.noResultsBody'
    );

    return;
  }

  // Signed image URLs only for the cards on this page.
  await resolveCardImages(pagination.cards);

  setSearchStatus('none');

  const gridEl =
    document.getElementById(
      'search-grid'
    );

  gridEl.style.display = '';
  gridEl.innerHTML =
    pagination.cards
      .map(searchResultRowHTML)
      .join('');

  renderSearchPagination(
    pagination
  );
}

/* ---------------- Search bar: places and sentences (2026-09-30) ----------------
   The location field accepts a commune (picked in the list or typed), a
   postcode, or a whole sentence ("T3 avec balcon à Évian moins de 450 000 €"),
   turned into filters by natural-search.js. */
async function searchQueryFromText(text, selectedCommune) {
  const services = window.ZFindServices || {};
  const raw = String(text || '').trim();
  const out = { q: raw, commune: selectedCommune || '' };
  if (!raw || selectedCommune) return out;
  const parsed = services.naturalSearch ? services.naturalSearch.parse(raw) : { filters: {}, place: raw, hasCriteria: false };
  const f = parsed.filters || {};
  if (f.transactionType) out.transactionType = f.transactionType;
  if (f.subtype) out.subtype = f.subtype;
  if (f.priceMin) out.priceMin = String(f.priceMin);
  if (f.priceMax) out.priceMax = String(f.priceMax);
  if (f.areaMin) out.areaMin = String(f.areaMin);
  if (f.roomsMin) out.rooms = String(f.roomsMin);
  if (f.bedsMin) out.beds = String(f.bedsMin);
  if (f.energyMax) out.dpe = f.energyMax;
  if (f.outdoor) out.outdoor = '1';
  if (f.parking) out.parking = '1';
  if (f.lift) out.lift = '1';
  const place = (parsed.place || '').trim();
  out.q = place;
  if (place && services.placeSearch) {
    const hits = await services.placeSearch.search(place, { limit: 2 }).catch(() => []);
    if (hits[0] && hits[0].score >= 4 && !(hits[1] && hits[1].score === hits[0].score && hits[1].name === hits[0].name)) {
      out.commune = services.placeSearch.encode(hits[0]);
      out.q = hits[0].name;
    }
  }
  return out;
}

function mergeSearchQuery(base, extra) {
  const next = Object.assign({}, base);
  ADVANCED_SEARCH_KEYS.forEach(key => { if (key !== 'sort') delete next[key]; });
  Object.keys(extra).forEach(key => {
    if (extra[key] === '' || extra[key] == null) delete next[key];
    else next[key] = extra[key];
  });
  delete next.page;
  return next;
}

async function applySearchBar() {
  const input = document.getElementById('search-q');
  const budgetVal = document.getElementById('search-budget').value;
  const extra = await searchQueryFromText(input.value, input.dataset.commune || '');
  if (!extra.priceMin && !extra.priceMax) extra.budget = budgetVal;
  const keepFilters = Object.assign({}, state.query);
  const next = mergeSearchQuery(keepFilters, extra);
  // Filters chosen in the panel stay unless the sentence set them.
  ADVANCED_SEARCH_KEYS.forEach(key => { if (!(key in extra) && state.query && state.query[key] && key !== 'commune') next[key] = state.query[key]; });
  navigate('search', null, next);
}

/* Commune suggestions under a location field (FR / BE / LU), keyboard and touch. */
function attachPlaceAutocomplete(input, onPick) {
  const service = window.ZFindServices && window.ZFindServices.placeSearch;
  if (!input || !service || input.dataset.autocomplete) return;
  input.dataset.autocomplete = '1';
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  const list = document.createElement('ul');
  list.className = 'place-suggest';
  list.id = input.id + '-suggest';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  input.setAttribute('aria-controls', list.id);
  input.insertAdjacentElement('afterend', list);
  let items = [];
  let active = -1;
  let token = 0;
  const flag = { FR: 'France', BE: 'Belgique', LU: 'Luxembourg' };
  function close() { list.hidden = true; active = -1; input.setAttribute('aria-expanded', 'false'); }
  function pick(i) {
    const place = items[i];
    if (!place) return;
    input.value = place.name;
    input.dataset.commune = service.encode(place);
    close();
    if (typeof onPick === 'function') onPick();
  }
  function paint() {
    list.innerHTML = items.map((p, i) => `<li role="option" id="${list.id}-${i}" aria-selected="${i === active}" data-i="${i}"><strong>${escapeHtmlSim(p.name)}</strong><span>${escapeHtmlSim([p.via, p.parent, flag[p.country]].filter(Boolean).join(' · '))}</span></li>`).join('');
    list.hidden = !items.length;
    input.setAttribute('aria-expanded', String(!!items.length));
    if (active >= 0) input.setAttribute('aria-activedescendant', `${list.id}-${active}`); else input.removeAttribute('aria-activedescendant');
  }
  input.addEventListener('input', () => {
    input.dataset.commune = '';
    const value = input.value;
    const mine = ++token;
    // A sentence ("T3 à Évian…") is left to the search button.
    if (value.trim().length < 2 || (window.ZFindServices.naturalSearch && window.ZFindServices.naturalSearch.looksLikeSentence(value))) { items = []; paint(); return; }
    setTimeout(async () => {
      if (mine !== token) return;
      items = await service.search(value, { limit: 6 }).catch(() => []);
      if (mine !== token) return;
      active = -1;
      paint();
    }, 120);
  });
  input.addEventListener('keydown', e => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); paint(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); paint(); e.preventDefault(); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(active); }
    else if (e.key === 'Escape') close();
  });
  list.addEventListener('mousedown', e => {
    const li = e.target.closest('li[data-i]');
    if (li) { e.preventDefault(); pick(Number(li.dataset.i)); }
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
}

function applyAdvancedFilters() {
  const panel = document.getElementById('search-advanced');
  if (!panel) return;
  const value = name => (panel.querySelector(`[data-adv="${name}"]`) || {}).value || '';
  const checked = name => !!(panel.querySelector(`[data-adv="${name}"]`) || {}).checked;
  const next = Object.assign({}, state.query);
  const set = (key, v) => { if (v) next[key] = v; else delete next[key]; };
  set('priceMin', value('priceMin'));
  set('priceMax', value('priceMax'));
  set('areaMin', value('areaMin'));
  set('rooms', value('rooms'));
  set('beds', value('beds'));
  set('dpe', value('dpe'));
  set('outdoor', checked('outdoor') ? '1' : '');
  set('parking', checked('parking') ? '1' : '');
  set('lift', checked('lift') ? '1' : '');
  set('sort', value('sort'));
  if (next.priceMin || next.priceMax) delete next.budget;
  delete next.page;
  navigate('search', null, next);
}

const ADVANCED_FILTERS_COPY = Object.freeze({
  fr: { toggle: 'Plus de critères', priceMin: 'Prix min. (€)', priceMax: 'Prix max. (€)', areaMin: 'Surface min. (m²)',
        rooms: 'Pièces min.', beds: 'Chambres min.', dpe: 'DPE / PEB au moins', any: 'Indifférent',
        outdoor: 'Balcon, terrasse ou jardin', parking: 'Parking ou garage', lift: 'Ascenseur',
        sort: 'Trier par', sorts: { '': 'Pertinence', recent: 'Plus récents', price_asc: 'Prix croissant', price_desc: 'Prix décroissant', ppm2_asc: 'Prix au m² croissant' },
        apply: 'Appliquer' },
  en: { toggle: 'More criteria', priceMin: 'Min. price (€)', priceMax: 'Max. price (€)', areaMin: 'Min. area (m²)',
        rooms: 'Min. rooms', beds: 'Min. bedrooms', dpe: 'Energy class at least', any: 'Any',
        outdoor: 'Balcony, terrace or garden', parking: 'Parking or garage', lift: 'Lift',
        sort: 'Sort by', sorts: { '': 'Relevance', recent: 'Newest', price_asc: 'Price, low to high', price_desc: 'Price, high to low', ppm2_asc: 'Price per m², low to high' },
        apply: 'Apply' }
});

function renderAdvancedFiltersPanel() {
  const panel = document.getElementById('search-advanced');
  if (!panel) return;
  const lang = state.lang === 'fr' ? 'fr' : 'en';
  if (panel.dataset.lang === lang) return;
  const c = ADVANCED_FILTERS_COPY[lang];
  const opts = (values, labelOf) => values.map(v => `<option value="${v}">${labelOf(v)}</option>`).join('');
  panel.innerHTML = `
    <summary>${c.toggle} <span class="adv-count" data-adv-count></span></summary>
    <div class="adv-grid">
      <label>${c.priceMin}<input type="number" inputmode="numeric" min="0" step="10000" data-adv="priceMin"></label>
      <label>${c.priceMax}<input type="number" inputmode="numeric" min="0" step="10000" data-adv="priceMax"></label>
      <label>${c.areaMin}<input type="number" inputmode="numeric" min="0" step="5" data-adv="areaMin"></label>
      <label>${c.rooms}<select data-adv="rooms">${opts(['', '1', '2', '3', '4', '5'], v => v ? v + (v === '5' ? '+' : '') : c.any)}</select></label>
      <label>${c.beds}<select data-adv="beds">${opts(['', '1', '2', '3', '4'], v => v ? v + (v === '4' ? '+' : '') : c.any)}</select></label>
      <label>${c.dpe}<select data-adv="dpe">${opts(['', 'A', 'B', 'C', 'D', 'E'], v => v || c.any)}</select></label>
      <label>${c.sort}<select data-adv="sort">${opts(Object.keys(c.sorts), v => c.sorts[v])}</select></label>
    </div>
    <div class="adv-checks">
      <label><input type="checkbox" data-adv="outdoor"> ${c.outdoor}</label>
      <label><input type="checkbox" data-adv="parking"> ${c.parking}</label>
      <label><input type="checkbox" data-adv="lift"> ${c.lift}</label>
    </div>
    <button type="button" class="btn btn-gold adv-apply" onclick="applyAdvancedFilters()">${c.apply}</button>`;
  panel.dataset.lang = lang;
  // Sorting applies at once; the other criteria with the button.
  panel.querySelector('[data-adv="sort"]').addEventListener('change', applyAdvancedFilters);
}

function syncAdvancedFilters(q) {
  renderAdvancedFiltersPanel();
  const panel = document.getElementById('search-advanced');
  if (!panel) return;
  ['priceMin', 'priceMax', 'areaMin', 'rooms', 'beds', 'dpe', 'sort'].forEach(name => {
    const el = panel.querySelector(`[data-adv="${name}"]`);
    if (el) el.value = q[name] || '';
  });
  ['outdoor', 'parking', 'lift'].forEach(name => {
    const el = panel.querySelector(`[data-adv="${name}"]`);
    if (el) el.checked = q[name] === '1';
  });
  const active = ['priceMin', 'priceMax', 'areaMin', 'rooms', 'beds', 'dpe', 'outdoor', 'parking', 'lift'].filter(k => q[k]).length;
  const count = panel.querySelector('[data-adv-count]');
  if (count) count.textContent = active ? String(active) : '';
  if (active) panel.open = true;
}

function clearSearchFilters() {
  const next = {
    transactionType:'sale'
  };

  if (state.query && state.query.market) {
    next.market = state.query.market;
  }

  navigate('search', null, next);
}

async function submitHomeSearch() {
  const transactionType = homeTransactionType;
  const typeVal = document.getElementById('home-type').value;
  const qVal = document.getElementById('home-q').value;
  const budgetVal = document.getElementById('home-budget').value;

  let query;
  if (typeVal) {
    query = { subtype:typeVal };
  } else {
    query = {
      subtype:
        (HOME_CATEGORY_SUBTYPES[homeCategory] || [])
          .join(',')
    };
  }
  query.transactionType = transactionType;

  if (transactionType === 'rent') {
    query.rentalPeriod = homeRentalPeriod;
  }

  const qInput = document.getElementById('home-q');
  const extra = await searchQueryFromText(qVal, (qInput && qInput.dataset.commune) || '');
  Object.keys(extra).forEach(key => { if (extra[key] !== '' && extra[key] != null) query[key] = extra[key]; });
  if (!query.q) delete query.q;
  if (!query.priceMin && !query.priceMax && budgetVal) query.budget = budgetVal;

  navigate('search', null, query);
}

/* ---------------- Data-status tag helper ---------------- */
function statusTag(status) {
  const cls = status === 'estimate' || status === 'model_output' ? 'tag-estimate' : (status === 'fact' ? 'tag-fact' : 'tag-verified');
  const key = { fact:'dataStatus.fact', observation:'dataStatus.observation', estimate:'dataStatus.estimate', model_output:'dataStatus.modelOutput' }[status] || 'dataStatus.data';
  return `<span class="tag ${cls}">${t(state.lang, key)}</span>`;
}

/* ---------------- Property detail ---------------- */
function detailStatusHTML(titleKey, bodyKey) {
  return `<div class="wrap" style="padding-top:20px;">
    <a href="#" onclick="navigateBackToSearchResults();return false;" class="btn-ghost" style="font-size:0.82rem;">${t(state.lang,'common.backToResults')}</a>
  </div>
  <div style="text-align:center; padding:60px 20px; border:1px solid var(--gray-200); border-radius:var(--radius); background:var(--gray-50); max-width:1200px; margin:20px auto;">
    <h3 style="font-size:1.4rem;">${t(state.lang, titleKey)}</h3>
    <p style="color:var(--gray-500); margin-top:10px; font-size:0.9rem;">${t(state.lang, bodyKey)}</p>
  </div>`;
}
function propertyStatusHTML(titleKey, bodyKey) { return detailStatusHTML(titleKey, bodyKey); } // kept for call-site clarity in renderProperty

/* ---------------- Listing page: price against the official market ----------------
   The listing's commune (matched on the official files), type and surface go
   through the estimation engine: the visitor sees the Z Find range for a
   comparable property and where the asking price stands, with the source. */
const jsonFileCache = new Map();
function loadPublicJson(path) {
  if (!jsonFileCache.has(path)) {
    jsonFileCache.set(path, fetch('/' + path, { credentials: 'omit' }).then(r => {
      if (!r.ok) throw new Error(path + ' ' + r.status);
      return r.json();
    }).catch(error => { jsonFileCache.delete(path); throw error; }));
  }
  return jsonFileCache.get(path);
}

async function renderListingMarketContext(vm) {
  const root = document.getElementById('listing-market-root');
  const services = window.ZFindServices || {};
  const engine = services.estimation;
  const page = services.estimationPage;
  const places = services.placeSearch;
  if (!root || !engine || !page || !places) return;
  const country = vm.geo && vm.geo.countryIso;
  const price = Number(vm.listing && vm.listing.priceCurrent);
  const surface = Number(vm.asset && vm.asset.areaSqm);
  if (!['FR', 'BE', 'LU'].includes(country) || vm.listing.transactionType !== 'sale' || !(price > 0) || !(surface >= 9)) return;
  const type = vm.asset.subtype === 'apartment' ? 'apartment' : vm.asset.subtype === 'villa' ? (country === 'BE' ? 'house_open' : 'house') : null;
  if (!type) return;
  const place = await places.resolveCity(country, vm.geo.cityLabel || vm.geo.zoneLabel).catch(() => null);
  if (!place) return;
  const result = await engine.estimate({ market: country, communeCode: place.code, type, surface, askingPrice: price }, loadPublicJson).catch(() => null);
  if (!result || !result.ok || state.view !== 'property' || !document.body.contains(root)) return;
  const lang = state.lang === 'fr' ? 'fr' : 'en';
  const c = page.COPY[lang];
  const money = v => fmtCurrency(v, state.lang, 'EUR');
  const pct = v => new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-IE', { style: 'percent', maximumFractionDigits: 0 }).format(Math.abs(v));
  const typeLabel = (c.typesSales || {})[type] || '';
  const buyer = result.buyer;
  const verdict = buyer ? (buyer.position === 'within' ? c.buyer.within : c.buyer[buyer.position](pct(buyer.deltaPct))) : '';
  const copy = lang === 'fr'
    ? { title: `Estimation Z Find pour un bien comparable à ${place.name}`, perM2: 'Prix au m² de ce bien', more: 'Estimer un autre bien' }
    : { title: `Z Find estimate for a comparable property in ${place.name}`, perM2: 'Price per m² of this property', more: 'Value another property' };
  root.innerHTML = `
    <div class="row"><span class="label">${copy.perM2}</span><span class="val">${money(Math.round(price / surface))}/m²</span></div>
    <div class="row"><span class="label">${copy.title}</span><span class="val">${money(result.low)} – ${money(result.high)}</span></div>
    <div class="row"><span class="label">${c.centralLabel}</span><span class="val">${money(result.central)} · ${c.confidence[result.confidence]}</span></div>
    ${verdict ? `<p class="listing-market-verdict" data-position="${buyer.position}">${verdict}</p>` : ''}
    <p class="listing-market-note">${escapeHtmlSim(c.basis(result.basis, typeLabel))} ${c.source || ''}${c.colon || ': '}${escapeHtmlSim(result.basis.source || '')}.</p>
    <p class="listing-market-note"><a href="#/${state.lang}/estimation?market=${country}&mode=buyer">${copy.more} →</a></p>`;
}

/* ---------------- Listing page: financing, travel, similar listings ---------------- */

const LISTING_PAGE_COPY = Object.freeze({
  fr: { travelTitle: 'Temps de trajet', travelPlaceholder: 'Votre lieu de travail, une école…', travelGo: 'Voir le trajet',
        travelModes: { driving: 'Voiture', transit: 'Transports', walking: 'À pied', bicycling: 'Vélo' },
        travelNote: 'Itinéraire calculé par Google Maps, dans un nouvel onglet.', similarTitle: 'Biens similaires' },
  en: { travelTitle: 'Travel time', travelPlaceholder: 'Your workplace, a school…', travelGo: 'Show the route',
        travelModes: { driving: 'Car', transit: 'Public transport', walking: 'Walk', bicycling: 'Bike' },
        travelNote: 'Route calculated by Google Maps, in a new tab.', similarTitle: 'Similar properties' }
});
function listingCopy() { return LISTING_PAGE_COPY[state.lang] || LISTING_PAGE_COPY.en; }

function financingCardHTML(vm) {
  const service = window.ZFindServices && window.ZFindServices.acquisitionCosts;
  const country = vm.geo && vm.geo.countryIso;
  if (!service || !['FR', 'BE', 'LU'].includes(country) || !(vm.listing.priceCurrent > 0)) return '';
  const c = service.COPY[state.lang] || service.COPY.en;
  const price = Number(vm.listing.priceCurrent);
  const deposit = Math.round(price * 0.1 / 1000) * 1000;
  const opt = (value, label, selected) => `<option value="${value}"${selected ? ' selected' : ''}>${label}</option>`;
  const countryFields = country === 'FR'
    ? `<label class="fin-check"><input type="checkbox" data-fin="newBuild"${vm.newBuild ? ' checked' : ''}> ${c.newBuild}</label>
       <label class="fin-check"><input type="checkbox" data-fin="firstBuyer"> ${c.firstBuyer}</label>`
    : country === 'BE'
      ? `<label class="fin-field">${c.region}<select data-fin="region">${opt('', '—', true)}${['WAL', 'VLG', 'BRU'].map(r => opt(r, c.regions[r], false)).join('')}</select></label>
         <label class="fin-check"><input type="checkbox" data-fin="ownHome" checked> ${c.ownHome.BE}</label>`
      : `<label class="fin-check"><input type="checkbox" data-fin="ownHome" checked> ${c.ownHome.LU}</label>
         <label class="fin-field">${c.buyers}<select data-fin="buyers">${opt(1, c.buyersOptions[1], true)}${opt(2, c.buyersOptions[2], false)}</select></label>`;
  return `
      <div class="sidebar-card financing-card" data-financing-country="${country}">
        <h4>${c.title}</h4>
        <div class="fin-grid">
          <label class="fin-field">${c.deposit}<input type="number" inputmode="numeric" min="0" step="1000" value="${deposit}" data-fin="deposit"></label>
          <label class="fin-field">${c.rate}<input type="number" inputmode="decimal" min="0" max="15" step="0.05" value="3.3" data-fin="ratePct"></label>
          <label class="fin-field">${c.years}<select data-fin="years">${[15, 20, 25].map(y => opt(y, y, y === 20)).join('')}</select></label>
        </div>
        ${countryFields}
        <div class="fin-result" data-fin-result aria-live="polite"></div>
        <p class="fin-note">${c.note}</p>
      </div>`;
}

function bindFinancingCard(vm) {
  const card = document.querySelector('#property-root .financing-card');
  const service = window.ZFindServices && window.ZFindServices.acquisitionCosts;
  if (!card || !service) return;
  const c = service.COPY[state.lang] || service.COPY.en;
  const country = card.getAttribute('data-financing-country');
  const field = name => card.querySelector(`[data-fin="${name}"]`);
  const money = v => fmtCurrency(v, state.lang, 'EUR');
  function update() {
    const input = {
      country, price: Number(vm.listing.priceCurrent),
      deposit: Number((field('deposit') || {}).value) || 0,
      ratePct: Number((field('ratePct') || {}).value) || 0,
      years: Number((field('years') || {}).value) || 20,
      newBuild: !!(field('newBuild') && field('newBuild').checked),
      firstBuyer: !!(field('firstBuyer') && field('firstBuyer').checked),
      region: field('region') ? field('region').value : undefined,
      ownHome: !!(field('ownHome') && field('ownHome').checked),
      buyers: field('buyers') ? Number(field('buyers').value) : 1
    };
    const r = service.financing(input);
    const out = card.querySelector('[data-fin-result]');
    if (r.error === 'region_required') {
      out.innerHTML = `<div class="sim-row"><span>${c.region}</span><span>—</span></div>`;
      return;
    }
    if (r.error) { out.innerHTML = ''; return; }
    out.innerHTML = r.lines.map(line => `<div class="sim-row"><span>${c.lines[line.key]}</span><span>${money(line.amount)}</span></div>`).join('')
      + `<div class="sim-row"><span>${c.costs}</span><span>${money(r.costs)}</span></div>`
      + (r.notaryIncluded ? '' : `<div class="sim-row"><span class="fin-muted">${c.notaryExcluded}</span><span></span></div>`)
      + `<div class="sim-row"><span>${c.total}</span><span>${money(r.total)}</span></div>`
      + `<div class="sim-row"><span>${c.loan}</span><span>${money(r.loan)}</span></div>`
      + `<div class="sim-row total"><span>${c.monthly}</span><span style="color:var(--gold-dark)">${money(r.monthly)}${c.perMonth}</span></div>`;
  }
  card.addEventListener('input', update);
  card.addEventListener('change', update);
  update();
}

function travelCardHTML(vm) {
  const c = listingCopy();
  const hasPlace = (vm.geo.latitude != null && vm.geo.longitude != null) || vm.geo.cityLabel;
  if (!hasPlace) return '';
  return `
      <div class="sidebar-card travel-card">
        <h4>${c.travelTitle}</h4>
        <form data-travel-form>
          <input type="text" data-travel-to placeholder="${c.travelPlaceholder}" aria-label="${c.travelPlaceholder}" required>
          <div class="travel-modes" role="radiogroup" aria-label="${c.travelTitle}">
            ${Object.keys(c.travelModes).map((mode, i) => `<label><input type="radio" name="travel-mode" value="${mode}"${i === 0 ? ' checked' : ''}> ${c.travelModes[mode]}</label>`).join('')}
          </div>
          <button type="submit" class="btn btn-outline" style="width:100%; justify-content:center">${c.travelGo}</button>
        </form>
        <p class="fin-note">${c.travelNote}</p>
      </div>`;
}

function bindTravelCard(vm) {
  const form = document.querySelector('#property-root [data-travel-form]');
  if (!form) return;
  form.addEventListener('submit', event => {
    event.preventDefault();
    const to = form.querySelector('[data-travel-to]').value.trim();
    if (!to) return;
    const mode = (form.querySelector('input[name="travel-mode"]:checked') || {}).value || 'driving';
    const origin = vm.geo.latitude != null && vm.geo.longitude != null
      ? `${vm.geo.latitude},${vm.geo.longitude}`
      : [vm.geo.cityLabel, vm.geo.countryIso].filter(Boolean).join(', ');
    const url = 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(origin) +
      '&destination=' + encodeURIComponent(to) + '&travelmode=' + encodeURIComponent(mode);
    window.open(url, '_blank', 'noopener');
  });
}

/* Up to four published listings of the same country and type, priced
   within ±30 % of this one, closest price first. */
async function renderSimilarListings(vm) {
  const root = document.getElementById('similar-listings-root');
  const services = window.ZFindServices;
  if (!root || !services || !services.search) return;
  const price = Number(vm.listing.priceCurrent);
  if (!(price > 0)) return;
  let result;
  try { result = await services.search.listPublished(); } catch (_) { return; }
  if (state.view !== 'property' || !document.body.contains(root)) return;
  const rows = (result && Array.isArray(result.data) ? result.data : []).filter(row => {
    const rep = (row.representations || [])[0];
    const listing = rep && (rep.listings || [])[0];
    if (!listing || row.id === vm.asset.id) return false;
    if ((row.zones_lite || {}).country_iso !== vm.geo.countryIso) return false;
    if (row.subtype !== vm.asset.subtype) return false;
    if ((listing.transaction_type || 'sale') !== vm.listing.transactionType) return false;
    const p = Number(listing.price_current);
    return p >= price * 0.7 && p <= price * 1.3;
  }).sort((a, b) => Math.abs(a.representations[0].listings[0].price_current - price) - Math.abs(b.representations[0].listings[0].price_current - price))
    .slice(0, 4);
  if (!rows.length) return;
  const cards = rows.map(row => Object.assign(mapSupabasePropertyRowToCard(row, state.lang), {
    imageUrl: undefined,
    imageMedia: ((row.representations[0].listings[0] || {}).listing_media) || []
  }));
  await resolveCardImages(cards);
  if (state.view !== 'property' || !document.body.contains(root)) return;
  root.innerHTML = `<div class="section-title">${listingCopy().similarTitle}</div><div class="cards-grid">${cards.map(cardHTML).join('')}</div>`;
  root.hidden = false;
}

async function renderProperty(assetId) {
  document.getElementById('property-root').innerHTML = propertyStatusHTML('home.loadingTitle', 'home.loadingBody');

  const result = await loadPropertyDetail(assetId, state.lang);

  if (result.notFound) {
    document.getElementById('property-root').innerHTML = propertyStatusHTML('property.notFoundTitle', 'property.notFoundBody');
    return;
  }
  if (result.error) {
    console.error('Property load failed:', result.error);
    document.getElementById('property-root').innerHTML = propertyStatusHTML('home.errorTitle', 'home.errorBody');
    return;
  }

  const vm = result.viewModel;
  const L = state.lang;
  const isRentalListing = vm.listing.transactionType === 'rent';
  document.title = vm.content.title ? (vm.content.title + ' — Z Find') : document.title; // minimal SEO hygiene — see report for what this sprint does/doesn't cover
  const repNote = vm.representationNote.multiple
    ? `<div class="rep-history">${t(L,'property.nowRepresented',{partner:vm.representationNote.activePartner, start:vm.representationNote.activeSince})}</div>`
    : '';
  const galleryStyle = vm.media[0] ? `background-image:url('${vm.media[0].url}'); background-size:cover; background-position:center;` : '';
  const galleryAlt = vm.media[0] ? vm.media[0].altText : '';

  document.getElementById('property-root').innerHTML = `
  <div class="wrap" style="padding-top:20px;">
    <a href="#" onclick="navigateBackToSearchResults();return false;" class="btn-ghost" style="font-size:0.82rem;">${t(L,'common.backToResults')}</a>
  </div>
  <div class="detail-hero">
    <div class="wrap">
      <span class="eyebrow">${[vm.asset.typology, vm.geo.locationLabel].filter(Boolean).join(' · ')}</span>
      <h1>${vm.content.title}</h1>
      <div class="loc-row"><span style="cursor:pointer; text-decoration:underline; text-underline-offset:3px;" onclick="navigate('search',null,{q:'${(vm.geo.zoneLabel||vm.geo.cityLabel).replace(/'/g,"\\'")}'})">${vm.geo.zoneLabel || vm.geo.cityLabel}</span><span>·</span><span>${vm.asset.areaSqm} m²</span><span>·</span><span class="tag tag-verified">${t(L,'property.singleRepresentation')}</span></div>
      <div class="price-tag">${vm.priceLabel}</div>
    </div>
  </div>
  <div class="wrap detail-layout">
    <div>
      <div class="gallery" style="${galleryStyle}" title="${galleryAlt}"></div>
      <div class="facts-grid">
        ${vm.facts.map(f => `<div class="fact"><div class="k">${t(L,f.labelKey)}</div><div class="v">${f.value}</div></div>`).join('')}
      </div>
      <div class="section-title">${t(L,'property.aboutTitle')}</div>
      <p style="color:var(--gray-700); line-height:1.7; font-size:0.95rem; margin-bottom:20px;">${vm.content.description}</p>
      ${repNote}

      <div class="section-title" style="margin-top:30px">${t(L,'property.marketTitle')}</div>
      <div class="info-card" id="listing-market-root">
        ${(vm.market && (vm.market.avgPriceZone || vm.market.priceThis || vm.market.trend || vm.market.comparables)) ? `
        ${vm.market.avgPriceZone ? `<div class="row"><span class="label">${t(L,'property.avgPriceZone')}</span><span class="val">${fmtCurrency(vm.market.avgPriceZone.value,L)}/m²</span></div>` : ''}
        ${vm.market.priceThis ? `<div class="row"><span class="label">${t(L,'property.priceThis')}</span><span class="val">${fmtCurrency(vm.market.priceThis.value,L)}/m²</span></div>` : ''}
        ${vm.market.trend ? `<div class="row"><span class="label">${t(L,'property.trend12m')}</span><span class="val">+${vm.market.trend.value}%</span></div>` : ''}
        ${vm.market.comparables ? `<div class="row"><span class="label">${t(L,'property.comparables')}</span><span class="val">${vm.market.comparables.value}</span></div>` : ''}
        ` : `<div class="row"><span class="label" style="color:var(--gray-400);">${t(L,'property.zIntelComingSoonBody')}</span></div>`}
      </div>

      ${vm.intelligence && !isRentalListing ? `
      <div class="section-title">${t(L,'property.investmentTitle')}</div>
      <div class="info-card">
        <div class="row"><span class="label">${t(L,'property.estYield')}</span><span class="val">${vm.intelligence.low}% – ${vm.intelligence.high}%</span></div>
        <div class="row"><span class="label">${t(L,'property.estRent')}</span><span class="val">${fmtCurrency(vm.intelligence.rentLow,L)} – ${fmtCurrency(vm.intelligence.rentHigh,L)}</span></div>
      </div>` : ''}
    </div>
    <div>
      <div class="sidebar-sticky">
      ${isRentalListing ? '' : financingCardHTML(vm)}
      <div class="sidebar-card">
        <h4>${t(L,'property.representedBy')}</h4>
        <div style="display:flex; gap:12px; align-items:center; ${vm.partner.id ? 'cursor:pointer;' : ''}" ${vm.partner.id ? `onclick="navigate('partner','${vm.partner.id}')"` : ''}>
          <div style="width:46px;height:46px;border-radius:50%;background:var(--gray-200)"></div>
          <div><div style="font-family:'Cormorant Garamond'; font-size:1.1rem">${vm.partner.name}</div><div class="trust-chip" style="${vm.trust ? '' : 'color:var(--gray-400); background:var(--gray-100); border-color:var(--gray-200);'}">${vm.trust ? vm.trust.label : t(L,'property.trustComingSoon')}</div></div>
        </div>
        <div id="listing-reviews-root"></div>
        <button class="btn btn-gold" style="width:100%; margin-top:20px; justify-content:center" onclick="openModal('${vm.listing.id}', ${JSON.stringify(vm.partner.enquiryPolicy).replace(/"/g,'&quot;')}, '${vm.partner.id}')">${t(L,'property.contactBtn')}</button>
        <button class="btn btn-outline" style="width:100%; margin-top:10px; justify-content:center">${t(L,'property.saveBtn')}</button>
      </div>
      ${travelCardHTML(vm)}
      </div>
    </div>
  </div>
  <section class="wrap similar-listings" id="similar-listings-root" hidden></section>`;
  renderListingMarketContext(vm);
  bindFinancingCard(vm);
  bindTravelCard(vm);
  renderSimilarListings(vm);
  renderListingReviews(vm);
}

/* ---------------- Development detail ---------------- */
async function renderDevelopment(assetId) {
  document.getElementById('development-root').innerHTML = detailStatusHTML('home.loadingTitle', 'home.loadingBody');

  const result = await loadDevelopmentDetail(assetId, state.lang);

  if (result.notFound) {
    document.getElementById('development-root').innerHTML = detailStatusHTML('property.notFoundTitle', 'property.notFoundBody');
    return;
  }
  if (result.error) {
    console.error('Development load failed:', result.error);
    document.getElementById('development-root').innerHTML = detailStatusHTML('home.errorTitle', 'home.errorBody');
    return;
  }

  const vm = result.viewModel;
  const L = state.lang;
  document.title = vm.content.title ? (vm.content.title + ' — Z Find') : document.title;
  // CTO correction: units no longer carry any status field at all —
  // "published" never proved commercial availability. The table's
  // status column now shows a neutral CTA instead (see below).
  const selectedUnitId = (state.query && state.query.unit) || null;
  const selectedUnit = selectedUnitId ? vm.units.find(u => u.id === selectedUnitId) : null;
  const galleryStyle = vm.media[0] ? `background-image:url('${vm.media[0].url}'); background-size:cover; background-position:center;` : '';
  const galleryAlt = vm.media[0] ? vm.media[0].altText : '';

  document.getElementById('development-root').innerHTML = `
  <div class="wrap" style="padding-top:20px;">
    <a href="#" onclick="navigateBackToSearchResults();return false;" class="btn-ghost" style="font-size:0.82rem;">${t(L,'common.backToResults')}</a>
  </div>
  <div class="detail-hero">
    <div class="wrap">
      <span class="eyebrow">${t(L,'navigation.development')} · ${vm.geo.zoneLabel || vm.geo.cityLabel}, ${vm.geo.countryLabel}</span>
      <h1>${vm.content.title}</h1>
      <div class="loc-row"><span style="cursor:pointer; text-decoration:underline; text-underline-offset:3px;" onclick="navigate('search',null,{q:'${(vm.geo.zoneLabel||vm.geo.cityLabel).replace(/'/g,"\\'")}'})">${vm.geo.zoneLabel || vm.geo.cityLabel}, ${vm.geo.cityLabel}</span><span>·</span><span>${t(L,'development.totalUnits',{n:vm.units.length})}</span></div>
      <div class="price-tag">${vm.priceLabel}</div>
    </div>
  </div>
  <div class="wrap" style="padding-top:48px;padding-bottom:48px">
    <div class="gallery" style="${galleryStyle}" title="${galleryAlt}"></div>
    <p style="color:var(--gray-700); line-height:1.7; font-size:0.95rem; margin-bottom:36px; max-width:760px;">${vm.content.description}</p>
    <div class="facts-grid" style="margin-bottom:40px">
      <div class="fact"><div class="k">${t(L,'development.developer')}</div><div class="v" ${vm.partner.id ? `style="cursor:pointer;" onclick="navigate('partner','${vm.partner.id}')"` : ''}>${vm.partner.name}</div></div>
      <div class="fact"><div class="k">${t(L,'development.units')}</div><div class="v">${vm.units.length}</div></div>
      <div class="fact"><div class="k">${t(L,'development.typologies')}</div><div class="v">${[...new Set(vm.units.map(u=>u.typology))].join(', ')}</div></div>
    </div>

    <div class="section-title">${t(L,'development.availableUnits')}</div>
    <div class="units-table-wrap">
    <table class="units-table">
      <thead><tr><th>${t(L,'development.colUnit')}</th><th>${t(L,'development.colTypology')}</th><th>${t(L,'development.colArea')}</th><th>${t(L,'development.colFloor')}</th><th>${t(L,'development.colPrice')}</th><th>${t(L,'development.colStatus')}</th><th></th></tr></thead>
      <tbody>
        ${vm.units.map(u => `<tr style="cursor:pointer;" onclick="selectUnit('${assetId}','${u.id}')"><td>${u.id}</td><td>${u.typology||''}</td><td>${u.areaSqm||''} m²</td><td>${u.floor||''}</td><td>${u.priceLabel}</td><td><span class="status-dot">${t(L,'development.unitEnquireLabel')}</span></td><td><button class="btn btn-outline" style="padding:8px 16px" onclick="event.stopPropagation(); selectUnit('${assetId}','${u.id}')">${t(L,'development.view')}</button></td></tr>`).join('')}
      </tbody>
    </table>
    </div>

    ${selectedUnit ? `
    <div class="scenario-card" style="margin-top:28px; border-color:var(--gold);">
      <div class="top"><h4>${t(L,'development.unitDetailTitle',{unit:selectedUnit.id})}</h4><span class="close-x" style="position:static; font-size:1.2rem;" onclick="clearUnit('${assetId}')">&times;</span></div>
      <div class="facts-grid" style="margin-top:16px; margin-bottom:0;">
        <div class="fact"><div class="k">${t(L,'development.colTypology')}</div><div class="v">${selectedUnit.typology||''}</div></div>
        <div class="fact"><div class="k">${t(L,'development.colArea')}</div><div class="v">${selectedUnit.areaSqm||''} m²</div></div>
        <div class="fact"><div class="k">${t(L,'development.colFloor')}</div><div class="v">${selectedUnit.floor||''}</div></div>
        <div class="fact"><div class="k">${t(L,'development.colPrice')}</div><div class="v">${selectedUnit.priceLabel}</div></div>
      </div>
      <button class="btn btn-gold" style="margin-top:20px;" onclick="openModal('${vm.listing.id}', ${JSON.stringify(vm.partner.enquiryPolicy).replace(/"/g,'&quot;')}, '${vm.partner.id}')">${t(L,'development.enquireAboutUnit')}</button>
    </div>` : ''}

    <div class="section-title" style="margin-top:40px">${t(L,'property.marketTitle')}</div>
    <div class="info-card">
      ${(vm.market && (vm.market.avgPriceZone || vm.market.priceThis || vm.market.trend || vm.market.comparables)) ? '' : `<div class="row"><span class="label" style="color:var(--gray-400);">${t(L,'property.zIntelComingSoonBody')}</span></div>`}
    </div>


    <div style="margin-top:20px; display:flex; align-items:center; gap:12px;">
      <div style="font-family:'Cormorant Garamond'; font-size:1.1rem">${t(L,'property.representedBy')}: ${vm.partner.name}</div>
      <div class="trust-chip" style="${vm.trust ? '' : 'color:var(--gray-400); background:var(--gray-100); border-color:var(--gray-200);'}">${vm.trust ? vm.trust.label : t(L,'property.trustComingSoon')}</div>
    </div>

    <div class="detail-actions-row" style="margin-top:40px; display:flex; gap:16px;">
      <button class="btn btn-gold" onclick="openModal('${vm.listing.id}', ${JSON.stringify(vm.partner.enquiryPolicy).replace(/"/g,'&quot;')}, '${vm.partner.id}')">${t(L,'development.enquireBtn')}</button>
      <button class="btn btn-outline">${t(L,'development.brochureBtn')}</button>
    </div>
  </div>`;
}

function selectUnit(devId, unitId) {
  navigate('development', devId, Object.assign({}, state.query, { unit: unitId }));
}
function clearUnit(devId) {
  const q = Object.assign({}, state.query); delete q.unit;
  navigate('development', devId, q);
}

/* ---------------- Land detail ---------------- */
async function renderLand(assetId) {
  const root = document.getElementById('land-root');
  root.innerHTML = detailStatusHTML('home.loadingTitle', 'home.loadingBody');

  const result = await loadLandDetail(assetId, state.lang);

  if (result.notFound) {
    root.innerHTML = detailStatusHTML(
      'property.notFoundTitle',
      'property.notFoundBody'
    );
    return;
  }

  if (result.error) {
    console.error('Land load failed:', result.error);
    root.innerHTML = detailStatusHTML('home.errorTitle', 'home.errorBody');
    return;
  }

  const vm = result.viewModel;
  const L = state.lang;

  document.title = vm.content.title
    ? (vm.content.title + ' — Z Find')
    : document.title;

  const galleryStyle = vm.media[0]
    ? `background-image:url('${vm.media[0].url}'); background-size:cover; background-position:center;`
    : '';

  const galleryAlt = vm.media[0] ? vm.media[0].altText : '';

  const displayAreaSqm =
    vm.asset.plotAreaSqm != null
      ? vm.asset.plotAreaSqm
      : vm.asset.areaSqm;

  const areaHTML = displayAreaSqm != null
    ? `<span>·</span><span>${fmtNumber(displayAreaSqm, L)} m²</span>`
    : '';

  const factualHTML = vm.facts && vm.facts.length
    ? `
      <div class="section-title" id="land-known-facts">
        ${t(L,'land.knownFacts')} ${statusTag('fact')}
      </div>
      <div class="info-card">
        ${vm.facts.map(f => `
          <div class="row">
            <span class="label">${t(L,f.labelKey)}</span>
            <span class="val">${f.value}</span>
          </div>
        `).join('')}
      </div>
    `
    : '';

  root.innerHTML = `
  <div class="wrap" style="padding-top:20px;">
    <a href="#" onclick="navigateBackToSearchResults();return false;" class="btn-ghost" style="font-size:0.82rem;">${t(L,'common.backToResults')}</a>
  </div>

  <div class="detail-hero">
    <div class="wrap">
      <span class="eyebrow">${t(L,'navigation.land')} · ${vm.geo.zoneLabel || vm.geo.cityLabel}, ${vm.geo.countryLabel}</span>
      <h1>${vm.content.title}</h1>
      <div class="loc-row">
        <span
          style="cursor:pointer; text-decoration:underline; text-underline-offset:3px;"
          onclick="navigate('search',null,{q:'${(vm.geo.zoneLabel||vm.geo.cityLabel).replace(/'/g,"\'")}'})"
        >${vm.geo.zoneLabel || vm.geo.cityLabel}</span>
        ${areaHTML}
        <span>·</span>
        <span class="tag tag-verified">${t(L,'property.singleRepresentation')}</span>
      </div>
      <div class="price-tag">${vm.priceLabel}</div>
    </div>
  </div>

  <div class="wrap detail-layout">
    <div>
      <div class="gallery" style="${galleryStyle}" title="${galleryAlt}"></div>

      ${factualHTML}

      <div class="section-title">${t(L,'property.aboutTitle')}</div>
      <p style="color:var(--gray-700); line-height:1.7; font-size:0.95rem; margin-bottom:20px;">
        ${vm.content.description || ''}
      </p>



      <div class="section-title">${t(L,'property.investmentTitle')}</div>
      <div class="info-card">
        <div class="row">
          <span class="label" style="color:var(--gray-400);">
            ${t(L,'property.zIntelInvestmentComingSoonBody')}
          </span>
        </div>
      </div>
    </div>

    <div>
      <div class="sidebar-sticky">
        <div class="sidebar-card">
          <h4>${t(L,'property.representedBy')}</h4>

          <div
            style="display:flex; gap:12px; align-items:center; ${vm.partner.id ? 'cursor:pointer;' : ''}"
            ${vm.partner.id ? `onclick="navigate('partner','${vm.partner.id}')"` : ''}
          >
            <div style="width:46px;height:46px;border-radius:50%;background:var(--gray-200)"></div>
            <div>
              <div style="font-family:'Cormorant Garamond'; font-size:1.1rem">
                ${vm.partner.name}
              </div>
              <div
                class="trust-chip"
                style="color:var(--gray-400); background:var(--gray-100); border-color:var(--gray-200);"
              >
                ${t(L,'property.trustComingSoon')}
              </div>
            </div>
          </div>

          <button
            class="btn btn-gold"
            style="width:100%; margin-top:20px; justify-content:center"
            onclick="openModal('${vm.listing.id}', ${JSON.stringify(vm.partner.enquiryPolicy).replace(/"/g,'&quot;')}, '${vm.partner.id}')"
          >
            ${t(L,'property.contactBtn')}
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

/* ---------------- Partner profile ---------------- */
async function renderPartner(partnerId) {
  const root = document.getElementById('partner-root');
  const L = state.lang;

  root.innerHTML = detailStatusHTML('home.loadingTitle', 'home.loadingBody');

  if (!partnerId) {
    root.innerHTML = detailStatusHTML(
      'partner.unavailableTitle',
      'partner.unavailableBody'
    );
    return;
  }

  const result = await loadPartnerDetail(partnerId, L);

  if (result.notFound) {
    root.innerHTML = detailStatusHTML(
      'partner.unavailableTitle',
      'partner.unavailableBody'
    );
    return;
  }

  if (result.error) {
    console.error('Partner load failed:', result.error);
    root.innerHTML = detailStatusHTML('home.errorTitle', 'home.errorBody');
    return;
  }

  const vm = result.viewModel;

  document.title = vm.partner.name
    ? (vm.partner.name + ' — Z Find')
    : document.title;

  const avatarStyle = vm.partner.logoUrl
    ? `style="background-image:url('${vm.partner.logoUrl}'); background-size:contain; background-position:center; background-repeat:no-repeat;"`
    : '';

  const cardsHTML = vm.cards.length
    ? vm.cards.map(cardHTML).join('')
    : `<div class="empty-state">${t(L,'partner.noOpportunities')}</div>`;

  root.innerHTML = `
  <div class="wrap">
    <div class="partner-header">
      <div class="partner-avatar" ${avatarStyle}></div>
      <div>
        <h1 style="font-size:2rem">${vm.partner.name}</h1>
        ${vm.trust ? `<div class="trust-chip">${vm.trust.label}</div>` : ''}
        <div class="partner-stats">
          <div><b>${vm.counts.total}</b>${t(L,'partner.activeOpportunities')}</div>
          <div><b>${vm.counts.developments}</b>${t(L,'partner.developments')}</div>
          <div><b>${vm.counts.land}</b>${t(L,'partner.landOpportunities')}</div>
          ${vm.avgResponse != null ? `<div><b>${vm.avgResponse} hrs</b>${t(L,'partner.avgResponse')}</div>` : ''}
        </div>
      </div>
    </div>
    <section class="block">
      <div class="tabs-row">
        <button class="pill active" data-filter="all" data-i18n="partner.filterAll"></button>
      </div>
      <div class="grid">${cardsHTML}</div>
    </section>
    <div id="partner-reviews-root"></div>
  </div>`;
  renderPartnerReviews(partnerId);

  const allPill = document.querySelector('#partner-root .pill');
  if (allPill) {
    allPill.textContent = t(L, 'partner.filterAll', { n: vm.counts.total });
  }
}

/** Acquisition-cost simulator — IMT + Imposto do Selo, rules-based,
    never speculative (see services/simulator.js's own extensive
    sourcing/scope documentation). Country-aware from the UI down:
    the country dropdown is built from supportedCountries(), not
    hardcoded to Portugal, even though only Portugal has real rules
    implemented today — adding a second country never requires
    touching this render function. */
function renderEstimation() {
  const root = document.getElementById('estimation-root');
  const page = window.ZFindServices && window.ZFindServices.estimationPage;
  if (!root || !page) return;
  page.render(root, state.lang, state.query || {});
}

function renderSimulator() {
  const L = state.lang;
  const countries = window.ZFindServices.simulator.supportedCountries();
  document.getElementById('simulator-root').innerHTML = `
  <div class="wrap" style="padding-top:48px;padding-bottom:48px; max-width:640px;">
    <div style="display:flex; gap:8px; margin-bottom:28px; border-bottom:1px solid var(--gray-200);">
      <button class="sim-tab-btn active" data-tab="costs" onclick="switchSimulatorTab('costs')" style="padding:10px 4px; margin-right:20px; border:none; background:none; font-size:0.95rem; font-weight:600; cursor:pointer; border-bottom:2px solid var(--gold);">${t(L,'simulator.tabCosts')}</button>
      <button class="sim-tab-btn" data-tab="yield" onclick="switchSimulatorTab('yield')" style="padding:10px 4px; border:none; background:none; font-size:0.95rem; font-weight:600; cursor:pointer; border-bottom:2px solid transparent; color:var(--gray-400);">${t(L,'simulator.tabYield')}</button>
    </div>

    <div id="sim-tab-costs">
      <h1 style="font-size:1.8rem; margin-bottom:8px;">${t(L,'simulator.title')}</h1>
      <p style="color:var(--gray-500); margin-bottom:28px; font-size:0.9rem;">${t(L,'simulator.subtitle')}</p>
      <div class="form-field" style="margin-bottom:14px;">
        <label style="display:block; font-size:0.78rem; font-weight:600; margin-bottom:4px;">${t(L,'simulator.country')}</label>
        <select id="sim-country" style="width:100%; padding:9px 10px; border:1px solid var(--gray-200); border-radius:6px;">
          ${countries.map(c => `<option value="${c.iso}">${c.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-field" style="margin-bottom:14px;">
        <label style="display:block; font-size:0.78rem; font-weight:600; margin-bottom:4px;">${t(L,'simulator.propertyValue')}</label>
        <input type="number" id="sim-value" placeholder="250000" style="width:100%; padding:9px 10px; border:1px solid var(--gray-200); border-radius:6px;">
      </div>
      <div style="margin-bottom:10px;"><label style="font-size:0.85rem;"><input type="checkbox" id="sim-hpp" checked> ${t(L,'simulator.isHPP')}</label></div>
      <div style="margin-bottom:20px;"><label style="font-size:0.85rem;"><input type="checkbox" id="sim-resident" checked> ${t(L,'simulator.isResident')}</label></div>
      <button class="btn btn-gold" onclick="runSimulator()">${t(L,'simulator.calculate')}</button>
      <div id="sim-result" style="margin-top:24px;"></div>
    </div>

    <div id="sim-tab-yield" style="display:none;"></div>
  </div>`;
}

function switchSimulatorTab(tab) {
  document.querySelectorAll('.sim-tab-btn').forEach(b => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('active', active);
    b.style.borderBottomColor = active ? 'var(--gold)' : 'transparent';
    b.style.color = active ? '' : 'var(--gray-400)';
  });
  document.getElementById('sim-tab-costs').style.display = tab === 'costs' ? '' : 'none';
  document.getElementById('sim-tab-yield').style.display = tab === 'yield' ? '' : 'none';
  if (tab === 'yield' && !document.getElementById('sim-tab-yield').dataset.rendered) {
    renderRentabilitySimulator();
    document.getElementById('sim-tab-yield').dataset.rendered = '1';
  }
}

function runSimulator() {
  const countryIso = document.getElementById('sim-country').value;
  const propertyValue = Number(document.getElementById('sim-value').value);
  const isHPP = document.getElementById('sim-hpp').checked;
  const isResident = document.getElementById('sim-resident').checked;
  const L = state.lang;
  const resultEl = document.getElementById('sim-result');

  const result = window.ZFindServices.simulator.calculateAcquisitionCosts(countryIso, { propertyValue, isHPP, isResident });

  if (result.error) {
    resultEl.innerHTML = `<div style="padding:14px 16px; background:#fdf0f0; color:#a33; border-radius:6px; font-size:0.85rem;">${escapeHtmlSim(result.error.message)}</div>`;
    return;
  }
  const d = result.data;
  resultEl.innerHTML = `
    <div style="padding:20px; background:var(--gray-50); border-radius:8px;">
      <div style="display:flex; justify-content:space-between; padding:6px 0; font-size:0.9rem;"><span>${t(L,'simulator.imt')}</span><span>${fmtCurrency(d.imt,L,'EUR')}</span></div>
      <div style="display:flex; justify-content:space-between; padding:6px 0; font-size:0.9rem;"><span>${t(L,'simulator.stampDuty')}</span><span>${fmtCurrency(d.stampDuty,L,'EUR')}</span></div>
      <div style="display:flex; justify-content:space-between; padding:10px 0 0; margin-top:8px; border-top:1px solid var(--gray-200); font-weight:700;"><span>${t(L,'simulator.total')}</span><span>${fmtCurrency(d.total,L,'EUR')}</span></div>
    </div>
    <p style="font-size:0.78rem; color:var(--gray-500); margin-top:14px;">${escapeHtmlSim(d.scope)}</p>
    ${d.warnings.map(w => `<p style="font-size:0.78rem; color:#a37a00; margin-top:8px;">⚠ ${escapeHtmlSim(w)}</p>`).join('')}
    <p style="font-size:0.75rem; color:var(--gray-400); margin-top:14px;">${escapeHtmlSim(d.disclaimer)}</p>
  `;
}

/** Rental yield / profitability simulator — the person supplies every
    assumption (price, rent/daily-rate, costs), this only does
    transparent arithmetic on them. Acquisition costs and the IRS rate
    on rental income are REQUIRED inputs here, not computed internally
    — see services/rentability.js's header for exactly why (both had
    genuinely uncertain/conflicting real-world figures found while
    researching this feature; asserting one with false confidence was
    rejected the same way an earlier, different overconfident claim
    was rejected in PRODUCT-AUDIT-V1.md). */
function renderRentabilitySimulator() {
  const L = state.lang;
  const root = document.getElementById('sim-tab-yield');
  root.innerHTML = `
    <h1 style="font-size:1.8rem; margin-bottom:8px;">${t(L,'yieldSim.title')}</h1>
    <p style="color:var(--gray-500); margin-bottom:20px; font-size:0.9rem;">${t(L,'yieldSim.subtitle')}</p>

    <div style="display:flex; gap:8px; margin-bottom:20px;">
      <button class="yield-mode-btn active" data-mode="al" onclick="switchYieldMode('al')" style="flex:1; padding:9px; border:1px solid var(--gray-200); border-radius:6px; background:var(--gold); color:#fff; cursor:pointer; font-size:0.85rem;">${t(L,'yieldSim.modeAL')}</button>
      <button class="yield-mode-btn" data-mode="ald" onclick="switchYieldMode('ald')" style="flex:1; padding:9px; border:1px solid var(--gray-200); border-radius:6px; background:none; cursor:pointer; font-size:0.85rem;">${t(L,'yieldSim.modeALD')}</button>
    </div>

    <div class="form-field" style="margin-bottom:12px;"><label style="display:block; font-size:0.78rem; font-weight:600; margin-bottom:4px;">${t(L,'yieldSim.propertyValue')}</label><input type="number" id="ys-value" placeholder="250000" style="width:100%; padding:9px 10px; border:1px solid var(--gray-200); border-radius:6px;"></div>
    <div class="form-field" style="margin-bottom:12px;"><label style="display:block; font-size:0.78rem; font-weight:600; margin-bottom:4px;">${t(L,'yieldSim.renovation')}</label><input type="number" id="ys-works" placeholder="0" style="width:100%; padding:9px 10px; border:1px solid var(--gray-200); border-radius:6px;"></div>
    <div class="form-field" style="margin-bottom:16px;">
      <label style="display:block; font-size:0.78rem; font-weight:600; margin-bottom:4px;">${t(L,'yieldSim.acquisitionCosts')}</label>
      <input type="number" id="ys-acq-costs" placeholder="0" style="width:100%; padding:9px 10px; border:1px solid var(--gray-200); border-radius:6px;">
      <p style="font-size:0.72rem; color:var(--gray-400); margin-top:4px;">${t(L,'yieldSim.acquisitionCostsNote')} <a href="#" onclick="switchSimulatorTab('costs'); return false;" style="color:var(--gold);">${t(L,'yieldSim.acquisitionCostsLink')}</a></p>
    </div>

    <div id="ys-mode-al">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
        <div class="form-field"><label style="display:block; font-size:0.78rem; font-weight:600; margin-bottom:4px;">${t(L,'yieldSim.dailyRate')}</label><input type="number" id="ys-daily" placeholder="100" style="width:100%; padding:9px 10px; border:1px solid var(--gray-200); border-radius:6px;"></div>
        <div class="form-field"><label style="display:block; font-size:0.78rem; font-weight:600; margin-bottom:4px;">${t(L,'yieldSim.occupancy')}</label><input type="number" id="ys-occ" placeholder="65" style="width:100%; padding:9px 10px; border:1px solid var(--gray-200); border-radius:6px;"></div>
        <div class="form-field"><label style="display:block; font-size:0.78rem; font-weight:600; margin-bottom:4px;">${t(L,'yieldSim.platformFee')}</label><input type="number" id="ys-platform-fee" placeholder="15" style="width:100%; padding:9px 10px; border:1px solid var(--gray-200); border-radius:6px;"></div>
        <div class="form-field"><label style="display:block; font-size:0.78rem; font-weight:600; margin-bottom:4px;">${t(L,'yieldSim.managementFee')}</label><input type="number" id="ys-mgmt-fee" placeholder="20" style="width:100%; padding:9px 10px; border:1px solid var(--gray-200); border-radius:6px;"></div>
        <div class="form-field"><label style="display:block; font-size:0.78rem; font-weight:600; margin-bottom:4px;">${t(L,'yieldSim.utilitiesMonthly')}</label><input type="number" id="ys-utilities" placeholder="80" style="width:100%; padding:9px 10px; border:1px solid var(--gray-200); border-radius:6px;"></div>
      </div>
    </div>
    <div id="ys-mode-ald" style="display:none;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
        <div class="form-field"><label style="display:block; font-size:0.78rem; font-weight:600; margin-bottom:4px;">${t(L,'yieldSim.monthlyRent')}</label><input type="number" id="ys-rent" placeholder="1200" style="width:100%; padding:9px 10px; border:1px solid var(--gray-200); border-radius:6px;"></div>
        <div class="form-field"><label style="display:block; font-size:0.78rem; font-weight:600; margin-bottom:4px;">${t(L,'yieldSim.voidMonths')}</label><input type="number" id="ys-void" placeholder="1" style="width:100%; padding:9px 10px; border:1px solid var(--gray-200); border-radius:6px;"></div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
      <div class="form-field"><label style="display:block; font-size:0.78rem; font-weight:600; margin-bottom:4px;">${t(L,'yieldSim.condoMonthly')}</label><input type="number" id="ys-condo" placeholder="50" style="width:100%; padding:9px 10px; border:1px solid var(--gray-200); border-radius:6px;"></div>
      <div class="form-field">
        <label style="display:block; font-size:0.78rem; font-weight:600; margin-bottom:4px;">${t(L,'yieldSim.irsRate')}</label>
        <input type="number" id="ys-irs" placeholder="28" style="width:100%; padding:9px 10px; border:1px solid var(--gray-200); border-radius:6px;">
      </div>
    </div>
    <p style="font-size:0.72rem; color:var(--gray-400); margin:-6px 0 16px;">${t(L,'yieldSim.irsRateNote')}</p>

    <div style="margin-bottom:10px;"><label style="font-size:0.85rem;"><input type="checkbox" id="ys-has-loan" onchange="document.getElementById('ys-loan-fields').style.display=this.checked?'grid':'none'"> ${t(L,'yieldSim.hasLoan')}</label></div>
    <div id="ys-loan-fields" style="display:none; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:16px;">
      <div class="form-field"><label style="display:block; font-size:0.78rem; font-weight:600; margin-bottom:4px;">${t(L,'yieldSim.loanAmount')}</label><input type="number" id="ys-loan-amount" placeholder="200000" style="width:100%; padding:9px 10px; border:1px solid var(--gray-200); border-radius:6px;"></div>
      <div class="form-field"><label style="display:block; font-size:0.78rem; font-weight:600; margin-bottom:4px;">${t(L,'yieldSim.loanRate')}</label><input type="number" id="ys-loan-rate" placeholder="3.5" style="width:100%; padding:9px 10px; border:1px solid var(--gray-200); border-radius:6px;"></div>
      <div class="form-field"><label style="display:block; font-size:0.78rem; font-weight:600; margin-bottom:4px;">${t(L,'yieldSim.loanYears')}</label><input type="number" id="ys-loan-years" placeholder="30" style="width:100%; padding:9px 10px; border:1px solid var(--gray-200); border-radius:6px;"></div>
    </div>

    <button class="btn btn-gold" onclick="runRentabilitySimulator()">${t(L,'yieldSim.calculate')}</button>
    <div id="ys-result" style="margin-top:24px;"></div>
  `;
}

function switchYieldMode(mode) {
  document.querySelectorAll('.yield-mode-btn').forEach(b => {
    const active = b.dataset.mode === mode;
    b.classList.toggle('active', active);
    b.style.background = active ? 'var(--gold)' : 'none';
    b.style.color = active ? '#fff' : '';
  });
  document.getElementById('ys-mode-al').style.display = mode === 'al' ? '' : 'none';
  document.getElementById('ys-mode-ald').style.display = mode === 'ald' ? '' : 'none';
}

function runRentabilitySimulator() {
  const L = state.lang;
  const val = id => Number(document.getElementById(id)?.value) || 0;
  const mode = document.querySelector('.yield-mode-btn.active').dataset.mode;
  const hasLoan = document.getElementById('ys-has-loan').checked;
  const common = {
    propertyValue: val('ys-value'), renovationCosts: val('ys-works'), acquisitionCosts: val('ys-acq-costs'),
    condoMonthly: val('ys-condo'), irsRatePercent: val('ys-irs'),
    hasLoan, loanAmount: val('ys-loan-amount'), loanRatePercent: val('ys-loan-rate'), loanYears: val('ys-loan-years'),
  };
  const d = mode === 'al'
    ? window.ZFindServices.rentability.calculateAL({ ...common, dailyRate: val('ys-daily'), occupancyPercent: val('ys-occ'), platformFeePercent: val('ys-platform-fee'), managementFeePercent: val('ys-mgmt-fee'), utilitiesMonthly: val('ys-utilities') })
    : window.ZFindServices.rentability.calculateALD({ ...common, monthlyRent: val('ys-rent'), voidMonthsPerYear: val('ys-void') });

  const row = (label, value) => `<div style="display:flex; justify-content:space-between; padding:6px 0; font-size:0.9rem;"><span>${label}</span><span>${value}</span></div>`;
  document.getElementById('ys-result').innerHTML = `
    <div style="padding:20px; background:var(--gray-50); border-radius:8px;">
      ${row(t(L,'yieldSim.grossYield'), d.grossYieldPercent != null ? d.grossYieldPercent + '%' : '—')}
      ${row(t(L,'yieldSim.netYield'), d.netYieldPercent != null ? d.netYieldPercent + '%' : '—')}
      ${row(t(L,'yieldSim.cashFlow'), fmtCurrency(d.cashFlow, L, 'EUR'))}
      ${row(t(L,'yieldSim.cashOnCash'), d.cashOnCashPercent != null ? d.cashOnCashPercent + '%' : '—')}
      ${row(t(L,'yieldSim.payback'), d.paybackYears != null ? d.paybackYears + ' ' + t(L,'yieldSim.years') : '—')}
      <div style="border-top:1px solid var(--gray-200); margin-top:8px; padding-top:10px;">
        ${row('NPV (10y @ 5%)', fmtCurrency(d.npv10yAt5pct, L, 'EUR'))}
        ${row('IRR (20y)', d.irr20yPercent != null ? d.irr20yPercent + '%' : t(L,'yieldSim.irrNoConverge'))}
      </div>
    </div>
    <p style="font-size:0.75rem; color:var(--gray-400); margin-top:14px;">${t(L,'yieldSim.disclaimer')}</p>
  `;
}
/** Derives the search results' location claim from the REAL data in
    front of the user, never a hardcoded city — Z Find is a global
    portal; a headline that always says "Porto" would misrepresent
    that the moment a second market has any inventory, and reinforces
    a single-city identity even while it's still accurate today.
    Returns '' (no location claim) when results span multiple cities
    or there are none — never picks one arbitrarily. */
function computeMarketLabel(cards) {
  if (!cards || !cards.length) return '';
  const cities = new Set(cards.map(c => c.cityLabel).filter(Boolean));
  if (cities.size !== 1) return '';
  return ' · ' + Array.from(cities)[0];
}

/** Live Zone view — different from scripts/generate-seo-pages.js's
    static output (that's for search engines; this is what a visitor
    actually sees clicking into a zone). Reuses loadSearchResults for
    the real listings (same card mapping as Search) and
    services/zones.js only for the zone lookup + honest stats. Never
    shows a misleading average on a small sample — same
    MIN_LISTINGS_FOR_STATS discipline as the static generator. */
async function renderZone(zoneId) {
  const root = document.getElementById('zone-root');
  const L = state.lang;
  if (!zoneId) { root.innerHTML = `<div class="wrap" style="padding-top:48px;padding-bottom:48px;">${t(L,'zone.notFound')}</div>`; return; }

  root.innerHTML = `<div class="wrap" style="padding-top:48px;padding-bottom:48px;">${t(L,'home.loadingTitle')}</div>`;

  const [zoneResult, searchResult] = await Promise.all([
    window.ZFindServices.zones.getZoneById(zoneId),
    loadSearchResults(L, { zoneLiteId: zoneId }),
  ]);

  if (zoneResult.error) {
    root.innerHTML = `<div class="wrap" style="padding-top:48px;padding-bottom:48px;">${t(L,'zone.notFound')}</div>`;
    return;
  }
  const zone = zoneResult.data;
  const cards = searchResult.cards || [];
  await resolveCardImages(cards);
  const stats = window.ZFindServices.zones.computeZoneStats(cards);
  const imagePath = window.ZFindServices.zoneImages.getZoneImagePath(zone.name);

  root.innerHTML = `
  <div class="wrap" style="padding-bottom:48px;">
    ${imagePath ? `<div style="width:100%; height:280px; overflow:hidden; margin-bottom:24px;"><img src="${imagePath}" alt="${zone.name}, ${zone.city}" style="width:100%; height:100%; object-fit:cover;"></div>` : ''}
    <h1 style="font-size:2rem; margin-bottom:6px;">${zone.name}, ${zone.city}</h1>
    <p style="color:var(--gray-500); margin-bottom:24px;">
      ${stats.hasEnoughForStats
        ? t(L, 'zone.statsSummary', { count: stats.listingCount, avgPrice: fmtCurrency(Math.round(stats.avgPrice), L, 'EUR') })
        : t(L, 'zone.thinInventory')}
    </p>
    <div class="cards-grid">${cards.map(cardHTML).join('')}</div>
    ${!cards.length ? `<p style="margin-top:20px;"><a href="#/${L}/search">${t(L,'zone.seeAllLink')}</a></p>` : ''}
  </div>`;
}

function escapeHtmlSim(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

/* ---------------- Enquiry modal ---------------- */
let currentEnquiryOption = null;
let currentEnquirySubmitting = false;
let currentPartnerIdForEnquiry = null;

/** Extracts utm_* parameters from the current route's query string —
    real values only, never fabricated; returns {} when none present. */
function extractUTMParams() {
  const utm = {};
  const q = state.query || {};
  Object.keys(q).forEach(key => { if (key.toLowerCase().startsWith('utm_') && q[key]) utm[key] = q[key]; });
  return utm;
}

function openModal(listingId, enquiryConfig, partnerId) {
  currentListingIdForEnquiry = listingId;
  currentPartnerIdForEnquiry = partnerId || null;
  // Supabase-backed detail pages pass their REAL listing_id and
  // Partner enquiry_policy directly. A caller that omits policy gets
  // only the conservative schema-aligned default — never fixture data.
  const cfg = enquiryConfig || DEFAULT_ENQUIRY_POLICY;
  // Sprint 1.6 final correction: 'assisted' can now be genuinely
  // selected AND rendered — previously it could be the silently
  // selected default with literally no visible option to click.
  currentEnquiryOption = cfg.direct ? 'direct' : (cfg.qualified ? 'qualified' : (cfg.assisted ? 'assisted' : 'direct'));
  currentEnquirySubmitting = false;
  const L = state.lang;
  let body = '<div class="contact-options">';
  if (cfg.direct) {
    body += `<div class="contact-opt ${currentEnquiryOption==='direct'?'selected':''}" data-opt="direct" onclick="selectOpt('direct')">
      <div class="row"><h5>${t(L,'enquiry.directTitle')}</h5><span class="eyebrow" style="color:var(--gray-400)">${t(L,'enquiry.noForms')}</span></div>
      <p>${t(L,'enquiry.directBody')}</p></div>`;
  }
  if (cfg.qualified) {
    body += `<div class="contact-opt ${currentEnquiryOption==='qualified'?'selected':''}" data-opt="qualified" onclick="selectOpt('qualified')">
      <div class="row"><h5>${t(L,'enquiry.qualifiedTitle')}</h5><span class="eyebrow">${t(L,'enquiry.recommended')}</span></div>
      <p>${t(L,'enquiry.qualifiedBody')}</p></div>`;
  }
  if (cfg.assisted) {
    body += `<div class="contact-opt ${currentEnquiryOption==='assisted'?'selected':''}" data-opt="assisted" onclick="selectOpt('assisted')">
      <div class="row"><h5>${t(L,'enquiry.assistedTitle')}</h5></div>
      <p>${t(L,'enquiry.assistedBody')}</p></div>`;
  }
  body += '</div>';
  const availableCount = [cfg.direct, cfg.qualified, cfg.assisted].filter(Boolean).length;
  if (availableCount === 1) {
    body += `<p class="direct-only-note">${t(L, cfg.qualified ? 'enquiry.qualifiedOnlyNote' : (cfg.assisted ? 'enquiry.assistedOnlyNote' : 'enquiry.directOnlyNote'))}</p>`;
  }
  body += `<div class="qual-form active" id="qual-form">
    <div id="qual-extra-fields" style="display:${currentEnquiryOption==='qualified'?'block':'none'}">
    <label>${t(L,'enquiry.lookingFor')}</label>
    <select id="enquiry-lookingfor"><option>${t(L,'enquiry.ownUse')}</option><option>${t(L,'enquiry.investment')}</option><option>${t(L,'enquiry.exploring')}</option></select>
    <label>${t(L,'enquiry.budgetRange')}</label>
    <select id="enquiry-budget"><option>€400,000+</option></select>
    <label>${t(L,'enquiry.timing')}</label>
    <select id="enquiry-timing"><option>${t(L,'enquiry.within3')}</option><option>${t(L,'enquiry.months3to6')}</option><option>${t(L,'enquiry.noTimeline')}</option></select>
    </div>
    <label>${t(L,'enquiry.yourName')}</label>
    <input type="text" id="enquiry-name" placeholder="${t(L,'enquiry.fullName')}">
    <label>${t(L,'enquiry.emailLabel')}</label>
    <input type="text" id="enquiry-email" placeholder="${t(L,'enquiry.emailPh')}">
    <label>${t(L,'enquiry.phoneLabel')}</label>
    <input type="text" id="enquiry-phone" placeholder="${t(L,'enquiry.phonePh')}">
    <p style="font-size:0.75rem; color:var(--gray-400); margin-top:-8px;">${t(L,'enquiry.atLeastOneNote')}</p>
    ${(partnerId && partnerId !== 'null' && partnerId !== 'undefined') ? `<label class="enquiry-review-optin"><input type="checkbox" id="enquiry-review-optin"> <span>${REVIEW_OPTIN_COPY[L] || REVIEW_OPTIN_COPY.en}</span></label>` : ''}
  </div>
  <div id="enquiry-feedback" style="display:none; margin-top:14px; padding:12px; border-radius:var(--radius); font-size:0.85rem;"></div>
  <button class="btn btn-gold" id="enquiry-send-btn" style="width:100%; justify-content:center; margin-top:26px;" onclick="submitEnquiry()">${t(L,'enquiry.send')}</button>
  <p class="disclaimer" style="text-align:center; justify-content:center;">${t(L,'enquiry.privacyNote')}</p>`;
  document.getElementById('enquiry-body').innerHTML = body;
  document.getElementById('modal-overlay').classList.add('active');
}


function closeModal() { document.getElementById('modal-overlay').classList.remove('active'); }
function selectOpt(opt) {
  currentEnquiryOption = opt;
  document.querySelectorAll('.contact-opt').forEach(o => o.classList.toggle('selected', o.dataset.opt === opt));
  const extra = document.getElementById('qual-extra-fields');
  if (extra) extra.style.display = (opt === 'qualified') ? 'block' : 'none';
}

function showEnquiryFeedback(kind, textKey) {
  const el = document.getElementById('enquiry-feedback');
  if (!el) return;
  const styles = {
    error:   'background:#fdf0f0; color:#a33; border:1px solid #f0c9c9;',
    success: 'background:#f0f9f0; color:#2a6b2a; border:1px solid #c9e8c9;',
  };
  el.style.cssText += styles[kind] || '';
  el.style.display = '';
  el.textContent = t(state.lang, textKey);
}

/** Sprint 1.6: the ONLY place the UI submits an enquiry — always
    through services/leads.js, never touching Supabase directly.
    Prevents double submission (a real, common source of duplicate
    leads), shows a real loading state, and never exposes an internal
    error message to the visitor. Re-enables the button on every
    outcome except genuine success (validation failure, network
    failure, and any other error all restore the button so the
    visitor can correct and retry). */
async function submitEnquiry() {
  if (currentEnquirySubmitting) return; // duplicate-click prevention
  const services = window.ZFindServices;
  if (!services || !services.leads) {
    showEnquiryFeedback('error', 'enquiry.submitError');
    return;
  }

  const btn = document.getElementById('enquiry-send-btn');
  currentEnquirySubmitting = true;
  if (btn) { btn.disabled = true; btn.textContent = t(state.lang, 'enquiry.sending'); }
  const feedbackEl = document.getElementById('enquiry-feedback');
  if (feedbackEl) feedbackEl.style.display = 'none';

  const nameInput = document.getElementById('enquiry-name');
  const emailInput = document.getElementById('enquiry-email');
  const phoneInput = document.getElementById('enquiry-phone');
  const lookingForInput = document.getElementById('enquiry-lookingfor');
  const budgetInput = document.getElementById('enquiry-budget');
  const timingInput = document.getElementById('enquiry-timing');

  const source = state.view === 'property' ? 'zfind_property' : state.view === 'development' ? 'zfind_development' : null;

  const result = await services.leads.submitLead({
    listingId: currentListingIdForEnquiry,
    contactType: currentEnquiryOption,
    name: nameInput ? nameInput.value.trim() : '',
    email: emailInput ? emailInput.value.trim() : '',
    phone: phoneInput ? phoneInput.value.trim() : '',
    userMessage: '',
    qualification: currentEnquiryOption === 'qualified' ? {
      lookingFor: lookingForInput ? lookingForInput.value : '',
      budget: budgetInput ? budgetInput.value : '',
      timing: timingInput ? timingInput.value : '',
    } : null,
    context: {
      language: state.lang,
      page: state.view,
      url: location.href,
      developmentId: state.view === 'development' ? state.id : null,
      partnerId: currentPartnerIdForEnquiry,
      source,
      utm: extractUTMParams(),
    },
  });

  currentEnquirySubmitting = false;

  if (result.error) {
    console.error('Lead submission failed:', result.error);
    if (btn) { btn.disabled = false; btn.textContent = t(state.lang, 'enquiry.send'); } // re-enable on every failure path
    const key = result.error.type === 'validation_failure' ? 'enquiry.validationError' : 'enquiry.submitError';
    showEnquiryFeedback('error', key);
    return;
  }

  showEnquiryFeedback('success', 'enquiry.submitSuccess');
  const reviewOptin = document.getElementById('enquiry-review-optin');
  if (reviewOptin && reviewOptin.checked && emailInput && emailInput.value.trim()) {
    requestReviewInvitation(currentListingIdForEnquiry, emailInput.value.trim());
  }
  if (btn) btn.style.display = 'none'; // only hidden on genuine success — never re-shown until the modal reopens fresh
}

/* ---------------- Responsive primary navigation ----------------
   Desktop remains the single source of truth. Mobile items are
   rebuilt from .nav-links whenever the menu opens, so routes,
   labels and future navigation changes cannot drift between two
   independently maintained menus.
---------------------------------------------------------------- */
function initMobilePrimaryNavigation() {
  const navRow = document.querySelector('.nav-row');
  const desktopNav = document.querySelector('.nav-links');
  const navActions = document.querySelector('.nav-actions');

  if (
    !navRow ||
    !desktopNav ||
    document.getElementById('mobile-nav-toggle')
  ) {
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'mobile-primary-nav';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.id = 'mobile-nav-toggle';
  toggle.className = 'menu-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'mobile-primary-nav');
  toggle.setAttribute('aria-label', 'Menu');
  toggle.innerHTML = '<span aria-hidden="true">☰</span>';

  const panel = document.createElement('div');
  panel.id = 'mobile-primary-nav';
  panel.className = 'mobile-primary-menu';
  panel.setAttribute('role', 'navigation');
  panel.setAttribute('aria-label', 'Primary navigation');
  panel.hidden = true;

  function closeMobileNavigation(restoreFocus) {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');

    if (restoreFocus) {
      toggle.focus();
    }
  }

  function syncMobileNavigationItems() {
    panel.innerHTML = '';

    desktopNav
      .querySelectorAll('button, a')
      .forEach(original => {
        const item = document.createElement('button');

        item.type = 'button';
        item.className = 'mobile-primary-menu-item';

        if (original.classList.contains('active')) {
          item.classList.add('active');
        }

        item.textContent =
          (original.textContent || '').trim();

        item.addEventListener('click', event => {
          event.preventDefault();
          original.click();
          closeMobileNavigation(false);
        });

        panel.appendChild(item);
      });
  }

  toggle.addEventListener('click', event => {
    event.stopPropagation();

    if (panel.hidden) {
      syncMobileNavigationItems();
      panel.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
    } else {
      closeMobileNavigation(false);
    }
  });

  wrapper.addEventListener('click', event => {
    event.stopPropagation();
  });

  document.addEventListener('click', () => {
    closeMobileNavigation(false);
  });

  document.addEventListener('keydown', event => {
    if (
      event.key === 'Escape' &&
      !panel.hidden
    ) {
      closeMobileNavigation(true);
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) {
      closeMobileNavigation(false);
    }
  });

  window.addEventListener('hashchange', () => {
    if (!panel.hidden) {
      syncMobileNavigationItems();
    }
  });

  wrapper.append(toggle, panel);

  if (navActions) {
    navActions.prepend(wrapper);
  } else {
    navRow.appendChild(wrapper);
  }
}

/* ---------------- E-mail alert on the search page (2026-09-30) ----------------
   "Receive the new listings for this search": double opt-in through
   /api/alerts (a confirmation e-mail, nothing else until it is clicked).
   The consent text is the one stored with the subscription
   (api/_lib/alerts-core.js CONSENT.search). */
const SEARCH_ALERT_COPY = Object.freeze({
  fr: Object.freeze({
    title: 'Créer une alerte pour cette recherche',
    body: 'Recevez par e-mail les nouvelles annonces qui correspondent à ces critères, au plus une fois par semaine.',
    email: 'Votre e-mail', button: 'Créer l’alerte', sending: 'Envoi…',
    consent: 'J’accepte de recevoir par e-mail, au plus une fois par semaine, les nouvelles annonces correspondant à cette recherche. Désinscription en un clic dans chaque e-mail.',
    privacy: 'Adresse utilisée uniquement pour cette alerte ; ni vendue ni cédée.',
    done: e => `Presque fini : cliquez sur le lien de confirmation envoyé à ${e}.`,
    errors: { email: 'Indiquez une adresse e-mail valide.', consent: 'Cochez la case d’accord.', unsupported: 'Les alertes ne couvrent pas encore les programmes neufs seuls.', too_many: 'Nombre maximal d’alertes atteint pour cette adresse.', generic: 'L’alerte n’a pas pu être créée. Réessayez dans un instant.' }
  }),
  en: Object.freeze({
    title: 'Create an alert for this search',
    body: 'Get the new listings matching these criteria by e-mail, at most once a week.',
    email: 'Your e-mail', button: 'Create the alert', sending: 'Sending…',
    consent: 'I agree to receive by e-mail, at most once a week, the new listings matching this search. One-click unsubscribe in every e-mail.',
    privacy: 'Address used only for this alert; never sold or passed on.',
    done: e => `Almost done: click the confirmation link sent to ${e}.`,
    errors: { email: 'Enter a valid e-mail address.', consent: 'Tick the agreement box.', unsupported: 'Alerts do not cover new developments on their own yet.', too_many: 'Maximum number of alerts reached for this address.', generic: 'The alert could not be created. Please try again shortly.' }
  })
});

let searchAlertKey = '';

function searchAlertQuery(query) {
  const out = {};
  Object.keys(query || {}).forEach(k => { if (k !== 'page' && k !== 'sort' && query[k]) out[k] = query[k]; });
  return out;
}

function renderSearchAlert(filters, query) {
  const root = document.getElementById('search-alert-root');
  if (!root) return;
  const alertQuery = searchAlertQuery(query);
  const key = state.lang + '|' + JSON.stringify(alertQuery);
  if (key === searchAlertKey && root.firstChild) return;
  searchAlertKey = key;
  const c = SEARCH_ALERT_COPY[state.lang] || SEARCH_ALERT_COPY.en;
  root.innerHTML = `
    <form class="search-alert" id="search-alert-form" novalidate>
      <h3>${c.title}</h3>
      <p>${c.body}</p>
      <div class="search-alert-row">
        <input type="email" id="search-alert-email" autocomplete="email" placeholder="${c.email}" aria-label="${c.email}">
        <button type="submit" class="btn btn-gold">${c.button}</button>
      </div>
      <label class="search-alert-consent"><input type="checkbox" id="search-alert-consent"> <span>${c.consent}</span></label>
      <div class="search-alert-hp" aria-hidden="true"><input type="text" id="search-alert-hp" tabindex="-1" autocomplete="off"></div>
      <p class="search-alert-consent" style="margin-top:6px">${c.privacy} <a href="mailto:hello@zfind.online">hello@zfind.online</a></p>
      <div class="search-alert-msg" id="search-alert-msg" role="status"></div>
    </form>`;
  const form = document.getElementById('search-alert-form');
  const msg = document.getElementById('search-alert-msg');
  const show = (kind, text) => { msg.className = 'search-alert-msg ' + kind; msg.textContent = text; };
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const email = document.getElementById('search-alert-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { show('err', c.errors.email); return; }
    if (!document.getElementById('search-alert-consent').checked) { show('err', c.errors.consent); return; }
    const button = form.querySelector('button');
    button.disabled = true; button.textContent = c.sending;
    try {
      const response = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'subscribe', kind: 'search', lang: state.lang, email, consent: true,
          filters: Object.assign({}, filters, { place: undefined, sort: undefined }),
          query: alertQuery,
          website: document.getElementById('search-alert-hp').value
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || String(response.status));
      form.querySelectorAll('input, button').forEach(el => { el.disabled = true; });
      button.textContent = c.button;
      show('ok', c.done(email));
    } catch (error) {
      button.disabled = false; button.textContent = c.button;
      show('err', c.errors[error.message] || c.errors.generic);
    }
  });
}

/* ---------------- Professionals page ---------------- */
function renderPro() {
  const service = window.ZFindServices && window.ZFindServices.proOffer;
  const root = document.getElementById('pro-root');
  if (!service || !root) return;
  service.render(root, state.lang);
  document.title = (state.lang === 'fr' ? 'Professionnels' : 'Professionals') + ' — Z Find';
}

/* ---------------- Demonstration mode: example sponsored slots ---------------- */
function demoModeOn() {
  const demo = window.ZFindServices && window.ZFindServices.demoMode;
  return Boolean(demo && demo.isOn());
}

/* ---------------- Agency reviews (2026-09-30) ---------------- */
async function loadPartnerReviews(partnerId) {
  const service = window.ZFindServices && window.ZFindServices.partnerReviews;
  if (!service || !partnerId) return { reviews: [], demo: false };
  const result = await service.listPublished(partnerId);
  if (result.data && result.data.length) return { reviews: result.data, demo: false };
  if (demoModeOn()) return { reviews: window.ZFindServices.demoMode.exampleReviews(state.lang, partnerId), demo: true };
  return { reviews: [], demo: false };
}

async function renderPartnerReviews(partnerId) {
  const mount = document.getElementById('partner-reviews-root');
  if (!mount) return;
  const loaded = await loadPartnerReviews(partnerId);
  if (state.view !== 'partner' || state.id !== partnerId) return;
  mount.innerHTML = window.ZFindServices.partnerReviews.sectionHTML(state.lang, loaded.reviews, { demo: loaded.demo });
}

async function renderListingReviews(vm) {
  const partnerId = vm && vm.partner && vm.partner.id;
  const mount = document.getElementById('listing-reviews-root');
  if (!partnerId || !mount) return;
  const loaded = await loadPartnerReviews(partnerId);
  if (!document.body.contains(mount)) return;
  mount.innerHTML = window.ZFindServices.partnerReviews.summaryHTML(state.lang, loaded.reviews, partnerId, { demo: loaded.demo });
}

/* Enquiry form: optional invitation to review the agency a week later. */
const REVIEW_OPTIN_COPY = Object.freeze({
  fr: 'Dans une semaine, m’inviter par e-mail à donner mon avis sur cette agence (une seule fois, e-mail requis).',
  en: 'In a week, invite me by e-mail to review this agency (once only, e-mail required).'
});

function requestReviewInvitation(listingId, email) {
  if (!listingId || !email) return;
  fetch('/api/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'optin', listingId, email, lang: state.lang, consent: true })
  }).catch(() => { /* optional: never affects the enquiry */ });
}

/* ---------------- Main render dispatch ---------------- */
function render() {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const requestedView = document.getElementById('view-' + state.view);
  const activeView =
    requestedView && requestedView.classList.contains('view')
      ? requestedView
      : document.getElementById('view-home');
  activeView.classList.add('active');

  applyI18n();

  const demoMode = window.ZFindServices && window.ZFindServices.demoMode;
  if (demoMode) {
    demoMode.refresh();
    demoMode.applyBanner(document, state.lang);
  }

  switch (state.view) {
    case 'home': renderHome(); break;
    case 'market': renderMarket(state.id); break;
    case 'search': renderSearch(); break;
    case 'property': renderProperty(state.id); break;
    case 'development': renderDevelopment(state.id); break;
    case 'land': renderLand(state.id); break;
    case 'partner': renderPartner(state.id); break;
    case 'simulator': renderSimulator(); break;
    case 'estimation': renderEstimation(); break;
    case 'pro': renderPro(); break;
    case 'zone': renderZone(state.id); break;
    case 'legal': break; // Portugal static jurisdiction content in body.html
    case 'al-manual': break; // Portugal short-term-rental jurisdiction content
    case 'legal-es': break; // Spain static jurisdiction content in body.html
    case 'al-manual-es': break; // Spain tourist-rental jurisdiction content
    case 'legal-fr': break; // France static jurisdiction content
    case 'tourist-rental-fr': break; // France tourist-rental jurisdiction content
    case 'legal-de': break; // Germany static jurisdiction content
    case 'tourist-rental-de': break; // Germany tourist-rental jurisdiction content
    case 'legal-it': break; // Italy static jurisdiction content
    case 'tourist-rental-it': break; // Italy tourist-rental jurisdiction content
    case 'legal-ie': break; // Republic of Ireland jurisdiction content
    case 'tourist-rental-ie': break; // Ireland short-term-rental jurisdiction
    case 'legal-england': break; // England jurisdiction content
    case 'tourist-rental-england': break; // England short-term-rental jurisdiction
    case 'legal-scotland': break; // Scotland jurisdiction content
    case 'tourist-rental-scotland': break; // Scotland short-term-rental jurisdiction
    case 'legal-wales': break; // Wales jurisdiction content
    case 'tourist-rental-wales': break; // Wales short-term / visitor accommodation
    case 'legal-northern-ireland': break; // Northern Ireland jurisdiction content
    case 'tourist-rental-northern-ireland': break; // Northern Ireland tourist accommodation
    case 'legal-netherlands': break; // Netherlands jurisdiction content
    case 'tourist-rental-netherlands': break; // Netherlands short-term-rental jurisdiction
    case 'legal-belgium': break; // Belgium jurisdiction content
    case 'tourist-rental-belgium': break; // Belgium short-term-rental jurisdiction
    case 'legal-united-states': break; // Americas independent jurisdiction
    case 'tourist-rental-united-states': break; // Americas independent jurisdiction
    case 'legal-canada': break; // Americas independent jurisdiction
    case 'tourist-rental-canada': break; // Americas independent jurisdiction
    case 'legal-mexico': break; // Americas independent jurisdiction
    case 'tourist-rental-mexico': break; // Americas independent jurisdiction
    case 'legal-brazil': break; // Americas independent jurisdiction
    case 'tourist-rental-brazil': break; // Americas independent jurisdiction
    case 'legal-argentina': break; // Americas independent jurisdiction
    case 'tourist-rental-argentina': break; // Americas independent jurisdiction
    case 'legal-chile': break; // Global legal wave independent jurisdiction
    case 'tourist-rental-chile': break; // Global legal wave independent jurisdiction
    case 'legal-dominican-republic': break; // Global legal wave independent jurisdiction
    case 'tourist-rental-dominican-republic': break; // Global legal wave independent jurisdiction
    case 'legal-poland': break; // Global legal wave independent jurisdiction
    case 'tourist-rental-poland': break; // Global legal wave independent jurisdiction
    case 'legal-greece': break; // Global legal wave independent jurisdiction
    case 'tourist-rental-greece': break; // Global legal wave independent jurisdiction
    case 'legal-croatia': break; // Global legal wave independent jurisdiction
    case 'tourist-rental-croatia': break; // Global legal wave independent jurisdiction
    case 'legal-cyprus': break; // Global legal wave independent jurisdiction
    case 'tourist-rental-cyprus': break; // Global legal wave independent jurisdiction
    case 'legal-dubai': break; // Global legal wave independent jurisdiction
    case 'tourist-rental-dubai': break; // Global legal wave independent jurisdiction
  }
  window.scrollTo({ top:0, behavior:'instant' in window ? 'instant' : 'auto' });
}

/* ---------------- Event wiring ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  initMobilePrimaryNavigation();
  document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => navigate(b.dataset.view)));
  document.querySelectorAll('.lang-menu button[data-lang]').forEach(b => b.addEventListener('click', () => {
    if (b.disabled) return;
    setLang(b.dataset.lang);
    const menu = document.getElementById('language-menu');
    if (menu) menu.removeAttribute('open');
  }));
  document.querySelectorAll('#view-home .cat-tabs button').forEach(b => {
    b.addEventListener('click', () => { document.querySelectorAll('#view-home .cat-tabs button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); });
  });
  document.querySelectorAll('#view-search .tabs-row .pill').forEach(b => {
    b.addEventListener('click', () => {
      const filterQuery = pillFilterToQuery(b.dataset.filter);
      const next = Object.assign({}, state.query, filterQuery);
      delete next.page;
      navigate('search', null, next);
    });
  });
  document.getElementById('search-q').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.defaultPrevented) applySearchBar(); });
  attachPlaceAutocomplete(document.getElementById('search-q'), applySearchBar);
  attachPlaceAutocomplete(document.getElementById('home-q'), submitHomeSearch);
  document.getElementById('home-q').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.defaultPrevented) submitHomeSearch(); });
  parseHash();
});

/* Installable site: register the network-first service worker (sw.js) on
   the real site only — never on file:// test pages or preview tooling. */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* optional enhancement */ });
  });
}
