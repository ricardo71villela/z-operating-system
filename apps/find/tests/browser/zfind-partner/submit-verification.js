/* ============================================================
   Z FIND PARTNER — « Soumettre à validation »: status badges and the
   button in the portfolio (missing items from the database), the
   checklist in the listing workspace (client precheck), submit /
   withdraw RPCs, status update, the Z Find return reason, and the
   offer to submit after saving the mentions obligatoires.
   Mocks Auth + REST only. Screenshots when ZFIND_SHOTS_DIR is set.
   ============================================================ */
'use strict';

const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-partner', 'dist', 'z-find-partner.html');
const SHOTS = process.env.ZFIND_SHOTS_DIR || '';
const USER = { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'agence@test.fr', app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-10-04T00:00:00Z', updated_at: '2026-10-04T00:00:00Z' };
let passed = 0;
function check(label, value) { if (!value) throw new Error('FAIL: ' + label); passed += 1; console.log('PASS:', label); }
const json = (b, s) => ({ status: s || 200, contentType: 'application/json', body: JSON.stringify(b), headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/0' } });
const NOT_FRENCH = /\b(the|and|save|submit|pending|draft|review|ready|published|approved|rejected|loading|error|undefined|null|NaN|true|false)\b/i;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+P/XfwAJpAPZ8cIvFwAAAABJRU5ErkJggg==', 'base64');

const EVIAN = { name: 'Évian-les-Bains', city: 'Évian-les-Bains', country_iso: 'FR' };
const rep = (id, listing) => [{ id: 'r-' + id, status: 'active', partner_id: 'p1', listings: listing ? [listing] : [] }];
const L = {
  todo: { id: 'l-todo', transaction_type: 'sale', rental_period: null, price_current: 0, currency_iso: 'EUR', price_is_from: false, status: 'draft' },
  done: { id: 'l-done', transaction_type: 'rent', rental_period: 'monthly', price_current: 1350, currency_iso: 'EUR', price_is_from: false, status: 'draft' },
  wait: { id: 'l-wait', transaction_type: 'sale', price_current: 690000, currency_iso: 'EUR', status: 'pending_review' },
  live: { id: 'l-live', transaction_type: 'sale', price_current: 820000, currency_iso: 'EUR', status: 'published' }
};
const PROPS = [
  { id: 'p-todo', subtype: 'apartment', typology: 'T3', area_sqm: 70, zones_lite: EVIAN, representations: rep('p-todo', L.todo) },
  { id: 'p-done', subtype: 'apartment', typology: 'T2', area_sqm: 48, zones_lite: EVIAN, representations: rep('p-done', L.done) },
  { id: 'p-wait', subtype: 'villa', typology: '5 pièces', area_sqm: 160, zones_lite: EVIAN, representations: rep('p-wait', L.wait) },
  { id: 'p-live', subtype: 'villa', typology: '6 pièces', area_sqm: 210, zones_lite: EVIAN, representations: rep('p-live', L.live) }
];
const DETAIL = { 'p-todo': Object.assign({}, PROPS[0], { floor: 2 }), 'p-done': Object.assign({}, PROPS[1], { floor: 1, gross_private_area_sqm: 48 }) };
const RENT_FACTS = { dpe_status: 'exempt', dpe_exemption_reason: 'Monument historique', fees_payer: 'shared', agency_fees_amount: 900, surface_habitable_sqm: 48, monthly_rent_excl_charges: 1250,
  monthly_charges: 100, charges_recovery_method: 'provision', deposit_amount: 1250, tenant_fees_amount: 480, inventory_fees_amount: 144, furnished: false, rent_control_status: 'not_applicable', georisques_disclosure: true };
// What zfind_list_listing_submission_status returns (the database readiness check).
const SUB = {
  'l-todo': { listing_id: 'l-todo', status: 'draft', ready: false, missing: ['description_fr', 'price', 'photo', 'compliance_facts'], jurisdiction_iso: 'FR',
    last_notice_kind: 'returned_to_draft', last_notice_reason: 'Ajoutez des photos du séjour et la description.', last_notice_at: '2026-10-08T16:00:00Z' },
  'l-done': { listing_id: 'l-done', status: 'draft', ready: true, missing: [], jurisdiction_iso: 'FR', last_notice_kind: null, last_notice_reason: null, last_notice_at: null },
  'l-wait': { listing_id: 'l-wait', status: 'pending_review', ready: false, missing: [], jurisdiction_iso: 'FR', last_notice_kind: null, last_notice_reason: null, last_notice_at: null },
  'l-live': { listing_id: 'l-live', status: 'published', ready: false, missing: [], jurisdiction_iso: 'FR', last_notice_kind: null, last_notice_reason: null, last_notice_at: null }
};
const COMPLIANCE = {
  'l-todo': { listing_id: 'l-todo', facts: {}, source_evidence: {}, review_status: 'unreviewed', review_note: null, reviewed_at: null, jurisdiction_iso: 'FR', profile: 'fr_residential_sale_v1',
    validation: { facts_valid: false, missing: ['compliance_record'] }, assessment: { compliant: false } },
  'l-done': { listing_id: 'l-done', facts: RENT_FACTS, source_evidence: {}, review_status: 'unreviewed', review_note: null, reviewed_at: null, jurisdiction_iso: 'FR', profile: 'fr_residential_rent_v1',
    validation: { facts_valid: true, missing: [] }, assessment: { compliant: false } }
};
const CONTENT = { 'l-todo': [{ listing_id: 'l-todo', locale: 'fr', title: 'T3 vue lac', description: '' }], 'l-done': [{ listing_id: 'l-done', locale: 'fr', title: 'T2 meublé centre', description: 'Lumineux, proche du lac.' }] };
const MEDIA = { 'l-todo': [], 'l-done': [{ media_asset_id: 'm1', listing_id: 'l-done', position: 0, is_cover: true, media_assets: { id: 'm1', original_storage_path: 'https://img.test/sejour.png', media_variants: [] } }] };

(async () => {
  console.log('\n=== Z FIND PARTNER — SOUMETTRE À VALIDATION ===');
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const submits = [], withdraws = [], saves = [];
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://img.test/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.route('**/rest/v1/**', r => r.fulfill(json([])));
  await page.route('**/auth/v1/token**', r => r.fulfill(json({ access_token: 't', token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: USER })));
  await page.route('**/rest/v1/profiles**', r => r.fulfill(json({ id: 'u1', partner_id: 'p1', role: 'partner_user' })));
  await page.route('**/rest/v1/partners**', r => r.fulfill(json({ id: 'p1', name: 'Agence du Lac' })));
  await page.route('**/rest/v1/zfind_partner_signups**', r => r.fulfill(json({ status: 'verified', plan: 'founder', founder_wave: 1, role: 'agency', country: 'FR' })));
  await page.route('**/rest/v1/properties**', r => {
    const id = (new URL(r.request().url()).searchParams.get('id') || '').replace('eq.', '');
    return r.fulfill(json(id ? DETAIL[id] : PROPS));
  });
  await page.route('**/rest/v1/rpc/zfind_partner_get_listing_for_asset**', r => r.fulfill(json(L[r.request().postDataJSON().p_asset_id.slice(2)])));
  await page.route('**/rest/v1/rpc/zfind_partner_enabled_languages**', r => r.fulfill(json([{ code: 'fr', native_name: 'Français' }])));
  await page.route('**/rest/v1/listing_content**', r => r.fulfill(json(CONTENT[(new URL(r.request().url()).searchParams.get('listing_id') || '').replace('eq.', '')] || [])));
  await page.route('**/rest/v1/listing_media**', r => r.fulfill(json(MEDIA[(new URL(r.request().url()).searchParams.get('listing_id') || '').replace('eq.', '')] || [])));
  await page.route('**/rest/v1/rpc/zfind_list_listing_compliance_status**', r => r.fulfill(json([])));
  await page.route('**/rest/v1/rpc/zfind_get_listing_compliance**', r => r.fulfill(json(COMPLIANCE[r.request().postDataJSON().p_listing_id])));
  await page.route('**/rest/v1/rpc/zfind_save_listing_compliance**', r => {
    const a = r.request().postDataJSON(); saves.push(a);
    return r.fulfill(json(Object.assign({}, COMPLIANCE[a.p_listing_id], { facts: a.p_facts, review_status: 'pending' })));
  });
  await page.route('**/rest/v1/rpc/zfind_list_listing_submission_status**', r => r.fulfill(json(r.request().postDataJSON().p_listing_ids.map(id => SUB[id]).filter(Boolean))));
  await page.route('**/rest/v1/rpc/zfind_partner_submit_listing**', r => {
    const a = r.request().postDataJSON(); submits.push(a);
    SUB[a.p_listing_id] = Object.assign({}, SUB[a.p_listing_id], { status: 'pending_review', ready: false });
    return r.fulfill(json(Object.assign({}, L[a.p_listing_id.slice(2)], { status: 'pending_review' })));
  });
  await page.route('**/rest/v1/rpc/zfind_partner_withdraw_listing_submission**', r => {
    const a = r.request().postDataJSON(); withdraws.push(a);
    SUB[a.p_listing_id] = Object.assign({}, SUB[a.p_listing_id], { status: 'draft', ready: true });
    return r.fulfill(json(Object.assign({}, L[a.p_listing_id.slice(2)], { status: 'draft' })));
  });

  await page.goto(FILE_URL);
  await page.fill('#login-email', 'agence@test.fr');
  await page.fill('#login-password', 'MotDePasse-2026');
  await page.click('#login-btn');
  await page.waitForSelector('.submit-row-btn');
  await page.waitForFunction(() => document.querySelector('[data-submission-listing="l-todo"]').textContent.includes('Renvoyée'));

  /* ---------- portfolio ---------- */
  const badge = id => page.textContent(`[data-submission-listing="${id}"] .status-badge:last-of-type`);
  check('portfolio statuses in French', (await badge('l-todo')) === 'Brouillon' && (await badge('l-wait')) === 'En attente de validation' && (await badge('l-live')) === 'Publiée');
  check('« Soumettre à validation » only on drafts', (await page.$$('.submit-row-btn')).length === 2 && !(await page.$('[data-submission-listing="l-wait"] .submit-row-btn')));
  check('Z Find return shown on the draft, reason in the tooltip', (await page.getAttribute('[data-submission-listing="l-todo"] .tone-bad', 'title')) === 'Motif : Ajoutez des photos du séjour et la description.');
  await page.click('[data-submission-listing="l-todo"] .submit-row-btn');
  await page.waitForSelector('.portfolio-submit-panel');
  const panelText = await page.textContent('.portfolio-submit-panel');
  check('incomplete draft: nothing sent, the missing items from the database are listed in French', submits.length === 0 && panelText.includes('Description en français') && panelText.includes('Prix')
    && panelText.includes('Au moins une photo') && panelText.includes('Mentions obligatoires (France)') && !panelText.includes('Titre en français'));
  check('… with « Compléter l’annonce »', (await page.textContent('.portfolio-submit-panel .btn-primary')) === 'Compléter l’annonce');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'partner-portfolio-submit-missing.png'), fullPage: true });
  await page.click('[data-submission-listing="l-done"] .submit-row-btn');
  await page.waitForFunction(() => document.querySelector('[data-submission-listing="l-done"]').textContent.includes('En attente de validation'));
  check('complete draft: zfind_partner_submit_listing(p_listing_id) sent, badge updated, button gone', submits.length === 1 && submits[0].p_listing_id === 'l-done' && Object.keys(submits[0]).join() === 'p_listing_id'
    && !(await page.$('[data-submission-listing="l-done"] .submit-row-btn')) && (await page.textContent('#toast-host')).includes('Annonce soumise à validation'));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'partner-portfolio-submitted.png'), fullPage: true });

  /* ---------- workspace: checklist ---------- */
  await page.click('.portfolio-row >> nth=0');
  await page.waitForSelector('#submission-checklist');
  await page.waitForFunction(() => document.getElementById('partner-submission-panel').textContent.includes('Renvoyée en brouillon'));
  const items = await page.$$eval('#submission-checklist li', els => els.map(e => e.dataset.code + ':' + e.className));
  check('checklist mirrors the database: title ok, description / price / photo / mentions missing', JSON.stringify(items) === JSON.stringify(['commune:ok', 'title_fr:ok', 'description_fr:todo', 'price:todo', 'photo:todo', 'compliance_facts:todo']));
  check('status badge « Brouillon » and the Z Find reason', (await page.textContent('#submission-status')) === 'Brouillon' && (await page.textContent('#submission-return-note')).includes('Motif : Ajoutez des photos du séjour'));
  await page.click('#submit-listing-btn');
  await page.waitForSelector('#submission-checklist.highlight');
  check('submit with missing items: nothing sent, checklist highlighted, French message', submits.length === 1 && (await page.textContent('#toast-host')).includes('4 éléments à compléter')
    && (await page.textContent('#submission-hint')) === '4 éléments à compléter avant l’envoi.');
  const panel = page.locator('#partner-submission-panel');
  check('everything visible in the panel is French', !NOT_FRENCH.test(await panel.innerText()));
  if (SHOTS) await panel.screenshot({ path: path.join(SHOTS, 'partner-submit-checklist-missing.png') });
  // Filling the description updates the checklist at once.
  await page.fill('#partner-content-description-fr', 'Bel appartement traversant, vue sur le lac.');
  await page.route('**/rest/v1/rpc/zfind_partner_upsert_listing_content**', r => r.fulfill(json({ listing_id: 'l-todo', locale: 'fr' })));
  await page.click('button:has-text("Enregistrer FR")');
  await page.waitForFunction(() => document.querySelector('#submission-checklist li[data-code="description_fr"]').className === 'ok');
  check('saving the French description ticks « Description en français »', (await page.textContent('#submission-hint')) === '3 éléments à compléter avant l’envoi.');

  /* ---------- workspace: complete draft, mentions saved → offer → submit → withdraw ---------- */
  SUB['l-done'] = Object.assign({}, SUB['l-done'], { status: 'draft', ready: true });
  L.done.status = 'draft';
  await page.click('.detail-back');
  await page.waitForSelector('.submit-row-btn');
  await page.click('.portfolio-row >> nth=1');
  await page.waitForSelector('#compliance-form');
  await page.waitForSelector('#submission-checklist');
  check('the mentions button says « Enregistrer les mentions » (the listing itself is submitted separately)', (await page.textContent('#compliance-save')) === 'Enregistrer les mentions');
  check('complete rental: every item ticked, « Tout est prêt »', (await page.$$('#submission-checklist li.todo')).length === 0 && (await page.textContent('#submission-hint')).startsWith('Tout est prêt'));
  await page.click('#compliance-save');
  await page.waitForSelector('#compliance-submit-offer');
  check('after saving the mentions on a draft: offer to submit', saves.length === 1 && (await page.textContent('#compliance-submit-offer')).includes('Votre annonce est encore un brouillon'));
  if (SHOTS) await page.locator('#partner-compliance-section').screenshot({ path: path.join(SHOTS, 'partner-compliance-offer.png') });
  await page.click('#compliance-submit-offer .btn-primary');
  await page.waitForFunction(() => document.getElementById('submission-status').textContent === 'En attente de validation');
  check('submitted from the offer: RPC sent, badge « En attente de validation », offer removed', submits.length === 2 && submits[1].p_listing_id === 'l-done' && !(await page.$('#compliance-submit-offer'))
    && (await page.textContent('#partner-submission-panel')).includes('Retirer de la validation'));
  if (SHOTS) await panel.screenshot({ path: path.join(SHOTS, 'partner-submit-success.png') });
  await page.click('#withdraw-listing-btn');
  await page.waitForFunction(() => document.getElementById('submission-status').textContent === 'Brouillon');
  check('« Retirer de la validation »: RPC sent, back to « Brouillon »', withdraws.length === 1 && withdraws[0].p_listing_id === 'l-done' && !!(await page.$('#submit-listing-btn')));

  /* ---------- phone ---------- */
  await page.evaluate(() => { document.getElementById('toast-host').innerHTML = ''; });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  check('panel fits a phone screen', await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  if (SHOTS) await panel.screenshot({ path: path.join(SHOTS, 'partner-submit-mobile.png') });
  await page.click('.detail-back');
  await page.waitForSelector('.submit-row-btn');
  await page.evaluate(() => { document.getElementById('toast-host').innerHTML = ''; });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('portfolio fits a phone screen', overflow <= 0);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'partner-portfolio-mobile.png'), fullPage: true });

  check('no console or script error', errors.length === 0 || (console.log(errors), false));
  await browser.close();
  console.log(`\nPARTNER SOUMETTRE À VALIDATION: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
