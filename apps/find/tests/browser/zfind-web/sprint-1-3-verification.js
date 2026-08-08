/* ============================================================
   Z FIND — SPRINT 1.3 VERIFICATION (Search, Supabase-backed)
   ============================================================
   Intercepts Supabase REST calls (page.route) to test the real code
   path — loadSearchResults(), the merge logic, renderSearch()'s async
   flow — against controlled data, including the specific gap this
   sprint closed: searching by the "development" pill must actually
   return Development results, not silently nothing (search.js alone
   is Property-only; loadSearchResults merges in developments.js).

   Run: node tests/browser/zfind-web/sprint-1-3-verification.js
   ============================================================ */

const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-web', 'dist', 'z-find-prototype.html');

const MOCK_APARTMENT = {
  id: 'p1', subtype: 'apartment', typology: 'T2', area_sqm: 85, zone_lite_id: 'z1',
  zones_lite: { name: 'Boavista', city: 'Porto', country_iso: 'PT' },
  representations: [{ target_type: 'property', status: 'active', listings: [{
    id: 'l1', channel: 'standard', price_current: 385000, currency_iso: 'EUR', price_is_from: false, status: 'published',
    listing_content: [{ locale: 'en', title: 'Renovated Apartment' }],
  }] }],
};
const MOCK_VILLA = {
  id: 'p2', subtype: 'villa', typology: 'T4', area_sqm: 220, zone_lite_id: 'z1',
  zones_lite: { name: 'Foz', city: 'Porto', country_iso: 'PT' },
  representations: [{ target_type: 'property', status: 'active', listings: [{
    id: 'l2', channel: 'standard', price_current: 890000, currency_iso: 'EUR', price_is_from: false, status: 'published',
    listing_content: [{ locale: 'en', title: 'Villa with Garden' }],
  }] }],
};
const MOCK_DEVELOPMENT = {
  id: 'd1', name: 'Rio Norte', zone_lite_id: 'z2',
  zones_lite: { name: 'Matosinhos Sul', city: 'Matosinhos', country_iso: 'PT' },
  representations: [{ target_type: 'development', status: 'active', listings: [{
    id: 'l3', channel: 'standard', price_current: 340000, currency_iso: 'EUR', price_is_from: true, status: 'published',
    listing_content: [{ locale: 'en', title: 'Rio Norte Development' }],
  }] }],
};

