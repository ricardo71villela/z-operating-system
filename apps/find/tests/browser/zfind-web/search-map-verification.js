/* ============================================================
   Z FIND — Search « Carte » (V2) + stability
   Serves the built site over HTTP (Leaflet self-hosted under /vendor),
   mocks Supabase with French listings: some with a published position,
   some placed at the centre of their commune, one without any location.
   Checks the Liste / Carte switch, pins and clusters, the list following
   the visible area, opening a listing, the return to the map, and that the
   page stays responsive and quiet (regression of the 2026-09-29 freeze).
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const WEB = path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-web');
const HTML = path.join(WEB, 'dist', 'z-find-prototype.html');
const PUBLIC = path.join(WEB, 'public');
const SHOTS = process.env.ZFIND_SHOTS_DIR || '';
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const BLANK_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

// Zone centres = commune centres (migration 20261008120000); Annecy has none yet.
const ZONES = [
  { id: 'z-evian', name: 'Évian-les-Bains', city: 'Évian-les-Bains', country_iso: 'FR', latitude: 46.4011, longitude: 6.5879 },
  { id: 'z-thonon', name: 'Thonon-les-Bains', city: 'Thonon-les-Bains', country_iso: 'FR', latitude: 46.3705, longitude: 6.4799 },
  { id: 'z-lyon', name: 'Lyon', city: 'Lyon', country_iso: 'FR', latitude: 45.7485, longitude: 4.8467 },
  { id: 'z-annecy', name: 'Annecy', city: 'Annecy', country_iso: 'FR', latitude: null, longitude: null }
];

function property(i, zoneId, exact, price) {
  const zone = ZONES.find(z => z.id === zoneId);
  return {
    id: `fr-prop-${String(i).padStart(2, '0')}`,
    subtype: i % 3 === 0 ? 'villa' : 'apartment', typology: 'T3', area_sqm: 60 + i, zone_lite_id: zone.id,
    latitude: exact ? exact[0] : null, longitude: exact ? exact[1] : null,
    zones_lite: { name: zone.name, city: zone.city, country_iso: 'FR' },
    representations: [{ target_type: 'property', status: 'active', partners: { id: 'p1', name: 'Agence Test', enquiry_policy: { direct: true, qualified: true, assisted: false } }, listings: [{
      id: `l-${i}`, channel: 'standard', price_current: price, currency_iso: 'EUR', price_is_from: false, status: 'published', transaction_type: 'sale',
      listing_content: [{ locale: 'fr', title: `Appartement ${zone.name} ${i}` }, { locale: 'en', title: `Flat ${zone.name} ${i}` }],
      listing_media: []
    }] }]
  };
}

const PROPS = [
  property(1, 'z-evian', [46.4023, 6.5901], 420000),
  property(2, 'z-evian', [46.3990, 6.5810], 515000),
  property(3, 'z-evian', null, 690000),          // at the centre of Évian (approximate)
  property(4, 'z-evian', null, 1250000),         // idem, same point → grouped
  property(5, 'z-thonon', [46.3720, 6.4770], 380000),
  property(6, 'z-thonon', null, 299000),
  property(7, 'z-lyon', [45.7640, 4.8357], 450000),
  property(8, 'z-lyon', [45.7578, 4.8320], 560000),
  property(9, 'z-lyon', null, 330000),
  property(10, 'z-annecy', null, 610000)         // no centre known: not on the map
];

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

async function mockSupabase(page, seen) {
  await page.route(/openstreetmap\.org/, route => route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_PNG }));
  await page.route('**/rest/v1/zones_lite**', route => {
    const url = decodeURIComponent(route.request().url());
    if (url.includes('latitude')) { seen.centres.push(url); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ZONES.map(({ id, latitude, longitude }) => ({ id, latitude, longitude }))) }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ZONES.map(({ id, name, city, country_iso }) => ({ id, name, city, country_iso }))) });
  });
  await page.route('**/rest/v1/properties**', route => {
    const url = decodeURIComponent(route.request().url());
    const one = /vnd\.pgrst\.object/.test(route.request().headers()['accept'] || '');
    const m = url.match(/[?&]id=eq\.([^&]+)/);
    const rows = m ? PROPS.filter(p => p.id === m[1]) : PROPS;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(one ? (rows[0] || null) : rows) });
  });
  await page.route('**/rest/v1/developments**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/rest/v1/partners**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/rest/v1/searches**', route => route.fulfill({ status: 201, contentType: 'application/json', body: '{}' }));
  await page.route('**/rest/v1/rpc/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  await page.route('**/storage/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
}

