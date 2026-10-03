/* Browser contract: the search alert form, the demonstration mode (sponsored
   examples only in the "Featured" spaces, never in organic results) and the
   professionals page. Serves the built site; Supabase and /api/alerts are
   answered locally. */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const WEB = path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-web');
const HTML = path.join(WEB, 'dist', 'z-find-prototype.html');
const PUBLIC = path.join(WEB, 'public');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const SHOTS = process.env.ZFIND_SHOTS_DIR || '';

let passed = 0;
function check(label, value) {
  if (!value) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS:', label);
}

function property(i) {
  return {
    id: `fr-prop-${i}`, subtype: 'apartment', typology: 'T3', area_sqm: 70, zone_lite_id: 'zfr-evian', latitude: null, longitude: null,
    bedrooms: 2, living_rooms: 1, energy_rating: 'C', attributes: { balcony_sqm: 6 }, postal_code: '74500',
    zones_lite: { name: 'Évian-les-Bains', city: 'Évian-les-Bains', country_iso: 'FR' },
    representations: [{ target_type: 'property', status: 'active', partners: { id: 'p1', name: 'Agence Test', enquiry_policy: { direct: true } }, listings: [{
      id: `l-${i}`, channel: 'standard', price_current: 400000 + i * 1000, currency_iso: 'EUR', price_is_from: false, status: 'published', transaction_type: 'sale', created_at: '2026-09-20T10:00:00Z',
      listing_content: [{ locale: 'fr', title: `Appartement ${i}` }], listing_media: []
    }] }]
  };
}

function startServer() {
  const html = fs.readFileSync(HTML);
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (url === '/' || url === '/index.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(html); }
    const file = path.join(PUBLIC, path.normalize(url).replace(/^([/\\])+/, ''));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function mock(page, alertRequests) {
  const json = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route(/openstreetmap\.org/, route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(0) }));
  await page.route('**/rest/v1/zones_lite**', route => route.fulfill(json([{ id: 'zfr-evian', name: 'Évian-les-Bains', city: 'Évian-les-Bains', country_iso: 'FR' }])));
  await page.route('**/rest/v1/properties**', route => route.fulfill(json([property(1), property(2)])));
  await page.route('**/rest/v1/developments**', route => route.fulfill(json([])));
  await page.route('**/rest/v1/partners**', route => route.fulfill(json([])));
  await page.route('**/rest/v1/zfind_partner_reviews**', route => route.fulfill(json([])));
  await page.route('**/rest/v1/searches**', route => route.fulfill({ status: 201, contentType: 'application/json', body: '{}' }));
  await page.route('**/rest/v1/rpc/**', route => route.fulfill(json(null)));
  await page.route('**/storage/v1/**', route => route.fulfill(json({})));
  await page.route('**/api/alerts', route => { alertRequests.push(JSON.parse(route.request().postData() || '{}')); route.fulfill(json({ ok: true, status: 'pending' })); });
}

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name), fullPage: false });
}

