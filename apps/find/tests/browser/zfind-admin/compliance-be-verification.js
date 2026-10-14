/* ============================================================
   Z FIND ADMIN — review of Belgian (Flandre) and Luxembourg mandatory
   information (migration 20261014120000): queue (country / region,
   type), detail in French with the official Dutch terms, Valider.
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


const VLA_FACTS = { epc_status: 'available', epc_score_kwh_m2: 245, epc_label: 'C', epc_unique_code: '20230101-0001234-00000001', renovation_obligation: false,
  flood_p_score: 'A', plot_is_built: true, flood_g_score: 'B', urban_permit_issued: true, urban_zoning_designation: 'woongebied', urban_summons: false,
  urban_preemption_right: false, urban_subdivision_permit: false };
const LU_FACTS = { cpe_status: 'available', cpe_energy_class: 'B', cpe_insulation_class: 'C', fees_payer: 'tenant', agency_fees_amount: 2340 };
const qrow = (id, extra) => Object.assign({ listing_id: id, review_status: 'pending', review_note: null, submitted_at: '2026-10-13T09:12:00Z', reviewed_at: null,
  listing_status: 'pending_review', currency_iso: 'EUR', partner_id: 'p-gent', partner_name: 'Immo Gent', development_id: null, missing: [], facts_valid: true }, extra);
const QUEUE = [
  qrow('l-vla', { title: 'Appartement 2 chambres — Gent', agency_reference: 'GE-77', jurisdiction_iso: 'BE', profile: 'be_vla_sale_v1', facts: VLA_FACTS, transaction_type: 'sale', price_current: 395000, property_id: 'p-vla', commune: 'Gent', postal_code: '9000' }),
  qrow('l-lu', { title: 'Appartement — Kirchberg', agency_reference: 'LX-5', jurisdiction_iso: 'LU', profile: 'lu_rent_v1', facts: LU_FACTS, transaction_type: 'rent', price_current: 2340, property_id: 'p-lu', commune: 'Luxembourg', postal_code: '1855', partner_name: 'Agence Kirchberg' })
];
const full = r => ({ listing_id: r.listing_id, facts: r.facts, source_evidence: {}, review_status: r.review_status, review_note: r.review_note, reviewed_at: r.reviewed_at, jurisdiction_iso: r.jurisdiction_iso, profile: r.profile,
  validation: { jurisdiction_iso: r.jurisdiction_iso, profile: r.profile, facts_valid: r.facts_valid, missing: r.missing }, assessment: { compliant: false } });
const PROPS = [];
const STATUSES = [];
const TAXONOMY = { classes: [{ code: 'residential', enabled: true, sort_order: 1 }], subtypes: [{ code: 'apartment', property_class: 'residential', enabled: true, sort_order: 1 }] };

(async () => {
  console.log('\n=== Z FIND ADMIN — MENTIONS OBLIGATOIRES BELGIQUE / LUXEMBOURG ===');
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

  await page.goto(FILE_URL);
  await page.fill('#login-email', 'admin@zfind.test');
  await page.fill('#login-password', 'x');
  await page.click('#login-btn');
  await page.waitForSelector('#card-compliance');
  check('dashboard card « Mentions obligatoires à valider (FR, BE, LU) »', (await page.textContent('#card-compliance')).includes('Mentions obligatoires à valider (FR, BE, LU)'));
  await page.click('#sidebar a[data-view="conformite"]');
  await page.waitForSelector('#cq-tbody tr[data-listing="l-vla"]');
  const queueText = await page.textContent('#cq-tbody');
  check('queue: country / region and type of each listing', queueText.includes('Belgique — Flandre (Vlaanderen)') && queueText.includes('Vente — Flandre') && queueText.includes('Luxembourg') && queueText.includes('Location — Luxembourg'));
  await page.click('#cq-tbody tr[data-listing="l-vla"]');
  await page.waitForSelector('.cq-facts');
  const detail = await page.textContent('#cq-detail');
  check('Flandre detail: EPC, watertoets and urbanism in French with the Dutch terms', detail.includes('Belgique — Flandre (Vlaanderen)') && detail.includes('Score énergétique — kengetal') && detail.includes('245 kWh/m².an')
    && detail.includes('Score de la parcelle (P-score)') && detail.includes('Droit de préemption (voorkooprecht)') && detail.includes('woongebied') && detail.includes('Ne s’applique pas'));
  check('everything visible is French (Dutch only as official terms)', !NOT_FRENCH.test(await page.innerText('#main')));
  check('Valider available for complete pending facts', !(await page.isDisabled('#cq-approve')));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-review-be-flandre.png'), fullPage: true });
  await page.click('#cq-approve');
  await page.waitForFunction(() => document.getElementById('toast-host').textContent.includes('Mentions validées'));
  check('Valider → zfind_admin_review_listing_compliance(approved)', reviews[0].p_listing_id === 'l-vla' && reviews[0].p_decision === 'approved');
  check('no console or script error', errors.length === 0 || (console.log(errors), false));
  await browser.close();
  console.log(`\nADMIN MENTIONS BE / LU: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
