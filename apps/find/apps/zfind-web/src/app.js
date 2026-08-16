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
  document.querySelectorAll('.lang-switch button').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === state.lang);
  });
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === state.view);
  });
}

/* ---------------- Card rendering (shared by Home / Search / Partner) ---------------- */
function cardHTML(vm) {
  return `<div class="card" onclick="navigate('${vm.kind==='Development'?'development':(vm.kind==='Land'?'land':'property')}','${vm.assetId}')">
    <div class="thumb"><span class="badge ${vm.badgeGold?'gold':''}">${vm.badgeLabel}</span></div>
    <div class="body">
      <div class="price">${vm.priceLabel}</div>
      <div class="loc">${vm.title} — ${vm.locationLabel}</div>
      <div class="meta">${vm.meta.map(m=>`<span>${m}</span>`).join('')}</div>
      <div class="facts-count">${vm.factsLine}</div>
    </div>
  </div>`;
}

/* ---------------- Sprint 1.2: Home status (loading / empty / error) ----------------
   One shared status container reused across all three states, same
   pattern already established by #search-empty (see body.html) — no
   new CSS classes, just the existing inline-style convention. */
function setHomeStatus(kind, titleKey, bodyKey) {
  const statusEl = document.getElementById('home-status');
  const gridsWrap = document.getElementById('home-grids-wrap');
  if (kind === 'none') {
    statusEl.style.display = 'none';
    gridsWrap.style.display = '';
    return;
  }
  gridsWrap.style.display = 'none';
  statusEl.style.display = '';
  document.getElementById('home-status-title').textContent = t(state.lang, titleKey);
  document.getElementById('home-status-body').textContent = t(state.lang, bodyKey);
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
  return { subtype:filterKey }; // apartment / villa / development / land
}

function currentPillForQuery(q) {
  if (q.subtype === 'apartment') return 'apartment';
  if (q.subtype === 'villa') return 'villa';
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

async function renderSearch() {
  const q = state.query || {};
  const transactionType = effectiveTransactionType(q);
  const rentalPeriod = effectiveRentalPeriod(q, transactionType);

  // Seasonal/yearly amounts are not compared against monthly rental ranges.
  const range = (
    transactionType === 'rent' && rentalPeriod !== 'monthly'
  )
    ? { budgetMin:null, budgetMax:null }
    : budgetToRange(q.budget);

  // Sync controls immediately (don't wait on the network for this).
  const qInput = document.getElementById('search-q');
  if (qInput) qInput.value = q.q || '';

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

  const activePill = currentPillForQuery(q);
  document.querySelectorAll('#view-search .tabs-row .pill').forEach(b => b.classList.toggle('active', b.dataset.filter === activePill));

  document.getElementById('search-grid').style.display = 'none';
  setSearchStatus('loading', 'home.loadingTitle', 'home.loadingBody');

  const result = await loadSearchResults(state.lang, {
    q: q.q || '',
    subtype: (q.subtype || '').split(',').filter(Boolean),
    transactionType,
    rentalPeriod,
    budgetMin: range.budgetMin,
    budgetMax: range.budgetMax,
  });

  if (result.error) {
    console.error('Search failed:', result.error);
    setSearchStatus('error', 'home.errorTitle', 'home.errorBody');
    return;
  }

  const filtered = result.cards;
  document.getElementById('search-results-title').textContent = t(state.lang, 'search.resultsTitle', { count: filtered.length, market: computeMarketLabel(filtered) });

  if (!filtered.length) {
    setSearchStatus('empty', 'search.noResultsTitle', 'search.noResultsBody');
    return;
  }

  setSearchStatus('none');
  document.getElementById('search-grid').style.display = '';
  document.getElementById('search-grid').innerHTML = filtered.map(cardHTML).join('');
}

function applySearchBar() {
  const qVal = document.getElementById('search-q').value;
  const budgetVal = document.getElementById('search-budget').value;
  navigate('search', null, Object.assign({}, state.query, { q: qVal, budget: budgetVal }));
}

function clearSearchFilters() {
  navigate('search', null, { transactionType:'sale' });
}

function submitHomeSearch() {
  const activeTab = document.querySelector('#view-home .cat-tabs button.active');
  const tabCat = activeTab ? activeTab.dataset.cat : 'residential';
  const transactionType = homeTransactionType;
  const typeVal = document.getElementById('home-type').value; // may override tab with a more specific choice
  const qVal = document.getElementById('home-q').value;
  const budgetVal = document.getElementById('home-budget').value;

  let query;
  if (typeVal) {
    query = pillFilterToQuery(typeVal);
  } else {
    const catMap = { residential:'apartment,villa', developments:'development', land:'land' };
    query = { subtype: catMap[tabCat] || '' };
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
    <a href="#" onclick="navigate('search');return false;" class="btn-ghost" style="font-size:0.82rem;">${t(state.lang,'common.backToResults')}</a>
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
    <a href="#" onclick="navigate('search');return false;" class="btn-ghost" style="font-size:0.82rem;">${t(L,'common.backToResults')}</a>
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
    <a href="#" onclick="navigate('search');return false;" class="btn-ghost" style="font-size:0.82rem;">${t(L,'common.backToResults')}</a>
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
    <a href="#" onclick="navigate('search');return false;" class="btn-ghost" style="font-size:0.82rem;">${t(L,'common.backToResults')}</a>
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
  }
  window.scrollTo({ top:0, behavior:'instant' in window ? 'instant' : 'auto' });
}

/* ---------------- Event wiring ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  initMobilePrimaryNavigation();
  document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => navigate(b.dataset.view)));
  document.querySelectorAll('.lang-switch button').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
  document.querySelectorAll('#view-home .cat-tabs button').forEach(b => {
    b.addEventListener('click', () => { document.querySelectorAll('#view-home .cat-tabs button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); });
  });
  document.querySelectorAll('#view-search .tabs-row .pill').forEach(b => {
    b.addEventListener('click', () => {
      const filterQuery = pillFilterToQuery(b.dataset.filter);
      navigate('search', null, Object.assign({}, state.query, filterQuery));
    });
  });
  document.getElementById('search-q').addEventListener('keydown', e => { if (e.key === 'Enter') applySearchBar(); });
  document.getElementById('home-q').addEventListener('keydown', e => { if (e.key === 'Enter') submitHomeSearch(); });
  parseHash();
});
