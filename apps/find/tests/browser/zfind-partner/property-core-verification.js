/* ============================================================
   Z FIND PARTNER — "Le bien" (type, typologie, surface, étage) in
   French + confirmation-link URL hygiene. Mocks Auth + REST only.
   ============================================================ */
'use strict';

const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-partner', 'dist', 'z-find-partner.html');
const SHOTS = process.env.ZFIND_SHOTS_DIR || '';
const USER = { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'agence@test.fr', app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-10-04T00:00:00Z', updated_at: '2026-10-04T00:00:00Z' };
let passed = 0;
function check(label, value) { if (!value) throw new Error('FAIL: ' + label); passed += 1; console.log('PASS:', label); }
const json = (b, s) => ({ status: s || 200, contentType: 'application/json', body: JSON.stringify(b) });
const PROP = { id: 'prop1', subtype: 'apartment', typology: null, area_sqm: null, floor: null, zones_lite: null, representations: [] };

(async () => {
  console.log('\n=== Z FIND PARTNER — LE BIEN ===');
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  const errors = [];

  {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    page.on('pageerror', e => errors.push(e.message));
    let patch = null;
    await page.route('**/auth/v1/token**', r => r.fulfill(json({ access_token: 't', token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: USER })));
    await page.route('**/rest/v1/profiles**', r => r.fulfill(json({ id: 'u1', partner_id: 'p1', role: 'partner_user' })));
    await page.route('**/rest/v1/partners**', r => r.fulfill(json({ id: 'p1', name: 'Agence Test' })));
    await page.route('**/rest/v1/zfind_partner_signups**', r => r.fulfill(json({ status: 'verified', plan: 'founder', founder_wave: 1, role: 'agency', country: 'FR' })));
    await page.route('**/rest/v1/developments**', r => r.fulfill(json([])));
    await page.route('**/rest/v1/properties**', r => {
      const u = new URL(r.request().url());
      if (u.searchParams.get('id')) return r.fulfill(json(PROP));
      return r.fulfill(json([Object.assign({}, PROP, { typology: 'T3' })]));
    });
    await page.route('**/rest/v1/features**', r => r.fulfill(json([{ id: 'f1', code: 'pool', label: 'Piscina' }])));
    await page.route('**/rest/v1/property_features**', r => r.fulfill(json([])));
    await page.route('**/rest/v1/rpc/zfind_partner_get_listing_for_asset**', r => r.fulfill(json(null)));
    let searchArgs = null, setArgs = null;
    await page.route('**/rest/v1/rpc/zfind_commune_search**', r => { searchArgs = r.request().postDataJSON(); return r.fulfill(json([
      { code: '74119', name: 'Évian-les-Bains', postcodes: ['74500'], parent: '74', zone_label: 'Évian-les-Bains (74500)' },
      { code: '74057', name: 'Champanges', postcodes: ['74500'], parent: '74', zone_label: 'Champanges (74500)' }])); });
    await page.route('**/rest/v1/rpc/zfind_set_asset_commune**', r => { setArgs = r.request().postDataJSON(); return r.fulfill(json({ zone_lite_id: 'z1', name: 'Évian-les-Bains', country: 'FR', code: '74119', postcodes: ['74500'], parent: '74' })); });
    await page.route('**/rest/v1/rpc/zfind_update_asset**', r => { patch = r.request().postDataJSON(); return r.fulfill(json(Object.assign({}, PROP, { subtype: 'villa', typology: 'T4' }))); });

    await page.goto(FILE_URL);
    await page.fill('#login-email', 'agence@test.fr');
    await page.fill('#login-password', 'MotDePasse-2026');
    await page.click('#login-btn');
    await page.waitForSelector('.portfolio-row');
    check('portfolio shows the property type in French with its typology', (await page.textContent('#portfolio-list')).includes('Appartement · T3') && (await page.textContent('#portfolio-list')).includes('Commune à définir'));
    check('verified sign-up: no welcome banner', !(await page.locator('#signup-banner').isVisible()));
    await page.click('.portfolio-row');
    await page.waitForSelector('#pp-subtype');
    check('detail: "Le bien" section with French property types', (await page.textContent('#detail-extended-fields')).includes('Le bien') && (await page.locator('#pp-subtype option').allTextContents()).includes('Maison / villa'));
    check('detail: French features list', (await page.textContent('#detail-features-grid')).includes('Piscine'));
    await page.selectOption('#pp-subtype', 'villa');
    await page.fill('#pp-typology', 'T4');
    await page.fill('#pp-area', '112.5');
    await page.fill('#pp-floor', '2');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'partner-le-bien.png') });
    await page.click('button:has-text("Enregistrer") >> nth=0');
    await page.waitForTimeout(400);
    check('commune picker: "à définir" with the publication hint', (await page.textContent('#cm-current')) === 'à définir' && (await page.textContent('.commune-picker')).includes('nécessaire pour publier'));
    await page.fill('#cm-q', 'Évian');
    await page.waitForSelector('.commune-option');
    check('search sends country and the folded query', searchArgs.p_country === 'FR' && searchArgs.p_query === 'evian');
    check('results show commune and postcode', (await page.textContent('#cm-results')).includes('Évian-les-Bains (74500)'));
    await page.click('.commune-option >> nth=0');
    await page.waitForFunction(() => document.getElementById('cm-current').textContent.includes('Évian'));
    check('pick links the property to the commune (server-checked code)', setArgs.p_kind === 'property' && setArgs.p_asset_id === 'prop1' && setArgs.p_country === 'FR' && setArgs.p_code === '74119'
      && (await page.textContent('#cm-current')) === 'Évian-les-Bains (74500)' && !(await page.$('.commune-required')));
    check('save sends subtype, typology, surface and floor through zfind_update_asset',
      patch && patch.p_kind === 'property' && patch.p_asset_id === 'prop1' && patch.p_patch.subtype === 'villa' && patch.p_patch.typology === 'T4' && patch.p_patch.area_sqm === 112.5 && patch.p_patch.floor === 2);
    check('title follows the new type', (await page.textContent('#detail-title')) === 'Maison / villa · T4');
    await page.close();
  }

  {
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(FILE_URL + '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    await page.waitForFunction(() => document.getElementById('login-error').textContent.length > 0);
    check('expired confirmation link: French explanation on the login screen', (await page.textContent('#login-error')).includes('a expiré'));
    check('expired confirmation link: error removed from the address bar', !(await page.evaluate(() => window.location.hash)).includes('error'));
    await page.close();
  }

  check('no script error', errors.length === 0);
  await browser.close();
  console.log(`\nPARTNER LE BIEN: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