(async () => {
  console.log('\n=== Z FIND ALERTS / DEMO / PRO (browser) ===');
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const alertRequests = [];
    await mock(page, alertRequests);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // Search alert.
    await page.goto(`${base}/#/fr`);
    await page.waitForFunction(() => !!(window.ZFindServices && window.ZFindServices.demoMode), null, { timeout: 15000 });
    await page.evaluate(() => { location.hash = '#/fr/search?market=FR&transactionType=sale&commune=FR:74119&rooms=3&outdoor=1'; });
    await page.waitForSelector('#search-alert-form', { timeout: 15000 });
    check('search: the alert form is offered under the results', await page.isVisible('#search-alert-form'));
    await page.fill('#search-alert-email', 'not-an-email');
    await page.click('#search-alert-form button');
    check('search alert: invalid e-mail refused in the page', (await page.textContent('#search-alert-msg')).includes('adresse e-mail valide') && alertRequests.length === 0);
    await page.fill('#search-alert-email', 'marie@example.com');
    await page.click('#search-alert-form button');
    check('search alert: consent box required', (await page.textContent('#search-alert-msg')).includes('Cochez') && alertRequests.length === 0);
    await page.check('#search-alert-consent');
    await page.click('#search-alert-form button');
    await page.waitForFunction(() => document.getElementById('search-alert-msg').classList.contains('ok'));
    const sent = alertRequests[0];
    check('search alert: sends the search (commune, criteria) and shows the confirmation step',
      sent.kind === 'search' && sent.consent === true && sent.query.commune === 'FR:74119' && sent.query.rooms === '3' && sent.filters.outdoor === true &&
      !('page' in sent.query) && (await page.textContent('#search-alert-msg')).includes('lien de confirmation'));
    await shot(page, 'search-alert.png');
    check('demo off by default: no banner, no example slot', !(await page.$('#zdemo-banner')) && !(await page.$('.zdemo-slot')));

    // Demonstration mode.
    await page.evaluate(() => { location.hash = '#/fr/market/FR?demo=1'; });
    await page.waitForSelector('#market-featured-root .zdemo-slot', { timeout: 15000 });
    const marketSlots = await page.$$eval('#market-featured-root [data-demo-slot]', n => n.length);
    const realSlots = await page.$$eval('#market-featured-root [data-featured-asset-id]', n => n.length);
    check('demo: banner shown and empty "Featured" slots filled with labelled examples', await page.isVisible('#zdemo-banner') && marketSlots + realSlots === 6 && marketSlots > 0 &&
      (await page.textContent('#market-featured-root')).includes('exemple fictif'));
    await page.evaluate(() => { const el = document.getElementById('market-featured-root'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 120); });
    await shot(page, 'demo-market.png');
    await page.evaluate(() => { location.hash = '#/fr/search?market=FR&transactionType=sale'; });
    await page.waitForSelector('#search-results-aside .zdemo-slot', { timeout: 15000 });
    check('demo: search rail examples, organic results untouched',
      (await page.$$eval('#search-results-aside .zdemo-slot', n => n.length)) >= 1 && (await page.$$eval('#search-grid .zdemo-slot, #search-grid .zdemo-card', n => n.length)) === 0);
    await shot(page, 'demo-search.png');
    await page.evaluate(() => { location.hash = '#/fr/home?demo=0'; });
    await page.waitForFunction(() => !document.getElementById('zdemo-banner'));
    check('demo: ?demo=0 turns it off', !(await page.$('#zdemo-banner')));
    await page.evaluate(() => { location.hash = '#/fr/market/FR?demo=1'; });
    await page.waitForSelector('#zdemo-banner a', { timeout: 10000 });
    await Promise.all([page.waitForEvent('load'), page.click('#zdemo-banner a')]);
    await page.waitForFunction(() => !!(window.ZFindServices && window.ZFindServices.demoMode));
    await page.waitForTimeout(500);
    check('demo: the banner link quits for good (clean address, no banner after reload)',
      !(await page.$('#zdemo-banner')) && !(await page.evaluate(() => location.href)).includes('demo=1') && !(await page.$('.zdemo-slot')));

    // Professionals page.
    await page.evaluate(() => { location.hash = '#/fr/pro'; });
    await page.waitForSelector('#pro-root .zpro', { timeout: 10000 });
    const pro = await page.textContent('#pro-root');
    check('professionals page: offers, rules, public price list and Founder offer', pro.includes('Mise en avant « À la une »') && pro.includes('Aucun particulier') && pro.includes('199 € HT / mois') && pro.includes('Fondateur'));
    await shot(page, 'pro.png');

    // Estimation: the value alert box is offered to owners only.
    await page.evaluate(() => { location.hash = '#/fr/estimation?market=FR&mode=owner'; });
    await page.waitForSelector('[data-est-form]', { timeout: 10000 });
    check('no script error on any page', errors.length === 0);
    console.log(errors.join('\n'));
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\nALERTS / DEMO / PRO BROWSER: ${passed}/${passed} PASSED`);
})().catch(error => { console.error(error); process.exit(1); });
