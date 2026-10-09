/* ============================================================
   Z FIND ADMIN — Importer des annonces (« Nous chargeons pour vous »)
   1. Poliris / SeLoger re-export (Windows-1252) of an agency already on
      Z Find: format recognised, preview of the synchronisation (create /
      update with the price change / archive / error / unchanged),
      « Import complet du portefeuille », confirmation, results, report.
   2. Spreadsheet export with the mandatory-information columns: mapping,
      facts saved for each created listing.
   3. The agency ZIP (annonces.csv + photos): read in the browser.
   Mocks Auth + REST only (fixtures: tests/fixtures/poliris).
   ============================================================ */
'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-admin', 'dist', 'z-find-admin.html');
const FIX = path.resolve(__dirname, '..', '..', 'fixtures', 'poliris');
const SHOTS = process.env.ZFIND_SHOTS_DIR || '';
// JSZip is loaded from cdnjs by the page; served locally when available (JSZIP_FILE or a local install).
const JSZIP_FILE = [process.env.JSZIP_FILE, path.resolve(__dirname, '..', '..', '..', 'node_modules', 'jszip', 'dist', 'jszip.min.js'), '/opt/node-tools/node_modules/jszip/dist/jszip.min.js'].filter(Boolean).find(f => fs.existsSync(f));
const USER = { id: 'admin-1', aud: 'authenticated', role: 'authenticated', email: 'admin@zfind.test', app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
let passed = 0;
function check(label, value) { if (!value) throw new Error('FAIL: ' + label); passed += 1; console.log('PASS:', label); }
const json = b => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b), headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/4' } });
const sp = s => String(s).replace(/[  ]/g, ' ');

