const { chromium } = require('playwright');
const path = require('path');

/* ============================================================
   Public Web regression fixture.

   Home, Search, Property, Development, Land and Partner now source
   runtime data through window.ZFindServices / Supabase-backed paths.
   This suite deliberately keeps the historical 7-card regression
   shape (3 apartments, 2 villas, 1 development, 1 land), but serves
   it through mocked Supabase network responses rather than through
   any application fixture.

   Sprint 1.10 removes db.js from the public runtime entirely. These
   fixed responses are test-only data and are not bundled into Z Find.
   ============================================================ */
function mockProperty(
  id,
  subtype,
  channel,
  title,
  zoneName,
  countryIso = 'PT',
  city = 'Porto',
  zoneId = 'z1'
) {
  return {
    id, subtype, typology: subtype === 'land' ? null : 'T2', area_sqm: 80, zone_lite_id: zoneId,
    zones_lite: { name: zoneName, city, country_iso: countryIso },
    representations: [{ target_type: 'property', status: 'active', partners: { id: 'partner_zimob', name: 'Z Imobiliária', enquiry_policy: { direct: true, qualified: true, assisted: false } }, listings: [{
      id: 'l-' + id, channel, price_current: 400000, currency_iso: 'EUR', price_is_from: false, status: 'published',
      listing_content: [{ locale: 'en', title }],
      listing_media: [],
    }] }],
  };
}
const MOCK_PROPERTIES = [
  mockProperty('asset_apt_boavista', 'apartment', 'standard', 'Apartment in Boavista', 'Boavista'),
  mockProperty('asset_apt_foz', 'apartment', 'standard', 'Apartment in Foz', 'Foz do Douro'),
  mockProperty(
    'asset_apt_paris_marais',
    'apartment',
    'standard',
    'Apartment in Le Marais',
    'Le Marais',
    'FR',
    'Paris',
    'z3'
  ),
  mockProperty('asset_townhouse_cedofeita', 'villa', 'standard', 'Villa in Cedofeita', 'Cedofeita'),
  mockProperty('asset_villa_foz', 'villa', 'standard', 'Villa in Foz', 'Foz do Douro'),
  mockProperty('asset_land_boavista', 'land', 'standard', 'Land in Boavista', 'Boavista'),
];
const MOCK_ZONES = [
  { id:'z1', name:'Boavista', city:'Porto', country_iso:'PT' },
  { id:'z2', name:'Matosinhos Sul', city:'Matosinhos', country_iso:'PT' },
  { id:'z3', name:'Le Marais', city:'Paris', country_iso:'FR' },
];

const MOCK_DEVELOPMENTS = [{
  id: 'asset_dev_rionorte', name: 'Rio Norte', zone_lite_id: 'z2',
  zones_lite: { name: 'Matosinhos Sul', city: 'Matosinhos', country_iso: 'PT' },
  development_media: [],
  representations: [{ target_type: 'development', status: 'active', partners: { id: 'partner_zimob', name: 'Z Imobiliária', enquiry_policy: { direct: true, qualified: true, assisted: false } }, listings: [{
    id: 'l-asset_dev_rionorte', channel: 'standard', price_current: 340000, currency_iso: 'EUR', price_is_from: true, status: 'published',
    listing_content: [{ locale: 'en', title: 'Rio Norte Development', description: 'A new construction project.' }],
    listing_media: [],
  }] }],
}];
// Sprint 1.5: real unit data has no 'sold'/'reserved' concept (no
// schema column backs it — see viewmodels.js's documented decision).
// Every unit listUnitsForDevelopment() can ever return is, by
// construction, actively listed — so every mock unit here is
// genuinely 'available' too, matching real behavior exactly. IDs kept
// historical regression IDs are intentionally preserved so existing
// click-by-position/click-by-text test steps remain stable.
function mockUnit(id, typology, areaSqm, floor, price) {
  return { id, subtype: 'apartment', typology, area_sqm: areaSqm, floor, representations: [{ target_type: 'property', status: 'active', listings: [{ id: 'ul-' + id, price_current: price, currency_iso: 'EUR', status: 'published' }] }] };
}
const MOCK_UNITS = [
  mockUnit('unit_2a', 'T1', 62, 2, 210000),
  mockUnit('unit_3b', 'T2', 88, 3, 280000),
  mockUnit('unit_4a', 'T2', 91, 4, 295000),
  mockUnit('unit_5c', 'T3', 124, 5, 410000),
  mockUnit('unit_ph1', 'Penthouse', 180, 6, 650000),
];

let searchLogRequests = 0;

