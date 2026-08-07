/* ============================================================
   Z FIND ADMIN — TAXONOMY FIELDS UI VERIFICATION
   ============================================================
   Covers the Admin forms built on top of Migration 0005's field
   taxonomy: property extended fields, development extended fields,
   and the shared features checklist (property_features /
   development_features).
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
async function mockZonesLite(page) {
  await page.route('**/rest/v1/zones_lite**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' }]) }));
}
async function login(page) {
  await page.goto(FILE_URL);
  await page.fill('#login-email', 'admin@zfind.test');
  await page.fill('#login-password', 'password123');
  await page.click('#login-btn');
  await page.waitForTimeout(500);
}
const FEATURES_FIXTURE = [
  { id: 'feat-elevator', code: 'elevator', label: 'Elevador' },
  { id: 'feat-pool', code: 'pool', label: 'Piscina' },
  { id: 'feat-ev', code: 'ev_charging', label: 'Carregamento Elétrico' },
];

async function run() {
  let pass = 0, fail = 0;
  function assert(cond, label) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});

  console.log('\n=== 1. Property extended fields render, grouped, pre-filled from real data ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    await mockZonesLite(page);
    const propertyRow = {
      id: 'prop-1', subtype: 'apartment', typology: 'T2', area_sqm: 80, floor: 1, zone_lite_id: 'z1',
      zones_lite: { id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' },
      energy_rating: 'B-', energy_certificate_number: 'SCE-12345', bedrooms: 2, bathrooms: 1,
      gross_private_area_sqm: 85.5, dependent_area_sqm: 12, year_built: 2018, condition: 'renovated',
      condo_fee_monthly: 45.5, accepts_trade: true,
      representations: [],
    };
    await page.route('**/rest/v1/properties**', route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(propertyRow) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' } });
    });
    await page.route('**/rest/v1/features**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FEATURES_FIXTURE) }));
    await page.route('**/rest/v1/property_features**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/developments**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/partners**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await login(page);
    await page.evaluate(() => navigateAdmin('properties', 'prop-1'));
    await page.waitForTimeout(500);

    assert(await page.locator('text=Legal & Compliance').count() > 0, 'Legal & Compliance section renders, with its own heading');
    assert(await page.locator('text=Energy Certificate is legally required').count() > 0, 'The legal-requirement note is visible, not buried');
    assert(await page.inputValue('#attr-energy-rating') === 'B-', 'Energy Rating pre-filled from real data (B-, not miscoerced to B)');
    assert(await page.inputValue('#attr-bedrooms') === '2', 'Bedrooms pre-filled');
    assert(await page.inputValue('#attr-gross-private-area') === '85.5', 'Gross Private Area (ABP) pre-filled with decimal precision');
    assert(await page.inputValue('#attr-condition') === 'renovated', 'Condition dropdown pre-selected correctly');
    assert(await page.isChecked('#attr-accepts-trade'), 'Accepts Trade checkbox reflects true from real data');
    assert(await page.locator('text=Rooms & Dimensions').count() > 0, 'Rooms & Dimensions section renders');
    assert(await page.locator('text=Financial').count() > 0, 'Financial section renders');
    assert(await page.locator('text=declared values only, never calculated').count() > 0, 'Financial honesty note is visible');
    await page.close();
  }

  console.log('\n=== 2. Saving extended attrs: empty numeric fields become null, not zero ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    await mockZonesLite(page);
    const propertyRow = {
      id: 'prop-2', subtype: 'apartment', typology: 'T2', area_sqm: 80, zone_lite_id: 'z1',
      zones_lite: { id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' },
      representations: [],
    };
    let patchSent = null;
    await page.route('**/rest/v1/properties**', route => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'PATCH') { patchSent = route.request().postDataJSON(); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...propertyRow, ...patchSent }) }); }
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(propertyRow) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' } });
    });
    await page.route('**/rest/v1/features**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FEATURES_FIXTURE) }));
    await page.route('**/rest/v1/property_features**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/developments**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/partners**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await login(page);
    await page.evaluate(() => navigateAdmin('properties', 'prop-2'));
    await page.waitForTimeout(500);
    await page.fill('#attr-bedrooms', '3');
    // leave attr-year-built empty on purpose
    await page.click('button:has-text("Save all fields above")');
    await page.waitForTimeout(400);
    assert(patchSent && patchSent.bedrooms === 3, 'Filled field (bedrooms) reaches the real PATCH payload correctly');
    assert(patchSent && patchSent.year_built === null, 'Empty numeric field (year_built) sent as null, never a stray 0');
    await page.close();
  }

  console.log('\n=== 3. Development extended fields render and save ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    await mockZonesLite(page);
    const devRow = {
      id: 'dev-1', name: 'Alma Living', zone_lite_id: 'z1',
      zones_lite: { id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' },
      total_units: 30, project_phase: 'construction',
      representations: [],
    };
    let patchSent = null;
    await page.route('**/rest/v1/developments**', route => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'PATCH') { patchSent = route.request().postDataJSON(); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...devRow, ...patchSent }) }); }
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(devRow) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' } });
    });
    await page.route('**/rest/v1/features**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FEATURES_FIXTURE) }));
    await page.route('**/rest/v1/development_features**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/properties**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/partners**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await login(page);
    await page.evaluate(() => navigateAdmin('developments', 'dev-1'));
    await page.waitForTimeout(500);
    assert(await page.locator('text=Total Units (Frações)').count() > 0, 'Uses the real market label "Frações", not "unidades"');
    assert(await page.inputValue('#attr-total-units') === '30', 'Total Units pre-filled from real data');
    assert(await page.inputValue('#attr-project-phase') === 'construction', 'Project Phase pre-selected correctly');
    await page.fill('#attr-developer-name', 'Construtora Teste');
    await page.click('button:has-text("Save all fields above")');
    await page.waitForTimeout(400);
    assert(patchSent && patchSent.developer_name === 'Construtora Teste', 'Development fields reach the real PATCH payload correctly');
    await page.close();
  }

  console.log('\n=== 4. Features checklist: loads, pre-checks linked features, saves the full set ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    await mockZonesLite(page);
    const propertyRow = {
      id: 'prop-3', subtype: 'apartment', typology: 'T2', area_sqm: 80, zone_lite_id: 'z1',
      zones_lite: { id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' },
      representations: [],
    };
    let deleteRequested = false, insertPayload = null;
    await page.route('**/rest/v1/properties**', route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(propertyRow) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' } });
    });
    await page.route('**/rest/v1/features**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FEATURES_FIXTURE) }));
    await page.route('**/rest/v1/property_features**', route => {
      const method = route.request().method();
      if (method === 'DELETE') { deleteRequested = true; return route.fulfill({ status: 204, body: '' }); }
      if (method === 'POST') { insertPayload = route.request().postDataJSON(); return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(insertPayload) }); }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ feature_id: 'feat-pool' }]) }); // "Piscina" already linked
    });
    await page.route('**/rest/v1/developments**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/partners**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await login(page);
    await page.evaluate(() => navigateAdmin('properties', 'prop-3'));
    await page.waitForTimeout(500);

    assert(await page.locator('.feature-checkbox').count() === 3, 'All 3 (mocked) features render as checkboxes');
    assert(await page.isChecked('.feature-checkbox[value="feat-pool"]'), 'Already-linked feature (Piscina) is pre-checked from real data');
    assert(!(await page.isChecked('.feature-checkbox[value="feat-elevator"]')), 'Non-linked feature (Elevador) starts unchecked');

    await page.check('.feature-checkbox[value="feat-elevator"]');
    await page.check('.feature-checkbox[value="feat-ev"]');
    await page.click('button:has-text("Save features")');
    await page.waitForTimeout(400);

    assert(deleteRequested, 'Clears the existing feature set before writing the new one (delete-then-insert, correct for a checkbox-list UI)');
    assert(insertPayload && insertPayload.length === 3, `Inserts exactly the 3 now-checked features — got ${insertPayload ? insertPayload.length : 0}`);
    assert(insertPayload && insertPayload.every(row => row.property_id === 'prop-3'), 'Every inserted row correctly references this property');
    await page.close();
  }

  console.log('\n=== 5. Delete Partner button exists, refuses clearly when real properties/developments are attached ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    const partnerRow = { id: 'partner-1', name: 'Z Imobiliária', role: 'agency', status: 'active', enquiry_policy: { direct: true, qualified: false, assisted: false }, logo_storage_path: null };
    let partnerDeleteRequested = false;
    await page.route('**/rest/v1/partners**', route => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'DELETE') { partnerDeleteRequested = true; return route.fulfill({ status: 204, body: '' }); }
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(partnerRow) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' } });
    });
    // 2 real representations still reference this partner
    await page.route('**/rest/v1/representations**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/2', 'access-control-expose-headers': 'content-range' } }));
    await login(page);
    await page.evaluate(() => navigateAdmin('partners', 'partner-1'));
    await page.waitForTimeout(400);
    assert(await page.locator('button:has-text("Delete")').count() > 0, 'Delete button now exists on the Partner edit screen');
    await page.click('button:has-text("Delete")');
    await page.waitForTimeout(200);
    await page.click('#confirm-ok');
    await page.waitForTimeout(400);
    assert(!partnerDeleteRequested, 'Never attempts to delete the partner while real properties/developments reference it');
    const toastText = await page.evaluate(() => document.querySelector('#toast-host .toast')?.textContent || '');
    assert(toastText.includes('2 propert'), `Shows the specific reason, not a generic error (got: "${toastText}")`);
    await page.close();
  }

  console.log('\n=== 6. Delete Partner succeeds when nothing real depends on it — the actual cleanup scenario ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    const partnerRow = { id: 'partner-2', name: 'Test Partner (safe to delete)', role: 'agency', status: 'active', enquiry_policy: { direct: true, qualified: false, assisted: false }, logo_storage_path: null };
    let partnerDeleteRequested = false;
    await page.route('**/rest/v1/partners**', route => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'DELETE') { partnerDeleteRequested = true; return route.fulfill({ status: 204, body: '' }); }
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(partnerRow) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' } });
    });
    await page.route('**/rest/v1/representations**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/developments**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await login(page);
    await page.evaluate(() => navigateAdmin('partners', 'partner-2'));
    await page.waitForTimeout(400);
    await page.click('button:has-text("Delete")');
    await page.waitForTimeout(200);
    await page.click('#confirm-ok');
    await page.waitForTimeout(400);
    assert(partnerDeleteRequested, 'Deletes successfully once no real properties/developments reference it');
    await page.close();
  }

  await browser.close();
  console.log('\n============================================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('============================================================');
  if (fail > 0) process.exit(1);
}

run();