const OVERVIEW = {
  agencias: { total: 0, active: 0, with_email: 0, outreach_allowed: 0, do_not_contact: 0, last_ingest: null }, agencias_by_country_type: [], networks: [],
  reviews: { pending: 0, published: 0, invited: 0 }, alerts: { active: 0, pending: 0 }, leads: { total: 0, last_7_days: 0, new: 0 },
  signups: { pending: 0, verified: 0, founder_seats: { FR: 0, BE: 0, LU: 0, developers: 0 } }
};
const PARTNERS = [
  { id: 'p-old', name: 'ANCIENNE AGENCE', role: 'agency', status: 'inactive' },
  { id: 'p-lac', name: 'LAC IMMO', role: 'agency', status: 'active' },
  { id: 'p-new', name: 'NOUVELLE AGENCE', role: 'agency', status: 'active' }
];
const GEO = 'Les informations sur les risques auxquels ce bien est exposé sont disponibles sur le site Géorisques : www.georisques.gouv.fr';
// LAC IMMO's portfolio as the first import (annonces v1) left it: EV-1024 since published.
const listing = (id, status, tx, price, title, description) => ({ id, status, transaction_type: tx, rental_period: tx === 'rent' ? 'monthly' : null, price_current: price, created_at: '2026-10-01T10:00:00Z', listing_content: [{ locale: 'fr', title, description }] });
const PORTFOLIO = [
  { id: 'rep-ev', status: 'active', properties: { id: 'prop-ev', agency_reference: 'EV-1024', subtype: 'apartment', typology: 'T3', area_sqm: 78.5, bedrooms: 2, bathrooms: 1, floor: 2, year_built: 1975, energy_rating: 'D', condo_fee_monthly: 180, postal_code: '74500', street_address: '12 avenue des Sources', latitude: 46.4012, longitude: 6.5897, removed_at: null },
    listings: [listing('lst-ev', 'published', 'sale', 450000, 'T3 vue lac – résidence « Les Sources »', `Bel appartement traversant de 78,5 m² au 2e étage avec ascenseur.\nSéjour plein sud, balcon vue lac, cave et garage.\n${GEO}`)] },
  { id: 'rep-th', status: 'active', properties: { id: 'prop-th', agency_reference: 'TH-2031', subtype: 'apartment', typology: 'T2', area_sqm: 48.2, bedrooms: 1, bathrooms: 1, floor: 3, year_built: 1962, energy_rating: 'C', postal_code: '74200', street_address: '5 rue des Arts', latitude: 46.3705, longitude: 6.4792, removed_at: null },
    listings: [listing('lst-th', 'draft', 'rent', 1150, 'T2 meublé centre-ville', 'Appartement meublé et rénové, cuisine équipée, proche gare.\nDisponible début novembre.')] },
  { id: 'rep-pub', status: 'active', properties: { id: 'prop-pub', agency_reference: 'PUB-77', subtype: 'villa', typology: '6 pièces', area_sqm: 142, removed_at: null },
    listings: [listing('lst-pub', 'pending_review', 'sale', 689000, 'Maison de village rénovée', 'Maison de village…')] }
];
const QUEUED = [
  { listing_id: 'lst-ev', url: 'https://photos.lacimmo.test/ev1024/1.jpg' }, { listing_id: 'lst-ev', url: 'https://photos.lacimmo.test/ev1024/2.jpg' },
  { listing_id: 'lst-ev', url: 'https://photos.lacimmo.test/ev1024/10.jpg' }, { listing_id: 'lst-th', url: 'https://photos.lacimmo.test/th2031/1.jpg' }
];
// Stored facts = what the first import saved (EV-1024 approved since).
const FACTS = {
  'lst-ev': { review_status: 'approved', facts: { dpe_status: 'available', dpe_energy_class: 'D', ghg_class: 'D', energy_cost_min: 1250, energy_cost_max: 1720, energy_cost_reference_year: '2023', fees_payer: 'buyer', agency_fees_amount: 20000, price_includes_agency_fees: true, agency_fees_percent: 4.65, fees_schedule_url: 'https://www.lacimmo.test/bareme-honoraires', is_condominium: true, condominium_lots_count: 24, annual_condominium_charges: 2160, surface_habitable_sqm: 78.5, georisques_disclosure: true, condominium_procedure_status: 'Aucune procédure en cours' } },
  'lst-th': { review_status: 'pending', facts: { dpe_status: 'available', dpe_energy_class: 'C', ghg_class: 'B', energy_cost_min: 640, energy_cost_max: 910, energy_cost_reference_year: '2023', fees_payer: 'shared', surface_habitable_sqm: 48.2, monthly_rent_excl_charges: 1060, monthly_charges: 90, charges_recovery_method: 'provision', furnished: true, deposit_amount: 2120, tenant_fees_amount: 690, inventory_fees_amount: 144 } }
};

