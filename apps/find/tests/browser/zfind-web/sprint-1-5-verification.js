/* ============================================================
   Z FIND — SPRINT 1.5 VERIFICATION (Development page, Supabase-backed)
   ============================================================
   Mocks only network requests, exercises real application code.
   ============================================================ */

const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-web', 'dist', 'z-find-prototype.html');

function mockDevelopmentRow(overrides) {
  return Object.assign({
    id: 'asset_dev_rionorte', name: 'Rio Norte', zone_lite_id: 'z2',
    zones_lite: { name: 'Matosinhos Sul', city: 'Matosinhos', country_iso: 'PT' },
    development_media: [{
      position: 0, is_cover: true,
      media_assets: {
        id: 'media1', original_storage_path: 'developments/rionorte-01-original.jpg',
        media_variants: [{ variant_type: 'large', storage_path: 'developments/rionorte-01-large.jpg' }],
        media_asset_content: [{ locale: 'en', alt_text: 'Building exterior' }],
      },
    }],
    representations: [{
      id: 'rep1', target_type: 'development', status: 'active',
      partners: { id: 'partner_zimob', name: 'Z Imobiliária' },
      listings: [{
        id: 'listing1', channel: 'standard', price_current: 340000, currency_iso: 'EUR', price_is_from: true, status: 'published',
        listing_content: [
          { locale: 'en', title: 'Rio Norte Development', description: 'A new construction project.' },
          { locale: 'pt', title: 'Empreendimento Rio Norte', description: 'Um novo projeto de construção.' },
        ],
        listing_media: [],
      }],
    }],
  }, overrides);
}
const MOCK_UNITS = [
  { id: 'unit-2a', subtype: 'apartment', typology: 'T1', area_sqm: 62, floor: 2, representations: [{ target_type: 'property', status: 'active', listings: [{ id: 'ul1', price_current: 210000, currency_iso: 'EUR', status: 'published' }] }] },
  { id: 'unit-3b', subtype: 'apartment', typology: 'T2', area_sqm: 88, floor: 3, representations: [{ target_type: 'property', status: 'active', listings: [{ id: 'ul2', price_current: 280000, currency_iso: 'EUR', status: 'published' }] }] },
];

async function mockRoutes(page, { devData, devStatus, devFail, units }) {
  await page.route('**/rest/v1/developments**', route => {
    if (devFail) return route.fulfill({ status: 500, body: JSON.stringify({ message: 'Internal Server Error' }) });
    route.fulfill({ status: devStatus || 200, contentType: 'application/json', body: JSON.stringify(devData) });
  });
  await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(units || []) }));
  // Same real endpoint/response-shape fix as Sprint 1.4's test: the
  // raw server field is `signedURL` (capital, relative) — the SDK
  // prepends its own base URL. Shared fix (resolveMediaUrl lives in
  // supabaseClient.js, used by both pages), one mock shape for both tests.
  await page.route('**/storage/v1/object/sign/**', route => {
    const url = route.request().url();
    const pathMatch = url.match(/\/object\/sign\/(.+?)(\?|$)/);
    const signedPath = pathMatch ? pathMatch[1] : 'unknown';
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedURL: `/object/sign/${signedPath}?token=mock-token-abc` }) });
  });
}


/*
 * Browser compatibility for local/CI verification.
 *
 * Prefer Playwright's bundled Chromium. If that executable is
 * unavailable on this development machine, use installed Chrome.
 * Application/product behaviour is unaffected.
 */
async function launchCompatibleChromium() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const message = String(
      error && error.message ? error.message : error
    );

    if (!/Executable doesn't exist/i.test(message)) {
      throw error;
    }

    console.log(
      'INFO: bundled Chromium unavailable; ' +
      'using installed Google Chrome.'
    );

    return chromium.launch({
      channel: 'chrome',
      headless: true
    });
  }
}