async function mockRoutes(page, { properties, developments }) {
  await page.route('**/rest/v1/properties**', route => {
    const url = new URL(route.request().url());
    const subtypeFilter = url.searchParams.get('subtype'); // e.g. "eq.villa"
    let data = properties;
    if (subtypeFilter && subtypeFilter.startsWith('eq.')) {
      const wanted = subtypeFilter.slice(3);
      data = properties.filter(p => p.subtype === wanted);
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.route('**/rest/v1/developments**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(developments) }));
  await page.route('**/rest/v1/searches**', route => route.fulfill({ status: 201, contentType: 'application/json', body: '{}' }));
}

async function run() {
  let pass = 0, fail = 0;
  function assert(cond, label) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }

  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});

  // ---- Scenario 1: no filter — all results merged (properties + developments) ----
  console.log('\n=== Scenario 1: no filter — properties + developments merged ===');
  {
    const page = await browser.newPage();
    await mockRoutes(page, { properties: [MOCK_APARTMENT, MOCK_VILLA], developments: [MOCK_DEVELOPMENT] });
    await page.goto(FILE_URL + '#/en/search');
    await page.waitForTimeout(700);
    const cards = await page.evaluate(() => document.querySelectorAll('#search-grid .card').length);
    const text = await page.evaluate(() => document.getElementById('search-grid').textContent);
    assert(cards === 3, `3 cards shown (2 properties + 1 development) — got ${cards}`);
    assert(text.includes('Rio Norte Development'), 'Development result rendered alongside properties');
    await page.close();
  }

  // ---- Scenario 2: filter by "development" pill — THE GAP THIS SPRINT CLOSES ----
  console.log('\n=== Scenario 2: subtype=development filter (the gap this sprint closes) ===');
  {
    const page = await browser.newPage();
    await mockRoutes(page, { properties: [MOCK_APARTMENT, MOCK_VILLA], developments: [MOCK_DEVELOPMENT] });
    await page.goto(FILE_URL + '#/en/search?subtype=development');
    await page.waitForTimeout(700);
    const cards = await page.evaluate(() => document.querySelectorAll('#search-grid .card').length);
    const text = await page.evaluate(() => document.getElementById('search-grid').textContent);
    assert(cards === 1, `Exactly 1 card (the development, properties correctly excluded) — got ${cards}`);
    assert(text.includes('Rio Norte Development'), 'The development result is present');
    assert(!text.includes('Renovated Apartment') && !text.includes('Villa with Garden'), 'Property results correctly excluded when filtering by development');
    await page.close();
  }

  // ---- Scenario 3: filter by "villa" — developments correctly excluded ----
  console.log('\n=== Scenario 3: subtype=villa filter — developments correctly excluded ===');
  {
    const page = await browser.newPage();
    await mockRoutes(page, { properties: [MOCK_APARTMENT, MOCK_VILLA], developments: [MOCK_DEVELOPMENT] });
    await page.goto(FILE_URL + '#/en/search?subtype=villa');
    await page.waitForTimeout(700);
    const cards = await page.evaluate(() => document.querySelectorAll('#search-grid .card').length);
    const text = await page.evaluate(() => document.getElementById('search-grid').textContent);
    assert(cards === 1, `Exactly 1 card (the villa) — got ${cards}`);
    assert(text.includes('Villa with Garden'), 'The villa result is present');
    assert(!text.includes('Rio Norte Development'), 'Development correctly excluded when filtering by villa');
    await page.close();
  }

  // ---- Scenario 4: empty result ----
  console.log('\n=== Scenario 4: zero results ===');
  {
    const page = await browser.newPage();
    await mockRoutes(page, { properties: [], developments: [] });
    await page.goto(FILE_URL + '#/en/search');
    await page.waitForTimeout(700);
    const emptyVisible = await page.evaluate(() => document.getElementById('search-empty').style.display !== 'none');
    const gridVisible = await page.evaluate(() => document.getElementById('search-grid').style.display !== 'none');
    assert(emptyVisible, 'Empty state shown when there are zero results');
    assert(!gridVisible, 'Grid hidden when there are zero results');
    await page.close();
  }

  // ---- Scenario 5: error ----
  console.log('\n=== Scenario 5: Supabase request fails ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 500, body: JSON.stringify({ message: 'Internal Server Error' }) }));
    await page.route('**/rest/v1/developments**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto(FILE_URL + '#/en/search');
    await page.waitForTimeout(700);
    const statusTitle = await page.evaluate(() => document.getElementById('search-empty-title').textContent);
    assert(statusTitle.toLowerCase().includes('could not'), 'Error message shown, not the empty-results message');
    await page.close();
  }

  console.log('\n=== Market label: computed from real data, never hardcoded to Porto (global portal) ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto(FILE_URL + '#/en/search');
    await page.waitForTimeout(700);
    const titleText = await page.evaluate(() => document.getElementById('search-results-title').textContent);
    assert(!titleText.includes('Porto'), `Search title never hardcodes a city — computed from real result data only (got: "${titleText}")`);
    await page.close();
  }

  console.log('\n=== Visual: results count uses a readable font, never Cormorant Garamond\'s ambiguous 0/o ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.goto(FILE_URL + '#/en/search');
    await page.waitForTimeout(700);
    const font = await page.evaluate(() => getComputedStyle(document.getElementById('search-results-title')).fontFamily);
    assert(font.includes('DM Sans'), `Results count uses DM Sans, not the decorative serif — got: "${font}"`);
    await page.close();
  }

  console.log('\n=== Visual: location input has enough room, placeholder not clipped ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.goto(FILE_URL + '#/en/search');
    await page.waitForTimeout(700);
    const flexGrow = await page.evaluate(() => {
      const input = document.getElementById('search-q');
      const select = document.getElementById('search-budget');
      return { input: getComputedStyle(input).flexGrow, select: getComputedStyle(select).flexGrow };
    });
    assert(Number(flexGrow.input) > Number(flexGrow.select), `Location input has more flex-grow than the budget dropdown, not split evenly — got input:${flexGrow.input} select:${flexGrow.select}`);
    await page.close();
  }

  console.log('\n=== Legal Guide: zero Z Imobiliária branding, correct IMT handling ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.goto(FILE_URL + '#/pt/legal');
    await page.waitForTimeout(700);
    const bodyText = await page.evaluate(() => document.body.innerText);
    assert(!bodyText.includes('Z Imobiliária') && !bodyText.includes('Imobiliária'), 'Zero mentions of Z Imobiliária anywhere on the page');
    assert(!bodyText.includes('97.064') && !bodyText.includes('97064'), 'Old, unverified IMT bracket numbers never appear');
    assert(!bodyText.includes('AMI') && !bodyText.includes('27196'), 'No leftover AMI license number from the source');
    assert(bodyText.includes('Simulador de Custos'), 'Links to the real, always-current Cost Simulator instead of a static IMT table');
    assert(bodyText.includes('Golden Visa') && bodyText.includes('outubro de 2023'), 'Verified factual claim (Golden Visa closure) retained correctly');
    await page.close();
  }

  console.log('\n=== Legal Guide: navigation via footer link and TOC anchors work ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.goto(FILE_URL + '#/pt/home');
    await page.waitForTimeout(700);
    await page.click('a:has-text("Guia Legal")');
    await page.waitForTimeout(500);
    assert(await page.locator('#view-legal').isVisible(), 'Footer link navigates to the Legal Guide');
    assert(await page.locator('#view-legal .legal-toc a').count() === 8, 'All 8 TOC sections are linked');
    await page.close();
  }

  console.log('\n=== Legal Guide: FAQ accordion opens/closes ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.goto(FILE_URL + '#/pt/legal');
    await page.waitForTimeout(700);
    const firstDetails = page.locator('.legal-faq details').first();
    assert(!(await firstDetails.evaluate(el => el.open)), 'FAQ item starts closed');
    await firstDetails.locator('summary').click();
    assert(await firstDetails.evaluate(el => el.open), 'FAQ item opens on click');
    await page.close();
  }

  console.log('\n=== AL Manual: zero branding, zero service-management sections, links to OUR simulator ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.goto(FILE_URL + '#/pt/al-manual');
    await page.waitForTimeout(700);
    const bodyText = await page.evaluate(() => document.body.innerText);
    assert(!bodyText.includes('Z Imobiliária') && !bodyText.includes('Imobiliária'), 'Zero mentions of Z Imobiliária');
    assert(!bodyText.includes('zimobiliaria'), 'Zero mentions of the source domain');
    assert(!bodyText.includes('27196'), 'No leftover AMI license number');
    assert(!bodyText.includes('919 281 967'), 'No leftover phone number');
    assert(!bodyText.includes('Como Começar com a Z') && !bodyText.includes('Gestão do Dia a Dia pela Z'), 'Service-management chapters (not applicable to Z Find, a marketplace not a property manager) genuinely removed, not just relabeled');
    assert(bodyText.includes('Simulador de Rentabilidade'), 'Links to Z Find\'s own Rental Yield Simulator instead of the source\'s service-specific one');
    assert(bodyText.includes('dois terços da permilagem'), 'The condo-opposition-power nuance (found and corrected during research, not in the naive reading of the source) is present');
    await page.close();
  }

  console.log('\n=== AL Manual: footer navigation and TOC work ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.goto(FILE_URL + '#/pt/home');
    await page.waitForTimeout(700);
    await page.click('a:has-text("Guia de Alojamento Local")');
    await page.waitForTimeout(500);
    assert(await page.locator('#view-al-manual').isVisible(), 'Footer link navigates to the AL Manual');
    assert(await page.locator('#view-al-manual .legal-toc a').count() === 9, 'All 9 TOC sections linked');
    await page.close();
  }

  console.log('\n=== Legal Guide: non-resident IMT correctly reflects DL 97/2026, not the old "same as residents" claim ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.goto(FILE_URL + '#/pt/legal');
    await page.waitForTimeout(700);
    const bodyText = await page.evaluate(() => document.body.innerText);
    assert(!bodyText.includes('IMT e Imposto do Selo: às mesmas taxas que para residentes'), 'The old, now-incorrect claim (IMT same as residents) is gone');
    assert(bodyText.includes('97/2026') && bodyText.includes('7,5%'), 'Correctly states the real DL 97/2026 flat 7.5% rate for non-residents');
    await page.close();
  }

  await browser.close();

  console.log('\n============================================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('============================================================');
  if (fail > 0) process.exit(1);
}

run();