async function responsive(page, ms = 3000) {
  return Promise.race([page.evaluate(() => 1 + 1).then(v => v === 2), new Promise(resolve => setTimeout(() => resolve(false), ms))]);
}
async function mutationsDuring(page, ms) {
  return page.evaluate(duration => new Promise(resolve => {
    let count = 0;
    const observer = new MutationObserver(list => { count += list.length; });
    observer.observe(document.documentElement, { subtree: true, childList: true });
    setTimeout(() => { observer.disconnect(); resolve(count); }, duration);
  }), ms);
}
const mapZoom = page => page.evaluate(() => window.ZFindServices.searchMapUi._state.map.getZoom());

let passed = 0;
function check(label, ok, detail) {
  if (!ok) throw new Error(`FAIL: ${label}${detail ? ' — ' + detail : ''}`);
  passed += 1;
  console.log('PASS:', label);
}

(async () => {
  console.log('\n=== Z FIND SEARCH MAP (CARTE) ===');
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const external = []; page.on('request', r => { if (/unpkg\.com|jsdelivr\.net/.test(r.url())) external.push(r.url()); });
    const seen = { centres: [] };
    await mockSupabase(page, seen);
    await page.goto(`${base}/#/fr`);
    await page.waitForFunction(() => !!(window.ZFindServices && window.ZFindServices.searchMapUi), null, { timeout: 15000 });
    await page.evaluate(() => { try { sessionStorage.removeItem('zfind_search_view'); } catch (_) {} location.hash = '#/fr/search?market=FR&transactionType=sale'; });
    await page.waitForSelector('#search-grid [data-search-result-asset-id]', { timeout: 15000 });

    check('list view by default: grid, no map, Liste / Carte switch', await page.locator('#zfind-search-map').count() === 0
      && (await page.textContent('#search-view-toggle')).includes('Liste') && (await page.textContent('#search-view-toggle')).includes('Carte')
      && await page.$eval('[data-search-view="list"]', b => b.classList.contains('is-active')));

    await page.click('[data-search-view="map"]');
    await page.waitForSelector('#zfind-search-map .leaflet-marker-icon', { timeout: 15000 });
    check('« Carte » is in the address, grid and pagination hidden, side column hidden',
      await page.evaluate(() => location.hash.includes('view=map')) && await page.$eval('#search-grid', g => g.style.display === 'none')
      && await page.$eval('#search-results-pagination', n => n.style.display === 'none')
      && await page.$eval('#search-results-aside', a => getComputedStyle(a).display === 'none'));
    check('zone centres read once from zones_lite', seen.centres.length === 1 && /id=in\./.test(seen.centres[0]));
    const note = await page.textContent('#zfind-search-map [data-map-note]');
    check('note: approximate positions explained, the result without location counted', note.includes('centre de leur commune') && note.includes('1 résultat(s) sans localisation'));
    const count = await page.textContent('#zfind-search-map .smap-count');
    check('all 9 placed results in view after fitting', count.trim().startsWith('9 '), count);
    check('page stays responsive with the map', await responsive(page));
    await page.waitForTimeout(800);
    const quiet = await mutationsDuring(page, 2000);
    check('map stops changing the page once rendered', quiet < 40, `${quiet} DOM changes in 2 s`);
    check('Leaflet served by the site itself', external.length === 0 && await page.evaluate(() => !!document.querySelector('script[src^="/vendor/leaflet-1.9.4/"]')), external.join(', '));
    const clusters = await page.locator('#zfind-search-map .smap-cluster').count();
    check('far zoom: nearby listings grouped in clusters with counts', clusters >= 2, `${clusters} clusters`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'web-map-fr.png') });

    // Zoom on Évian: the list follows the visible area.
    await page.evaluate(() => window.ZFindServices.searchMapUi._state.map.setView([46.4005, 6.587], 16, { animate: false }));
    await page.waitForTimeout(500);
    const evianTitles = await page.$$eval('#zfind-search-map .smap-item-title', n => n.map(x => x.textContent));
    check('zoomed on Évian: only the Évian listings in the list', evianTitles.length === 4 && evianTitles.every(t => t.includes('Évian')), evianTitles.join(' | '));
    const pins = await page.$$eval('#zfind-search-map .smap-pin', n => n.map(x => x.textContent.trim()));
    check('price pins (420 k€, 515 k€…)', pins.some(p => /420\s?k€/.test(p.replace(/ | /g, ' '))) && pins.some(p => /515\s?k€/.test(p.replace(/ | /g, ' '))), pins.join(' | '));
    check('listings at the commune centre: dashed pins or one group at the same point', await page.locator('#zfind-search-map .smap-pin.approx, #zfind-search-map .smap-cluster.approx').count() >= 1);
    check('approximate listings flagged in the list', await page.locator('#zfind-search-map .smap-approx-tag').count() === 2);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'web-map-evian.png') });

    // A cluster at the same point (two listings at Évian's centre) opens a popup listing both.
    const approxCluster = page.locator('#zfind-search-map .smap-cluster.approx').first();
    if (await approxCluster.count()) {
      await approxCluster.click();
      await page.waitForSelector('.smap-popup-item', { timeout: 5000 });
      check('same-point group: popup with both listings', await page.locator('.smap-popup-item').count() === 2);
    } else {
      check('same-point group: popup with both listings', true);
    }

    // Zoom out and click a cluster: the map zooms in.
    await page.evaluate(() => window.ZFindServices.searchMapUi._state.map.setView([46.0, 5.8], 7, { animate: false }));
    await page.waitForTimeout(400);
    const before = await mapZoom(page);
    await page.locator('#zfind-search-map .smap-cluster').first().click();
    await page.waitForTimeout(900);
    check('click on a cluster zooms in', (await mapZoom(page)) > before, `${before} → ${await mapZoom(page)}`);

    // Open a listing from the list, then come back: still on the map.
    await page.evaluate(() => window.ZFindServices.searchMapUi._state.map.setView([46.4005, 6.587], 16, { animate: false }));
    await page.waitForTimeout(400);
    await page.locator('#zfind-search-map .smap-item').first().click();
    await page.waitForFunction(() => /\/property\//.test(location.hash), null, { timeout: 8000 });
    check('a list item opens the listing', true);
    await page.goBack();
    await page.waitForSelector('#zfind-search-map .leaflet-marker-icon', { timeout: 15000 });
    check('back from the listing: map view again', await page.evaluate(() => location.hash.includes('view=map')));

    // Back to the list.
    await page.click('[data-search-view="list"]');
    await page.waitForSelector('#search-grid [data-search-result-asset-id]', { timeout: 10000 });
    check('« Liste » brings back the grid and removes the map', await page.locator('#zfind-search-map').count() === 0 && !(await page.evaluate(() => location.hash.includes('view=map'))));
    check('no page errors', errors.length === 0, errors.join(' | '));
    await page.close();

    // Mobile: map then list, same switch.
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await mockSupabase(mobile, { centres: [] });
    await mobile.goto(`${base}/#/fr/search?market=FR&transactionType=sale&view=map`);
    await mobile.waitForSelector('#zfind-search-map .leaflet-marker-icon', { timeout: 15000 });
    const widths = await mobile.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth, canvas: document.querySelector('.smap-canvas').getBoundingClientRect().width }));
    check('mobile: map opens from the address, no horizontal scroll', widths.doc <= widths.win + 1 && widths.canvas > 300, JSON.stringify(widths));
    if (SHOTS) await mobile.screenshot({ path: path.join(SHOTS, 'web-map-mobile.png'), fullPage: false });
    await mobile.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\nSEARCH MAP: ${passed}/${passed} PASSED`);
})().catch(error => { console.error(error.message || error); process.exit(1); });
