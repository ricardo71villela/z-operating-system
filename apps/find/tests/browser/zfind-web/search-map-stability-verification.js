/* ============================================================
   Z FIND — Search map stability (regression of the 2026-09-29 freeze)

   With published listings that carry coordinates, the results map used to
   redraw itself on every DOM change it made, forever, and froze the tab.
   This suite serves the built site over HTTP (Leaflet is self-hosted under
   /vendor), mocks Supabase with French listings that have coordinates and
   checks that the search page renders its map, stays responsive and stops
   changing the DOM once rendered — including after a page change.
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const WEB = path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-web');
const HTML = path.join(WEB, 'dist', 'z-find-prototype.html');
const PUBLIC = path.join(WEB, 'public');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
// 1×1 transparent PNG for map tiles (no network in tests).
const BLANK_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

const ZONES = [
  { id: 'zfr-lyon', name: 'Lyon 6e', city: 'Lyon', country_iso: 'FR', lat: 45.769, lon: 4.85 },
  { id: 'zfr-evian', name: 'Évian-les-Bains', city: 'Évian-les-Bains', country_iso: 'FR', lat: 46.4, lon: 6.59 },
  { id: 'zfr-nice', name: 'Nice', city: 'Nice', country_iso: 'FR', lat: 43.70, lon: 7.27 }
];

function property(i, withCoordinates) {
  const zone = ZONES[i % ZONES.length];
  return {
    id: `fr-prop-${String(i).padStart(2, '0')}`,
    subtype: i % 3 === 0 ? 'villa' : 'apartment',
    typology: 'T3', area_sqm: 60 + i, zone_lite_id: zone.id,
    latitude: withCoordinates ? zone.lat + i * 0.002 : null,
    longitude: withCoordinates ? zone.lon + i * 0.002 : null,
    zones_lite: { name: zone.name, city: zone.city, country_iso: 'FR' },
    representations: [{ target_type: 'property', status: 'active', partners: { id: 'p1', name: 'Agence Test', enquiry_policy: { direct: true, qualified: true, assisted: false } }, listings: [{
      id: `l-${i}`, channel: 'standard', price_current: 300000 + i * 10000, currency_iso: 'EUR', price_is_from: false, status: 'published', transaction_type: 'sale',
      listing_content: [{ locale: 'fr', title: `Appartement lumineux ${i}` }, { locale: 'en', title: `Bright apartment ${i}` }],
      listing_media: []
    }] }]
  };
}

function startServer() {
  const html = fs.readFileSync(HTML);
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
    const file = path.join(PUBLIC, path.normalize(url).replace(/^([/\\])+/, ''));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end('not found');
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function mockSupabase(page, properties) {
  await page.route(/openstreetmap\.org/, route => route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_PNG }));
  // A CDN copy of Leaflet (older builds) is answered locally so the stability
  // checks still run; the self-hosting check below reports the request.
  await page.route(/unpkg\.com\/leaflet@1\.9\.4\/dist\/(leaflet\.(?:js|css))/, route => {
    const name = route.request().url().match(/leaflet\.(js|css)$/)[0];
    route.fulfill({ status: 200, contentType: TYPES[path.extname(name)], body: fs.readFileSync(path.join(PUBLIC, 'vendor', 'leaflet-1.9.4', name)) });
  });
  await page.route('**/rest/v1/zones_lite**', route => route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify(ZONES.map(({ id, name, city, country_iso }) => ({ id, name, city, country_iso }))) }));
  await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(properties) }));
  await page.route('**/rest/v1/developments**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/rest/v1/partners**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/rest/v1/searches**', route => route.fulfill({ status: 201, contentType: 'application/json', body: '{}' }));
  await page.route('**/rest/v1/rpc/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  await page.route('**/storage/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
}

// Evaluates with a hard deadline: a frozen page never answers.
// Opens the home first, then the search route, as a visitor would.
async function openSearch(page, base) {
  await page.goto(`${base}/#/fr`);
  await page.waitForFunction(() => !!(window.ZFindServices && window.ZFindServices.searchMapUi), null, { timeout: 15000 });
  await page.evaluate(() => { location.hash = '#/fr/search?market=FR&transactionType=sale'; });
}