(async () => {
  console.log('\n=== Z FIND ADMIN — IMPORTER DES ANNONCES (POLIRIS, SYNCHRONISATION) ===');
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true, locale: 'fr-FR' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const failed = []; page.on('requestfailed', r => failed.push(r.url()));
  const seen = { create: [], update: [], communeSet: [], listing: [], patch: [], content: [], reps: [], queue: [], nudges: [], transition: [], save: [], getFacts: [] };
  let n = 0;
  await page.route('**/auth/v1/token**', r => r.fulfill(json({ access_token: 't', token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: USER })));
  await page.route('**/rest/v1/profiles**', r => r.fulfill(json({ id: USER.id, partner_id: null, role: 'admin' })));
  for (const t of ['properties', 'developments', 'leads']) await page.route(`**/rest/v1/${t}**`, r => r.fulfill(json([])));
  await page.route('**/rest/v1/partners**', r => r.fulfill(json(PARTNERS)));
  await page.route('**/rest/v1/rpc/zfind_admin_operations_overview**', r => r.fulfill(json(OVERVIEW)));
  await page.route('**/rest/v1/rpc/zfind_admin_list_listing_compliance**', r => r.fulfill(json([])));
  await page.route('**/rest/v1/zfind_estimation_requests**', r => r.fulfill(json([])));
  await page.route('**/rest/v1/rpc/zfind_admin_leads**', r => r.fulfill(json([])));
  await page.route('**/rest/v1/representations**', r => { const u = decodeURIComponent(r.request().url()); seen.reps.push(u); return r.fulfill(json(u.includes('partner_id=eq.p-lac') ? PORTFOLIO : [])); });
  await page.route('**/rest/v1/rpc/zfind_get_listing_compliance**', r => { const b = r.request().postDataJSON(); seen.getFacts.push(b.p_listing_id); const f = FACTS[b.p_listing_id] || { review_status: 'unreviewed', facts: {} }; return r.fulfill(json(Object.assign({ listing_id: b.p_listing_id }, f))); });
  await page.route('**/rest/v1/rpc/zfind_save_listing_compliance**', r => { const b = r.request().postDataJSON(); seen.save.push(b); return r.fulfill(json({ listing_id: b.p_listing_id, review_status: 'pending', facts: b.p_facts })); });
  await page.route('**/rest/v1/rpc/zfind_admin_transition_listing**', r => { seen.transition.push(r.request().postDataJSON()); return r.fulfill(json({ id: 'x', status: 'archived' })); });
  await page.route('**/rest/v1/rpc/zfind_create_property**', r => { seen.create.push(r.request().postDataJSON()); n += 1; return r.fulfill(json({ id: 'prop-' + n })); });
  await page.route('**/rest/v1/rpc/zfind_update_asset**', r => { seen.update.push(r.request().postDataJSON()); return r.fulfill(json({ id: 'x' })); });
  await page.route('**/rest/v1/rpc/zfind_commune_search**', r => {
    const b = r.request().postDataJSON();
    if (b.p_query === '74500') return r.fulfill(json([{ code: '74218', name: 'Neuvecelle', postcodes: ['74500'] }, { code: '74119', name: 'Évian-les-Bains', postcodes: ['74500'] }]));
    if (b.p_query === '74200') return r.fulfill(json([{ code: '74281', name: 'Thonon-les-Bains', postcodes: ['74200'] }]));
    return r.fulfill(json([]));
  });
  await page.route('**/rest/v1/rpc/zfind_set_asset_commune**', r => { seen.communeSet.push(r.request().postDataJSON()); return r.fulfill(json({ zone_lite_id: 'z' })); });
  await page.route('**/rest/v1/rpc/zfind_admin_create_initial_listing**', r => { const b = r.request().postDataJSON(); seen.listing.push(b); return r.fulfill(json({ id: 'lst-' + b.p_owner_id, status: 'draft' })); });
  await page.route('**/rest/v1/listings**', r => { if (r.request().method() === 'PATCH') seen.patch.push({ url: decodeURIComponent(r.request().url()), body: r.request().postDataJSON() }); return r.fulfill(json({ id: 'l' })); });
  await page.route('**/rest/v1/listing_content**', r => { seen.content.push(r.request().postDataJSON()); return r.fulfill(json({ id: 'c' })); });
  let polls = 0;
  await page.route('**/rest/v1/zfind_media_import_queue**', r => {
    const u = decodeURIComponent(r.request().url());
    if (r.request().method() === 'POST') { seen.queue.push({ url: u, body: r.request().postDataJSON() }); return r.fulfill(json([])); }
    if (!u.includes('status')) return r.fulfill(json(QUEUED.filter(q => u.includes(q.listing_id))));
    polls += 1;
    return r.fulfill(json([{ listing_id: 'lst-prop-1', url: 'https://img.test/a.jpg', status: polls === 1 ? 'pending' : 'done', error: null }]));
  });
  await page.route('https://zfind.online/api/**', r => { seen.nudges.push(r.request().url()); return r.fulfill({ status: 200, body: '{}' }); });
  if (JSZIP_FILE) await page.route('https://cdnjs.cloudflare.com/ajax/libs/jszip/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(JSZIP_FILE, 'utf8') }));

  await page.goto(FILE_URL);
  await page.fill('#login-email', 'admin@zfind.test');
  await page.fill('#login-password', 'x');
  await page.click('#login-btn');
  await page.waitForSelector('#ops-cards .card');
  check('daily routine mentions importing an agency’s file (Poliris)', (await page.textContent('#main')).includes('Importer des annonces') && (await page.textContent('#main')).includes('Poliris'));
  await page.click('#sidebar a[data-view="importar"]');
  await page.waitForSelector('#imp-partner option[value="p-lac"]', { state: 'attached' });
  const opts = await page.$$eval('#imp-partner option', o => o.map(x => x.textContent));
  check('agency list: active agencies first, inactive marked', opts[1] === 'LAC IMMO' && opts[3].includes('(Inactif)'));
  const intro = await page.textContent('#main');
  check('page explains Poliris / ZIP, drafts, portfolio update and withdrawal', intro.includes('Poliris / SeLoger') && intro.includes('en brouillon') && intro.includes('mettent à jour son portefeuille') && intro.includes('archivées, jamais supprimées'));

  // Template download: every column, French.
  const [tpl] = await Promise.all([page.waitForEvent('download'), page.click('#imp-template')]);
  const tplText = fs.readFileSync(await tpl.path(), 'utf8');
  check('« Télécharger le modèle CSV »: French headers incl. the mandatory information', tpl.suggestedFilename() === 'modele-import-zfind.csv' && tplText.includes('Honoraires à la charge de') && tplText.includes('GES (classe climat)') && tplText.includes('Dépenses d’énergie estimées — minimum (€/an)'));

  /* ---------- 1. Poliris re-export ---------- */
  await page.selectOption('#imp-partner', 'p-lac');
  await page.setInputFiles('#imp-file', { name: 'annonces.csv', mimeType: 'text/csv', buffer: fs.readFileSync(path.join(FIX, 'annonces-v2-latin1.csv')) });
  await page.click('#imp-read');
  await page.waitForSelector('#imp-format');
  const fmt = sp(await page.textContent('#imp-format'));
  check('Poliris recognised: version 4.09, 4 listings, no mapping to do', fmt.includes('format Poliris / SeLoger reconnu') && fmt.includes('4.09') && fmt.includes('4 annonces') && !(await page.$('#imp-map-table')));
  check('preview: accents decoded from Windows-1252, line numbers without header', (await page.textContent('#imp-preview-table')).includes('Évian-les-Bains') && (await page.$eval('#imp-preview-table tbody tr td', td => td.textContent)) === '1');
  await page.waitForSelector('#imp-plan-panel');
  const counts = await page.$$eval('.imp-counts .card', c => c.map(x => x.id.replace('imp-count-', '') + '=' + x.querySelector('.n').textContent));
  check('plan: 1 to create, 1 to update, 1 to withdraw, 1 in error, 1 unchanged', counts.join(',') === 'create=1,update=1,archive=1,error=1,unchanged=1');
  check('« Import complet du portefeuille » on by default for Poliris', await page.$eval('#imp-full', c => c.checked));
  const upd = sp(await page.textContent('#imp-plan-updates'));
  check('update shows « Prix : 450 000 € → 435 000 € » on the published listing', upd.includes('EV-1024') && upd.includes('Prix : 450 000 € → 435 000 €') && upd.includes('Publiée'));
  check('withdrawal list: PUB-77 (absent from the file) with its current status', (await page.textContent('#imp-plan-archives')).includes('PUB-77') && (await page.textContent('#imp-plan-archives')).includes('À vérifier'));
  check('errors: the parking, with the reason in French', (await page.textContent('#imp-plan-errors')).includes('EV-P12') && (await page.textContent('#imp-plan-errors')).includes('Type non accepté'));
  const cr = await page.textContent('#imp-plan-creates');
  check('creation: EV-1100, with what the agency must still provide', cr.includes('EV-1100') && cr.includes('mentions incomplètes') && cr.includes('motif d’exemption du DPE'));
  check('stored facts read only for the matched French listings', seen.getFacts.sort().join() === 'lst-ev,lst-th');
  check('portfolio read for LAC IMMO only', seen.reps.length === 1 && seen.reps[0].includes('partner_id=eq.p-lac') && seen.reps[0].includes('target_type=eq.property'));
  check('button sums up what will be applied', sp(await page.textContent('#imp-run')) === 'Confirmer et appliquer (1 création, 1 mise à jour, 1 retrait)');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-import-poliris-preview.png'), fullPage: true });
  await page.uncheck('#imp-full');
  await page.waitForFunction(() => document.querySelector('#imp-count-archive .n') && document.querySelector('#imp-count-archive .n').textContent === '0');
  check('without « import complet »: nothing to withdraw', !(await page.$('#imp-plan-archives')));
  await page.check('#imp-full');
  await page.waitForSelector('#imp-plan-archives');

  await page.click('#imp-run');
  await page.waitForSelector('#confirm-ok');
  const conf = await page.textContent('#confirm-overlay');
  check('confirmation names the agency, the counts and says nothing is published', conf.includes('LAC IMMO') && conf.includes('1 création(s)') && conf.includes('1 retrait(s) par archivage') && conf.includes('Rien n’est publié'));
  await page.click('#confirm-ok');
  await page.waitForFunction(() => /retirée\(s\)/.test((document.getElementById('imp-progress') || {}).textContent || ''));
  const statuses = await page.$$eval('#imp-results-table tbody tr', t => t.map(x => x.dataset.status));
  check('results: error, created, updated, withdrawn', statuses.join(',') === 'error,create,update,archive');
  check('published listing: price written, nothing else, no facts re-sent', seen.patch.filter(p => p.url.includes('id=eq.lst-ev')).map(p => JSON.stringify(p.body)).join() === '{"price_current":435000}' && !seen.save.some(s => s.p_listing_id === 'lst-ev'));
  check('withdrawal through zfind_admin_transition_listing(…, archived), never a delete', seen.transition.length === 1 && seen.transition[0].p_listing_id === 'lst-pub' && seen.transition[0].p_to_status === 'archived');
  check('new listing: property, reference, commune, draft, price, text', seen.create.length === 1 && seen.create[0].p_typology === 'Studio' && seen.update[0].p_patch.agency_reference === 'EV-1100' && seen.communeSet[0].p_code === '74119'
    && seen.listing[0].p_partner_id === 'p-lac' && seen.patch.some(p => p.body.price_current === 165000 && p.body.transaction_type === 'sale') && seen.content.some(c => c.locale === 'fr' && c.description.includes('Studio rénové')));
  const saved = seen.save.find(s => s.p_listing_id === 'lst-prop-1');
  check('mandatory information of the new listing saved after it exists (import evidence)', saved && saved.p_facts.dpe_status === 'exempt' && saved.p_facts.condominium_procedure_status === 'Procédure en cours : Mandat ad hoc' && saved.p_source_evidence.source === 'admin_import' && saved.p_source_evidence.format === 'poliris');
  const resText = sp(await page.textContent('#imp-results'));
  check('summary + link to « Mentions obligatoires à valider » + per-row missing information', resText.includes('1 créée(s) en brouillon · 1 mise(s) à jour · 1 retirée(s)') && resText.includes('« Mentions obligatoires à valider »') && resText.includes('mentions incomplètes : ') && resText.includes('1 annonce(s) inchangée(s) restent incomplètes') && resText.includes('Retirée (archivée) — absente du fichier, était « à vérifier »'));
  const [rep] = await Promise.all([page.waitForEvent('download'), page.click('#imp-report')]);
  const repText = fs.readFileSync(await rep.path(), 'utf8');
  check('report CSV downloaded: one line per item, French', /^rapport-import-lac-immo-\d{4}-\d{2}-\d{2}\.csv$/.test(rep.suggestedFilename()) && repText.includes('Ligne du fichier;Référence;Action') && repText.includes(';PUB-77;Retrait;OK;') && repText.includes('EV-P12;Erreur') && repText.split('\r\n').length >= 6);
  check('no photo job: every link of the matched listings was already queued', seen.queue.length === 0);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-import-poliris-results.png'), fullPage: true });

  /* ---------- 2. spreadsheet export with the mandatory-information columns ---------- */
  await page.click('#sidebar a[data-view="importar"]');
  await page.waitForSelector('#imp-partner option[value="p-new"]', { state: 'attached' });
  await page.selectOption('#imp-partner', 'p-new');
  await page.setInputFiles('#imp-file', { name: 'export-tableur.csv', mimeType: 'text/csv', buffer: fs.readFileSync(path.join(FIX, 'export-tableur-mentions.csv')) });
  await page.click('#imp-read');
  await page.waitForSelector('#imp-map-table');
  const mapped = await page.$$eval('#imp-map-table select', s => Object.fromEntries(s.map(x => [x.dataset.field, x.value])));
  check('spreadsheet columns recognised, incl. GES, energy costs, fees payer, copropriété, rent columns', mapped.reference === 'N° mandat' && mapped.ges === 'Classe GES' && mapped.feesPayer === 'Honoraires à la charge de' && mapped.condoLots === 'Nombre de lots'
    && mapped.rentExclCharges === 'Loyer hors charges (€)' && mapped.energyCostMax === 'Dépenses d’énergie estimées — maximum (€/an)' && mapped.charges === 'Charges');
  check('mapping grouped: « Annonce » / « Mentions obligatoires (France) »', (await page.textContent('#imp-map-table')).includes('Mentions obligatoires (France)'));
  await page.waitForSelector('#imp-plan-panel');
  check('new agency: 2 to create, « import complet » off for a spreadsheet', (await page.textContent('#imp-count-create .n')) === '2' && !(await page.$eval('#imp-full', c => c.checked)));
  const prevMentions = await page.textContent('#imp-preview-table');
  check('preview: mandatory information complete for the sale, what is missing for the rental', prevMentions.includes('mentions complètes') && prevMentions.includes('mentions incomplètes : montant des honoraires, encadrement des loyers'));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-import-tableur-preview.png'), fullPage: true });
  const before = seen.save.length;
  await page.click('#imp-run');
  await page.click('#confirm-ok');
  await page.waitForFunction(() => /créée\(s\)/.test((document.getElementById('imp-progress') || {}).textContent || ''));
  const newSaves = seen.save.slice(before);
  check('facts saved for both created listings (sale complete, rent partial)', newSaves.length === 2 && newSaves[0].p_facts.agency_fees_amount === 20000 && newSaves[0].p_facts.surface_carrez_sqm === 94.1 && newSaves[1].p_facts.monthly_rent_excl_charges === 1780 && !('rent_control_status' in newSaves[1].p_facts));
  check('photo-less spreadsheet: no photo step', !(await page.$('#imp-photos')));

  /* ---------- 3. the agency ZIP ---------- */
  if (JSZIP_FILE) {
    await page.click('#sidebar a[data-view="importar"]');
    await page.waitForSelector('#imp-partner option[value="p-new"]', { state: 'attached' });
    await page.setInputFiles('#imp-file', { name: 'lacimmo74.zip', mimeType: 'application/zip', buffer: fs.readFileSync(path.join(FIX, 'lacimmo74.zip')) });
    await page.click('#imp-read');
    await page.waitForSelector('#imp-format');
    const z = sp(await page.textContent('#imp-format'));
    check('ZIP: Annonces.csv read as Poliris, photo files counted', z.includes('format Poliris / SeLoger reconnu') && z.includes('ZIP : Annonces.csv et 2 photo(s)') && z.includes('4 annonces'));
    await page.selectOption('#imp-partner', 'p-new');
    await page.waitForSelector('#imp-plan-panel');
    check('ZIP plan for an agency without listings: 3 to create, nothing to withdraw', (await page.textContent('#imp-count-create .n')) === '3' && (await page.textContent('#imp-count-archive .n')) === '0');
  } else console.log('SKIP: ZIP (no local jszip to serve instead of cdnjs)');

  check('no script or console error, no failed request', (errors.length === 0 && failed.length === 0) || (console.error(errors, failed), false));
  await browser.close();
  console.log(`\nADMIN IMPORT: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
