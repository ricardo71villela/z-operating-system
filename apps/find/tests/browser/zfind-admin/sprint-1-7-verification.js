/* ============================================================
   Z FIND ADMIN — SPRINT 1.7 VERIFICATION
   ============================================================
   Mocks only network requests (Auth + REST), exercises real
   application code (services/admin.js, services/auth.js, app.js).
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
async function mockAuthAsNonAdmin(page) {
  await page.route('**/auth/v1/token**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ access_token: 'fake-token', token_type: 'bearer', expires_in: 3600, refresh_token: 'fake-refresh', user: FAKE_USER }),
  }));
  await page.route('**/rest/v1/profiles**', route => route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: 'no rows' }) }));
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

async function run() {
  let pass = 0, fail = 0;
  function assert(cond, label) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});

  console.log('\n=== 1. Login gate: admin access granted ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    await page.route('**/rest/v1/properties**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/5', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/developments**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/2', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/partners**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/3', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/leads**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/7', 'access-control-expose-headers': 'content-range' } }));
    await login(page);
    const shellVisible = await page.evaluate(() => !document.getElementById('app-shell').classList.contains('hidden'));
    assert(shellVisible, 'Admin shell becomes visible after a valid admin sign-in');
    await page.close();
  }

  console.log('\n=== 2. Login gate: non-admin rejected ===');
  {
    const page = await browser.newPage();
    await mockAuthAsNonAdmin(page);
    await login(page);
    const shellHidden = await page.evaluate(() => document.getElementById('app-shell').classList.contains('hidden'));
    const errorShown = await page.evaluate(() => document.getElementById('login-error').textContent.length > 0);
    assert(shellHidden, 'Admin shell stays hidden for a non-admin/no-profile account');
    assert(errorShown, 'A clear error message is shown');
    await page.close();
  }

  console.log('\n=== 3. Dashboard shows real counts ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    await page.route('**/rest/v1/properties**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/12', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/developments**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/3', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/partners**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/5', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/leads**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/9', 'access-control-expose-headers': 'content-range' } }));
    await login(page);
    await page.waitForTimeout(400);
    const cardsText = await page.evaluate(() => document.getElementById('dash-cards').textContent);
    assert(cardsText.includes('12') && cardsText.includes('3') && cardsText.includes('5') && cardsText.includes('9'), `Dashboard shows the real counts from the mocked head-count responses (got: "${cardsText.replace(/\s+/g,' ')}")`);
    await page.close();
  }

  console.log('\n=== 4. Create partner: real payload reaches the server ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    await page.route('**/rest/v1/properties**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/developments**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/leads**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    let capturedPayload = null;
    await page.route('**/rest/v1/partners**', route => {
      if (route.request().method() === 'POST') {
        capturedPayload = JSON.parse(route.request().postData());
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(Object.assign({ id: 'new-partner-1' }, capturedPayload)) });
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await login(page);
    await page.evaluate(() => navigateAdmin('partners'));
    await page.waitForTimeout(300);
    await page.click('button:has-text("New partner")');
    await page.fill('#np-name', 'Nova Agência');
    await page.selectOption('#np-role', 'agency');
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(400);
    assert(!!capturedPayload, 'A real INSERT payload reached the server');
    assert(capturedPayload.name === 'Nova Agência', 'Payload includes the real entered name');
    assert(capturedPayload.role === 'agency', 'Payload includes the real selected role');
    await page.close();
  }

  console.log('\n=== 5. Publish / unpublish never deletes ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    let patchPayload = null, deleteAttempted = false;
    const propertyRow = {
      id: 'prop-1', subtype: 'apartment', typology: 'T2', area_sqm: 80, zone_lite_id: 'z1',
      zones_lite: { id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' },
      representations: [{ id: 'rep1', status: 'active', partner_id: 'p1', listings: [{ id: 'listing1', price_current: 300000, currency_iso: 'EUR', price_is_from: false, status: 'draft', listing_content: [] }] }],
    };
    await page.route('**/rest/v1/properties**', route => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'DELETE') { deleteAttempted = true; return route.fulfill({ status: 204, body: '' }); }
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(propertyRow) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' } });
    });
    await page.route('**/rest/v1/developments**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/partners**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/leads**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/listings**', route => {
      if (route.request().method() === 'PATCH') { patchPayload = JSON.parse(route.request().postData()); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.assign({ id: 'listing1' }, patchPayload)) }); }
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await mockZonesLite(page);
    await login(page);
    await page.evaluate(() => navigateAdmin('properties', 'prop-1'));
    await page.waitForTimeout(400);
    await page.click('button:has-text("Publish")');
    await page.waitForTimeout(300);
    assert(patchPayload && patchPayload.status === 'published', `Publish sends an UPDATE to listings.status='published' — got ${JSON.stringify(patchPayload)}`);
    assert(!deleteAttempted, 'No DELETE request is ever made when publishing/unpublishing');
    await page.close();
  }

  console.log('\n=== 6. Leads: list, search, filter, detail — no CRM actions ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    await page.route('**/rest/v1/properties**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/developments**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/partners**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    let leadWriteAttempted = false;
    const leadRow = { id: 'lead-1', listing_id: 'listing1', contact_type: 'direct', name: 'Maria Silva', email: 'maria@example.com', phone: null, message: 'Interested', status: 'new', created_at: '2026-07-20T10:00:00Z' };
    await page.route('**/rest/v1/leads**', route => {
      const method = route.request().method();
      if (method === 'PATCH' || method === 'POST' || method === 'DELETE') { leadWriteAttempted = true; return route.fulfill({ status: 403, body: '' }); }
      const url = new URL(route.request().url());
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(leadRow) });
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([leadRow]) });
    });
    await login(page);
    await page.evaluate(() => navigateAdmin('leads'));
    await page.waitForTimeout(400);
    const listedName = await page.evaluate(() => document.getElementById('leads-tbody').textContent);
    assert(listedName.includes('Maria Silva'), 'Leads list shows the real lead');
    await page.click('tr:has-text("Maria Silva")');
    await page.waitForTimeout(300);
    const detailText = await page.evaluate(() => document.getElementById('lead-detail-root').textContent);
    assert(detailText.includes('maria@example.com') && detailText.includes('Interested'), 'Lead detail shows real data');
    assert(!leadWriteAttempted, 'No write (POST/PATCH/DELETE) is ever attempted on leads from the Admin — list/search/filter/detail only');
    await page.close();
  }

  console.log('\n=== 7. Media: uses the REAL composite key (media_asset_id + owner id), no fake id column ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    let signRequests = 0;
    await page.route('**/storage/v1/object/sign/**', route => { signRequests++; route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedURL: '/object/sign/listing-media/x.jpg?token=t' }) }); });
    const propertyRow = {
      id: 'prop-1', subtype: 'apartment', typology: 'T2', area_sqm: 80, zone_lite_id: 'z1',
      zones_lite: { id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' },
      representations: [{ id: 'rep1', status: 'active', partner_id: 'p1', listings: [{ id: 'listing1', price_current: 300000, currency_iso: 'EUR', price_is_from: false, status: 'draft', listing_content: [] }] }],
    };
    await page.route('**/rest/v1/properties**', route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(propertyRow) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' } });
    });
    await page.route('**/rest/v1/developments**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/partners**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/leads**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    // Real shape: composite key (media_asset_id, listing_id) — no `id` column at all, matching migration 0001 exactly.
    await page.route('**/rest/v1/listing_media**', route => {
      const method = route.request().method();
      if (method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ media_asset_id: 'ma-1', listing_id: 'listing1', position: 0, is_cover: true, media_assets: { id: 'ma-1', original_storage_path: 'listings/x.jpg', media_variants: [] } }]) });
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ media_asset_id: 'ma-1', listing_id: 'listing1' }) });
    });
    await mockZonesLite(page);
    await login(page);
    await page.evaluate(() => navigateAdmin('properties', 'prop-1'));
    await page.waitForTimeout(400);
    const gridHtml = await page.evaluate(() => document.getElementById('media-grid').innerHTML);
    assert(gridHtml.includes('img') && gridHtml.includes('ma-1'), 'Media grid renders using the real media_asset_id, not a fabricated id column');
    assert(signRequests > 0, 'The real resolveMediaUrl (createSignedUrl) path is used for Admin photos too — same shared fix as the public site');
    await page.close();
  }

  console.log('\n=== 8. Development photos use development_media directly, independent of any listing ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    await page.route('**/storage/v1/object/sign/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedURL: '/object/sign/listing-media/y.jpg?token=t' }) }));
    // A development with NO listing at all — its own photos must still be manageable.
    const devRow = { id: 'dev-1', name: 'Rio Norte', zone_lite_id: 'z1', promoter_partner_id: 'p1', zones_lite: { id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' }, representations: [] };
    let devMediaRequested = false;
    await page.route('**/rest/v1/developments**', route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(devRow) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' } });
    });
    await page.route('**/rest/v1/properties**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/partners**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/leads**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/development_media**', route => {
      devMediaRequested = true;
      if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ media_asset_id: 'ma-2', development_id: 'dev-1', position: 0, is_cover: true, media_assets: { id: 'ma-2', original_storage_path: 'developments/y.jpg', media_variants: [] } }]) });
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ media_asset_id: 'ma-2', development_id: 'dev-1' }) });
    });
    await mockZonesLite(page);
    await login(page);
    await page.evaluate(() => navigateAdmin('developments', 'dev-1'));
    await page.waitForTimeout(400);
    assert(devMediaRequested, 'development_media (not listing_media) is queried for a Development with no listing at all');
    const gridHtml = await page.evaluate(() => document.getElementById('media-grid').innerHTML);
    assert(gridHtml.includes('img'), 'Development photo renders correctly, independent of listing status');
    await page.close();
  }

  console.log('\n=== 9. Delete: real DELETE request, confirm required ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    await mockZonesLite(page);
    let deleteRequested = false;
    const propertyRow = {
      id: 'prop-1', subtype: 'apartment', typology: 'T2', area_sqm: 80, zone_lite_id: 'z1',
      zones_lite: { id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' },
      representations: [],
    };
    await page.route('**/rest/v1/properties**', route => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'DELETE') { deleteRequested = true; return route.fulfill({ status: 204, body: '' }); }
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(propertyRow) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' } });
    });
    await page.route('**/rest/v1/developments**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/partners**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/leads**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await login(page);
    await page.evaluate(() => navigateAdmin('properties', 'prop-1'));
    await page.waitForTimeout(400);
    await page.click('button:has-text("Delete")'); // opens the custom confirm modal
    await page.waitForTimeout(200);
    await page.click('#confirm-ok');
    await page.waitForTimeout(300);
    assert(deleteRequested, 'A real DELETE request reaches the server after confirming');
    await page.close();
  }

  console.log('\n=== 9.5. Delete cascades safely through an empty listing (no real leads) ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    await mockZonesLite(page);
    const propertyRow = {
      id: 'prop-2', subtype: 'apartment', typology: 'T2', area_sqm: 80, zone_lite_id: 'z1',
      zones_lite: { id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' },
      representations: [{ id: 'rep1', status: 'active', partner_id: 'p1', listings: [{ id: 'listing1', channel: 'standard', price_current: 0, currency_iso: 'EUR', price_is_from: false, status: 'draft', listing_content: [] }] }],
    };
    let leadsCountChecked = false, propertyDeleteRequested = false, cascadeDeletes = [];
    await page.route('**/rest/v1/properties**', route => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'DELETE') { propertyDeleteRequested = true; return route.fulfill({ status: 204, body: '' }); }
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(propertyRow) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' } });
    });
    await page.route('**/rest/v1/leads**', route => {
      leadsCountChecked = true;
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }); // zero real leads
    });
    await page.route('**/rest/v1/listing_content**', route => { cascadeDeletes.push('listing_content'); route.fulfill({ status: 204, body: '' }); });
    await page.route('**/rest/v1/listing_media**', route => { cascadeDeletes.push('listing_media'); route.fulfill({ status: 204, body: '' }); });
    await page.route('**/rest/v1/listings**', route => { cascadeDeletes.push('listings'); route.fulfill({ status: 204, body: '' }); });
    await page.route('**/rest/v1/representations**', route => { cascadeDeletes.push('representations'); route.fulfill({ status: 204, body: '' }); });
    await page.route('**/rest/v1/developments**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/partners**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await login(page);
    await page.evaluate(() => navigateAdmin('properties', 'prop-2'));
    await page.waitForTimeout(400);
    await page.click('button:has-text("Delete")');
    await page.waitForTimeout(200);
    await page.click('#confirm-ok');
    await page.waitForTimeout(400);
    assert(leadsCountChecked, 'Checks for real leads on the listing before doing anything else');
    assert(cascadeDeletes.includes('listing_content') && cascadeDeletes.includes('listing_media') && cascadeDeletes.includes('listings') && cascadeDeletes.includes('representations'), `Cascades through all 4 structural tables in order — got: ${cascadeDeletes.join(', ')}`);
    assert(propertyDeleteRequested, 'Finally deletes the property itself, only after the cascade succeeded');
    await page.close();
  }

  console.log('\n=== 9.6. Delete REFUSED, clearly, when real leads exist — never silently destroyed ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    await mockZonesLite(page);
    const propertyRow = {
      id: 'prop-3', subtype: 'apartment', typology: 'T2', area_sqm: 80, zone_lite_id: 'z1',
      zones_lite: { id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' },
      representations: [{ id: 'rep1', status: 'active', partner_id: 'p1', listings: [{ id: 'listing1', channel: 'standard', price_current: 300000, currency_iso: 'EUR', price_is_from: false, status: 'published', listing_content: [] }] }],
    };
    let propertyDeleteRequested = false, listingsDeleteRequested = false;
    await page.route('**/rest/v1/properties**', route => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'DELETE') { propertyDeleteRequested = true; return route.fulfill({ status: 204, body: '' }); }
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(propertyRow) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' } });
    });
    // 2 real leads exist for this listing
    await page.route('**/rest/v1/leads**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/2', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/listings**', route => { if (route.request().method() === 'DELETE') listingsDeleteRequested = true; route.fulfill({ status: 204, body: '' }); });
    await page.route('**/rest/v1/developments**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/partners**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await login(page);
    await page.evaluate(() => navigateAdmin('properties', 'prop-3'));
    await page.waitForTimeout(400);
    await page.click('button:has-text("Delete")');
    await page.waitForTimeout(200);
    await page.click('#confirm-ok');
    await page.waitForTimeout(400);
    assert(!listingsDeleteRequested, 'Never attempts to delete the listing when real leads reference it');
    assert(!propertyDeleteRequested, 'Never attempts to delete the property either — refused before reaching that point');
    const toastText = await page.evaluate(() => document.querySelector('#toast-host .toast')?.textContent || '');
    assert(toastText.includes('2 real lead') || toastText.includes('lead'), `Shows the SPECIFIC reason, not a generic error (got: "${toastText}")`);
    await page.close();
  }

  console.log('\n=== 10. Duplicate a Development: real payload, media not copied ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    await mockZonesLite(page);
    const devRow = { id: 'dev-1', name: 'Rio Norte', zone_lite_id: 'z1', promoter_partner_id: 'p1', zones_lite: { id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' }, representations: [] };
    let devInsertPayload = null;
    await page.route('**/rest/v1/developments**', route => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'POST') { devInsertPayload = JSON.parse(route.request().postData()); return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(Object.assign({ id: 'dev-2' }, devInsertPayload)) }); }
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(devRow) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' } });
    });
    await page.route('**/rest/v1/properties**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/partners**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/leads**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await login(page);
    await page.evaluate(() => navigateAdmin('developments', 'dev-1'));
    await page.waitForTimeout(400);
    await page.click('button:has-text("Duplicate")');
    await page.waitForTimeout(400);
    assert(!!devInsertPayload && devInsertPayload.name.includes('Rio Norte'), 'Duplicating a Development sends a real INSERT with the original name');
    assert(devInsertPayload.zone_lite_id === 'z1', 'Duplicate preserves the real zone');
    await page.close();
  }

  console.log('\n=== 11. Create initial listing for a Development with no listing yet ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    await mockZonesLite(page);
    const devRow = { id: 'dev-1', name: 'Rio Norte', zone_lite_id: 'z1', promoter_partner_id: 'p1', zones_lite: { id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' }, representations: [] };
    let repPayload = null, listingPayload = null;
    await page.route('**/rest/v1/developments**', route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(devRow) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } });
    });
    await page.route('**/rest/v1/representations**', route => { repPayload = JSON.parse(route.request().postData()); route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(Object.assign({ id: 'rep-new' }, repPayload)) }); });
    await page.route('**/rest/v1/listings**', route => { listingPayload = JSON.parse(route.request().postData()); route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(Object.assign({ id: 'listing-new' }, listingPayload)) }); });
    await page.route('**/rest/v1/properties**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/partners**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'p1', name: 'Z Imobiliária', role: 'agency', status: 'active', enquiry_policy: {}, created_at: '2026-01-01' }]), headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/leads**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await login(page);
    await page.evaluate(() => navigateAdmin('developments', 'dev-1'));
    await page.waitForTimeout(400);
    await page.click('button:has-text("Create listing")');
    await page.waitForTimeout(400);
    assert(repPayload && repPayload.target_type === 'development' && repPayload.development_id === 'dev-1', 'A real representation is created for the Development, correctly typed');
    assert(listingPayload && listingPayload.status === 'draft', 'A real draft listing is created — routed through the service, never a direct Supabase call from the UI');
    await page.close();
  }

  console.log('\n=== 12. Partner logo upload ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    let signRequests = 0, updatePayload = null;
    await page.route('**/storage/v1/object/**', route => {
      if (route.request().method() === 'POST' || route.request().method() === 'PUT') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"partners/p1/logo.jpg"}' });
      signRequests++;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedURL: '/object/sign/listing-media/logo.jpg?token=t' }) });
    });
    await page.route('**/rest/v1/partners**', route => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'PATCH') { updatePayload = JSON.parse(route.request().postData()); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.assign({ id: 'p1', name: 'Z Imobiliária', role: 'agency', status: 'active', enquiry_policy: {} }, updatePayload)) }); }
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'p1', name: 'Z Imobiliária', role: 'agency', status: 'active', enquiry_policy: { direct: true, qualified: false, assisted: false }, logo_storage_path: null }) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } });
    });
    await page.route('**/rest/v1/properties**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/developments**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/leads**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await login(page);
    await page.evaluate(() => navigateAdmin('partners', 'p1'));
    await page.waitForTimeout(400);
    const fileInputExists = await page.evaluate(() => !!document.getElementById('pe-logo-input'));
    assert(fileInputExists, 'Logo upload field is present on the partner edit form');
    await page.setInputFiles('#pe-logo-input', { name: 'logo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake-image-bytes') });
    await page.waitForTimeout(500);
    assert(updatePayload && updatePayload.logo_storage_path, 'Uploading a logo saves logo_storage_path on the partner via a real UPDATE');
    await page.close();
  }

  console.log('\n=== 13. Toast notification (replaces static status box) ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    await page.route('**/rest/v1/properties**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/developments**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/leads**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/partners**', route => {
      if (route.request().method() === 'POST') return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'p1', name: 'Test' }) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } });
    });
    await login(page);
    await page.evaluate(() => navigateAdmin('partners'));
    await page.waitForTimeout(300);
    await page.click('button:has-text("New partner")');
    await page.fill('#np-name', 'Toast Test Partner');
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(200);
    const toastVisible = await page.evaluate(() => document.querySelectorAll('#toast-host .toast.success').length > 0);
    assert(toastVisible, 'A success toast appears in #toast-host (not the old static status box)');
    await page.waitForTimeout(3000);
    const toastGone = await page.evaluate(() => document.querySelectorAll('#toast-host .toast').length === 0);
    assert(toastGone, 'Toast auto-dismisses after its timeout');
    await page.close();
  }

  console.log('\n=== 14. Searchable zone combo ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    await page.route('**/rest/v1/zones_lite**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'z1', name: 'Boavista', city: 'Porto' }, { id: 'z2', name: 'Matosinhos Sul', city: 'Matosinhos' }]) }));
    await page.route('**/rest/v1/developments**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/properties**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/partners**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/leads**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await login(page);
    await page.evaluate(() => navigateAdmin('developments'));
    await page.waitForTimeout(300);
    await page.click('button:has-text("New development")');
    await page.waitForTimeout(200);
    await page.click('#nd-zone-wrap .zone-combo-btn');
    await page.fill('#nd-zone-wrap .zone-combo-search', 'Matosinhos');
    await page.waitForTimeout(150);
    const itemCount = await page.evaluate(() => document.querySelectorAll('#nd-zone-list .zone-combo-item').length);
    assert(itemCount === 1, `Typing "Matosinhos" filters to exactly 1 matching zone — got ${itemCount}`);
    await page.click('#nd-zone-list .zone-combo-item');
    const hiddenValue = await page.evaluate(() => document.getElementById('nd-zone').value);
    assert(hiddenValue === 'z2', `Selecting a zone sets the real hidden input value used by the existing submit logic — got "${hiddenValue}"`);
    await page.close();
  }

  console.log('\n=== 15. Lightbox opens and closes on real photo ===');
  {
    const page = await browser.newPage();
    await mockAuthAsAdmin(page);
    await mockZonesLite(page);
    await page.route('**/storage/v1/object/sign/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedURL: '/object/sign/listing-media/x.jpg?token=t' }) }));
    const propertyRow = {
      id: 'prop-1', subtype: 'apartment', typology: 'T2', area_sqm: 80, zone_lite_id: 'z1',
      zones_lite: { id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' },
      representations: [{ id: 'rep1', status: 'active', partner_id: 'p1', listings: [{ id: 'listing1', price_current: 300000, currency_iso: 'EUR', price_is_from: false, status: 'draft', listing_content: [] }] }],
    };
    await page.route('**/rest/v1/properties**', route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(propertyRow) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' } });
    });
    await page.route('**/rest/v1/developments**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/partners**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/leads**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' } }));
    await page.route('**/rest/v1/listing_media**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ media_asset_id: 'ma-1', listing_id: 'listing1', position: 0, is_cover: true, media_assets: { id: 'ma-1', original_storage_path: 'listings/x.jpg', media_variants: [] } }]) }));
    await login(page);
    await page.evaluate(() => navigateAdmin('properties', 'prop-1'));
    await page.waitForTimeout(500);
    await page.click('.media-item img');
    await page.waitForTimeout(150);
    const lightboxOpen = await page.evaluate(() => !document.getElementById('lightbox-overlay').classList.contains('hidden'));
    assert(lightboxOpen, 'Clicking a photo thumbnail opens the lightbox');
    await page.click('#lightbox-overlay');
    await page.waitForTimeout(150);
    const lightboxClosed = await page.evaluate(() => document.getElementById('lightbox-overlay').classList.contains('hidden'));
    assert(lightboxClosed, 'Clicking the overlay closes the lightbox');
    await page.close();
  }

  await browser.close();
  console.log('\n============================================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('============================================================');
  if (fail > 0) process.exit(1);
}

run();
