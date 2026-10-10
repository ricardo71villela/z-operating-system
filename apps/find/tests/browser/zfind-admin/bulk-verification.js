/* ============================================================
   Z FIND ADMIN — actions groupées: checkboxes on « À vérifier » /
   « Biens et annonces », « Publier » / « Approuver » / « Renvoyer en
   brouillon » (reason) applied one listing at a time through the
   existing commands, progress, French summary + per-listing result;
   bulk « Valider » in « Mentions obligatoires à valider »; the
   « Valider les mentions et publier » shortcut on a listing page.
   Mocks Auth + REST only. Screenshots when ZFIND_SHOTS_DIR is set.
   ============================================================ */
'use strict';

const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-admin', 'dist', 'z-find-admin.html');
const SHOTS = process.env.ZFIND_SHOTS_DIR || '';
const USER = { id: 'admin-1', aud: 'authenticated', role: 'authenticated', email: 'admin@zfind.test', app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
let passed = 0;
function check(label, value) { if (!value) throw new Error('FAIL: ' + label); passed += 1; console.log('PASS:', label); }
const json = (b, s) => ({ status: s || 200, contentType: 'application/json', body: JSON.stringify(b), headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/0' } });
const NOT_FRENCH = /\b(the|and|save|submit|pending|approved|rejected|loading|undefined|null|NaN|draft|ready|published|failed|skipped|done)\b/i;
const wait = ms => new Promise(r => setTimeout(r, ms));

const EVIAN = { name: 'Évian-les-Bains', city: 'Évian-les-Bains' };
const prop = (id, title, status, extra) => Object.assign({ id, subtype: 'apartment', typology: 'T3', area_sqm: 70, zone_lite_id: 'z1', zones_lite: EVIAN,
  representations: [{ id: 'r-' + id, status: 'active', partner_id: 'p-lac', partners: { name: 'Agence du Lac' }, listings: [{ id: 'l-' + id.slice(2), status, transaction_type: 'sale', rental_period: null,
    price_current: 472000, currency_iso: 'EUR', price_is_from: false, listing_content: [{ locale: 'fr', title, description: 'Texte.' }] }] }] }, extra || {});
const PROPS = [
  prop('p-a', 'T3 vue lac', 'pending_review'), prop('p-b', 'Villa Neuvecelle', 'pending_review'), prop('p-c', 'T2 Ixelles', 'pending_review', { zones_lite: { name: 'Ixelles', city: 'Bruxelles' } }),
  prop('p-d', 'Studio gare', 'pending_review'), prop('p-r', 'Maison Publier', 'ready'), prop('p-x', 'Loft Thonon', 'draft'), prop('p-z', 'Chalet Bernex', 'published')
];
const listingOf = id => PROPS.map(p => p.representations[0].listings[0]).find(l => l.id === id);
const STATUSES = ['a', 'b', 'd', 'r', 'x', 'z'].map(k => ({ listing_id: 'l-' + k, jurisdiction_iso: 'FR', profile: 'fr_residential_sale_v1', review_status: k === 'b' ? 'pending' : 'approved', review_note: null, facts_valid: true }))
  .concat([{ listing_id: 'l-c', jurisdiction_iso: 'BE', profile: null, review_status: 'unreviewed', review_note: null, facts_valid: false }]);
const QUEUE = [
  { listing_id: 'l-b', review_status: 'pending', review_note: null, submitted_at: '2026-10-08T09:12:00Z', reviewed_at: null, facts: {}, jurisdiction_iso: 'FR', profile: 'fr_residential_sale_v1', facts_valid: true, missing: [],
    listing_status: 'pending_review', transaction_type: 'sale', price_current: 690000, currency_iso: 'EUR', title: 'Villa Neuvecelle', partner_id: 'p-lac', partner_name: 'Agence du Lac', property_id: 'p-b', development_id: null, agency_reference: 'NV-12', commune: 'Neuvecelle', postal_code: '74500' },
  { listing_id: 'l-q', review_status: 'pending', review_note: null, submitted_at: '2026-10-08T11:00:00Z', reviewed_at: null, facts: {}, jurisdiction_iso: 'FR', profile: 'fr_residential_rent_v1', facts_valid: true, missing: [],
    listing_status: 'draft', transaction_type: 'rent', price_current: 1350, currency_iso: 'EUR', title: 'T2 meublé centre', partner_id: 'p-lac', partner_name: 'Agence du Lac', property_id: 'p-q', development_id: null, agency_reference: 'TH-118', commune: 'Thonon-les-Bains', postal_code: '74200' },
  { listing_id: 'l-p', review_status: 'pending', review_note: null, submitted_at: '2026-10-09T08:05:00Z', reviewed_at: null, facts: {}, jurisdiction_iso: 'FR', profile: 'fr_residential_sale_v1', facts_valid: false, missing: ['dpe_status'],
    listing_status: 'draft', transaction_type: 'sale', price_current: 129000, currency_iso: 'EUR', title: 'Studio incomplet', partner_id: 'p-lm', partner_name: 'Léman Immobilier', property_id: 'p-p', development_id: null, agency_reference: null, commune: 'Évian-les-Bains', postal_code: '74500' }
];
const TAXONOMY = { classes: [{ code: 'residential', enabled: true, sort_order: 1 }], subtypes: [{ code: 'apartment', property_class: 'residential', enabled: true, sort_order: 1 }] };

(async () => {
  console.log('\n=== Z FIND ADMIN — ACTIONS GROUPÉES ===');
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/status of 400/.test(m.text())) errors.push(m.text()); });
  const transitions = [], returns = [], reviews = [];
  let inFlight = 0, maxInFlight = 0, notified = 0;
  await page.route('https://zfind.online/api/lead-notify', r => { notified += 1; return r.fulfill({ status: 200, body: '{"ok":true}' }); });
  await page.route('**/rest/v1/**', r => r.fulfill(json([])));
  await page.route('**/auth/v1/token**', r => r.fulfill(json({ access_token: 't', token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: USER })));
  await page.route('**/rest/v1/profiles**', r => r.fulfill(json({ id: USER.id, partner_id: null, role: 'admin' })));
  await page.route('**/rest/v1/rpc/zfind_admin_operations_overview**', r => r.fulfill(json({ agencias: {}, agencias_by_country_type: [], networks: [], reviews: {}, alerts: {}, leads: {}, signups: { founder_seats: {} } })));
  await page.route('**/rest/v1/rpc/zfind_authoring_property_taxonomy**', r => r.fulfill(json(TAXONOMY)));
  await page.route('**/rest/v1/zones_lite**', r => r.fulfill(json([{ id: 'z1', name: 'Évian-les-Bains', city: 'Évian-les-Bains', country_iso: 'FR' }])));
  await page.route('**/rest/v1/properties**', r => {
    const id = (new URL(r.request().url()).searchParams.get('id') || '').replace('eq.', '');
    return r.fulfill(json(id ? Object.assign({}, PROPS.find(p => p.id === id), { zones_lite: { id: 'z1', name: 'Évian-les-Bains', city: 'Évian-les-Bains', country_iso: 'FR' } }) : PROPS));
  });
  await page.route('**/rest/v1/rpc/zfind_list_listing_compliance_status**', r => { const ids = r.request().postDataJSON().p_listing_ids; return r.fulfill(json(STATUSES.filter(s => ids.includes(s.listing_id)))); });
  await page.route('**/rest/v1/rpc/zfind_admin_list_listing_compliance**', r => {
    const a = r.request().postDataJSON();
    if (a.p_listing_id) return r.fulfill(json(QUEUE.filter(x => x.listing_id === a.p_listing_id)));
    return r.fulfill(json(QUEUE.filter(x => x.review_status === a.p_review_status)));
  });
  await page.route('**/rest/v1/rpc/zfind_admin_transition_listing**', async r => {
    const a = r.request().postDataJSON(); transitions.push(a);
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); await wait(120); inFlight--;
    const l = listingOf(a.p_listing_id);
    if (a.p_to_status === 'published' && a.p_listing_id === 'l-b' && STATUSES.find(s => s.listing_id === 'l-b').review_status !== 'approved') return r.fulfill(json({ code: '55000', details: null, hint: null, message: 'France Listing compliance gate failed: ["review_approval"]' }, 400));
    if (a.p_to_status === 'published' && a.p_listing_id === 'l-c') return r.fulfill(json({ code: '55000', details: null, hint: null, message: 'Listing cannot be published while Representation is proposed; activate the Representation first' }, 400));
    if (l) l.status = a.p_to_status;
    return r.fulfill(json(Object.assign({}, l, { status: a.p_to_status })));
  });
  await page.route('**/rest/v1/rpc/zfind_admin_return_listing_to_draft**', r => {
    const a = r.request().postDataJSON(); returns.push(a);
    const l = listingOf(a.p_listing_id); if (l) l.status = 'draft';
    return r.fulfill(json(Object.assign({}, l, { status: 'draft' })));
  });
  await page.route('**/rest/v1/rpc/zfind_admin_review_listing_compliance**', r => {
    const a = r.request().postDataJSON(); reviews.push(a);
    const q = QUEUE.find(x => x.listing_id === a.p_listing_id); if (q) q.review_status = a.p_decision;
    const s = STATUSES.find(x => x.listing_id === a.p_listing_id); if (s) s.review_status = a.p_decision;
    return r.fulfill(json({ listing_id: a.p_listing_id, review_status: a.p_decision, facts: {}, validation: { facts_valid: true, missing: [] }, assessment: { compliant: true } }));
  });

  await page.goto(FILE_URL);
  await page.fill('#login-email', 'admin@zfind.test');
  await page.fill('#login-password', 'MotDePasse-2026');
  await page.click('#login-btn');
  await page.waitForSelector('#app-shell:not(.hidden)');

  /* ---------- « À vérifier »: select + Publier ---------- */
  await page.click('#sidebar a.sub >> text=À vérifier');
  await page.waitForSelector('#props-tbody .bulk-cb');
  check('« À vérifier » list: one checkbox per listing, hint in French while nothing is selected', (await page.$$('#props-tbody .bulk-cb')).length === 4 && (await page.textContent('#bulk-bar-props')).includes('Cochez des annonces'));
  await page.check('#props-tbody tr[data-prop="p-a"] .bulk-cb');
  check('one selected: bar with the three actions', (await page.textContent('#bulk-bar-props')).includes('1 annonce sélectionnée')
    && JSON.stringify(await page.$$eval('#bulk-bar-props button', b => b.map(x => x.textContent))) === JSON.stringify(['Approuver (prête à publier)', 'Publier', 'Renvoyer en brouillon']));
  await page.check('#bulk-all-props');
  check('« tout sélectionner »: 4 annonces', (await page.textContent('#bulk-bar-props strong')) === '4 annonces sélectionnées' && (await page.$$('#props-tbody .bulk-cb:checked')).length === 4);
  check('clicking a checkbox does not open the listing', (await page.$('#props-tbody')) !== null);
  check('bulk bar in French', !NOT_FRENCH.test(await page.innerText('#bulk-bar-props')));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-bulk-selection.png') });
  await page.click('#bulk-bar-props button[data-bulk="publish"]');
  await page.waitForSelector('#confirm-overlay:not(.hidden)');
  check('confirmation in French before publishing', (await page.textContent('.confirm-box h4')) === 'Publier 4 annonces ?');
  await page.click('#confirm-ok');
  await page.waitForSelector('.bulk-progress');
  check('progress shown while running', /Publication… \d \/ 4/.test(await page.textContent('.bulk-progress')));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-bulk-progress.png') });
  await page.waitForSelector('.bulk-summary');
  const summary = await page.textContent('.bulk-summary-head strong');
  check(`summary: « ${summary} »`, summary === '2 publiées, 2 bloquées (1 : mandat non actif ; 1 : mentions obligatoires non validées)');
  check('one listing at a time, in the order shown (oldest first), through zfind_admin_transition_listing (ready, then published)', maxInFlight === 1
    && JSON.stringify(transitions.map(t => t.p_listing_id.slice(2) + ':' + t.p_to_status)) === JSON.stringify(['d:ready', 'd:published', 'c:ready', 'c:published', 'b:ready', 'b:published', 'a:ready', 'a:published']));
  const detail = await page.$$eval('.bulk-list li', li => li.map(x => x.className + ' ' + x.querySelector('div').innerText.replace(/\s+/g, ' ').trim()));
  check('per-listing result in French, blocked ones explained', detail.length === 4 && detail[0].startsWith('ok Studio gare — publiée') && detail[3].startsWith('ok T3 vue lac — publiée')
    && detail[2].startsWith('bad Villa Neuvecelle — bloquée : mentions obligatoires non validées') && detail[2].includes('Publication bloquée : les mentions obligatoires (France)')
    && detail[1].startsWith('bad T2 Ixelles — bloquée : mandat non actif') && detail[1].includes('Activez d’abord le mandat'));
  check('list reloaded: nothing left « À vérifier », blocked listings stay « Prêtes à publier », selection cleared', (await page.$$('#props-tbody tr[data-prop]')).length === 0
    && listingOf('l-b').status === 'ready' && listingOf('l-c').status === 'ready' && (await page.textContent('#bulk-bar-props')).includes('Cochez des annonces'));
  check('summary in French', !NOT_FRENCH.test(await page.innerText('#bulk-result-props')));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-bulk-summary.png'), fullPage: true });

  /* ---------- Renvoyer en brouillon (reason required) ---------- */
  await page.click('#prop-chips .chip.on'); // back to « Toutes »
  await page.waitForFunction(() => document.querySelectorAll('#props-tbody .bulk-cb').length === 7);
  await page.check('#props-tbody tr[data-prop="p-r"] .bulk-cb');
  await page.check('#props-tbody tr[data-prop="p-x"] .bulk-cb');
  await page.click('#bulk-bar-props button[data-bulk="return"]');
  await page.waitForSelector('#reason-text');
  await page.click('#reason-ok');
  check('return without a reason: blocked in the dialog, nothing sent', (await page.textContent('#reason-error')).includes('Indiquez le motif') && returns.length === 0);
  await page.fill('#reason-text', 'Photos floues : merci d’ajouter des photos nettes du séjour.');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-bulk-return-reason.png') });
  await page.click('#reason-ok');
  await page.waitForFunction(() => { const s = document.querySelector('#bulk-result-props .bulk-summary-head strong'); return s && s.textContent.includes('renvoyée'); });
  check('return: zfind_admin_return_listing_to_draft(p_listing_id, p_reason) for the « prête » one only, draft ignored',
    returns.length === 1 && returns[0].p_listing_id === 'l-r' && returns[0].p_reason === 'Photos floues : merci d’ajouter des photos nettes du séjour.'
    && (await page.textContent('#bulk-result-props .bulk-summary-head strong')) === '1 renvoyée en brouillon, 1 ignorée : déjà en brouillon');
  await page.waitForTimeout(150);
  check('the agency e-mail is triggered (/api/lead-notify)', notified === 1);

  /* ---------- Approuver ---------- */
  listingOf('l-x').status = 'pending_review';
  await page.click('#sidebar a.sub >> text=À vérifier');
  await page.waitForSelector('#props-tbody tr[data-prop="p-x"] .bulk-cb');
  await page.check('#props-tbody tr[data-prop="p-x"] .bulk-cb');
  await page.click('#bulk-bar-props button[data-bulk="approve"]');
  await page.click('#confirm-ok');
  await page.waitForFunction(() => { const s = document.querySelector('#bulk-result-props .bulk-summary-head strong'); return s && s.textContent.includes('approuvée'); });
  check('approve: pending_review → ready, « 1 approuvée »', transitions.slice(-1)[0].p_listing_id === 'l-x' && transitions.slice(-1)[0].p_to_status === 'ready' && (await page.textContent('#bulk-result-props .bulk-summary-head strong')) === '1 approuvée');

  /* ---------- Mentions obligatoires: bulk « Valider » ---------- */
  await page.click('#sidebar a[data-view="conformite"]');
  await page.waitForSelector('#cq-tbody .bulk-cb');
  check('queue: checkboxes only on complete mentions (refusal stays one by one)', (await page.$$('#cq-tbody .bulk-cb')).length === 2 && !(await page.$('#cq-tbody tr[data-listing="l-p"] .bulk-cb')));
  check('queue bar: « Valider » only', JSON.stringify(await (async () => { await page.check('#bulk-all-compliance'); return page.$$eval('#bulk-bar-compliance button', b => b.map(x => x.textContent)); })()) === JSON.stringify(['Valider']));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-bulk-compliance-selection.png') });
  await page.click('#bulk-bar-compliance button[data-bulk="validate"]');
  await page.click('#confirm-ok');
  await page.waitForSelector('#bulk-result-compliance .bulk-summary');
  check('bulk « Valider »: zfind_admin_review_listing_compliance(approved) for each, « 2 validées »', reviews.length === 2 && reviews.every(r => r.p_decision === 'approved' && r.p_note === null)
    && (await page.textContent('#bulk-result-compliance .bulk-summary-head strong')) === '2 validées');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-bulk-compliance-summary.png') });

  /* ---------- listing page: « Valider les mentions et publier » ---------- */
  STATUSES.find(s => s.listing_id === 'l-d').review_status = 'pending';
  listingOf('l-d').status = 'ready';
  await page.evaluate(() => navigateAdmin('properties', 'p-d'));
  await page.waitForSelector('#validate-publish-btn');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-validate-publish-button.png') });
  const before = transitions.length;
  await page.click('#validate-publish-btn');
  await page.click('#confirm-ok');
  await page.waitForFunction(() => document.getElementById('toast-host').textContent.includes('Mentions validées, annonce publiée'));
  check('shortcut: mentions approved, then published (existing RPCs)', reviews.slice(-1)[0].p_listing_id === 'l-d' && reviews.slice(-1)[0].p_decision === 'approved'
    && JSON.stringify(transitions.slice(before).map(t => t.p_to_status)) === JSON.stringify(['published']));
  check('no shortcut once nothing is pending', !(await page.$('#validate-publish-btn')));

  check('no script error', errors.length === 0 || (console.log(errors), false));
  await browser.close();
  console.log(`\nADMIN ACTIONS GROUPÉES: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
