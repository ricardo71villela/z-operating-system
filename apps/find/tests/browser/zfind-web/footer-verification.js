#!/usr/bin/env node
'use strict';

/* ============================================================
   Z FIND — public footer: every link leads somewhere.
   - type shortcuts (Appartements, Programmes neufs, Terrains) land on
     the search page with the filter applied;
   - « Réseau de partenaires », « Confiance et provenance », « Comment les
     opportunités sont vérifiées » (formerly dead « # » links) open the
     professionals page / the « Confiance et vérification » page;
   - ZOS portals: Z Studio opens zstudio.space, the others the
     « <Portail> est en cours de développement » page (FR / EN, mobile);
   - French browser tab title, reset when leaving a page with its own title;
   - no uncaught error in the page.
   Run after building zfind-web (SUPABASE_URL / SUPABASE_ANON_KEY dummies are fine):
     node tests/browser/zfind-web/footer-verification.js
   ZFIND_SHOTS_DIR=<dir> saves screenshots.
   ============================================================ */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const DIST = path.resolve(__dirname, '../../../apps/zfind-web/dist/z-find-prototype.html');
const FILE_URL = pathToFileURL(DIST).href;
const SHOTS = process.env.ZFIND_SHOTS_DIR || '';
let passed = 0;
function check(label, ok, extra) {
  if (!ok) { console.error('FAIL:', label, extra === undefined ? '' : JSON.stringify(extra)); process.exitCode = 1; return; }
  passed++; console.log('PASS:', label);
}
async function shot(page, name, full) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: !!full });
}

const ZONE = { id: 'zfr1', name: 'Évian-les-Bains', city: 'Évian-les-Bains', country_iso: 'FR' };
function prop(id, subtype, title, price) {
  return {
    id, subtype, typology: subtype === 'apartment' ? 'T3' : null, area_sqm: subtype === 'land' ? 820 : 74, zone_lite_id: ZONE.id, latitude: null, longitude: null,
    bedrooms: subtype === 'apartment' ? 2 : null, living_rooms: 1, energy_rating: subtype === 'apartment' ? 'G' : null, attributes: {}, postal_code: '74500',
    zones_lite: { name: ZONE.name, city: ZONE.city, country_iso: 'FR' },
    representations: [{ target_type: 'property', status: 'active', partners: { id: 'p1', name: 'Agence du Lac', enquiry_policy: { direct: true } }, listings: [{
      id: 'l-' + id, transaction_type: 'sale', rental_period: null, price_current: price, currency_iso: 'EUR', price_is_from: false, status: 'published', created_at: '2026-10-01T10:00:00Z',
      listing_content: [{ locale: 'fr', title }], listing_media: [] }] }]
  };
}
const PROPERTIES = [
  prop('apt-1', 'apartment', 'T3 vue lac — Évian-les-Bains', 472000),
  prop('apt-2', 'apartment', 'T2 centre — Évian-les-Bains', 289000),
  prop('villa-1', 'villa', 'Maison familiale — Évian-les-Bains', 890000),
  prop('land-1', 'land', 'Terrain à bâtir — Évian-les-Bains', 210000)
];

