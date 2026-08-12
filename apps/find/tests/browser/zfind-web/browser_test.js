const { chromium } = require('playwright');
const path = require('path');

/* ============================================================
   Sprint 1.3 update: Home and Search now source data from Supabase
   (via window.ZFindServices), not db.js directly — this suite's
   pre-existing assertions (villa:2, all:7, land:1, etc.) were written
   against db.js's 7-listing fixture. Rather than rewrite those
   assertions, this mock data replicates the SAME 7-listing shape
   (3 apartments, 2 villas [1 standard, 1 offmarket], 1 development,
   1 land) over the network — so the suite keeps testing the same
   documented behavior, sourced the same way the real app now sources
   it, real network calls just replaced with realistic fixed
   responses (this sandbox cannot reach real Supabase at all — see
   the CORS root-cause investigation). Property/Development/Land
   DETAIL pages are untouched here: those still read db.js directly
   (Sprint 1.4/1.5 have not migrated them yet), so their own fixture
   data continues to apply unmodified.
   ============================================================ */
function mockProperty(id, subtype, channel, title, zoneName) {
  return {
    id, subtype, typology: subtype === 'land' ? null : 'T2', area_sqm: 80, zone_lite_id: 'z1',
    zones_lite: { name: zoneName, city: 'Porto', country_iso: 'PT' },
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
  mockProperty('asset_apt_paris_marais', 'apartment', 'standard', 'Apartment in Le Marais', 'Le Marais'),
  mockProperty('asset_townhouse_cedofeita', 'villa', 'standard', 'Villa in Cedofeita', 'Cedofeita'),
  mockProperty('asset_villa_offmarket_foz', 'villa', 'offmarket', 'Off-market Villa in Foz', 'Foz do Douro'),
  mockProperty('asset_land_boavista', 'land', 'standard', 'Land in Boavista', 'Boavista'),
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
// identical to the original db.js fixture (unit_2a...unit_ph1) so
// existing click-by-position/click-by-text test steps still resolve.
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

async function mockSupabaseRoutes(page) {
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
    let data = MOCK_PROPERTIES;
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
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DEVELOPMENTS) });
  });
  await page.route('**/rest/v1/searches**', route => route.fulfill({ status: 201, contentType: 'application/json', body: '{}' }));
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
  console.log('Result cards (villa filter):', cardCount1, '(expect 2: Cedofeita + off-market villa — subtype and channel are independent axes now)');
  await shot('02-search-villa');

  console.log('--- 3. SEARCH: clear filters ---');
  await page.click('button:has-text("Clear filters")');
  await page.waitForTimeout(300);
  const cardCountAll = await page.locator('#search-grid .card').count();
  console.log('Result cards (all):', cardCountAll, '(expect 7)');
  await shot('03-search-all');

  console.log('--- 4. SEARCH: pill click Land ---');
  await page.click('#view-search .tabs-row .pill:has-text("Land")');
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
  await page.click('button:has-text("Clear filters")');
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
  const unitPanelVisible = await page.locator('.scenario-card:has-text("Unit")').isVisible().catch(()=>false);
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
  await page.waitForSelector('#land-root button:has-text("Contact about this opportunity")');

  const landText = await page.locator('#land-root').textContent();
  const legacyScenarioButtons = await page.locator('button:has-text("Scenarios")').count();

  console.log('Land title visible:', landText.includes('Land in Boavista'), '(expect true)');
  console.log('Legacy Scenarios button present:', legacyScenarioButtons, '(expect 0)');
  await shot('11-land-top');


  console.log('--- 11. Land enquiry uses Supabase Partner enquiry policy ---');
  await page.click('#land-root button:has-text("Contact about this opportunity")');
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
  await page.click('button:has-text("Contact about this opportunity")');
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

  console.log('--- 14. Language switch PT, preserves route ---');
  await page.click('.lang-switch button:has-text(\"PT\")');
  await page.waitForTimeout(300);
  console.log('URL after PT switch:', page.url());
  console.log('h1 nav home label (should be Início... but we are on partner view, check nav):', await page.locator('[data-view=\"home\"]').textContent());
  await shot('16-partner-pt');

  console.log('--- 15. Language switch FR, then verify search state preserved from earlier ---');
  await page.evaluate(() => navigate('search', null, {subtype:'land'}));
  await page.waitForTimeout(300);
  await page.click('.lang-switch button:has-text(\"FR\")');
  await page.waitForTimeout(300);
  console.log('URL after FR switch (should keep category=land):', page.url());
  console.log('Cards:', await page.locator('#search-grid .card').count(), '(expect 1)');
  await shot('17-search-land-fr');

  console.log();
  console.log('=== CONSOLE ERRORS CAUGHT ===');
  console.log(consoleErrors.length === 0 ? 'NONE' : consoleErrors.join('\n'));

  await browser.close();
})();
