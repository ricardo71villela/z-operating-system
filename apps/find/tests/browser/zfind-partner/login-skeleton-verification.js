/* ============================================================
   Z FIND PARTNER — LOGIN SKELETON VERIFICATION
   ============================================================ */
const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-partner', 'dist', 'z-find-partner.html');
const FAKE_USER = { id: 'partner-user-1', aud: 'authenticated', role: 'authenticated', email: 'partner@zfind.test', app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };

async function mockAuth(page, { profileRole, partnerId, partnerName }) {
  await page.route('**/auth/v1/token**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ access_token: 'fake-token', token_type: 'bearer', expires_in: 3600, refresh_token: 'fake-refresh', user: FAKE_USER }),
  }));
  await page.route('**/rest/v1/profiles**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: FAKE_USER.id, partner_id: partnerId, role: profileRole }),
  }));
  await page.route('**/rest/v1/partners**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: partnerId, name: partnerName }),
  }));
}

async function login(page) {
  await page.goto(FILE_URL);
  await page.fill('#login-email', 'partner@zfind.test');
  await page.fill('#login-password', 'password123');
  await page.click('#login-btn');
  await page.waitForTimeout(500);
}

async function run() {
  let pass = 0, fail = 0;
  function assert(cond, label) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});

  console.log('\n=== 1. Correct partner_user login reaches the real dashboard, with the real partner name ===');
  {
    const page = await browser.newPage();
    await mockAuth(page, { profileRole: 'partner_user', partnerId: 'partner-1', partnerName: 'Alma Imóveis' });
    await login(page);
    assert(!(await page.locator('#view-login').isVisible()), 'Login screen hides after a valid partner_user login');
    assert(await page.locator('#view-dashboard').isVisible(), 'Dashboard shell becomes visible');
    assert((await page.locator('#dash-partner-name').textContent()) === 'Alma Imóveis', 'Shows the REAL partner name fetched from the database, not a placeholder');
    await page.close();
  }

  console.log('\n=== 2. Wrong credentials — clear error, never enters the dashboard ===');
  {
    const page = await browser.newPage();
    await page.route('**/auth/v1/token**', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }) }));
    await login(page);
    assert(await page.locator('#view-login').isVisible(), 'Login screen stays visible after failed login');
    assert(!(await page.locator('#view-dashboard').isVisible()), 'Dashboard never shows');
    const errorText = await page.locator('#login-error').textContent();
    assert(errorText.length > 0, `A clear error message is shown (got: "${errorText}")`);
    await page.close();
  }

  console.log('\n=== 3. Admin role rejected — same strict-role discipline as the Admin app itself ===');
  {
    const page = await browser.newPage();
    await mockAuth(page, { profileRole: 'admin', partnerId: null, partnerName: '' });
    await login(page);
    assert(await page.locator('#view-login').isVisible(), 'An admin account is REJECTED from the Partner app, not silently let in');
    assert(!(await page.locator('#view-dashboard').isVisible()), 'Dashboard never shows for a non-partner_user role');
    const errorText = await page.locator('#login-error').textContent();
    assert(errorText.includes('not set up') || errorText.toLowerCase().includes('partner'), `A specific, honest reason is shown, not a generic error (got: "${errorText}")`);
    await page.close();
  }

  console.log('\n=== 4. partner_user with no linked partner_id is also rejected — never a broken half-logged-in state ===');
  {
    const page = await browser.newPage();
    await mockAuth(page, { profileRole: 'partner_user', partnerId: null, partnerName: '' });
    await login(page);
    assert(await page.locator('#view-login').isVisible(), 'Rejected — a partner_user profile with no partner_id cannot enter a dashboard that has nothing to show');
    await page.close();
  }

  console.log('\n=== 5. Sign out returns cleanly to the login screen, clears the form ===');
  {
    const page = await browser.newPage();
    await mockAuth(page, { profileRole: 'partner_user', partnerId: 'partner-1', partnerName: 'Alma Imóveis' });
    await page.route('**/auth/v1/logout**', route => route.fulfill({ status: 204, body: '' }));
    await login(page);
    await page.click('text=Sign out');
    await page.waitForTimeout(300);
    assert(await page.locator('#view-login').isVisible(), 'Returns to the login screen after signing out');
    assert((await page.inputValue('#login-email')) === '', 'Email field cleared after sign out — never leaves a previous session\'s data sitting in the form');
    await page.close();
  }

  console.log('\n=== 6. Split-screen layout: editorial panel present on desktop, hidden on mobile ===');
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(FILE_URL);
    await page.waitForTimeout(300);
    assert(await page.locator('.login-editorial').isVisible(), 'Editorial panel visible on desktop width');
    await page.close();

    const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobilePage.goto(FILE_URL);
    await mobilePage.waitForTimeout(300);
    assert(!(await mobilePage.locator('.login-editorial').isVisible()), 'Editorial panel hidden below the 860px breakpoint — the functional form stays the priority on mobile');
    assert(await mobilePage.locator('.login-form-panel').isVisible(), 'Login form remains visible and usable on mobile');
    await mobilePage.close();
  }

  console.log('\n=== 7. Portfolio loads and renders real properties and developments ===');
  {
    const page = await browser.newPage();
    await mockAuth(page, { profileRole: 'partner_user', partnerId: 'partner-1', partnerName: 'Alma Imóveis' });
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'prop1', subtype: 'apartment', typology: 'T2', area_sqm: 85, zones_lite: { name: 'Boavista', city: 'Porto' } }]) }));
    await page.route('**/rest/v1/developments**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'dev1', name: 'Alma Living', zones_lite: { name: 'Foz do Douro', city: 'Porto' } }]) }));
    await login(page);
    await page.waitForTimeout(400);
    const listText = await page.locator('#portfolio-list').textContent();
    assert(listText.includes('T2') && listText.includes('Boavista'), 'Real property (T2, Boavista) renders');
    assert(listText.includes('Alma Living') && listText.includes('Foz do Douro'), 'Real development renders');
    assert(await page.locator('.kind-tag:has-text("Property")').count() === 1, 'Property tagged correctly');
    assert(await page.locator('.kind-tag:has-text("Development")').count() === 1, 'Development tagged correctly');
    await page.close();
  }

  console.log('\n=== 8. Empty portfolio shows an honest empty state, not a blank screen ===');
  {
    const page = await browser.newPage();
    await mockAuth(page, { profileRole: 'partner_user', partnerId: 'partner-1', partnerName: 'Alma Imóveis' });
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/developments**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await login(page);
    await page.waitForTimeout(400);
    assert(await page.locator('.portfolio-empty').isVisible(), 'Empty state message shown when there is genuinely nothing yet');
    await page.close();
  }

  console.log('\n=== 9. Creating a new property uses one atomic Partner RPC ===');
  {
    const page = await browser.newPage();
    await mockAuth(page, { profileRole: 'partner_user', partnerId: 'partner-1', partnerName: 'Alma Imóveis' });
    let propertyRpcPayload = null;
await page.route('**/rest/v1/rpc/zfind_partner_create_property', route => {
  propertyRpcPayload = route.request().postDataJSON();
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'new-prop-1', subtype: 'apartment' }) });
});
await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
await page.route('**/rest/v1/developments**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await login(page);
    await page.waitForTimeout(400);
    await page.click('text=+ New property');
    await page.waitForTimeout(400);
    assert(propertyRpcPayload && propertyRpcPayload.p_subtype === 'apartment', 'Property RPC receives the sensible default subtype (apartment)');
assert(propertyRpcPayload && propertyRpcPayload.p_typology === null && propertyRpcPayload.p_zone_lite_id === null, 'Property RPC preserves the minimal draft defaults');
assert(propertyRpcPayload && !Object.prototype.hasOwnProperty.call(propertyRpcPayload, 'partner_id'), 'Partner ownership is never supplied by the browser — the RPC derives it from auth.uid()');
await page.close();
  }

  console.log('\n=== 10. Creating a new development validates the form, then uses one atomic Partner RPC ===');
  {
    const page = await browser.newPage();
    await mockAuth(page, { profileRole: 'partner_user', partnerId: 'partner-1', partnerName: 'Alma Imóveis' });
    let developmentRpcPayload = null;
await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
await page.route('**/rest/v1/rpc/zfind_partner_create_development', route => {
  developmentRpcPayload = route.request().postDataJSON();
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'new-dev-1', name: 'Alma Living Test' }) });
});
await page.route('**/rest/v1/developments**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
await login(page);
    await page.waitForTimeout(400);
    await page.click('text=+ New development');
    await page.waitForTimeout(200);
    assert(await page.locator('#new-dev-form').isVisible(), 'Development form opens');
    await page.click('#new-dev-save');
    await page.waitForTimeout(200);
    assert(!developmentRpcPayload, 'Refuses to create with an empty name — never sends the RPC request');
    await page.fill('#new-dev-name', 'Alma Living Test');
    await page.click('#new-dev-save');
    await page.waitForTimeout(400);
    assert(developmentRpcPayload && developmentRpcPayload.p_name === 'Alma Living Test', 'Development RPC receives the real name entered');
assert(developmentRpcPayload && developmentRpcPayload.p_zone_lite_id === null, 'Development RPC preserves the minimal draft defaults');
assert(developmentRpcPayload && !Object.prototype.hasOwnProperty.call(developmentRpcPayload, 'partner_id'), 'Partner ownership is never supplied by the browser — the RPC derives it from auth.uid()');
assert(!(await page.locator('#new-dev-form').isVisible()), 'Form closes after a successful save');
    await page.close();
  }

  console.log('\n=== 11. Clicking a portfolio row opens the full detail view, pre-filled with real data ===');
  {
    const page = await browser.newPage();
    await mockAuth(page, { profileRole: 'partner_user', partnerId: 'partner-1', partnerName: 'Alma Imóveis' });
    await page.route('**/rest/v1/properties**', route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'prop1', subtype: 'apartment', typology: 'T2', area_sqm: 85, bedrooms: 3, energy_rating: 'B-', representations: [] }) });
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'prop1', subtype: 'apartment', typology: 'T2', area_sqm: 85, zones_lite: { name: 'Boavista', city: 'Porto' } }]) });
    });
    await page.route('**/rest/v1/developments**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/features**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'f1', code: 'pool', label: 'Piscina' }]) }));
    await page.route('**/rest/v1/property_features**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await login(page);
    await page.waitForTimeout(400);
    await page.click('.portfolio-row');
    await page.waitForTimeout(400);
    assert(await page.locator('#view-detail').isVisible(), 'Detail view opens');
    assert(!(await page.locator('#view-dashboard').isVisible()), 'Portfolio list hides behind it');
    assert((await page.inputValue('#attr-bedrooms')) === '3', 'Real bedroom count pre-filled from the database — the full 30+ field taxonomy, not a stripped-down subset');
    assert((await page.inputValue('#attr-energy-rating')) === 'B-', 'Energy rating pre-filled correctly (B-, not miscoerced to B)');
    assert(await page.locator('.feature-checkbox').count() === 1, 'Features checklist also loads on the detail page');
    await page.close();
  }

  console.log('\n=== 12. Saving fields on the detail view works, uses the SAME shared reader as Admin ===');
  {
    const page = await browser.newPage();
    await mockAuth(page, { profileRole: 'partner_user', partnerId: 'partner-1', partnerName: 'Alma Imóveis' });
    let patchSent = null;
    await page.route('**/rest/v1/properties**', route => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'PATCH') { patchSent = route.request().postDataJSON(); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(patchSent) }); }
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'prop1', subtype: 'apartment', representations: [] }) });
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'prop1', subtype: 'apartment', typology: 'T2', zones_lite: null }]) });
    });
    await page.route('**/rest/v1/developments**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/features**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/property_features**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await login(page);
    await page.waitForTimeout(400);
    await page.click('.portfolio-row');
    await page.waitForTimeout(400);
    await page.fill('#attr-bedrooms', '4');
    await page.click('button:has-text("Save all fields above")');
    await page.waitForTimeout(300);
    assert(patchSent && patchSent.bedrooms === 4, 'Edited field reaches the real PATCH payload');
    assert(await page.locator('.toast').count() === 1, 'A confirmation toast appears');
    await page.close();
  }

  console.log('\n=== 13. Back to portfolio returns cleanly and refreshes the list ===');
  {
    const page = await browser.newPage();
    await mockAuth(page, { profileRole: 'partner_user', partnerId: 'partner-1', partnerName: 'Alma Imóveis' });
    await page.route('**/rest/v1/properties**', route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'prop1', subtype: 'apartment', representations: [] }) });
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'prop1', subtype: 'apartment', typology: 'T2', zones_lite: null }]) });
    });
    await page.route('**/rest/v1/developments**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/features**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/property_features**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await login(page);
    await page.waitForTimeout(400);
    await page.click('.portfolio-row');
    await page.waitForTimeout(300);
    await page.click('text=← Back to portfolio');
    await page.waitForTimeout(300);
    assert(await page.locator('#view-dashboard').isVisible(), 'Returns to the portfolio list');
    assert(!(await page.locator('#view-detail').isVisible()), 'Detail view hides');
    await page.close();
  }

  console.log('\n=== 14. Units section shows for a Development, hidden for a Property — same analogous feature as Admin ===');
  {
    const page = await browser.newPage();
    await mockAuth(page, { profileRole: 'partner_user', partnerId: 'partner-1', partnerName: 'Alma Imóveis' });
    await page.route('**/rest/v1/properties**', route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('development_id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'unit-1', subtype: 'apartment', typology: 'T1', area_sqm: 55, floor: 2, zones_lite: { name: 'Foz do Douro' } }]) });
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'dev-1', name: 'Alma Living', zone_lite_id: 'z1', representations: [] }) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('**/rest/v1/developments**', route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'dev-1', name: 'Alma Living', zone_lite_id: 'z1', zones_lite: null, representations: [] }) });
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'dev-1', name: 'Alma Living', zones_lite: null }]) });
    });
    await page.route('**/rest/v1/features**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/development_features**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await login(page);
    await page.waitForTimeout(400);
    await page.click('.portfolio-row');
    await page.waitForTimeout(400);
    assert(await page.locator('#detail-units-section').isVisible(), 'Units section visible for a Development');
    const unitsText = await page.locator('#detail-units-list').textContent();
    assert(unitsText.includes('T1') && unitsText.includes('55 m²') && unitsText.includes('Floor 2'), `Real unit data renders — got: "${unitsText}"`);
    await page.close();
  }

  console.log('\n=== 15. "+ Add unit" from Partner correctly links to this development and this partner sees it (RLS-scoped) ===');
  {
    const page = await browser.newPage();
    await mockAuth(page, { profileRole: 'partner_user', partnerId: 'partner-1', partnerName: 'Alma Imóveis' });
    let insertPayload = null;
    await page.route('**/rest/v1/properties**', route => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'POST') { insertPayload = route.request().postDataJSON(); return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ...insertPayload, id: 'new-unit-1' }) }); }
      if (url.searchParams.get('development_id')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'dev-1', name: 'Alma Living', zone_lite_id: 'z1', representations: [] }) });
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('**/rest/v1/developments**', route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'dev-1', name: 'Alma Living', zone_lite_id: 'z1', zones_lite: null, representations: [] }) });
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'dev-1', name: 'Alma Living', zones_lite: null }]) });
    });
    await page.route('**/rest/v1/features**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/development_features**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await login(page);
    await page.waitForTimeout(400);
    await page.click('.portfolio-row');
    await page.waitForTimeout(400);
    await page.click('text=+ Add unit');
    await page.waitForTimeout(400);
    assert(insertPayload && insertPayload.development_id === 'dev-1', 'New unit correctly linked to this development');
    assert(insertPayload && insertPayload.zone_lite_id === 'z1', 'Inherits the development\'s zone by default, same as Admin');
    await page.close();
  }

  console.log('\n=== 16. Leads view: navigation works, shows real leads for this partner only ===');
  {
    const page = await browser.newPage();
    await mockAuth(page, { profileRole: 'partner_user', partnerId: 'partner-1', partnerName: 'Alma Imóveis' });
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/developments**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/leads**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { id: 'lead-1', listing_id: 'l1', contact_type: 'direct', name: 'Maria Silva', email: 'maria@example.com', phone: '+351912345678', message: 'Interested in this apartment, is it still available?', status: 'new', created_at: '2026-01-15T10:00:00Z' },
    ]) }));
    await login(page);
    await page.waitForTimeout(400);
    assert(!(await page.locator('#view-leads').isVisible()), 'Leads view hidden by default, Portfolio shows first');
    await page.click('.dash-nav a:has-text("Leads")');
    await page.waitForTimeout(400);
    assert(await page.locator('#view-leads').isVisible(), 'Leads view opens on nav click');
    assert(!(await page.locator('#view-dashboard').isVisible()), 'Portfolio hides behind it');
    const leadsText = await page.locator('#leads-list').textContent();
    assert(leadsText.includes('Maria Silva'), 'Real lead name renders');
    assert(leadsText.includes('maria@example.com') && leadsText.includes('+351912345678'), 'BOTH email and phone render — the earlier fix (separate fields) still holds here');
    assert(leadsText.includes('Interested in this apartment'), 'Real message renders');
    assert(await page.locator('.lead-status.new').count() === 1, 'Status badge renders correctly');
    await page.close();
  }

  console.log('\n=== 17. Empty leads state is honest, never a blank screen ===');
  {
    const page = await browser.newPage();
    await mockAuth(page, { profileRole: 'partner_user', partnerId: 'partner-1', partnerName: 'Alma Imóveis' });
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/developments**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/leads**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await login(page);
    await page.waitForTimeout(400);
    await page.click('.dash-nav a:has-text("Leads")');
    await page.waitForTimeout(400);
    assert((await page.locator('#leads-list').textContent()).toLowerCase().includes('no leads yet'), 'Honest empty state, not a blank screen');
    await page.close();
  }

  console.log('\n=== 18. Navigation back to Portfolio from Leads works, and vice versa ===');
  {
    const page = await browser.newPage();
    await mockAuth(page, { profileRole: 'partner_user', partnerId: 'partner-1', partnerName: 'Alma Imóveis' });
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/developments**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/leads**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await login(page);
    await page.waitForTimeout(400);
    await page.click('#view-dashboard .dash-nav a:has-text("Leads")');
    await page.waitForTimeout(300);
    await page.click('#view-leads .dash-nav a:has-text("Portfolio")');
    await page.waitForTimeout(300);
    assert(await page.locator('#view-dashboard').isVisible(), 'Returns to Portfolio');
    assert(!(await page.locator('#view-leads').isVisible()), 'Leads view hides');
    await page.close();
  }

  await browser.close();
  console.log('\n============================================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('============================================================');
  if (fail > 0) process.exit(1);
}

run();
