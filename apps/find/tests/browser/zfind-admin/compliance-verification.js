/* ============================================================
   Z FIND ADMIN — « Mentions obligatoires à valider »: dashboard card,
   queue, detail in French, Valider / Refuser (reason required), the
   « Mentions FR » column + filter, and « Publier » errors in French.
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
const NOT_FRENCH = /\b(the|and|save|submit|pending|approved|rejected|loading|undefined|null|NaN|guardar|anúncio|aprovar|rejeitar)\b/i;

const SALE_FACTS = { dpe_status: 'available', dpe_energy_class: 'C', ghg_class: 'E', energy_cost_min: 1200, energy_cost_max: 1700, energy_cost_reference_year: '2023', dpe_ademe_number: '2374E0123456X',
  fees_payer: 'buyer', agency_fees_amount: 15000, price_includes_agency_fees: true, agency_fees_percent: 3.28, is_condominium: true, condominium_lots_count: 24, annual_condominium_charges: 1800,
  condominium_procedure_status: 'Aucune procédure en cours', surface_carrez_sqm: 64.2, surface_habitable_sqm: 64.5, georisques_disclosure: true };
const RENT_FACTS = { dpe_status: 'exempt', dpe_exemption_reason: 'Monument historique', fees_payer: 'shared', agency_fees_amount: 960, surface_habitable_sqm: 48, monthly_rent_excl_charges: 1250,
  monthly_charges: 100, charges_recovery_method: 'provision', deposit_amount: 1250, tenant_fees_amount: 480, inventory_fees_amount: 144, furnished: true, rent_control_status: 'not_applicable', georisques_disclosure: true };
const qrow = (id, extra) => Object.assign({ listing_id: id, review_status: 'pending', review_note: null, submitted_at: '2026-10-08T09:12:00Z', reviewed_at: null, jurisdiction_iso: 'FR',
  listing_status: 'ready', currency_iso: 'EUR', partner_id: 'p-lac', partner_name: 'Agence du Lac', development_id: null, commune: 'Évian-les-Bains', postal_code: '74500', missing: [] }, extra);
const QUEUE = [
  qrow('l-sale', { title: 'T3 vue lac', agency_reference: 'EV-001', profile: 'fr_residential_sale_v1', facts: SALE_FACTS, facts_valid: true, transaction_type: 'sale', price_current: 472000, property_id: 'p-sale' }),
  qrow('l-rent', { title: 'T2 meublé centre', agency_reference: 'TH-118', profile: 'fr_residential_rent_v1', facts: RENT_FACTS, facts_valid: true, transaction_type: 'rent', price_current: 1350, property_id: 'p-rent', commune: 'Thonon-les-Bains', postal_code: '74200', submitted_at: '2026-10-08T14:40:00Z' }),
  qrow('l-part', { title: 'Studio gare', agency_reference: null, profile: 'fr_residential_sale_v1', facts: { georisques_disclosure: true, fees_payer: 'seller' }, facts_valid: false, missing: ['agency_fees_amount', 'dpe_status'], transaction_type: 'sale', price_current: 129000, property_id: 'p-part', partner_name: 'Léman Immobilier', submitted_at: '2026-10-09T08:05:00Z' })
];
const full = r => ({ listing_id: r.listing_id, facts: r.facts, source_evidence: {}, review_status: r.review_status, review_note: r.review_note, reviewed_at: r.reviewed_at, jurisdiction_iso: 'FR', profile: r.profile,
  validation: { jurisdiction_iso: 'FR', profile: r.profile, facts_valid: r.facts_valid, missing: r.missing }, assessment: { compliant: false } });
const prop = (id, listing, extra) => Object.assign({ id, subtype: 'apartment', typology: 'T3', area_sqm: 70, zone_lite_id: 'z1', zones_lite: { name: 'Évian-les-Bains', city: 'Évian-les-Bains' },
  representations: [{ id: 'r-' + id, status: 'active', partner_id: 'p-lac', partners: { name: 'Agence du Lac' }, listings: listing ? [Object.assign({ transaction_type: 'sale', rental_period: null, price_current: 472000, currency_iso: 'EUR', price_is_from: false, listing_content: [{ locale: 'fr', title: 'Annonce ' + id, description: 'Texte.' }] }, listing)] : [] }] }, extra || {});
const PROPS = [prop('p-sale', { id: 'l-sale', status: 'ready' }), prop('p-rent', { id: 'l-rent', status: 'draft', transaction_type: 'rent', rental_period: 'monthly', price_current: 1350 }),
  prop('p-ok', { id: 'l-ok', status: 'published' }), prop('p-be', { id: 'l-be', status: 'draft' }, { zones_lite: { name: 'Ixelles', city: 'Bruxelles' } })];
const STATUSES = [
  { listing_id: 'l-sale', jurisdiction_iso: 'FR', profile: 'fr_residential_sale_v1', review_status: 'pending', review_note: null, facts_valid: true },
  { listing_id: 'l-rent', jurisdiction_iso: 'FR', profile: 'fr_residential_rent_v1', review_status: 'rejected', review_note: 'Dépôt trop élevé', facts_valid: true },
  { listing_id: 'l-ok', jurisdiction_iso: 'FR', profile: 'fr_residential_sale_v1', review_status: 'approved', review_note: null, facts_valid: true },
  { listing_id: 'l-be', jurisdiction_iso: 'BE', profile: null, review_status: 'unreviewed', review_note: null, facts_valid: false }
];
const TAXONOMY = { classes: [{ code: 'residential', enabled: true, sort_order: 1 }], subtypes: [{ code: 'apartment', property_class: 'residential', enabled: true, sort_order: 1 }, { code: 'villa', property_class: 'residential', enabled: true, sort_order: 2 }] };

(async () => {
  console.log('\n=== Z FIND ADMIN — MENTIONS OBLIGATOIRES ===');
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/status of 400/.test(m.text())) errors.push(m.text()); });
  const reviews = []; let transition = null; let notified = 0;
  // The refusal nudges the site's /api/lead-notify (e-mail with the reason to the agency): no network here.
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
  await page.route('**/rest/v1/rpc/zfind_admin_list_listing_compliance**', r => {
    const a = r.request().postDataJSON();
    if (a.p_listing_id) return r.fulfill(json(QUEUE.filter(x => x.listing_id === a.p_listing_id)));
    return r.fulfill(json(a.p_review_status === 'pending' ? QUEUE : []));
  });
  await page.route('**/rest/v1/rpc/zfind_get_listing_compliance**', r => r.fulfill(json(full(QUEUE.find(x => x.listing_id === r.request().postDataJSON().p_listing_id)))));
  await page.route('**/rest/v1/rpc/zfind_admin_review_listing_compliance**', r => {
    const a = r.request().postDataJSON(); reviews.push(a);
    const row = QUEUE.find(x => x.listing_id === a.p_listing_id);
    return r.fulfill(json(full(Object.assign({}, row, { review_status: a.p_decision, review_note: a.p_note, reviewed_at: '2026-10-09T10:00:00Z' }))));
  });
  await page.route('**/rest/v1/rpc/zfind_list_listing_compliance_status**', r => r.fulfill(json(STATUSES)));
  await page.route('**/rest/v1/rpc/zfind_admin_transition_listing**', r => { transition = r.request().postDataJSON();
    return r.fulfill(json({ code: '55000', details: null, hint: null, message: 'France Listing compliance gate failed: ["review_approval"]' }, 400)); });

  await page.goto(FILE_URL);
  await page.fill('#login-email', 'admin@zfind.test');
  await page.fill('#login-password', 'x');
  await page.click('#login-btn');
  await page.waitForSelector('#card-compliance');
  check('dashboard card « Mentions obligatoires à valider (France) » with the pending count', (await page.textContent('#card-compliance')).includes('3') && (await page.textContent('#card-compliance')).includes('Mentions obligatoires à valider'));
  check('daily routine mentions the compliance review', (await page.textContent('#main')).includes('Mentions obligatoires à valider (annonces en France)'));

  await page.click('#sidebar a[data-view="conformite"]');
  await page.waitForSelector('#cq-tbody tr[data-listing]');
  const queueText = await page.textContent('#cq-tbody');
  check('queue: agency, title + reference, commune + postcode, type, date, completeness', queueText.includes('Agence du Lac') && queueText.includes('T3 vue lac') && queueText.includes('Réf. EV-001')
    && queueText.includes('Thonon-les-Bains') && queueText.includes('74200') && queueText.includes('Vente — logement') && queueText.includes('Location — logement') && queueText.includes('Incomplète') && /8 oct\. 2026/.test(queueText));
  check('queue statuses in French', queueText.includes('En attente de validation Z Find') && queueText.includes('À compléter'));
  check('sidebar entry highlighted', await page.$eval('#sidebar a[data-view="conformite"]', a => a.classList.contains('active')));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-compliance-queue.png'), fullPage: true });

  // Detail of the sale
  await page.click('#cq-tbody tr[data-listing="l-sale"]');
  await page.waitForSelector('.cq-facts');
  const detail = await page.textContent('#cq-detail');
  check('detail: facts in readable French', detail.includes('Classe climat (GES)') && detail.includes('de l’acquéreur') && detail.includes('Oui, honoraires inclus') && /15\s000,00\s€/.test(detail)
    && detail.includes('Aucune procédure en cours') && detail.includes('64,2 m²') && detail.includes('Mention Géorisques dans l’annonce') && detail.includes('Oui, mention présente') && detail.includes('3,28 %'));
  check('detail: listing context (agency, commune, price, lifecycle status)', detail.includes('Agence du Lac') && detail.includes('Évian-les-Bains 74500') && /472\s000 €/.test(detail) && detail.includes('Prête à publier'));
  check('Valider and Refuser available for complete pending facts', !(await page.isDisabled('#cq-approve')) && !(await page.isDisabled('#cq-reject')));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-compliance-detail.png'), fullPage: true });
  await page.click('#cq-reject');
  await page.waitForSelector('.toast.error');
  check('Refuser without a reason is blocked in French', (await page.textContent('#toast-host')).includes('Indiquez le motif du refus') && reviews.length === 0);
  await page.fill('#cq-note', 'Classe GES à vérifier sur le DPE joint');
  await page.click('#cq-reject');
  await page.waitForSelector('#confirm-overlay:not(.hidden) .confirm-box');
  check('refusal asks for confirmation, quoting the reason', (await page.textContent('.confirm-box')).includes('Classe GES à vérifier'));
  await page.click('#confirm-ok');
  await page.waitForFunction(() => document.getElementById('toast-host').textContent.includes('Mentions refusées'));
  check('Refuser calls zfind_admin_review_listing_compliance(rejected, reason)', reviews[0].p_listing_id === 'l-sale' && reviews[0].p_decision === 'rejected' && reviews[0].p_note === 'Classe GES à vérifier sur le DPE joint');
  await page.waitForTimeout(100);
  check('… and asks the site to e-mail the reason to the agency (/api/lead-notify)', notified === 1);
  await page.waitForSelector('.cq-facts');
  await page.click('#cq-approve');
  await page.waitForFunction(() => document.getElementById('toast-host').textContent.includes('Mentions validées'));
  check('Valider calls zfind_admin_review_listing_compliance(approved, null)', reviews[1].p_decision === 'approved' && reviews[1].p_note === null);

  // Incomplete facts: no « Valider »
  await page.click('a.back-link');
  await page.waitForSelector('#cq-tbody tr[data-listing="l-part"]');
  await page.click('#cq-tbody tr[data-listing="l-part"]');
  await page.waitForSelector('.cq-missing');
  check('incomplete facts: missing items in French and « Valider » disabled', (await page.textContent('.cq-missing')).includes('montant des honoraires, DPE ou exemption') && await page.isDisabled('#cq-approve'));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-compliance-incomplete.png'), fullPage: true });
  check('everything visible in the review screens is French', !NOT_FRENCH.test(await page.innerText('#main')));

  // Properties list: column + filter
  await page.click('#sidebar a[data-view="properties"]');
  await page.waitForFunction(() => document.getElementById('props-tbody').textContent.includes('Validé'));
  const props = await page.textContent('#props-tbody');
  check('« Mentions FR » column: pending / refused / validated, nothing for Belgium', props.includes('En attente de validation Z Find') && props.includes('Refusé') && props.includes('Validé')
    && (await page.$$eval('#props-tbody tr[data-prop="p-be"] .tag', t => t.length)) === 1);
  await page.selectOption('#prop-compliance', 'rejected');
  let ids = await page.$$eval('#props-tbody tr[data-prop]', t => t.map(x => x.dataset.prop));
  check('compliance filter « Mentions refusées »', ids.join(',') === 'p-rent');
  await page.selectOption('#prop-compliance', 'none');
  ids = await page.$$eval('#props-tbody tr[data-prop]', t => t.map(x => x.dataset.prop));
  check('compliance filter « Hors France »', ids.join(',') === 'p-be');
  await page.selectOption('#prop-compliance', '');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-properties-compliance.png'), fullPage: true });

  // Publish blocked by the gate → French
  await page.click('#props-tbody tr[data-prop="p-sale"]');
  await page.waitForSelector('#asset-compliance-line .tag');
  check('property page shows the compliance status next to the lifecycle', (await page.textContent('#asset-compliance-line')).includes('Mentions obligatoires (France)') && (await page.textContent('#asset-compliance-line')).includes('la publication sera refusée'));
  await page.click('button:has-text("Publier")');
  await page.waitForFunction(() => document.getElementById('toast-host').textContent.includes('Publication bloquée'));
  check('« Publier » sends the existing transition and shows the SQL gate error in French', transition.p_listing_id === 'l-sale' && transition.p_to_status === 'published'
    && (await page.textContent('#toast-host')).includes('Publication bloquée : les mentions obligatoires (France) n’ont pas encore été validées par Z Find') && !(await page.textContent('#toast-host')).includes('gate failed'));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-publish-blocked.png') });

  check('no script error', errors.length === 0 || (console.log(errors), false));
  await browser.close();
  console.log(`\nADMIN MENTIONS OBLIGATOIRES: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