async function mockSupabaseRoutes(page) {
  await page.route(
    '**/rest/v1/rpc/zfind_public_exact_market_scope**',
    route => {
      let payload = {};

      try {
        payload = route.request().postDataJSON() || {};
      } catch (_) {
        payload = {};
      }

      const marketKey = payload.p_market_key;
      const supported = [
        'GB-ENG',
        'GB-SCT',
        'GB-WLS',
        'GB-NIR',
        'AE-DU'
      ].includes(marketKey);

      return route.fulfill({
        status:200,
        contentType:'application/json',
        body:JSON.stringify({
          market_key:marketKey,
          resolved:supported,
          zone_lite_ids:[]
        })
      });
    }
  );

  await page.route('**/rest/v1/zones_lite**', route => {
    const url = new URL(route.request().url());
    const countryFilter =
      url.searchParams.get('country_iso');

    let data = MOCK_ZONES;

    if (
      countryFilter &&
      countryFilter.startsWith('eq.')
    ) {
      const wanted = countryFilter.slice(3);
      data = MOCK_ZONES.filter(
        zone => zone.country_iso === wanted
      );
    }

    return route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify(data)
    });
  });

  await page.route('**/rest/v1/partners**', route => {
    const url = new URL(route.request().url());
    const idFilter = url.searchParams.get('id');

    if (idFilter === 'eq.partner_zimob') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'partner_zimob',
          name: 'Z Imobiliária',
          role: 'agency',
          status: 'active',
          avg_response_hours: 4.2,
          enquiry_policy: { direct: true, qualified: true, assisted: false },
          logo_storage_path: null,
        })
      });
    }

    return route.fulfill({
      status: 406,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'PGRST116',
        message: 'Results contain 0 rows'
      })
    });
  });

  await page.route('**/rest/v1/properties**', route => {
    const url = new URL(route.request().url());
    const idFilter = url.searchParams.get('id'); // e.g. "eq.asset_apt_boavista"
    // Sprint 1.4: the Property detail page fetches ONE property via
    // .single() (getPropertyById) — PostgREST/supabase-js expects a
    // single object in this case, not an array, unlike the Home/Search
    // list queries below. Detected here by the presence of an `id`
    // filter, which only getPropertyById ever sends.
    if (idFilter && idFilter.startsWith('eq.')) {
      const wanted = idFilter.slice(3);
      const match = MOCK_PROPERTIES.find(p => p.id === wanted);
      if (!match) return route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: 'Results contain 0 rows' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(match) });
    }
    // Sprint 1.5: listUnitsForDevelopment() filters by development_id.
    const devIdFilter = url.searchParams.get('development_id');
    if (devIdFilter && devIdFilter.startsWith('eq.')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_UNITS) });
    }
    const subtypeFilter = url.searchParams.get('subtype');
    const zoneFilter = url.searchParams.get('zone_lite_id');
    let data = MOCK_PROPERTIES;

    if (zoneFilter && zoneFilter.startsWith('in.(')) {
      const wanted = zoneFilter
        .slice(4, -1)
        .split(',')
        .map(value => value.replace(/^"|"$/g, ''));

      data = data.filter(
        property => wanted.includes(property.zone_lite_id)
      );
    }
    if (subtypeFilter && subtypeFilter.startsWith('eq.')) {
      const wanted = subtypeFilter.slice(3);
      data = MOCK_PROPERTIES.filter(p => p.subtype === wanted);
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.route('**/rest/v1/developments**', route => {
    const url = new URL(route.request().url());
    const idFilter = url.searchParams.get('id');
    // Sprint 1.5: getDevelopmentById() fetches ONE development via
    // .single() — same single-object-not-array distinction as properties.
    if (idFilter && idFilter.startsWith('eq.')) {
      const wanted = idFilter.slice(3);
      const match = MOCK_DEVELOPMENTS.find(d => d.id === wanted);
      if (!match) return route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: 'Results contain 0 rows' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(match) });
    }
    const zoneFilter = url.searchParams.get('zone_lite_id');
    let data = MOCK_DEVELOPMENTS;

    if (zoneFilter && zoneFilter.startsWith('in.(')) {
      const wanted = zoneFilter
        .slice(4, -1)
        .split(',')
        .map(value => value.replace(/^"|"$/g, ''));

      data = data.filter(
        development => wanted.includes(development.zone_lite_id)
      );
    }

    route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify(data)
    });
  });
  await page.route('**/rest/v1/searches**', route => {
    searchLogRequests += 1;
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: '{}'
    });
  });
}