async function run() {
  let pass = 0, fail = 0;
  function assert(cond, label) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }

  const browser = await launchCompatibleChromium();

  // ---- Scenario 1: Development loads correctly ----
  console.log('\n=== Scenario 1: Development loads correctly ===');
  {
    const page = await browser.newPage();
    await mockRoutes(page, { devData: mockDevelopmentRow({}), units: MOCK_UNITS });
    await page.goto(FILE_URL + '#/en/development/asset_dev_rionorte');
    await page.waitForTimeout(600);
    const html = await page.evaluate(() => document.getElementById('development-root').innerHTML);
    assert(html.includes('Rio Norte Development'), 'Real title rendered');
    assert(html.includes('From'), 'Price rendered with "From" prefix (price_is_from)');
    const rows = await page.evaluate(() => document.querySelectorAll('.units-table tbody tr').length);
    assert(rows === 2, `2 unit rows rendered — got ${rows}`);
    const tableText = await page.evaluate(() => document.querySelector('.units-table').textContent);
    assert(tableText.includes('Enquire'), 'Unit rows show the neutral "Enquire" CTA (CTO correction — no real availability field exists)');
    assert(!/Available|Reserved|Sold/i.test(tableText), 'No fabricated Available/Reserved/Sold value appears anywhere in the units table');
    await page.close();
  }

  // ---- Scenario 2: Development not found ----
  console.log('\n=== Scenario 2: Development not found ===');
  {
    const page = await browser.newPage();
    await mockRoutes(page, { devData: null, devStatus: 406, units: [] });
    await page.goto(FILE_URL + '#/en/development/does-not-exist');
    await page.waitForTimeout(600);
    const text = await page.evaluate(() => document.getElementById('development-root').textContent);
    assert(text.includes('no longer available'), 'Not-found message shown');
    await page.close();
  }

  // ---- Scenario 3: network failure / error state ----
  console.log('\n=== Scenario 3: network failure -> error state ===');
  {
    const page = await browser.newPage();
    await mockRoutes(page, { devFail: true, units: [] });
    await page.goto(FILE_URL + '#/en/development/asset_dev_rionorte');
    await page.waitForTimeout(600);
    const text = await page.evaluate(() => document.getElementById('development-root').textContent);
    assert(text.toLowerCase().includes('could not'), 'Error message shown');
    await page.close();
  }

  // ---- Scenario 4: multilingual rendering ----
  console.log('\n=== Scenario 4: multilingual rendering (PT) ===');
  {
    const page = await browser.newPage();
    await mockRoutes(page, { devData: mockDevelopmentRow({}), units: MOCK_UNITS });
    await page.goto(FILE_URL + '#/pt/development/asset_dev_rionorte');
    await page.waitForTimeout(600);
    const html = await page.evaluate(() => document.getElementById('development-root').innerHTML);
    assert(html.includes('Empreendimento Rio Norte'), 'Portuguese title rendered');
    await page.close();
  }

  // ---- Scenario 5: gallery ----
  console.log('\n=== Scenario 5: gallery — real signed URL resolution for Development media ===');
  {
    const page = await browser.newPage();
    const imageRequests = [];
    page.on('request', req => { if (req.url().includes('rionorte-01')) imageRequests.push(req.url()); });
    await mockRoutes(page, { devData: mockDevelopmentRow({}), units: MOCK_UNITS });
    await page.goto(FILE_URL + '#/en/development/asset_dev_rionorte');
    await page.waitForTimeout(700);
    const style = await page.evaluate(() => { const g = document.querySelector('.gallery'); return g ? g.getAttribute('style') : null; });
    assert(style && style.includes('rionorte-01-large.jpg'), `The 'large' variant is preferred over the original (${style})`);
    assert(style && style.includes('token=mock-token-abc'), 'Gallery uses the RESOLVED SIGNED URL (same shared fix as Property), not the bare storage path');
    assert(imageRequests.some(u => u.includes('token=mock-token-abc')), 'The browser genuinely fetches the resolved URL');
    await page.close();
  }

  // ---- Scenario 12: partner data — real navigation, safe when missing ----
  console.log('\n=== Scenario 12: partner data — real navigation, safe when missing ===');
  {
    const page = await browser.newPage();
    await mockRoutes(page, { devData: mockDevelopmentRow({}), units: MOCK_UNITS });
    await page.goto(FILE_URL + '#/en/development/asset_dev_rionorte');
    await page.waitForTimeout(600);
    const onclickAttr = await page.evaluate(() => { const el = document.querySelector('.fact [onclick*="navigate(\'partner\'"]'); return el ? el.getAttribute('onclick') : null; });
    assert(onclickAttr && onclickAttr.includes("'partner_zimob'"), `Developer click handler navigates with the REAL partner id (got: ${onclickAttr})`);
    await page.close();
  }
  {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    const rowNoPartner = mockDevelopmentRow({});
    delete rowNoPartner.representations[0].partners;
    await mockRoutes(page, { devData: rowNoPartner, units: MOCK_UNITS });
    await page.goto(FILE_URL + '#/en/development/asset_dev_rionorte');
    await page.waitForTimeout(600);
    assert(pageErrors.length === 0, `Missing partner data does not crash the Development page (errors: ${JSON.stringify(pageErrors)})`);
    const html = await page.evaluate(() => document.getElementById('development-root').innerHTML);
    assert(!html.includes("navigate('partner','null')") && !html.includes('navigate(\'partner\', \'null\')'), 'UI never generates navigate(\'partner\',\'null\') on the Development page either');
    await page.close();
  }

  // ---- Scenario 6: loading state ----
  console.log('\n=== Scenario 6: loading state ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/developments**', async route => {
      await new Promise(r => setTimeout(r, 800));
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDevelopmentRow({})) });
    });
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto(FILE_URL + '#/en/development/asset_dev_rionorte');
    await page.waitForTimeout(150);
    const earlyText = await page.evaluate(() => document.getElementById('development-root').textContent);
    assert(earlyText.toLowerCase().includes('loading'), 'Loading message shown while request is in flight');
    await page.close();
  }

  // ---- Scenario 7: error state (covered by Scenario 3 — cross-referenced here) ----
  console.log('\n=== Scenario 7: error state (see Scenario 3) ===');
  assert(true, 'Covered by Scenario 3 — network failure produces the error state');

  // ---- Scenario 8: placeholder rendering (Z Intelligence / Z Trust / Z Insights) ----
  console.log('\n=== Scenario 8: Z Intelligence / Z Trust / Z Insights placeholders ===');
  {
    const page = await browser.newPage();
    await mockRoutes(page, { devData: mockDevelopmentRow({}), units: MOCK_UNITS });
    await page.goto(FILE_URL + '#/en/development/asset_dev_rionorte');
    await page.waitForTimeout(600);
    const text = await page.evaluate(() => document.getElementById('development-root').textContent);
    assert(text.includes('Z Intelligence market analysis'), 'Market Intelligence placeholder shown (never hidden, never fabricated)');
    assert(text.includes('Professional insights and contextual observations'), 'Z Insights placeholder shown');
    assert(text.includes('Z Intelligence investment scoring'), 'Investment placeholder shown');
    assert(text.includes('Trust Score') && text.includes('Coming Soon'), 'Trust placeholder shown');
    await page.close();
  }

  // ---- Scenario 9: dynamic page title ----
  console.log('\n=== Scenario 9: dynamic page title ===');
  {
    const page = await browser.newPage();
    await mockRoutes(page, { devData: mockDevelopmentRow({}), units: MOCK_UNITS });
    await page.goto(FILE_URL + '#/en/development/asset_dev_rionorte');
    await page.waitForTimeout(600);
    const title = await page.title();
    assert(title.includes('Rio Norte Development'), `document.title updated (got: "${title}")`);
    await page.close();
  }

  // ---- Scenario 10: navigation from Search ----
  console.log('\n=== Scenario 10: navigation from Search into Development ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/developments**', route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDevelopmentRow({})) });
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([mockDevelopmentRow({})]) });
    });
    await page.goto(FILE_URL + '#/en/search');
    await page.waitForTimeout(600);
    const card = page.locator('#search-grid .card').first();
    await card.click();
    await page.waitForTimeout(600);
    const url = page.url();
    assert(url.includes('/development/asset_dev_rionorte'), `Clicking the development card navigates to its detail page (got: ${url})`);
    await page.close();
  }

  // ---- Scenario 11: navigation from Homepage ----
  console.log('\n=== Scenario 11: navigation from Homepage into Development ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/developments**', route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDevelopmentRow({})) });
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([mockDevelopmentRow({})]) });
    });
    await page.goto(FILE_URL + '#/en/home');
    await page.waitForTimeout(600);
    const card = page.locator('#home-grid .card').first();
    await card.click();
    await page.waitForTimeout(600);
    const url = page.url();
    assert(url.includes('/development/asset_dev_rionorte'), `Clicking the development card on Home navigates to its detail page (got: ${url})`);
    await page.close();
  }

  await browser.close();

  console.log('\n============================================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('============================================================');
  if (fail > 0) process.exit(1);
}

run();
