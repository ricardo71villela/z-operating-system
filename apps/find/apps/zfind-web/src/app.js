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
  ]);
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
    state.view === 'market' && MARKET_REGISTRY_SERVICE.getMarket(state.id)
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

      MARKET_REGISTRY_SERVICE
        .listMarkets()
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
  if (!MARKET_REGISTRY_SERVICE.getMarket(marketKey)) return;

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
  if (!SUPPORTED_LANGS.includes(lang)) {
    const storedLang =
      localStorage.getItem('zfind_lang');

    lang =
      SUPPORTED_LANGS.includes(storedLang)
        ? storedLang
        : DEFAULT_LANG;
    location.hash = '/' + lang + (parts.length ? '/'+parts.join('/') : '/home') + (queryPart ? '?'+queryPart : '');
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
  'page'
]);

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

  root.innerHTML = slots
    .map(slot =>
      slot.card
        ? featuredCardSlotHTML(slot, copy)
        : featuredEmptySlotHTML(
            slot.position,
            copy.featuredEmptyTitle,
            copy.featuredEmptyBody,
            ''
          )
    )
    .join('');
}

function renderMarket(marketKey) {
  const root = document.getElementById('market-root');
  if (!root) return;

  const market = MARKET_REGISTRY_SERVICE.getMarket(marketKey);

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

            <div class="market-foundation-actions">
              <button
                class="btn btn-outline"
                type="button"
                onclick="navigate('${market.legalRoute}')"
              >${copy.legalLabel}</button>

              <button
                class="btn btn-outline"
                type="button"
                onclick="navigate('${market.touristRentalRoute}')"
              >${copy.rentalLabel}</button>
            </div>
          </div>

          <div
            class="market-map-slot"
            data-market-map-key="${market.geography.code}"
            data-market-map-kind="${market.geography.kind}"
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
          </div>
        </div>
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

      <section class="wrap market-foundation-section market-guide-links">
        <div class="block-head">
          <div>
            <span class="eyebrow">${copy.guidesTitle}</span>
            <p>${copy.guidesIntro}</p>
          </div>
        </div>

        <div class="market-foundation-actions">
          <button
            class="btn btn-outline"
            type="button"
            onclick="navigate('${market.legalRoute}')"
          >${copy.legalLabel}</button>

          <button
            class="btn btn-outline"
            type="button"
            onclick="navigate('${market.touristRentalRoute}')"
          >${copy.rentalLabel}</button>
        </div>
      </section>
    </div>
  `;

  renderMarketFeatured(market);
  renderMarketSearch(market);
}

async function renderHome() {
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

  aside.innerHTML =
    searchFeaturedRailShellHTML(
      copy,
      slots
        .map(slot =>
          slot.card
            ? searchFeaturedCardSlotHTML(slot, copy)
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
        {
          q: q.q || '',
          subtype:
            (q.subtype || '')
              .split(',')
              .filter(Boolean),
          transactionType,
          rentalPeriod,
          budgetMin: range.budgetMin,
          budgetMax: range.budgetMax,
          marketKey: q.market || undefined
        }
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

  const selectedMarketLabel =
    selectedMarket
      ? MARKET_REGISTRY_SERVICE
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
      'search.resultsTitle',
      {
        count: fullCards.length,
        market: selectedMarketLabel
      }
    );

  const pagination =
    SEARCH_PAGINATION_SERVICE.paginate(
      fullCards,
      presentationQuery.page
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

function applySearchBar() {
  const qVal = document.getElementById('search-q').value;
  const budgetVal = document.getElementById('search-budget').value;
  const next = Object.assign({}, state.query, { q: qVal, budget: budgetVal });
  delete next.page;
  navigate('search', null, next);
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

function submitHomeSearch() {
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

  query.q = qVal;
  query.budget = budgetVal;

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
      <span class="eyebrow">${vm.asset.typology} · ${vm.geo.zoneLabel || vm.geo.cityLabel}, ${vm.geo.cityLabel}, ${vm.geo.countryLabel}</span>
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
      <div class="info-card">
        ${(vm.market && (vm.market.avgPriceZone || vm.market.priceThis || vm.market.trend || vm.market.comparables)) ? `
        ${vm.market.avgPriceZone ? `<div class="row"><span class="label">${t(L,'property.avgPriceZone')}</span><span class="val">${fmtCurrency(vm.market.avgPriceZone.value,L)}/m²</span></div>` : ''}
        ${vm.market.priceThis ? `<div class="row"><span class="label">${t(L,'property.priceThis')}</span><span class="val">${fmtCurrency(vm.market.priceThis.value,L)}/m²</span></div>` : ''}
        ${vm.market.trend ? `<div class="row"><span class="label">${t(L,'property.trend12m')}</span><span class="val">+${vm.market.trend.value}%</span></div>` : ''}
        ${vm.market.comparables ? `<div class="row"><span class="label">${t(L,'property.comparables')}</span><span class="val">${vm.market.comparables.value}</span></div>` : ''}
        ` : `<div class="row"><span class="label" style="color:var(--gray-400);">${t(L,'property.zIntelComingSoonBody')}</span></div>`}
      </div>

      <div class="section-title">${t(L,'property.zInsightsTitle')}</div>
      <div class="info-card">
        <div class="row"><span class="label" style="color:var(--gray-400);">${t(L,'property.zInsightsComingSoonBody')}</span></div>
      </div>

      ${isRentalListing ? '' : `
      <div class="section-title">${t(L,'property.investmentTitle')}</div>
      <div class="info-card">
        ${vm.intelligence ? `
        <div class="row"><span class="label">${t(L,'property.estYield')}</span><span class="val">${vm.intelligence.low}% – ${vm.intelligence.high}%</span></div>
        <div class="row"><span class="label">${t(L,'property.estRent')}</span><span class="val">${fmtCurrency(vm.intelligence.rentLow,L)} – ${fmtCurrency(vm.intelligence.rentHigh,L)}</span></div>
        ` : `<div class="row"><span class="label" style="color:var(--gray-400);">${t(L,'property.zIntelInvestmentComingSoonBody')}</span></div>`}
      </div>
      `}
    </div>
    <div>
      <div class="sidebar-sticky">
      ${isRentalListing ? '' : `
      <div class="sidebar-card">
        <h4>${t(L,'property.yieldSimTitle')}</h4>
        ${vm.intelligence ? `
        <div class="sim-row"><span>${t(L,'property.purchasePrice')}</span><span>${vm.priceLabel}</span></div>
        <div class="sim-row"><span>${t(L,'property.estCosts')}</span><span>${fmtCurrency(Math.round(vm.listing.priceCurrent*0.07),L)}</span></div>
        <div class="sim-row"><span>${t(L,'property.estAnnualRent')}</span><span>${fmtCurrency(vm.intelligence.rentLow*12,L)}</span></div>
        <div class="sim-row total"><span>${t(L,'property.estGrossYield')}</span><span style="color:var(--gold-dark)">${vm.intelligence.low}%</span></div>
        ` : `<div class="sim-row"><span style="color:var(--gray-400);">${t(L,'property.zIntelInvestmentComingSoonBody')}</span></div>`}
      </div>
      `}
      <div class="sidebar-card">
        <h4>${t(L,'property.representedBy')}</h4>
        <div style="display:flex; gap:12px; align-items:center; ${vm.partner.id ? 'cursor:pointer;' : ''}" ${vm.partner.id ? `onclick="navigate('partner','${vm.partner.id}')"` : ''}>
          <div style="width:46px;height:46px;border-radius:50%;background:var(--gray-200)"></div>
          <div><div style="font-family:'Cormorant Garamond'; font-size:1.1rem">${vm.partner.name}</div><div class="trust-chip" style="${vm.trust ? '' : 'color:var(--gray-400); background:var(--gray-100); border-color:var(--gray-200);'}">${vm.trust ? vm.trust.label : t(L,'property.trustComingSoon')}</div></div>
        </div>
        <button class="btn btn-gold" style="width:100%; margin-top:20px; justify-content:center" onclick="openModal('${vm.listing.id}', ${JSON.stringify(vm.partner.enquiryPolicy).replace(/"/g,'&quot;')}, '${vm.partner.id}')">${t(L,'property.contactBtn')}</button>
        <button class="btn btn-outline" style="width:100%; margin-top:10px; justify-content:center">${t(L,'property.saveBtn')}</button>
      </div>
      </div>
    </div>
  </div>`;
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
  <div class="wrap" style="padding:48px 0">
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

    <div class="section-title">${t(L,'property.zInsightsTitle')}</div>
    <div class="info-card">
      <div class="row"><span class="label" style="color:var(--gray-400);">${t(L,'property.zInsightsComingSoonBody')}</span></div>
    </div>

    <div class="section-title">${t(L,'property.investmentTitle')}</div>
    <div class="info-card">
      ${vm.intelligence ? '' : `<div class="row"><span class="label" style="color:var(--gray-400);">${t(L,'property.zIntelInvestmentComingSoonBody')}</span></div>`}
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

      <div class="section-title" style="margin-top:30px">${t(L,'property.zInsightsTitle')}</div>
      <div class="info-card">
        <div class="row">
          <span class="label" style="color:var(--gray-400);">
            ${t(L,'property.zInsightsComingSoonBody')}
          </span>
        </div>
      </div>

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
  </div>`;

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
function renderSimulator() {
  const L = state.lang;
  const countries = window.ZFindServices.simulator.supportedCountries();
  document.getElementById('simulator-root').innerHTML = `
  <div class="wrap" style="padding:48px 0; max-width:640px;">
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
  if (!zoneId) { root.innerHTML = `<div class="wrap" style="padding:48px 0;">${t(L,'zone.notFound')}</div>`; return; }

  root.innerHTML = `<div class="wrap" style="padding:48px 0;">${t(L,'home.loadingTitle')}</div>`;

  const [zoneResult, searchResult] = await Promise.all([
    window.ZFindServices.zones.getZoneById(zoneId),
    loadSearchResults(L, { zoneLiteId: zoneId }),
  ]);

  if (zoneResult.error) {
    root.innerHTML = `<div class="wrap" style="padding:48px 0;">${t(L,'zone.notFound')}</div>`;
    return;
  }
  const zone = zoneResult.data;
  const cards = searchResult.cards || [];
  const stats = window.ZFindServices.zones.computeZoneStats(cards);
  const imagePath = window.ZFindServices.zoneImages.getZoneImagePath(zone.name);

  root.innerHTML = `
  <div class="wrap" style="padding:0 0 48px;">
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

  switch (state.view) {
    case 'home': renderHome(); break;
    case 'market': renderMarket(state.id); break;
    case 'search': renderSearch(); break;
    case 'property': renderProperty(state.id); break;
    case 'development': renderDevelopment(state.id); break;
    case 'land': renderLand(state.id); break;
    case 'partner': renderPartner(state.id); break;
    case 'simulator': renderSimulator(); break;
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
  document.getElementById('search-q').addEventListener('keydown', e => { if (e.key === 'Enter') applySearchBar(); });
  document.getElementById('home-q').addEventListener('keydown', e => { if (e.key === 'Enter') submitHomeSearch(); });
  parseHash();
});
