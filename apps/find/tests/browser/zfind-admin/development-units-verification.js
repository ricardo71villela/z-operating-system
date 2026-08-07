/* ============================================================
   Z FIND ADMIN — DEVELOPMENT UNITS VERIFICATION
   ============================================================ */
const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-admin', 'dist', 'z-find-admin.html');
const FAKE_USER = { id: 'admin-user-1', aud: 'authenticated', role: 'authenticated', email: 'admin@zfind.test', app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };

async function mockAuthAsAdmin(page) {
  await page.route('**/auth/v1/token**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ access_token: 'fake-token', token_type: 'bearer', expires_in: 3600, refresh_token: 'fake-refresh', user: FAKE_USER }),
  }));
  await page.route('**/rest/v1/profiles**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: FAKE_USER.id, partner_id: null, role: 'admin' }),
  }));
}
async function login(page) {
  await page.goto(FILE_URL);
  await page.fill('#login-email', 'admin@zfind.test');
  await page.fill('#login-password', 'password123');
  await page.click('#login-btn');
  await page.waitForTimeout(500);
}

async function run() {
  let pass = 0, fail = 0;
  function assert(cond, label) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});

  console.log('\n=== 1. Units section renders on a Development, lists real linked units ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    const devRow = { id: 'dev-1', name: 'Alma Living', zone_lite_id: 'z1', zones_lite: { id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' }, representations: [] };
    await page.route('**/rest/v1/developments**', route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(devRow) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } });
    });
    await page.route('**/rest/v1/properties**', route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('development_id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'unit-1', subtype: 'apartment', typology: 'T2', area_sqm: 80, floor: 3, zones_lite: { name: 'Boavista' } }]) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } });
    });
    await page.route('**/rest/v1/zones_lite**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' }]) }));
    await page.route('**/rest/v1/features**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/development_features**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/partners**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await login(page);
    await page.evaluate(() => navigateAdmin('developments', 'dev-1'));
    await page.waitForTimeout(500);

    assert(await page.locator('text=Units').count() > 0, 'Units section renders for a Development');
    const listText = await page.locator('#units-list').textContent();
    assert(listText.includes('T2') && listText.includes('80 m²') && listText.includes('Floor 3'), `Real unit data renders (typology, area, floor) — got: "${listText}"`);
    await page.close();
  }

  console.log('\n=== 2. No Units section on a Property (only makes sense for Developments) ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    const propRow = { id: 'prop-1', subtype: 'apartment', typology: 'T2', area_sqm: 80, zone_lite_id: 'z1', zones_lite: { id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' }, representations: [] };
    await page.route('**/rest/v1/properties**', route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(propRow) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } });
    });
    await page.route('**/rest/v1/zones_lite**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' }]) }));
    await page.route('**/rest/v1/features**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/property_features**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/developments**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/partners**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await login(page);
    await page.evaluate(() => navigateAdmin('properties', 'prop-1'));
    await page.waitForTimeout(500);
    assert(await page.locator('#units-list').count() === 0, 'No Units section on a Property detail page — units only make sense for Developments');
    await page.close();
  }

  console.log('\n=== 3. "+ Add unit" creates a real property, inheriting the development\'s zone by default ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    const devRow = { id: 'dev-1', name: 'Alma Living', zone_lite_id: 'z1', zones_lite: { id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' }, representations: [] };
    let insertPayload = null;
    await page.route('**/rest/v1/developments**', route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(devRow) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } });
    });
    await page.route('**/rest/v1/properties**', route => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'POST') { insertPayload = route.request().postDataJSON(); return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ...insertPayload, id: 'new-unit-1' }) }); }
      if (url.searchParams.get('development_id')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } });
    });
    await page.route('**/rest/v1/zones_lite**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' }]) }));
    await page.route('**/rest/v1/features**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/development_features**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/partners**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await login(page);
    await page.evaluate(() => navigateAdmin('developments', 'dev-1'));
    await page.waitForTimeout(500);
    await page.click('button:has-text("+ Add unit")');
    await page.waitForTimeout(400);
    assert(insertPayload && insertPayload.development_id === 'dev-1', 'New unit correctly linked to THIS development');
    assert(insertPayload && insertPayload.zone_lite_id === 'z1', 'New unit inherits the development\'s own zone by default — a real convenience, not forced');
    await page.close();
  }

  await browser.close();
  console.log('\n============================================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('============================================================');
  if (fail > 0) process.exit(1);
}

run();
