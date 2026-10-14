/* ============================================================
   Z FIND PARTNER — « Importer mes annonces » and « Flux automatique »
   1. The agency's Poliris re-export (Windows-1252): preview of the
      synchronisation against ITS OWN portfolio (zfind_partner_import_portfolio,
      no agency selector), « Import complet », inline confirmation, Partner
      commands only (zfind_create_property … zfind_partner_archive_imported_listing),
      results + report, photo links queued.
   2. « Soumettre toutes les annonces prêtes »: one ready, others blocked
      with what they miss.
   3. Limits: too large a file, too many listings.
   4. « Flux automatique »: save (password never shown again), « Tester le
      flux » (server nudged, result read back), « Dernière synchronisation »
      flagged + « Confirmer ».
   5. Mobile (390 px): no horizontal overflow.
   Mocks Auth + REST only. Screenshots when ZFIND_SHOTS_DIR is set.
   ============================================================ */
'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-partner', 'dist', 'z-find-partner.html');
const FIX = path.resolve(__dirname, '..', '..', 'fixtures', 'poliris');
const SHOTS = process.env.ZFIND_SHOTS_DIR || '';
const JSZIP_FILE = [process.env.JSZIP_FILE, path.resolve(__dirname, '..', '..', '..', 'node_modules', 'jszip', 'dist', 'jszip.min.js'), path.resolve(__dirname, '..', '..', '..', '..', '..', 'node_modules', 'jszip', 'dist', 'jszip.min.js')].filter(Boolean).find(f => fs.existsSync(f));
const USER = { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'agence@lacimmo.test', app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-10-04T00:00:00Z', updated_at: '2026-10-04T00:00:00Z' };
let passed = 0;
function check(label, value) { if (!value) throw new Error('FAIL: ' + label); passed += 1; console.log('PASS:', label); }
const json = (b, s) => ({ status: s || 200, contentType: 'application/json', body: JSON.stringify(b), headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/0' } });
const sp = s => String(s).replace(/[\u00a0\u202f]/g, " ");
const NOT_FRENCH = /\b(the|and|save|submit|pending|draft|review|ready|published|approved|rejected|loading|error|undefined|null|NaN|true|false|flagged|partial)\b/i;

const GEO = 'Les informations sur les risques auxquels ce bien est exposé sont disponibles sur le site Géorisques : www.georisques.gouv.fr';
const listing = (id, status, tx, price, title, description, queued) => ({ id, status, transaction_type: tx, rental_period: tx === 'rent' ? 'monthly' : null, price_current: price, created_at: '2026-10-01T10:00:00Z', listing_content: [{ locale: 'fr', title, description }], queued_urls: queued || [] });
// What zfind_partner_import_portfolio returns for the agency of the session (after its first import, annonces v1).
const PORTFOLIO = [
  { id: 'rep-ev', status: 'active', properties: { id: 'prop-ev', agency_reference: 'EV-1024', subtype: 'apartment', typology: 'T3', area_sqm: 78.5, bedrooms: 2, bathrooms: 1, floor: 2, year_built: 1975, energy_rating: 'D', condo_fee_monthly: 180, postal_code: '74500', street_address: '12 avenue des Sources', latitude: 46.4012, longitude: 6.5897, removed_at: null },
    listings: [listing('lst-ev', 'published', 'sale', 450000, 'T3 vue lac – résidence « Les Sources »', `Bel appartement traversant de 78,5 m² au 2e étage avec ascenseur.\nSéjour plein sud, balcon vue lac, cave et garage.\n${GEO}`, ['https://photos.lacimmo.test/ev1024/1.jpg'] /* two of its photo links are new in the file */)] },
  { id: 'rep-th', status: 'active', properties: { id: 'prop-th', agency_reference: 'TH-2031', subtype: 'apartment', typology: 'T2', area_sqm: 48.2, bedrooms: 1, bathrooms: 1, floor: 3, year_built: 1962, energy_rating: 'C', postal_code: '74200', street_address: '5 rue des Arts', latitude: 46.3705, longitude: 6.4792, removed_at: null },
    listings: [listing('lst-th', 'draft', 'rent', 1150, 'T2 meublé centre-ville', 'Appartement meublé et rénové, cuisine équipée, proche gare.\nDisponible début novembre.', ['https://photos.lacimmo.test/th2031/1.jpg'])] },
  { id: 'rep-pub', status: 'active', properties: { id: 'prop-pub', agency_reference: 'PUB-77', subtype: 'villa', typology: '6 pièces', area_sqm: 142, removed_at: null },
    listings: [listing('lst-pub', 'draft', 'sale', 689000, 'Maison de village rénovée', 'Maison de village…')] }
];
const FACTS = {
  'lst-ev': { review_status: 'approved', facts: { dpe_status: 'available', dpe_energy_class: 'D', ghg_class: 'D', energy_cost_min: 1250, energy_cost_max: 1720, energy_cost_reference_year: '2023', fees_payer: 'buyer', agency_fees_amount: 20000, price_includes_agency_fees: true, agency_fees_percent: 4.65, fees_schedule_url: 'https://www.lacimmo.test/bareme-honoraires', is_condominium: true, condominium_lots_count: 24, annual_condominium_charges: 2160, surface_habitable_sqm: 78.5, georisques_disclosure: true, condominium_procedure_status: 'Aucune procédure en cours' } },
  'lst-th': { review_status: 'pending', facts: { dpe_status: 'available', dpe_energy_class: 'C', ghg_class: 'B', energy_cost_min: 640, energy_cost_max: 910, energy_cost_reference_year: '2023', fees_payer: 'shared', surface_habitable_sqm: 48.2, monthly_rent_excl_charges: 1060, monthly_charges: 90, charges_recovery_method: 'provision', furnished: true, deposit_amount: 2120, tenant_fees_amount: 690, inventory_fees_amount: 144 } }
};

(async () => {
  console.log('\n=== Z FIND PARTNER — IMPORTER MES ANNONCES / FLUX AUTOMATIQUE ===');
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const failed = []; page.on('requestfailed', r => failed.push(r.url()));
  const rpcs = [];
  const seen = { create: [], update: [], ensure: [], commercial: [], content: [], archive: [], queue: [], save: [], submit: [], nudges: [], feedSave: [] };
  let n = 0;
  let feed = null;
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/rest/v1/**', r => r.fulfill(json([])));
  await page.route('**/auth/v1/token**', r => r.fulfill(json({ access_token: 't', token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: USER })));
  await page.route('**/rest/v1/profiles**', r => r.fulfill(json({ id: 'u1', partner_id: 'p1', role: 'partner_user' })));
  await page.route('**/rest/v1/partners**', r => r.fulfill(json({ id: 'p1', name: 'LAC IMMO' })));
  await page.route('**/rest/v1/zfind_partner_signups**', r => r.fulfill(json({ status: 'verified', plan: 'founder', founder_wave: 1, role: 'agency', country: 'FR' })));
  await page.route('**/rest/v1/rpc/**', r => {
    const name = new URL(r.request().url()).pathname.split('/').pop();
    const b = r.request().postDataJSON() || {};
    rpcs.push(name);
    switch (name) {
      case 'zfind_partner_import_portfolio': return r.fulfill(json(PORTFOLIO));
      case 'zfind_get_listing_compliance': return r.fulfill(json(Object.assign({ listing_id: b.p_listing_id }, FACTS[b.p_listing_id] || { review_status: 'unreviewed', facts: {} })));
      case 'zfind_save_listing_compliance': seen.save.push(b); return r.fulfill(json({ listing_id: b.p_listing_id, review_status: 'pending', facts: b.p_facts }));
      case 'zfind_create_property': seen.create.push(b); n += 1; return r.fulfill(json({ id: 'prop-new-' + n }));
      case 'zfind_update_asset': seen.update.push(b); return r.fulfill(json({ id: b.p_asset_id }));
      case 'zfind_commune_search': return r.fulfill(json(b.p_query === '74500' ? [{ code: '74218', name: 'Neuvecelle', postcodes: ['74500'] }, { code: '74119', name: 'Évian-les-Bains', postcodes: ['74500'] }] : b.p_query === '74200' ? [{ code: '74281', name: 'Thonon-les-Bains', postcodes: ['74200'] }] : []));
      case 'zfind_set_asset_commune': return r.fulfill(json({ zone_lite_id: 'z' }));
      case 'zfind_partner_ensure_draft_listing': seen.ensure.push(b); return r.fulfill(json({ id: 'lst-' + b.p_asset_id, status: 'draft' }));
      case 'zfind_partner_update_listing_commercial': seen.commercial.push(b); return r.fulfill(json({ id: b.p_listing_id, status: 'draft' }));
      case 'zfind_partner_upsert_listing_content': seen.content.push(b); return r.fulfill(json({ listing_id: b.p_listing_id }));
      case 'zfind_partner_archive_imported_listing': seen.archive.push(b); return r.fulfill(json({ id: b.p_listing_id, status: 'archived' }));
      case 'zfind_partner_queue_listing_photos': seen.queue.push(b); return r.fulfill(json(b.p_urls.length));
      case 'zfind_list_listing_submission_status': return r.fulfill(json(b.p_listing_ids.map(id => (
        id === 'lst-th' ? { listing_id: id, status: 'draft', ready: true, missing: [] }
          : id === 'lst-ev' ? { listing_id: id, status: 'published', ready: false, missing: [] }
            : { listing_id: id, status: 'draft', ready: false, missing: ['photo', 'compliance_facts'] }))));
      case 'zfind_partner_submit_listing': seen.submit.push(b); return r.fulfill(json({ id: b.p_listing_id, status: 'pending_review' }));
      case 'zfind_partner_get_feed': return r.fulfill(json(feed));
      case 'zfind_partner_save_feed': {
        seen.feedSave.push(b);
        feed = Object.assign({}, feed || {}, { id: 'feed-1', partner_id: 'p1', url: b.p_url, auth_user: b.p_auth_user, has_password: !!(b.p_password || (feed && feed.has_password)) && !b.p_clear_password,
          full_sync: b.p_full_sync, active: b.p_active, country: b.p_country, software_agency_id: b.p_software_agency_id, disabled_by_admin: false, last_counts: {}, last_report: [] });
        return r.fulfill(json(feed));
      }
      case 'zfind_partner_request_feed_test': feed = Object.assign({}, feed, { test_requested_at: new Date().toISOString() }); return r.fulfill(json(feed));
      case 'zfind_partner_accept_feed_volume': feed = Object.assign({}, feed, { last_listing_count: feed.flagged_listing_count, flagged_listing_count: null }); return r.fulfill(json(feed));
      default: return r.fulfill(json([]));
    }
  });
  let polls = 0;
  await page.route('**/rest/v1/zfind_media_import_queue**', r => { polls += 1; return r.fulfill(json([{ status: polls === 1 ? 'pending' : 'done' }])); });
  await page.route('https://zfind.online/api/**', r => {
    seen.nudges.push(r.request().url());
    // The server's answer to « Tester le flux »: what /api/feed-sync records (zfind_feed_record).
    if (r.request().url().endsWith('/api/feed-sync') && feed && feed.test_requested_at) {
      const at = new Date().toISOString();
      feed = Object.assign({}, feed, { test_requested_at: null, last_test_at: at, last_test: { at, status: 'ok', format: 'poliris', version: '4.09', listingCount: 4, counts: { create: 1, update: 1, archive: 1, error: 1, unchanged: 1 }, message: '4 annonces lues : 1 à créer, 1 à mettre à jour, 1 à retirer, 1 en erreur, 1 inchangée.' } });
    }
    return r.fulfill({ status: 200, body: '{}' });
  });
  if (JSZIP_FILE) await page.route('https://cdnjs.cloudflare.com/ajax/libs/jszip/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(JSZIP_FILE, 'utf8') }));

  await page.goto(FILE_URL);
  await page.fill('#login-email', 'agence@lacimmo.test');
  await page.fill('#login-password', 'MotDePasse-2026');
  await page.click('#login-btn');
  await page.waitForSelector('#view-dashboard .dash-nav');

  /* ---------- 1. Importer mes annonces ---------- */
  await page.click('#view-dashboard .dash-nav a:has-text("Importer")');
  await page.waitForSelector('#pimp-step-file');
  check('import page: no agency selector (own agency from the session)', !(await page.$('#view-import select#imp-partner')) && (await page.$$('#view-import select')).length === 1);
  check('nav shows « Importer » active and the agency name', (await page.textContent('#view-import .dash-nav a.active')) === 'Importer' && (await page.textContent('#dash-partner-name-4')) === 'LAC IMMO');
  const [tpl] = await Promise.all([page.waitForEvent('download'), page.click('#pimp-template')]);
  check('« Télécharger le modèle CSV » (French headers)', tpl.suggestedFilename() === 'modele-import-zfind.csv' && fs.readFileSync(await tpl.path(), 'utf8').includes('Honoraires à la charge de'));

  // Limits, before anything is read.
  await page.setInputFiles('#pimp-file', { name: 'annonces.csv', mimeType: 'text/csv', buffer: Buffer.alloc(21 * 1024 * 1024, 65) });
  await page.click('#pimp-read');
  check('a 21 Mo CSV is refused with a French message', /trop volumineux.*20 Mo/.test(sp(await page.textContent('#pimp-file-error'))));
  const many = 'Référence;Prix;Type;Code postal;Ville;Titre\r\n' + Array.from({ length: 2001 }, (_, i) => `R${i};100000;Appartement;74500;Évian;T2 n°${i}`).join('\r\n');
  await page.setInputFiles('#pimp-file', { name: 'export.csv', mimeType: 'text/csv', buffer: Buffer.from(many, 'utf8') });
  await page.click('#pimp-read');
  await page.waitForFunction(() => /2.001 annonces/.test(document.getElementById('pimp-file-error').textContent));
  check('2 001 listings refused (2 000 per import)', /2\s001 annonces.*2\s000 au maximum/.test(sp(await page.textContent('#pimp-file-error'))));

  await page.setInputFiles('#pimp-file', { name: 'annonces.csv', mimeType: 'text/csv', buffer: fs.readFileSync(path.join(FIX, 'annonces-v2-latin1.csv')) });
  await page.click('#pimp-read');
  await page.waitForSelector('#pimp-plan-updates tbody tr');
  check('Poliris recognised (version, count), nothing to map', sp(await page.textContent('#pimp-format')).includes('4 annonces') && sp(await page.textContent('#pimp-format')).includes('4.09') && !(await page.$('#pimp-map-table')));
  const counts = await page.$$eval('.pimp-counts .pimp-count', c => c.map(x => x.id.replace('pimp-count-', '') + '=' + x.querySelector('strong').textContent));
  check('preview: 1 à créer, 1 à mettre à jour, 1 à retirer, 1 en erreur, 1 inchangée', counts.join(',') === 'create=1,update=1,archive=1,error=1,unchanged=1');
  check('portfolio read through zfind_partner_import_portfolio only (no partner id sent)', rpcs.includes('zfind_partner_import_portfolio') && !rpcs.includes('zfind_admin_create_initial_listing'));
  check('change details: « Prix : 450 000 € → 435 000 € » on the published listing', sp(await page.textContent('#pimp-plan-updates')).includes('Prix : 450 000 € → 435 000 €') && (await page.textContent('#pimp-plan-updates')).includes('Publiée'));
  check('withdrawal (import complet on for Poliris) and error listed', (await page.textContent('#pimp-plan-archives')).includes('PUB-77') && (await page.textContent('#pimp-plan-errors')).includes('Type non accepté') && await page.$eval('#pimp-full', c => c.checked));
  check('preview text is French', !NOT_FRENCH.test(await page.innerText('#pimp-plan-panel')));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'partner-import-preview.png'), fullPage: true });
  await page.uncheck('#pimp-full');
  await page.waitForFunction(() => document.querySelector('#pimp-count-archive strong').textContent === '0');
  check('without « import complet »: nothing to withdraw', !(await page.$('#pimp-plan-archives')));
  await page.check('#pimp-full');
  await page.waitForSelector('#pimp-plan-archives');

  await page.click('#pimp-run');
  await page.waitForSelector('#pimp-confirm');
  check('inline confirmation with the counts, nothing published or deleted', sp(await page.textContent('#pimp-confirm')).includes('1 annonce créée en brouillon, 1 mise à jour, 1 retirée (archivée)') && (await page.textContent('#pimp-confirm')).includes('rien n’est publié ni supprimé'));
  if (SHOTS) await page.locator('#pimp-plan-panel').screenshot({ path: path.join(SHOTS, 'partner-import-confirm.png') });
  await page.click('#pimp-confirm-yes');
  await page.waitForSelector('#pimp-submit-all');
  const statuses = await page.$$eval('#pimp-results-table tbody tr', t => t.map(x => x.dataset.status));
  check('results: error, created, updated, withdrawn', statuses.join(',') === 'error,create,update,archive');
  check('Partner commands only: create → ensure draft → price → text; archive by zfind_partner_archive_imported_listing', seen.create.length === 1 && seen.ensure.length === 1 && seen.ensure[0].p_kind === 'property'
    && seen.commercial.some(c => c.p_listing_id === 'lst-ev' && JSON.stringify(c.p_patch) === '{"price_current":435000}') && seen.archive.length === 1 && seen.archive[0].p_listing_id === 'lst-pub'
    && !rpcs.some(x => /^zfind_admin_/.test(x)) && seen.update.some(u => u.p_patch.agency_reference === 'EV-1100'));
  check('facts of the created listing saved with « partner_import » evidence', seen.save.some(s => s.p_listing_id === 'lst-prop-new-1' && s.p_source_evidence.source === 'partner_import'));
  check('photo links queued for /api/media-import (Partner command), server nudged', seen.queue.length >= 1 && seen.queue.every(q => q.p_urls.every(u => /^https:/.test(u))) && seen.nudges.some(u => u.endsWith('/api/media-import')));
  const resText = sp(await page.textContent('#pimp-results'));
  check('summary in French', resText.includes('1 créée en brouillon · 1 mise à jour · 1 retirée') && resText.includes('Retirée (archivée) — absente du fichier'));
  const [rep] = await Promise.all([page.waitForEvent('download'), page.click('#pimp-report')]);
  check('report CSV downloaded', /^rapport-import-\d{4}-\d{2}-\d{2}\.csv$/.test(rep.suggestedFilename()) && fs.readFileSync(await rep.path(), 'utf8').includes(';PUB-77;Retrait;OK;'));
  await page.waitForFunction(() => /^Photos : 1 ajoutée/.test((document.getElementById('pimp-photos-progress') || {}).textContent || ''), null, { timeout: 20000 });
  check('photo progress read back from the queue (RLS: own listings)', true);
  check('success toast (the line in error was already in the preview)', !(await page.$('#toast-host .toast.error')));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'partner-import-results.png'), fullPage: true });

  /* ---------- 2. Soumettre toutes les annonces prêtes ---------- */
  await page.click('#pimp-submit-all');
  await page.waitForSelector('#pimp-submit-summary');
  const sum = sp(await page.textContent('#pimp-submit-summary'));
  check('submit-all: only the ready draft (TH-2031) is submitted; the published one is ignored, the new one blocked', seen.submit.length === 1 && seen.submit[0].p_listing_id === 'lst-th');
  check('… summary', sum.includes('soumise à validation') && sum.includes('bloquée') && sum.includes('il manque au moins une photo, les mentions obligatoires (France) complètes et enregistrées') && sum.includes('ignorée'));
  check('… « Compléter » opens the blocked listing', (await page.$$('#pimp-submit-table .pimp-link')).length >= 1);
  if (SHOTS) await page.locator('#pimp-result-panel').screenshot({ path: path.join(SHOTS, 'partner-import-submit-all.png') });

  /* ---------- ZIP read in the browser ---------- */
  if (JSZIP_FILE) {
    await page.click('#view-import .dash-nav a:has-text("Importer")');
    await page.setInputFiles('#pimp-file', { name: 'lacimmo74.zip', mimeType: 'application/zip', buffer: fs.readFileSync(path.join(FIX, 'lacimmo74.zip')) });
    await page.click('#pimp-read');
    await page.waitForFunction(() => /dans le ZIP/.test((document.getElementById('pimp-format') || {}).textContent || ''));
    check('ZIP export: Annonces.csv + 2 photos read', sp(await page.textContent('#pimp-format')).includes('2 photo(s) dans le ZIP'));
  }

  /* ---------- 3. Flux automatique ---------- */
  await page.click('#view-import .dash-nav a:has-text("Flux automatique")');
  await page.waitForSelector('#pfeed-form');
  check('feed page: HTTPS only explained, FTP not supported', (await page.textContent('#pfeed-form')).includes('FTP / SFTP ne sont pas prises en charge'));
  await page.fill('#pfeed-url', 'http://export.lacimmo.test/annonces.zip');
  await page.click('#pfeed-save');
  check('http:// refused in the panel', (await page.textContent('#pfeed-error')).includes('https://') && seen.feedSave.length === 0);
  await page.fill('#pfeed-url', 'https://export.lacimmo.test/zfind/annonces.zip');
  await page.fill('#pfeed-user', 'lacimmo');
  await page.fill('#pfeed-password', 'S3cret-feed!');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'partner-feed-form.png'), fullPage: true });
  await page.click('#pfeed-save');
  await page.waitForSelector('#pfeed-test');
  check('saved: password sent once, never shown again', seen.feedSave[0].p_password === 'S3cret-feed!' && (await page.inputValue('#pfeed-password')) === '' && (await page.getAttribute('#pfeed-password', 'placeholder')).includes('laisser vide pour le garder') && !(await page.content()).includes('S3cret'));
  check('« Dernière synchronisation : pas encore »', (await page.textContent('#pfeed-last')).includes('pas encore'));
  await page.click('#pfeed-test');
  await page.waitForSelector('#pfeed-test-box', { timeout: 20000 });
  const tb = sp(await page.textContent('#pfeed-test-box'));
  check('« Tester le flux »: server nudged, counts shown, « aucune annonce modifiée »', seen.nudges.some(u => u.endsWith('/api/feed-sync')) && tb.includes('Flux lisible') && tb.includes('Poliris / SeLoger') && tb.includes('à créer') && tb.includes('Un test ne modifie aucune annonce'));
  check('feed page text is French', !NOT_FRENCH.test(await page.innerText('#pfeed-root')));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'partner-feed-test.png'), fullPage: true });

  // The night run happened: a flagged result (feed with far fewer listings).
  feed = Object.assign({}, feed, { last_run_at: '2026-10-11T00:16:00Z', last_status: 'flagged', last_listing_count: 4, flagged_listing_count: 1,
    last_counts: { file: 1, created: 0, updated: 1, archived: 0, unchanged: 0, errors: 0 },
    last_message: '0 créée, 1 mise à jour, 0 retirée, 0 erreur · Le flux contient 1 annonce contre 4 lors de la dernière synchronisation (baisse de plus de moitié) : aucune annonce n’a été retirée. À vérifier.',
    last_report: [{ line: 1, reference: 'EV-1024', kind: 'update', status: 'ok', message: 'Prix : 435 000 € → 430 000 €', compliance: '', listingId: 'lst-ev' }] });
  await page.click('#view-feed .dash-nav a:has-text("Portefeuille")');
  await page.click('#view-dashboard .dash-nav a:has-text("Flux automatique")');
  await page.waitForSelector('#pfeed-flag');
  const last = sp(await page.textContent('#pfeed-last'));
  check('« Dernière synchronisation : 11 octobre 2026 à 02:16 » — À vérifier, counts, nothing withdrawn', last.includes('Dernière synchronisation : 11 octobre 2026 à 02:16') && last.includes('À vérifier') && last.includes('aucune annonce n’a été retirée'));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'partner-feed-last-sync.png'), fullPage: true });
  const [frep] = await Promise.all([page.waitForEvent('download'), page.click('#pfeed-report')]);
  check('last run report downloadable', fs.readFileSync(await frep.path(), 'utf8').includes('EV-1024;Mise à jour;OK'));
  await page.click('#pfeed-accept');
  await page.waitForFunction(() => !document.getElementById('pfeed-flag'));
  check('« Confirmer 1 annonce » calls zfind_partner_accept_feed_volume', rpcs.includes('zfind_partner_accept_feed_volume'));

  /* ---------- 4. Mobile ---------- */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#view-feed .dash-nav a:has-text("Flux automatique")');
  await page.waitForSelector('#pfeed-form');
  const overflowFeed = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'partner-feed-mobile.png'), fullPage: true });
  await page.click('#view-feed .dash-nav a:has-text("Importer")');
  await page.setInputFiles('#pimp-file', { name: 'annonces.csv', mimeType: 'text/csv', buffer: fs.readFileSync(path.join(FIX, 'annonces-v2-latin1.csv')) });
  await page.click('#pimp-read');
  await page.waitForSelector('#pimp-plan-panel');
  const overflowImport = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'partner-import-mobile.png'), fullPage: true });
  check('mobile: no horizontal page overflow (tables scroll inside their box)', overflowFeed <= 0 && overflowImport <= 0);

  check('no script or console error, no failed request', (errors.length === 0 && failed.length === 0) || (console.error(errors, failed), false));
  await browser.close();
  console.log(`\nPARTNER SELF-IMPORT / FEED: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
