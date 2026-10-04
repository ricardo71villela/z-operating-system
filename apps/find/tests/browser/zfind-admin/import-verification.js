/* ============================================================
   Z FIND ADMIN — Importar anúncios (« Nous chargeons pour vous »)
   An agency's CSV export → mapping → preview → draft listings.
   Mocks Auth + REST only.
   ============================================================ */
'use strict';

const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-admin', 'dist', 'z-find-admin.html');
const SHOTS = process.env.ZFIND_SHOTS_DIR || '';
const USER = { id: 'admin-1', aud: 'authenticated', role: 'authenticated', email: 'admin@zfind.test', app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
let passed = 0;
function check(label, value) { if (!value) throw new Error('FAIL: ' + label); passed += 1; console.log('PASS:', label); }
const json = b => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b), headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/4' } });

const OVERVIEW = {
  agencias: { total: 0, active: 0, with_email: 0, outreach_allowed: 0, do_not_contact: 0, last_ingest: null }, agencias_by_country_type: [], networks: [],
  reviews: { pending: 0, published: 0, invited: 0 }, alerts: { active: 0, pending: 0 }, leads: { total: 0, last_7_days: 0, new: 0 },
  signups: { pending: 0, verified: 0, founder_seats: { FR: 0, BE: 0, LU: 0, developers: 0 } }
};
const PARTNERS = [
  { id: 'p-old', name: 'ANCIENNE AGENCE', role: 'agency', status: 'inactive' },
  { id: 'p-lac', name: 'LAC IMMO', role: 'agency', status: 'active' }
];
// Windows-1252 export with semicolons, as French Excel / agency software produce it.
const CSV = [
  'N° mandat;Type de bien;Type d\'annonce;Prix FAI;Surface habitable;Nb pièces;Chambres;CP;Ville;Descriptif;Classe énergie;Libre',
  'M-101;Appartement;Vente;420 000 €;81;3;2;74500;Évian-les-Bains;"Bel appartement; vue lac";C;x',
  'M-102;Maison;Location;2 100;150;6;4;74200;Thonon-les-Bains;Maison familiale;D;y',
  'M-100;Appartement;Vente;300000;60;2;1;74500;Évian-les-Bains;Déjà en ligne;E;z',
  'M-103;Garage;Vente;25000;14;;;74500;Évian-les-Bains;;;'
].join('\r\n');
const CSV_BYTES = Buffer.from([...CSV].map(c => (c === '€' ? 0x80 : c.charCodeAt(0))));

