/* ============================================================
   Z FIND — SPRINT 1.2 VERIFICATION (Homepage, Supabase-backed)
   ============================================================
   Cannot reach a real Supabase project from this sandbox (network
   allowlist), so this test intercepts the REST calls the Supabase JS
   SDK makes (page.route) and returns controlled fake payloads shaped
   exactly like real API responses. This exercises the ACTUAL code —
   loadHomeCards(), the mapping functions, renderHome()'s async flow —
   not a reimplementation of it. Three scenarios: real data, empty
   result, and a hard failure.

   Run: node tests/browser/zfind-web/sprint-1-2-verification.js
   ============================================================ */

const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-web', 'dist', 'z-find-prototype.html');

const MOCK_PROPERTY_ROW = {
  id: 'prop-1', subtype: 'apartment', typology: 'T2', area_sqm: 85, zone_lite_id: 'zone-1',
  zones_lite: { name: 'Boavista', city: 'Porto', country_iso: 'PT' },
  representations: [{ target_type: 'property', status: 'active', listings: [{
    id: 'listing-1', channel: 'standard', price_current: 385000, currency_iso: 'EUR', price_is_from: false, status: 'published',
    listing_content: [{ locale: 'en', title: 'Renovated Apartment in Boavista' }],
  }] }],
};
const MOCK_LAND_ROW = {
  id: 'land-1', subtype: 'land', typology: null, area_sqm: 3200, zone_lite_id: 'zone-1',
  zones_lite: { name: 'Boavista', city: 'Porto', country_iso: 'PT' },
  representations: [{ target_type: 'property', status: 'active', listings: [{
    id: 'listing-2', channel: 'standard', price_current: 1450000, currency_iso: 'EUR', price_is_from: false, status: 'published',
    listing_content: [{ locale: 'en', title: 'Urban Plot' }],
  }] }],
};
const MOCK_DEVELOPMENT_ROW = {
  id: 'dev-1', name: 'Rio Norte', zone_lite_id: 'zone-2',
  zones_lite: { name: 'Matosinhos Sul', city: 'Matosinhos', country_iso: 'PT' },
  representations: [{ target_type: 'development', status: 'active', listings: [{
    id: 'listing-3', channel: 'standard', price_current: 340000, currency_iso: 'EUR', price_is_from: true, status: 'published',
    listing_content: [{ locale: 'en', title: 'Rio Norte Development' }],
  }] }],
};

async function mockRoutes(page, { propertiesData, developmentsData, propertiesFail }) {
  await page.route('**/rest/v1/properties**', route => {
    if (propertiesFail) return route.fulfill({ status: 500, body: JSON.stringify({ message: 'Internal Server Error' }) });
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(propertiesData) });
  });
  await page.route('**/rest/v1/developments**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(developmentsData) });
  });
  await page.route('**/rest/v1/searches**', route => route.fulfill({ status: 201, contentType: 'application/json', body: '{}' }));
}

async function run() {
  let pass = 0, fail = 0;
  function assert(cond, label) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }

  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});

  // ---- Scenario 1: real data ----
  console.log('\n=== Scenario 1: properties + developments returned ===');
  {
    const page = await browser.newPage();
    await mockRoutes(page, { propertiesData: [MOCK_PROPERTY_ROW, MOCK_LAND_ROW], developmentsData: [MOCK_DEVELOPMENT_ROW] });
    await page.goto(FILE_URL);
    await page.waitForTimeout(600); // allow the async renderHome() to complete

    const state = await page.evaluate(() => ({
      statusVisible: document.getElementById('home-status').style.display !== 'none',
      gridsVisible: document.getElementById('home-grids-wrap').style.display !== 'none',
      homeGridCards: document.querySelectorAll('#home-grid .card').length,
      landGridCards: document.querySelectorAll('#home-land-grid .card').length,
      homeGridText: document.getElementById('home-grid').textContent,
    }));

    assert(!state.statusVisible, 'Status container hidden when data loads successfully');
    assert(state.gridsVisible, 'Grids container visible when data loads successfully');
    assert(state.homeGridCards === 2, `home-grid shows 2 cards (1 apartment + 1 development) — got ${state.homeGridCards}`);
    assert(state.landGridCards === 1, `home-land-grid shows 1 card — got ${state.landGridCards}`);
    assert(state.homeGridText.includes('Renovated Apartment in Boavista'), 'Real property title rendered');
    assert(state.homeGridText.includes('Rio Norte Development'), 'Real development title rendered');
    await page.close();
  }

  // ---- Scenario 2: empty result ----
  console.log('\n=== Scenario 2: zero published listings ===');
  {
    const page = await browser.newPage();
    await mockRoutes(page, { propertiesData: [], developmentsData: [] });
    await page.goto(FILE_URL);
    await page.waitForTimeout(600);

    const state = await page.evaluate(() => ({
      statusVisible: document.getElementById('home-status').style.display !== 'none',
      gridsVisible: document.getElementById('home-grids-wrap').style.display !== 'none',
      statusTitle: document.getElementById('home-status-title').textContent,
    }));

    assert(state.statusVisible, 'Status container visible when there is no data');
    assert(!state.gridsVisible, 'Grids container hidden when there is no data');
    assert(state.statusTitle.length > 0 && !state.statusTitle.includes('could not'), 'Empty state shows the EMPTY message, not the error message');
    await page.close();
  }

  // ---- Scenario 3: hard failure ----
  console.log('\n=== Scenario 3: Supabase request fails ===');
  {
    const page = await browser.newPage();
    await mockRoutes(page, { propertiesData: [], developmentsData: [], propertiesFail: true });
    await page.goto(FILE_URL);
    await page.waitForTimeout(600);

    const state = await page.evaluate(() => ({
      statusVisible: document.getElementById('home-status').style.display !== 'none',
      gridsVisible: document.getElementById('home-grids-wrap').style.display !== 'none',
      statusTitle: document.getElementById('home-status-title').textContent,
    }));

    assert(state.statusVisible, 'Status container visible on failure');
    assert(!state.gridsVisible, 'Grids container hidden on failure');
    assert(state.statusTitle.toLowerCase().includes('could not') || state.statusTitle.toLowerCase().includes('não foi possível') || state.statusTitle.toLowerCase().includes('impossible'), 'Error state shows the ERROR message, not the empty message');
    await page.close();
  }

  await browser.close();

  console.log('\n============================================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('============================================================');
  if (fail > 0) process.exit(1);
}

run();