async function mock(page) {
  // Playwright: the route registered last wins — catch-alls first.
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/rest/v1/rpc/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  await page.route(/fonts\.(googleapis|gstatic)\.com|_vercel\/insights/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/rest/v1/properties**', route => {
    const url = new URL(route.request().url());
    const sub = url.searchParams.get('subtype');
    const data = sub && sub.startsWith('eq.') ? PROPERTIES.filter(p => p.subtype === sub.slice(3)) : PROPERTIES;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.route('**/rest/v1/zones_lite**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ZONE]) }));
}

const activeView = page => page.evaluate(() => (document.querySelector('.view.active') || {}).id);
const hashOf = page => page.evaluate(() => location.hash);

(async () => {
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await mock(page);
  await page.goto(FILE_URL + '#/fr/home');
  await page.waitForFunction(() => document.querySelector('.view.active')?.id === 'view-home');
  await page.waitForSelector('#zfind-zos-ecosystem-footer');

  /* ---------- title ---------- */
  check('browser tab title (French): « Z Find — Annonces immobilières en France, Belgique et Luxembourg »', await page.title() === 'Z Find — Annonces immobilières en France, Belgique et Luxembourg', await page.title());

  /* ---------- inventory of the footer ---------- */
  const links = await page.$$eval('footer.site a, footer.site [data-zos-app]', els => els.map(e => ({ tag: e.tagName, text: e.textContent.replace(/\s+/g, ' ').trim(), href: e.getAttribute('href'), target: e.getAttribute('target') })));
  console.log('Footer links:'); links.forEach(l => console.log(`  ${l.text} → ${l.href}${l.target ? ' (' + l.target + ')' : ''}`));
  check('every footer entry is a link with a real destination (no « # », no inert span)', links.length >= 19 && links.every(l => l.tag === 'A' && l.href && l.href !== '#'), links.filter(l => l.tag !== 'A' || !l.href || l.href === '#'));
  await page.locator('footer.site').scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await page.locator('footer.site').screenshot({ path: SHOTS ? path.join(SHOTS, 'footer-desktop.png') : undefined }).catch(() => {});

  /* ---------- type shortcuts ---------- */
  const clickFooter = async key => { await page.click(`footer.site a[data-i18n="${key}"]`); await page.waitForTimeout(400); };
  await clickFooter('footer.buyApartments');
  await page.waitForFunction(() => document.querySelectorAll('#search-grid .card, #search-grid [data-asset-id], #search-grid article').length > 0, null, { timeout: 8000 }).catch(() => {});
  const aptHash = await hashOf(page);
  const aptPill = await page.evaluate(() => (document.querySelector('#view-search .tabs-row .pill.active') || {}).dataset?.filter);
  const gridText = await page.textContent('#search-grid').catch(() => '');
  check('« Appartements » → search filtered on apartments (address, active tab, results)', aptHash === '#/fr/search?subtype=apartment' && await activeView(page) === 'view-search' && aptPill === 'apartment'
    && gridText.includes('T3 vue lac') && !gridText.includes('Maison familiale') && !gridText.includes('Terrain à bâtir'), { aptHash, aptPill, gridText: gridText.slice(0, 200) });
  await shot(page, 'footer-filter-apartments-results');
  await clickFooter('footer.land');
  check('« Terrains » → search filtered on land', await hashOf(page) === '#/fr/search?subtype=land' && await page.evaluate(() => document.querySelector('#view-search .tabs-row .pill.active')?.dataset.filter) === 'land');
  await clickFooter('footer.developments');
  check('« Programmes neufs » → search filtered on developments', await hashOf(page) === '#/fr/search?subtype=development' && await page.evaluate(() => document.querySelector('#view-search .tabs-row .pill.active')?.dataset.filter) === 'development');

  /* ---------- formerly dead links ---------- */
  await clickFooter('footer.publishListings');
  check('« Publier vos annonces » → professionals page', await activeView(page) === 'view-pro' && /Professionnels/.test(await page.title()));
  await clickFooter('footer.trust');
  check('« Confiance et vérification » → Confiance et vérification, verification section',
    await activeView(page) === 'view-confiance' && (await page.textContent('#confiance-root')).includes('Comment les annonces sont vérifiées') && await page.title() === 'Confiance et vérification — Z Find');
  await shot(page, 'footer-confiance-page');
  await page.goto(FILE_URL + '#/fr/confiance?section=provenance'); await page.waitForTimeout(400);
  check('« Confiance et provenance » → same page, provenance section', await hashOf(page) === '#/fr/confiance?section=provenance' && (await page.textContent('#confiance-root')).includes('Provenance des annonces'));
  await page.goto(FILE_URL + '#/fr/home'); await page.waitForTimeout(300);
  check('leaving a page with its own title resets the tab title', await page.title() === 'Z Find — Annonces immobilières en France, Belgique et Luxembourg', await page.title());

  /* ---------- ZOS portals ---------- */
  const studio = await page.$eval('[data-zos-app="studio"]', a => ({ href: a.getAttribute('href'), target: a.target, rel: a.rel }));
  check('Z Studio (live) opens zstudio.space in a new tab', studio.href === 'https://zstudio.space' && studio.target === '_blank' && /noopener/.test(studio.rel), studio);
  const coming = await page.$$eval('#zfind-zos-ecosystem-footer a.is-coming', els => els.map(a => [a.dataset.zosApp, a.getAttribute('href'), a.textContent.trim()]));
  const liveApps = await page.$$eval('[data-zos-app="fashion"], [data-zos-app="jobs"]', els => els.map(a => [a.getAttribute('href'), a.target]));
  check('Z Fashion and Z Jobs (live) open zfashion.online and zjobs.online in a new tab', JSON.stringify(liveApps) === JSON.stringify([['https://zfashion.online', '_blank'], ['https://zjobs.online', '_blank']]), liveApps);
  check('Z Desk, Z Mobility, Z Intelligence → « en développement » page, marked « bientôt »',
    JSON.stringify(coming.map(c => c[0])) === JSON.stringify(['desk', 'mobility', 'intelligence']) && coming.every(c => c[1] === '#/fr/bientot/' + c[0] && /bientôt$/.test(c[2])), coming);
  await page.click('[data-zos-app="mobility"]'); await page.waitForTimeout(300);
  const soonText = await page.textContent('#bientot-root');
  check('« Z Mobility est en cours de développement — Bientôt disponible », description, back to Z Find',
    await activeView(page) === 'view-bientot' && soonText.includes('Z Mobility est en cours de développement') && soonText.includes('Bientôt disponible') && soonText.includes('constructeurs') && soonText.includes('Retour à Z Find')
    && await page.title() === 'Z Mobility — bientôt disponible — Z Find', { title: await page.title(), soonText: soonText.slice(0, 200) });
  await shot(page, 'footer-bientot-desktop', true);
  await page.click('#bientot-root a.btn-gold'); await page.waitForTimeout(300);
  check('« Retour à Z Find » → home', await activeView(page) === 'view-home');
  await page.goto(FILE_URL + '#/fr/bientot/inconnu'); await page.waitForTimeout(300);
  check('unknown portal: « Portail introuvable », still a way back', (await page.textContent('#bientot-root')).includes('Portail introuvable') && !!(await page.$('#bientot-root a.btn-gold')));

  /* ---------- English ---------- */
  await page.goto(FILE_URL + '#/en/home'); await page.waitForTimeout(400);
  const enHrefs = await page.$$eval('footer.site a[data-i18n="footer.buyApartments"], [data-zos-app="desk"]', els => els.map(a => a.getAttribute('href')));
  check('English: footer links follow the language, English tab title', JSON.stringify(enHrefs) === JSON.stringify(['#/en/search?subtype=apartment', '#/en/bientot/desk']) && await page.title() === 'Z Find — Property listings in France, Belgium and Luxembourg', { enHrefs, title: await page.title() });
  await page.click('[data-zos-app="desk"]'); await page.waitForTimeout(300);
  check('English « coming soon » page', (await page.textContent('#bientot-root')).includes('Z Desk is under development'));

  /* ---------- mobile ---------- */
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await mobile.newPage();
  m.on('pageerror', e => pageErrors.push(e.message));
  await mock(m);
  await m.goto(FILE_URL + '#/fr/bientot/desk'); await m.waitForTimeout(500);
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('mobile: « Z Desk est en cours de développement », no horizontal scroll', (await m.textContent('#bientot-root')).includes('Z Desk est en cours de développement') && overflow <= 1, overflow);
  await shot(m, 'footer-bientot-mobile', true);
  await m.goto(FILE_URL + '#/fr/home'); await m.waitForTimeout(400);
  await m.locator('footer.site').scrollIntoViewIfNeeded();
  if (SHOTS) await m.locator('footer.site').screenshot({ path: path.join(SHOTS, 'footer-mobile.png') });
  await m.tap('footer.site a[data-i18n="footer.buyApartments"]'); await m.waitForTimeout(500);
  check('mobile: tapping « Appartements » applies the filter', await m.evaluate(() => location.hash) === '#/fr/search?subtype=apartment');
  await shot(m, 'footer-filter-apartments-mobile');

  check('no uncaught error in the pages', pageErrors.length === 0, pageErrors);
  await browser.close();
  console.log(`\nFOOTER: ${passed} checks passed${process.exitCode ? ' — WITH FAILURES' : ''}`);
})().catch(e => { console.error(e); process.exit(1); });