async function responsive(page, ms = 3000) {
  return Promise.race([
    page.evaluate(() => 1 + 1).then(v => v === 2),
    new Promise(resolve => setTimeout(() => resolve(false), ms))
  ]);
}

async function mutationsDuring(page, ms) {
  return page.evaluate(duration => new Promise(resolve => {
    let count = 0;
    const observer = new MutationObserver(list => { count += list.length; });
    observer.observe(document.documentElement, { subtree: true, childList: true });
    setTimeout(() => { observer.disconnect(); resolve(count); }, duration);
  }), ms);
}

let passed = 0;
function check(label, ok, detail) {
  if (!ok) throw new Error(`FAIL: ${label}${detail ? ' — ' + detail : ''}`);
  passed += 1;
  console.log('PASS:', label);
}

(async () => {
  console.log('\n=== Z FIND SEARCH MAP STABILITY ===');
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  try {
    // 1. Twelve French listings with coordinates: two pages of results.
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const external = [];
    page.on('request', r => { if (/unpkg\.com|jsdelivr\.net/.test(r.url())) external.push(r.url()); });
    await mockSupabase(page, Array.from({ length: 12 }, (_, i) => property(i + 1, true)));
    await openSearch(page, base);
    await page.waitForSelector('#search-grid [data-search-result-asset-id]', { timeout: 15000 });
    await page.waitForSelector('#zfind-search-map-v1 .leaflet-marker-icon', { timeout: 15000 });
    check('search page renders results and map markers', true);
    check('page stays responsive with the map on screen', await responsive(page));
    await page.waitForTimeout(800);
    const quiet = await mutationsDuring(page, 2000);
    check('map stops changing the page once rendered', quiet < 40, `${quiet} DOM changes in 2 s`);
    const markers1 = await page.locator('#zfind-search-map-v1 .leaflet-marker-icon').count();
    check('one marker per result on the page', markers1 === 6, `${markers1} markers`);
    check('Leaflet is served by the site itself', external.length === 0 && await page.evaluate(() => !!document.querySelector('script[src^="/vendor/leaflet-1.9.4/"]')), external.join(', '));

    // 2. Page 2 redraws the map once, then goes quiet again.
    const firstIds = await page.$$eval('#search-grid [data-search-result-asset-id]', n => n.map(x => x.getAttribute('data-search-result-asset-id')).join());
    await page.locator('#search-pagination-next, [data-search-page-next], button:has-text("Suivant")').first().click();
    await page.waitForFunction(ids => Array.from(document.querySelectorAll('#search-grid [data-search-result-asset-id]')).map(x => x.getAttribute('data-search-result-asset-id')).join() !== ids, firstIds, { timeout: 10000 });
    await page.waitForTimeout(800);
    check('page change keeps the tab responsive', await responsive(page));
    const quiet2 = await mutationsDuring(page, 2000);
    check('map is quiet again after the page change', quiet2 < 40, `${quiet2} DOM changes in 2 s`);
    const listIds = await page.$$eval('#zfind-search-map-v1 [data-map-asset-id]', n => n.map(x => x.getAttribute('data-map-asset-id')));
    const gridIds = await page.$$eval('#search-grid [data-search-result-asset-id]', n => n.map(x => x.getAttribute('data-search-result-asset-id')));
    check('map follows the new page', listIds.length > 0 && listIds.every(id => gridIds.includes(id)), `${listIds} vs ${gridIds}`);
    check('no page errors', errors.length === 0, errors.join(' | '));
    await page.close();

    // 3. Listings without coordinates: no map, no freeze.
    const page2 = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    await mockSupabase(page2, Array.from({ length: 4 }, (_, i) => property(i + 1, false)));
    await openSearch(page2, base);
    await page2.waitForSelector('#search-grid [data-search-result-asset-id]', { timeout: 15000 });
    await page2.waitForTimeout(1000);
    check('results without coordinates: responsive and no map surface',
      await responsive(page2) && await page2.locator('#zfind-search-map-v1').count() === 0);
    await page2.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\nSEARCH MAP STABILITY: ${passed}/${passed} PASSED`);
})().catch(error => { console.error(error.message || error); process.exit(1); });