(async () => {
  console.log('\n=== Z FIND ADMIN — IMPORTAR ANÚNCIOS ===');
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const seen = { create: [], update: [], communeSearch: [], communeSet: [], listing: [], patch: [], content: [], reps: [] };
  let n = 0;
  await page.route('**/auth/v1/token**', r => r.fulfill(json({ access_token: 't', token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: USER })));
  await page.route('**/rest/v1/profiles**', r => r.fulfill(json({ id: USER.id, partner_id: null, role: 'admin' })));
  for (const t of ['properties', 'developments', 'leads']) await page.route(`**/rest/v1/${t}**`, r => r.fulfill(json([])));
  await page.route('**/rest/v1/partners**', r => r.fulfill(json(PARTNERS)));
  await page.route('**/rest/v1/rpc/zfind_admin_operations_overview**', r => r.fulfill(json(OVERVIEW)));
  await page.route('**/rest/v1/representations**', r => { seen.reps.push(decodeURIComponent(r.request().url())); return r.fulfill(json([{ properties: { agency_reference: 'M-100' } }])); });
  await page.route('**/rest/v1/rpc/zfind_create_property**', r => { seen.create.push(r.request().postDataJSON()); n += 1; return r.fulfill(json({ id: 'prop-' + n })); });
  await page.route('**/rest/v1/rpc/zfind_update_asset**', r => { seen.update.push(r.request().postDataJSON()); return r.fulfill(json({ id: 'x' })); });
  await page.route('**/rest/v1/rpc/zfind_commune_search**', r => {
    const b = r.request().postDataJSON(); seen.communeSearch.push(b);
    if (b.p_query === '74500') return r.fulfill(json([{ code: '74218', name: 'Neuvecelle', postcodes: ['74500'] }, { code: '74119', name: 'Évian-les-Bains', postcodes: ['74500'] }]));
    if (b.p_query === '74200') return r.fulfill(json([{ code: '74281', name: 'Thonon-les-Bains', postcodes: ['74200'] }]));
    return r.fulfill(json([]));
  });
  await page.route('**/rest/v1/rpc/zfind_set_asset_commune**', r => { seen.communeSet.push(r.request().postDataJSON()); return r.fulfill(json({ zone_lite_id: 'z' })); });
  await page.route('**/rest/v1/rpc/zfind_admin_create_initial_listing**', r => { const b = r.request().postDataJSON(); seen.listing.push(b); return r.fulfill(json({ id: 'lst-' + b.p_owner_id, status: 'draft' })); });
  await page.route('**/rest/v1/listings**', r => { if (r.request().method() === 'PATCH') seen.patch.push({ url: decodeURIComponent(r.request().url()), body: r.request().postDataJSON() }); return r.fulfill(json({ id: 'l' })); });
  await page.route('**/rest/v1/listing_content**', r => { seen.content.push(r.request().postDataJSON()); return r.fulfill(json({ id: 'c' })); });

  await page.goto(FILE_URL);
  await page.fill('#login-email', 'admin@zfind.test');
  await page.fill('#login-password', 'x');
  await page.click('#login-btn');
  await page.waitForSelector('#ops-cards .card');
  check('daily routine mentions importing an agency\'s file', (await page.textContent('#main')).includes('Importar anúncios'));
  await page.click('#sidebar a[data-view="importar"]');
  await page.waitForSelector('#imp-partner option[value="p-lac"]', { state: 'attached' });
  const opts = await page.$$eval('#imp-partner option', o => o.map(x => x.textContent));
  check('agency list: active agencies first, inactive marked', opts[1] === 'LAC IMMO' && opts[2].includes('(inactive)'));
  check('page explains drafts only, photos by the agency, re-import safe', (await page.textContent('#main')).includes('em rascunho') && (await page.textContent('#main')).includes('fotografias'));

  await page.setInputFiles('#imp-file', { name: 'export-hektor.csv', mimeType: 'text/csv', buffer: CSV_BYTES });
  await page.click('#imp-read');
  await page.waitForSelector('#imp-map-table');
  const mapped = await page.$$eval('#imp-map-table select', s => Object.fromEntries(s.map(x => [x.dataset.field, x.value])));
  check('columns recognised automatically (Windows-1252 headers)', mapped.reference === 'N° mandat' && mapped.price === 'Prix FAI' && mapped.area === 'Surface habitable'
    && mapped.rooms === 'Nb pièces' && mapped.postcode === 'CP' && mapped.city === 'Ville' && mapped.dpe === 'Classe énergie' && mapped.transaction === "Type d'annonce" && mapped.type === 'Type de bien');
  check('example values shown, accents decoded', (await page.textContent('#imp-ex-city')) === 'Évian-les-Bains' && (await page.textContent('#imp-ex-price')) === '420 000 €');
  let summary = await page.textContent('#imp-summary');
  check('preview: 3 of 4 rows ready, garage refused', summary.includes('3') && summary.includes('de 4') && (await page.textContent('#imp-preview-table')).includes('Tipo não aceite'));
  check('import button waits for the agency', await page.$eval('#imp-run', b => b.disabled) && (await page.textContent('#imp-preview')).includes('Escolha a agência'));
  // The admin can change a mapping: unmapping the price blocks every row.
  await page.selectOption('#imp-map-table select[data-field="price"]', '');
  summary = await page.textContent('#imp-summary');
  check('changing a mapping recomputes the preview', summary.trim().startsWith('0 de 4'));
  await page.selectOption('#imp-map-table select[data-field="price"]', 'Prix FAI');
  await page.selectOption('#imp-partner', 'p-lac');
  await page.waitForSelector('#imp-run:not([disabled])');
  check('button counts the rows to import', (await page.textContent('#imp-run')).includes('Importar 3 anúncios como rascunho'));
  const prev = (await page.textContent('#imp-preview-table')).replace(/[\u00a0\u202f]/g, ' ');
  check('preview shows price per month for rentals, typology and file line numbers', /2 ?100 € \/mês/.test(prev) && prev.includes('T3') && prev.includes('Arrendamento'));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-import-preview.png'), fullPage: true });

  await page.click('#imp-run');
  await page.waitForSelector('#confirm-ok');
  check('confirmation names the agency and says nothing is published', (await page.textContent('#confirm-overlay')).includes('LAC IMMO') && (await page.textContent('#confirm-overlay')).includes('nada é publicado'));
  await page.click('#confirm-ok');
  await page.waitForFunction(() => (document.getElementById('imp-progress') || {}).textContent && document.getElementById('imp-progress').textContent.includes('criados em rascunho'));
  const statuses = await page.$$eval('#imp-results-table tbody tr', t => t.map(x => x.dataset.status));
  check('results: 2 created, 1 already online, 1 refused', statuses.join(',') === 'ok,ok,duplicate,skipped');
  check('existing references read for the chosen agency', seen.reps[0].includes('partner_id=eq.p-lac'));
  check('properties created with type, typology and area', seen.create.length === 2 && seen.create[0].p_subtype === 'apartment' && seen.create[0].p_typology === 'T3' && seen.create[0].p_area_sqm === 81 && seen.create[1].p_subtype === 'villa' && seen.create[1].p_typology === '6 pièces');
  check('agency reference, DPE, rooms and postcode saved', seen.update[0].p_patch.agency_reference === 'M-101' && seen.update[0].p_patch.energy_rating === 'C' && seen.update[0].p_patch.bedrooms === 2 && seen.update[0].p_patch.postal_code === '74500');
  check('commune: Évian chosen among the 74500 communes, FR', seen.communeSet[0].p_code === '74119' && seen.communeSet[0].p_country === 'FR' && seen.communeSet[1].p_code === '74281');
  check('draft listing created for LAC IMMO', seen.listing.length === 2 && seen.listing.every(l => l.p_partner_id === 'p-lac' && l.p_kind === 'property'));
  check('price saved: sale 420 000, rent 2 100 monthly, EUR', seen.patch.length === 2 && seen.patch[0].body.price_current === 420000 && seen.patch[0].body.transaction_type === 'sale'
    && seen.patch[1].body.transaction_type === 'rent' && seen.patch[1].body.rental_period === 'monthly' && seen.patch[1].body.price_current === 2100 && seen.patch[0].body.currency_iso === 'EUR');
  check('nothing published (no status change in any listing update)', seen.patch.every(p => !('status' in p.body)));
  check('French title and description written', seen.content.length === 2 && seen.content[0].locale === 'fr' && seen.content[0].title === 'T3 — Évian-les-Bains' && seen.content[0].description === 'Bel appartement; vue lac');
  const res = await page.textContent('#imp-results');
  check('summary and next step shown, each created row links to the property', res.includes('2 criados em rascunho') && res.includes('1 já existiam') && res.includes('fotografias') && (await page.$$('#imp-results-table a')).length === 2);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-import-results.png'), fullPage: true });
  check('no script error', errors.length === 0);
  await browser.close();
  console.log(`\nADMIN IMPORTAR: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