(async () => {
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('PAGEERROR: ' + err.message));
  await mockSupabaseRoutes(page);

  const fileUrl = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-web', 'dist', 'z-find-prototype.html');

  async function shot(name) {
    await page.screenshot({ path: '/tmp/screenshots/' + name + '.png' });
    console.log('  📸', name);
  }

  console.log('--- 1. HOME (EN) ---');
  await page.goto(fileUrl);
  await page.waitForTimeout(300);
  console.log('URL:', page.url());
  console.log('Title visible:', await page.locator('h1').first().textContent());
  await shot('01-home-en');

  console.log('--- 2. HOME SEARCH: type villa, submit ---');
  await page.selectOption('#home-type', 'villa');
  await page.click('.searchbar .go');
  await page.waitForTimeout(300);
  console.log('URL after search:', page.url());
  const cardCount1 = await page.locator('#search-grid .card').count();
  console.log('Result cards (villa filter):', cardCount1, '(expect 2: Cedofeita + Foz villa)');
  await shot('02-search-villa');

  console.log('--- 3. SEARCH: clear filters ---');
  await page.click('#view-search .searchbar button[data-i18n="search.clearFilters"]');
  await page.waitForTimeout(300);
  const cardCountAll = await page.locator('#search-grid .card').count();
  console.log('Result cards (all):', cardCountAll, '(expect 6 on page 1; total 7)');
  await shot('03-search-all');

  console.log(
    '--- 3B. B2 horizontal organic result rows ---'
  );

  const b2Rows =
    await page.locator(
      '#search-grid .search-result-row'
    ).count();

  const b2Cards =
    await page.locator(
      '#search-grid .card'
    ).count();

  const b2Shape =
    await page.locator(
      '#search-grid .search-result-row'
    ).first().evaluate(el => {
      const style = getComputedStyle(el);

      return {
        display: style.display,
        columns: style.gridTemplateColumns,
        hasThumb: Boolean(
          el.querySelector('.search-result-thumb')
        ),
        hasBody: Boolean(
          el.querySelector('.search-result-body')
        ),
        imageState:
          el.getAttribute('data-search-image-state')
      };
    });

  console.log(
    'B2 horizontal result rows:',
    b2Rows,
    '(cards:', b2Cards + ')'
  );

  console.log(
    'B2 first row shape:',
    JSON.stringify(b2Shape)
  );

  if (
    b2Rows !== 6 ||
    b2Rows !== b2Cards ||
    b2Shape.display !== 'grid' ||
    !b2Shape.hasThumb ||
    !b2Shape.hasBody ||
    !['resolved', 'placeholder'].includes(
      b2Shape.imageState
    )
  ) {
    throw new Error(
      'B2 horizontal Search result-row contract failed'
    );
  }



  console.log(
    '--- 3C. B5 organic pagination ---'
  );

  const b5Page1 =
    await page.locator(
      '#search-results-pagination'
    ).evaluate(el => ({
      state: el.dataset.paginationState,
      page: el.dataset.paginationPage,
      pageCount: el.dataset.paginationPageCount,
      totalCount: el.dataset.paginationTotalCount,
      previousDisabled:
        document.getElementById(
          'search-pagination-previous'
        ).disabled,
      nextDisabled:
        document.getElementById(
          'search-pagination-next'
        ).disabled
    }));

  const b5Page1Rows =
    await page.locator(
      '#search-grid .search-result-row'
    ).count();

  const b5SearchLogsBeforePageTurn =
    searchLogRequests;

  console.log(
    'B5 page 1 organic rows:',
    b5Page1Rows,
    'state:',
    JSON.stringify(b5Page1),
    'search logs before page turn:',
    b5SearchLogsBeforePageTurn
  );

  if (
    b5Page1.state !== 'ready' ||
    b5Page1.page !== '1' ||
    b5Page1.pageCount !== '2' ||
    b5Page1.totalCount !== '7' ||
    b5Page1Rows !== 6 ||
    b5Page1.previousDisabled !== true ||
    b5Page1.nextDisabled !== false
  ) {
    throw new Error(
      'B5 page 1 pagination contract failed'
    );
  }

  await page
    .locator('#search-pagination-next')
    .click();

  await page.waitForFunction(() =>
    location.hash.includes('page=2') &&
    document.querySelectorAll(
      '#search-grid .search-result-row'
    ).length === 1
  );

  const b5Page2Rows =
    await page.locator(
      '#search-grid .search-result-row'
    ).count();

  const b5Page2 =
    await page.locator(
      '#search-results-pagination'
    ).evaluate(el => ({
      page: el.dataset.paginationPage,
      pageCount: el.dataset.paginationPageCount,
      totalCount: el.dataset.paginationTotalCount,
      previousDisabled:
        document.getElementById(
          'search-pagination-previous'
        ).disabled,
      nextDisabled:
        document.getElementById(
          'search-pagination-next'
        ).disabled
    }));

  const b5Page2Url =
    page.url();

  const b5SearchLogsAfterNext =
    searchLogRequests;

  console.log(
    'B5 page 2 organic rows:',
    b5Page2Rows,
    'URL:',
    b5Page2Url,
    'state:',
    JSON.stringify(b5Page2),
    'search-log delta after Next:',
    b5SearchLogsAfterNext -
      b5SearchLogsBeforePageTurn
  );

  if (
    b5Page2Rows !== 1 ||
    b5Page2.page !== '2' ||
    b5Page2.pageCount !== '2' ||
    b5Page2.totalCount !== '7' ||
    b5Page2.previousDisabled !== false ||
    b5Page2.nextDisabled !== true ||
    !b5Page2Url.includes('transactionType=sale') ||
    !b5Page2Url.includes('page=2') ||
    b5SearchLogsAfterNext !==
      b5SearchLogsBeforePageTurn
  ) {
    throw new Error(
      'B5 page 2 pagination/context/analytics contract failed'
    );
  }

  await page
    .locator('#search-pagination-previous')
    .click();

  await page.waitForFunction(() =>
    !location.hash.includes('page=') &&
    document.querySelectorAll(
      '#search-grid .search-result-row'
    ).length === 6
  );

  const b5Page1ReturnUrl =
    page.url();

  const b5SearchLogsAfterPrevious =
    searchLogRequests;

  console.log(
    'B5 search-log delta after Previous:',
    b5SearchLogsAfterPrevious -
      b5SearchLogsBeforePageTurn
  );

  if (
    b5Page1ReturnUrl.includes('page=') ||
    !b5Page1ReturnUrl.includes(
      'transactionType=sale'
    ) ||
    b5SearchLogsAfterPrevious !==
      b5SearchLogsBeforePageTurn
  ) {
    throw new Error(
      'B5 canonical page-1 URL / zero-analytics contract failed'
    );
  }

  console.log(
    'PASS: B5 six-plus-one pagination, canonical page-1 URL and zero page-turn Search analytics'
  );

  console.log('--- 3D. PHASE C: Search-origin detail return context ---');

  await page.evaluate(() => goToSearchPage(2));
  await page.waitForTimeout(300);

  const phaseCOrganicLogsBeforeDetail =
    searchLogRequests;

  await page.locator(
    '#search-grid .search-result-row'
  ).first().click();

  await page.waitForTimeout(300);

  const phaseCOrganicDetail =
    await page.evaluate(() => {
      const full =
        location.hash.replace(/^#\/?/, '');
      const [pathPart, queryPart = ''] =
        full.split('?');
      const parts =
        pathPart.split('/').filter(Boolean);
      const outer =
        new URLSearchParams(queryPart);
      const nested =
        new URLSearchParams(
          outer.get('returnQuery') || ''
        );

      return {
        view: parts[1] || '',
        returnTo: outer.get('returnTo'),
        page: nested.get('page'),
        transactionType:
          nested.get('transactionType')
      };
    });

  if (
    !['property','development','land'].includes(
      phaseCOrganicDetail.view
    ) ||
    phaseCOrganicDetail.returnTo !== 'search' ||
    phaseCOrganicDetail.page !== '2' ||
    phaseCOrganicDetail.transactionType !==
      'sale' ||
    searchLogRequests !==
      phaseCOrganicLogsBeforeDetail
  ) {
    throw new Error(
      'Phase C organic Search -> detail context contract failed'
    );
  }

  await page.locator(
    '.view.active .btn-ghost'
  ).first().click();

  await page.waitForTimeout(350);

  const phaseCOrganicReturn =
    await page.evaluate(() => {
      const full =
        location.hash.replace(/^#\/?/, '');
      const [pathPart, queryPart = ''] =
        full.split('?');
      const parts =
        pathPart.split('/').filter(Boolean);
      const query =
        new URLSearchParams(queryPart);

      return {
        view: parts[1] || '',
        page: query.get('page'),
        transactionType:
          query.get('transactionType')
      };
    });

  const phaseCOrganicRows =
    await page.locator(
      '#search-grid .search-result-row'
    ).count();

  if (
    phaseCOrganicReturn.view !== 'search' ||
    phaseCOrganicReturn.page !== '2' ||
    phaseCOrganicReturn.transactionType !==
      'sale' ||
    phaseCOrganicRows !== 1 ||
    searchLogRequests -
      phaseCOrganicLogsBeforeDetail !== 1
  ) {
    throw new Error(
      'Phase C detail -> exact page 2 Search return contract failed'
    );
  }

  console.log(
    'PASS: Phase C organic page-2 detail round-trip with one normal return Search load'
  );

  await page.evaluate(() =>
    navigate(
      'search',
      null,
      {
        market: 'PT',
        transactionType: 'sale'
      }
    )
  );

  await page.waitForTimeout(450);

  await page.waitForSelector(
    '#search-results-aside .search-featured-card .card',
    { timeout: 3000 }
  );

  const phaseCFeaturedLogsBeforeDetail =
    searchLogRequests;

  await page.locator(
    '#search-results-aside .search-featured-card .card'
  ).first().click();

  await page.waitForTimeout(300);

  const phaseCFeaturedDetail =
    await page.evaluate(() => {
      const full =
        location.hash.replace(/^#\/?/, '');
      const [, queryPart = ''] =
        full.split('?');
      const outer =
        new URLSearchParams(queryPart);
      const nested =
        new URLSearchParams(
          outer.get('returnQuery') || ''
        );

      return {
        returnTo:
          outer.get('returnTo'),
        market:
          nested.get('market'),
        transactionType:
          nested.get('transactionType')
      };
    });

  if (
    phaseCFeaturedDetail.returnTo !==
      'search' ||
    phaseCFeaturedDetail.market !== 'PT' ||
    phaseCFeaturedDetail.transactionType !==
      'sale' ||
    searchLogRequests !==
      phaseCFeaturedLogsBeforeDetail
  ) {
    throw new Error(
      'Phase C Search Featured origin contract failed'
    );
  }

  await page.locator(
    '.view.active .btn-ghost'
  ).first().click();

  await page.waitForTimeout(350);

  const phaseCFeaturedReturn =
    await page.evaluate(() => {
      const full =
        location.hash.replace(/^#\/?/, '');
      const [pathPart, queryPart = ''] =
        full.split('?');
      const parts =
        pathPart.split('/').filter(Boolean);
      const query =
        new URLSearchParams(queryPart);

      return {
        view: parts[1] || '',
        market:
          query.get('market'),
        transactionType:
          query.get('transactionType')
      };
    });

  if (
    phaseCFeaturedReturn.view !== 'search' ||
    phaseCFeaturedReturn.market !== 'PT' ||
    phaseCFeaturedReturn.transactionType !==
      'sale' ||
    searchLogRequests -
      phaseCFeaturedLogsBeforeDetail !== 1
  ) {
    throw new Error(
      'Phase C Search Featured return contract failed'
    );
  }

  console.log(
    'PASS: Phase C Search Featured returns to the same Search'
  );

  await page.evaluate(() =>
    navigate(
      'market',
      'PT'
    )
  );

  await page.waitForTimeout(450);

  await page.waitForSelector(
    '#market-featured-root .card',
    { timeout: 3000 }
  );

  await page.locator(
    '#market-featured-root .card'
  ).first().click();

  await page.waitForTimeout(300);

  const phaseCMarketFeaturedDetail =
    await page.evaluate(() => {
      const full =
        location.hash.replace(/^#\/?/, '');
      const [, queryPart = ''] =
        full.split('?');
      const outer =
        new URLSearchParams(queryPart);

      return {
        returnTo:
          outer.get('returnTo'),
        returnQuery:
          outer.get('returnQuery')
      };
    });

  if (
    phaseCMarketFeaturedDetail.returnTo !==
      null ||
    phaseCMarketFeaturedDetail.returnQuery !==
      null
  ) {
    throw new Error(
      'Phase C Country Market Featured fabricated Search-origin context'
    );
  }

  await page.locator(
    '.view.active .btn-ghost'
  ).first().click();

  await page.waitForTimeout(350);

  const phaseCGenericFallback =
    await page.evaluate(() => {
      const full =
        location.hash.replace(/^#\/?/, '');
      const [pathPart, queryPart = ''] =
        full.split('?');
      const parts =
        pathPart.split('/').filter(Boolean);
      const query =
        new URLSearchParams(queryPart);

      return {
        view: parts[1] || '',
        market:
          query.get('market'),
        page:
          query.get('page')
      };
    });

  if (
    phaseCGenericFallback.view !== 'search' ||
    phaseCGenericFallback.market !== null ||
    phaseCGenericFallback.page !== null
  ) {
    throw new Error(
      'Phase C non-Search detail generic fallback failed'
    );
  }

  console.log(
    'PASS: Country Market Featured remains non-Search-origin'
  );

  await page.evaluate(() =>
    navigate(
      'search',
      null,
      {
        transactionType: 'sale'
      }
    )
  );

  await page.waitForTimeout(350);

  await page.evaluate(() =>
    goToSearchPage(2)
  );

  await page.waitForTimeout(250);

  await page.evaluate(() =>
    navigateSearchOriginDetail(
      'development',
      'asset_dev_rionorte'
    )
  );

  await page.waitForTimeout(350);

  await page.locator(
    '#development-root .units-table tbody tr'
  ).first().click();

  await page.waitForTimeout(250);

  const phaseCUnitBeforeLanguage =
    await page.evaluate(() => {
      const full =
        location.hash.replace(/^#\/?/, '');
      const [pathPart, queryPart = ''] =
        full.split('?');
      const parts =
        pathPart.split('/').filter(Boolean);
      const outer =
        new URLSearchParams(queryPart);
      const nested =
        new URLSearchParams(
          outer.get('returnQuery') || ''
        );

      return {
        lang: parts[0] || '',
        unit:
          outer.get('unit'),
        returnTo:
          outer.get('returnTo'),
        page:
          nested.get('page'),
        transactionType:
          nested.get('transactionType')
      };
    });

  if (
    !phaseCUnitBeforeLanguage.unit ||
    phaseCUnitBeforeLanguage.returnTo !==
      'search' ||
    phaseCUnitBeforeLanguage.page !== '2' ||
    phaseCUnitBeforeLanguage.transactionType !==
      'sale'
  ) {
    throw new Error(
      'Phase C Development unit/envelope coexistence failed'
    );
  }

  const phaseCLanguageTarget =
    phaseCUnitBeforeLanguage.lang === 'pt'
      ? 'fr'
      : 'pt';

  // Reuse the exact compact-language interaction already proven
  // elsewhere in this browser suite: open the menu summary, then
  // click the enabled target language option.
  await page.click(
    '#language-menu .lang-menu-summary'
  );

  await page.click(
    `#language-menu button[data-lang="${phaseCLanguageTarget}"]`
  );

  await page.waitForTimeout(350);

  const phaseCUnitAfterLanguage =
    await page.evaluate(() => {
      const full =
        location.hash.replace(/^#\/?/, '');
      const [pathPart, queryPart = ''] =
        full.split('?');
      const parts =
        pathPart.split('/').filter(Boolean);
      const outer =
        new URLSearchParams(queryPart);
      const nested =
        new URLSearchParams(
          outer.get('returnQuery') || ''
        );

      return {
        lang: parts[0] || '',
        unit:
          outer.get('unit'),
        returnTo:
          outer.get('returnTo'),
        page:
          nested.get('page'),
        transactionType:
          nested.get('transactionType')
      };
    });

  if (
    phaseCUnitAfterLanguage.lang !==
      phaseCLanguageTarget ||
    phaseCUnitAfterLanguage.unit !==
      phaseCUnitBeforeLanguage.unit ||
    phaseCUnitAfterLanguage.returnTo !==
      'search' ||
    phaseCUnitAfterLanguage.page !== '2' ||
    phaseCUnitAfterLanguage.transactionType !==
      'sale'
  ) {
    throw new Error(
      'Phase C actual language UI did not preserve detail return envelope/unit state'
    );
  }

  await page.locator(
    '.view.active .btn-ghost'
  ).first().click();

  await page.waitForTimeout(350);

  const phaseCUnitReturn =
    await page.evaluate(() => {
      const full =
        location.hash.replace(/^#\/?/, '');
      const [pathPart, queryPart = ''] =
        full.split('?');
      const parts =
        pathPart.split('/').filter(Boolean);
      const query =
        new URLSearchParams(queryPart);

      return {
        view:
          parts[1] || '',
        page:
          query.get('page'),
        transactionType:
          query.get('transactionType'),
        unit:
          query.get('unit')
      };
    });

  if (
    phaseCUnitReturn.view !== 'search' ||
    phaseCUnitReturn.page !== '2' ||
    phaseCUnitReturn.transactionType !==
      'sale' ||
    phaseCUnitReturn.unit !== null
  ) {
    throw new Error(
      'Phase C Development unit leaked into returned Search'
    );
  }

  console.log(
    'PASS: Development unit + actual language UI preserve envelope and never leak unit into Search'
  );

  await page.evaluate(() =>
    navigate(
      'search',
      null,
      {
        transactionType: 'sale'
      }
    )
  );

  await page.waitForTimeout(350);

  console.log('--- 4. SEARCH: pill click Land ---');
  await page.click('#view-search .tabs-row .pill[data-filter="land"]');
  await page.waitForTimeout(300);
  console.log('URL:', page.url());
  console.log('Cards:', await page.locator('#search-grid .card').count(), '(expect 1)');
  await shot('04-search-land-pill');

  console.log('--- 5. SEARCH: no-results state ---');
  await page.fill('#search-q', 'xyznonexistentplace');
  await page.click('#view-search .searchbar .go');
  await page.waitForTimeout(300);
  const emptyVisible = await page.locator('#search-empty').isVisible();
  const gridVisible = await page.locator('#search-grid').isVisible();
  console.log('Empty state visible:', emptyVisible, '| Grid visible:', gridVisible);
  console.log('Empty title text:', await page.locator('#search-empty-title').textContent());
  await shot('05-search-empty');

  console.log('--- 6. SEARCH: clear, then click first card -> property detail ---');
  await page.click('#view-search .searchbar button[data-i18n="search.clearFilters"]');
  await page.waitForTimeout(300);
  await page.click('#search-grid .card >> nth=0');
  await page.waitForTimeout(300);
  console.log('URL:', page.url());
  console.log('View active:', await page.locator('.view.active').getAttribute('id'));
  await shot('06-property-detail');

  console.log('--- 7. Property: click location -> back to search filtered ---');
  const locText = await page.locator('.loc-row span[onclick*="navigate"]').first().textContent();
  await page.locator('.loc-row span[onclick*="navigate"]').first().click();
  await page.waitForTimeout(300);
  console.log('Clicked location:', locText, '-> URL:', page.url());
  console.log('Search input value:', await page.inputValue('#search-q'));
  await shot('07-location-click-search');

  console.log('--- 8. Navigate to development, expand a unit ---');
  await page.evaluate(() => navigate('development','asset_dev_rionorte'));
  await page.waitForTimeout(300);
  await shot('08-development');
  await page.click('.units-table tbody tr >> nth=0');
  await page.waitForTimeout(300);
  console.log('URL with unit param:', page.url());
  const unitPanelVisible = await page.locator('#development-root .scenario-card').isVisible().catch(()=>false);
  console.log('Unit panel visible:', unitPanelVisible);
  await shot('09-development-unit-open');

  console.log('--- 9. PH1 unit (Sprint 1.5: no real "sold" concept exists — every unit returned by listUnitsForDevelopment() is, by construction, actively listed, so this now correctly shows AVAILABLE, not sold) ---');
  await page.click('.units-table tbody tr:has-text("unit_ph1")');
  await page.waitForTimeout(300);
  const enquireButtonVisible = await page.locator('.scenario-card button.btn-gold').isVisible().catch(()=>false);
  console.log('PH1 unit shows enquire button (available, not sold):', enquireButtonVisible);
  await shot('10-development-unit-sold');

  console.log('--- 10. Navigate to Land, verify source-backed detail ---');
  await page.evaluate(() => navigate('land','asset_land_boavista'));
  await page.waitForSelector('#land-root button.btn-gold[onclick^="openModal("]');

  const landText = await page.locator('#land-root').textContent();
  const legacyScenarioCards = await page.locator('#land-root .scenario-card').count();

  console.log('Land title visible:', landText.includes('Land in Boavista'), '(expect true)');
  console.log('Legacy scenario cards present:', legacyScenarioCards, '(expect 0)');
  await shot('11-land-top');


  console.log('--- 11. Land enquiry uses Supabase Partner enquiry policy ---');
  await page.click('#land-root button.btn-gold[onclick^="openModal("]');
  await page.waitForSelector('#modal-overlay.active');

  const directOptVisible = await page.locator('.contact-opt[data-opt="direct"]').isVisible().catch(()=>false);
  const qualifiedOptVisible = await page.locator('.contact-opt[data-opt="qualified"]').isVisible().catch(()=>false);

  console.log('Direct option visible:', directOptVisible, '(expect true)');
  console.log('Qualified option visible:', qualifiedOptVisible, '(expect true)');
  await shot('13-enquiry-land-partner-policy');
  await page.click('#modal-overlay .close-x');


  console.log('--- 12. Normal property enquiry (both options) ---');
  await page.evaluate(() => navigate('property','asset_apt_boavista'));
  await page.waitForTimeout(300);
  await page.click('.sidebar-card button.btn-gold[onclick^="openModal("]');
  await page.waitForTimeout(300);
  console.log('Direct visible:', await page.locator('.contact-opt[data-opt=\"direct\"]').isVisible());
  console.log('Qualified visible:', await page.locator('.contact-opt[data-opt=\"qualified\"]').isVisible());
  await shot('14-enquiry-property-both');
  await page.click('#modal-overlay .close-x');

  console.log('--- 13. Partner profile navigation ---');
  await page.evaluate(() => navigate('property','asset_apt_boavista'));
  await page.waitForTimeout(300);
  await page.click('.sidebar-card >> text=Z Imobiliária');
  await page.waitForTimeout(300);
  console.log('URL:', page.url());
  console.log('Partner portfolio cards:', await page.locator('#partner-root .card').count(), '(expect 7)');
  await shot('15-partner-profile');

  console.log('--- 14. Compact language menu PT, preserves route ---');
  await page.click('#language-menu .lang-menu-summary');
  await page.click('#language-menu button[data-lang="pt"]');
  await page.waitForTimeout(300);
  console.log('URL after PT switch:', page.url());
  console.log('Current language label:', await page.locator('#current-lang-label').textContent());
  console.log('h1 nav home label (should be Início... but we are on partner view, check nav):', await page.locator('[data-view=\"home\"]').textContent());
  await shot('16-partner-pt');

  console.log('--- 15. Compact language menu FR, then verify search state preserved from earlier ---');
  await page.evaluate(() => navigate('search', null, {subtype:'land'}));
  await page.waitForTimeout(300);
  await page.click('#language-menu .lang-menu-summary');
  await page.click('#language-menu button[data-lang="fr"]');
  await page.waitForTimeout(300);
  console.log('URL after FR switch (should keep category=land):', page.url());
  console.log('Current language label:', await page.locator('#current-lang-label').textContent());
  console.log('Cards:', await page.locator('#search-grid .card').count(), '(expect 1)');
  await shot('17-search-land-fr');

  console.log('--- 16. COUNTRY MARKET FEATURED FOUNDATION ---');

  const searchLogsBeforeMarket = searchLogRequests;

  await page.evaluate(() => navigate('market','PT',{}));
  await page.waitForSelector(
    '#market-featured-root[data-featured-state="ready"]'
  );
  await page.waitForTimeout(120);

  const ptFeaturedSlots =
    await page.locator(
      '#market-featured-root .market-featured-slot'
    ).count();
  const ptFeaturedCards =
    await page.locator(
      '#market-featured-root .market-featured-card .card'
    ).count();
  const searchLogsAfterMarket = searchLogRequests;

  console.log(
    'PT featured slots:',
    ptFeaturedSlots,
    '(expect 6)'
  );
  console.log(
    'PT source-backed featured cards:',
    ptFeaturedCards,
    '(expect 6)'
  );
  console.log(
    'Search log delta from passive Featured load:',
    searchLogsAfterMarket - searchLogsBeforeMarket,
    '(expect 0)'
  );

  if (
    ptFeaturedSlots !== 6 ||
    ptFeaturedCards !== 6 ||
    searchLogsAfterMarket !== searchLogsBeforeMarket
  ) {
    throw new Error(
      'COUNTRY MARKET FEATURED PT contract failed'
    );
  }

  await shot('18-market-pt-featured');

  await page
    .locator('#market-featured-root .market-featured-card .card')
    .first()
    .click();

  await page.waitForTimeout(200);

  const featuredTargetView =
    await page.locator('.view.active').getAttribute('id');

  if (
    ![
      'view-property',
      'view-development',
      'view-land'
    ].includes(featuredTargetView)
  ) {
    throw new Error(
      'Featured card did not open a canonical detail view'
    );
  }

  console.log(
    'Featured card canonical target:',
    featuredTargetView
  );

  await page.evaluate(() => navigate('market','FR',{}));
  await page.waitForSelector(
    '#market-featured-root[data-featured-state="ready"]'
  );

  const frCards =
    await page.locator(
      '#market-featured-root .market-featured-card'
    ).count();
  const frEmpty =
    await page.locator(
      '#market-featured-root .market-featured-empty'
    ).count();

  console.log(
    'FR source-backed Featured cards:',
    frCards,
    '(expect 1)'
  );
  console.log(
    'FR explicit empty slots:',
    frEmpty,
    '(expect 5)'
  );

  if (frCards !== 1 || frEmpty !== 5) {
    throw new Error(
      'Country Market Featured FR source-scope contract failed'
    );
  }

  await page.evaluate(() => navigate('market','AE-DU',{}));
  await page.waitForSelector(
    '#market-featured-root[data-featured-state="ready"]'
  );

  const dubaiParentCards =
    await page.locator(
      '#market-featured-root .market-featured-card'
    ).count();
  const dubaiEmpty =
    await page.locator(
      '#market-featured-root .market-featured-empty'
    ).count();

  console.log(
    'Dubai parent-country substitution cards:',
    dubaiParentCards,
    '(expect 0)'
  );
  console.log(
    'Dubai exact-market Featured empty slots:',
    dubaiEmpty,
    '(expect 6)'
  );

  if (dubaiParentCards !== 0 || dubaiEmpty !== 6) {
    throw new Error(
      'Dubai Featured substituted non-exact market inventory'
    );
  }

  await shot('19-market-dubai-featured-empty');

  console.log('--- 17. COUNTRY MARKET SCOPED SEARCH ---');

  await page.evaluate(() => navigate('market','PT',{}));
  await page.waitForSelector(
    '#market-search-root[data-market-search-state="ready"]'
  );

  await page.selectOption(
    '#market-search-transaction',
    'sale'
  );
  await page.selectOption(
    '#market-search-type',
    ''
  );
  await page.click(
    '#market-search-root button.btn-gold'
  );

  await page.waitForTimeout(250);

  const ptUrl = page.url();
  const ptScopedCards =
    await page.locator('#search-grid .card').count();

  console.log('PT scoped URL:', ptUrl);
  console.log(
    'PT scoped result cards:',
    ptScopedCards,
    '(expect 6)'
  );

  if (
    !ptUrl.includes('market=PT') ||
    ptScopedCards !== 6
  ) {
    throw new Error(
      'Portugal market-scoped Search contract failed'
    );
  }

  await page.click(
    '#view-search .searchbar button[data-i18n="search.clearFilters"]'
  );
  await page.waitForTimeout(220);

  if (!page.url().includes('market=PT')) {
    throw new Error(
      'Clear Search filters dropped selected market'
    );
  }

  console.log(
    'PT market preserved after clear:',
    page.url().includes('market=PT')
  );

  await page.evaluate(() => navigate('market','FR',{}));
  await page.waitForSelector(
    '#market-search-root[data-market-search-state="ready"]'
  );
  await page.click(
    '#market-search-root button.btn-gold'
  );
  await page.waitForTimeout(250);

  const frScopedCards =
    await page.locator('#search-grid .card').count();

  console.log(
    'FR scoped result cards:',
    frScopedCards,
    '(expect 1)'
  );

  if (
    !page.url().includes('market=FR') ||
    frScopedCards !== 1
  ) {
    throw new Error(
      'France market-scoped Search contract failed'
    );
  }

  await page.evaluate(() => navigate('market','AE-DU',{}));
  await page.waitForSelector(
    '#market-search-root[data-market-search-state="ready"]'
  );

  const dubaiState =
    await page.locator('#market-search-root')
      .getAttribute('data-market-search-state');

  const dubaiSearchButtonCount =
    await page.locator(
      '#market-search-root button.btn-gold'
    ).count();

  console.log(
    'Dubai exact-market search state:',
    dubaiState,
    '(expect ready)'
  );
  console.log(
    'Dubai search buttons:',
    dubaiSearchButtonCount,
    '(expect 1)'
  );

  if (
    dubaiState !== 'ready' ||
    dubaiSearchButtonCount !== 1
  ) {
    throw new Error(
      'Dubai exact-market Search form did not activate'
    );
  }

  await page.click(
    '#market-search-root button.btn-gold'
  );
  await page.waitForTimeout(250);

  const dubaiUrl = page.url();
  const dubaiDirectCards =
    await page.locator('#search-grid .card').count();

  const dubaiEmptyVisible =
    await page.locator('#search-empty').isVisible();

  console.log('Dubai exact-market URL:', dubaiUrl);
  console.log(
    'Dubai exact-market result cards:',
    dubaiDirectCards,
    '(expect 0 — canonical node, zero linked zones)'
  );
  console.log(
    'Dubai ordinary empty-result state visible:',
    dubaiEmptyVisible,
    '(expect true)'
  );

  if (
    !dubaiUrl.includes('market=AE-DU') ||
    dubaiDirectCards !== 0 ||
    !dubaiEmptyVisible
  ) {
    throw new Error(
      'Dubai exact-market Search widened beyond its authoritative empty zone set'
    );
  }

  await shot('20-market-scoped-search');


  console.log(
    '--- 17B. B3/B4 Search Featured rail separation ---'
  );

  await page.waitForFunction(() => {
    const aside =
      document.getElementById('search-results-aside');

    return (
      aside &&
      ['ready', 'empty', 'error'].includes(
        aside.dataset.searchAsideState
      )
    );
  });

  const dubaiFeaturedRail =
    await page.evaluate(() => {
      const aside =
        document.getElementById('search-results-aside');

      return {
        state: aside.dataset.searchAsideState,
        ariaHidden:
          aside.getAttribute('aria-hidden'),
        slots:
          aside.querySelectorAll(
            '[data-search-featured-slot]'
          ).length,
        cards:
          aside.querySelectorAll(
            '.search-featured-card'
          ).length,
        empty:
          aside.querySelectorAll(
            '.search-featured-empty'
          ).length
      };
    });

  console.log(
    'Dubai Search Featured rail:',
    JSON.stringify(dubaiFeaturedRail)
  );

  if (
    dubaiFeaturedRail.state !== 'empty' ||
    dubaiFeaturedRail.ariaHidden !== 'false' ||
    dubaiFeaturedRail.slots !== 3 ||
    dubaiFeaturedRail.cards !== 0 ||
    dubaiFeaturedRail.empty !== 3
  ) {
    throw new Error(
      'B3/B4 Dubai exact-market Featured rail must fail closed into three empty slots'
    );
  }

  await page.evaluate(() => {
    window.location.hash =
      '#/fr/search?transactionType=sale';
  });

  await page.waitForFunction(() => {
    const aside =
      document.getElementById('search-results-aside');

    return (
      aside &&
      aside.dataset.searchAsideState ===
        'unscoped' &&
      aside.getAttribute('aria-hidden') ===
        'true'
    );
  });

  const unscopedFeaturedRail =
    await page.evaluate(() => {
      const aside =
        document.getElementById('search-results-aside');

      return {
        state: aside.dataset.searchAsideState,
        ariaHidden:
          aside.getAttribute('aria-hidden'),
        childCount: aside.children.length,
        html: aside.innerHTML.trim()
      };
    });

  console.log(
    'Unscoped Search Featured rail:',
    JSON.stringify(unscopedFeaturedRail)
  );

  if (
    unscopedFeaturedRail.state !== 'unscoped' ||
    unscopedFeaturedRail.ariaHidden !== 'true' ||
    unscopedFeaturedRail.childCount !== 0 ||
    unscopedFeaturedRail.html !== ''
  ) {
    throw new Error(
      'B3/B4 unscoped Search must keep Featured rail hidden and empty'
    );
  }

  await page.evaluate(() => {
    window.location.hash =
      '#/fr/search?market=PT&transactionType=sale';
  });

  await page.waitForFunction(() => {
    const aside =
      document.getElementById('search-results-aside');

    return (
      aside &&
      aside.dataset.searchAsideState ===
        'ready'
    );
  });

  const ptFeaturedRail =
    await page.evaluate(() => {
      const aside =
        document.getElementById('search-results-aside');

      const visibleText =
        (aside.textContent || '').trim();

      return {
        state: aside.dataset.searchAsideState,
        market:
          aside.dataset.searchFeaturedMarket,
        ariaHidden:
          aside.getAttribute('aria-hidden'),
        slots:
          aside.querySelectorAll(
            '[data-search-featured-slot]'
          ).length,
        cards:
          aside.querySelectorAll(
            '.search-featured-card'
          ).length,
        empty:
          aside.querySelectorAll(
            '.search-featured-empty'
          ).length,
        sharedCards:
          aside.querySelectorAll(
            '.search-featured-card .card'
          ).length,
        organicRowsInsideRail:
          aside.querySelectorAll(
            '.search-result-row'
          ).length,
        hasForbiddenClaim:
          /\b(sponsored|promoted|paid|advertisement)\b/i.test(
            visibleText
          )
      };
    });

  console.log(
    'PT Search Featured rail:',
    JSON.stringify(ptFeaturedRail)
  );

  if (
    ptFeaturedRail.state !== 'ready' ||
    ptFeaturedRail.market !== 'PT' ||
    ptFeaturedRail.ariaHidden !== 'false' ||
    ptFeaturedRail.slots !== 3 ||
    ptFeaturedRail.cards !== 3 ||
    ptFeaturedRail.empty !== 0 ||
    ptFeaturedRail.sharedCards !== 3 ||
    ptFeaturedRail.organicRowsInsideRail !== 0 ||
    ptFeaturedRail.hasForbiddenClaim
  ) {
    throw new Error(
      'B3/B4 PT Search Featured rail structural separation contract failed'
    );
  }

  console.log(
    'PASS: B3/B4 unscoped hide + exact-market empty + PT three-slot Featured rail'
  );

  console.log();
  console.log('=== CONSOLE ERRORS CAUGHT ===');
  console.log(consoleErrors.length === 0 ? 'NONE' : consoleErrors.join('\n'));


  console.log();
  console.log('=== MAP.V4 MAINLAND + RELIEF NOTE SMOKE ===');

  await page.evaluate(() => {
    window.location.hash = '/en/market/PT';
  });

  await page.waitForFunction(() => {
    return Boolean(
      document.querySelector('#market-root .market-map-visual') &&
      document.querySelector('#market-root .market-map-omission-note')
    );
  });

  const ptRelief = await page
    .locator('#market-root .market-map-slot')
    .getAttribute('data-map-relief-v1');

  const ptRequired = await page
    .locator('#market-root .market-map-slot')
    .getAttribute('data-map-note-required');

  const ptEn = (
    await page.locator('#market-root .market-map-omission-note').textContent()
    || ''
  ).trim();

  if (
    ptRelief !== 'true' ||
    ptRequired !== 'true' ||
    ptEn !== 'Non-mainland territories are not represented on this map.'
  ) {
    throw new Error('MAP.V4 PT English note/relief contract failed');
  }

  await page.click('#language-menu .lang-menu-summary');
  await page.click('#language-menu button[data-lang="pt"]');

  await page.waitForFunction(() => {
    const note = document.querySelector('#market-root .market-map-omission-note');
    return Boolean(note && note.textContent.includes('Os territórios não continentais'));
  });

  const ptPt = (
    await page.locator('#market-root .market-map-omission-note').textContent()
    || ''
  ).trim();

  if (
    ptPt !== 'Os territórios não continentais não estão representados neste mapa.'
  ) {
    throw new Error('MAP.V4 PT localized omission note failed');
  }

  await page.evaluate(() => {
    window.location.hash = '/en/market/BE';
  });

  await page.waitForFunction(() =>
    Boolean(document.querySelector('#market-root .market-map-slot'))
  );

  const beCount = await page
    .locator('#market-root .market-map-omission-note')
    .count();

  const beRequired = await page
    .locator('#market-root .market-map-slot')
    .getAttribute('data-map-note-required');

  if (beCount !== 0 || beRequired !== 'false') {
    throw new Error('MAP.V4 unchanged market incorrectly exposes note');
  }

  console.log('PASS: MAP.V4 PT note localized; BE note absent');

  await browser.close();
})();
