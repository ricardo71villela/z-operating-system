/* ============================================================
   Z FIND PARTNER — « Mentions obligatoires (France) »: badges in the
   portfolio, the sale and rent forms (prefill, French validation,
   conditional fields), the save RPC payload, refusal reason.
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
const NOT_FRENCH = /\b(the|and|save|submit|pending|approved|rejected|loading|error|undefined|null|NaN|guardar|anúncio|aprovar)\b/i;

const EVIAN = { name: 'Évian-les-Bains', city: 'Évian-les-Bains', country_iso: 'FR' };
const rep = (id, listing) => [{ id: 'r-' + id, status: 'active', partner_id: 'p1', listings: listing ? [listing] : [] }];
const L_SALE = { id: 'l-sale', transaction_type: 'sale', rental_period: null, price_current: 472000, currency_iso: 'EUR', price_is_from: false, status: 'draft' };
const L_RENT = { id: 'l-rent', transaction_type: 'rent', rental_period: 'monthly', price_current: 1350, currency_iso: 'EUR', price_is_from: false, status: 'draft' };
const PROPS = [
  { id: 'p-sale', subtype: 'apartment', typology: 'T3', area_sqm: 70, zones_lite: EVIAN, representations: rep('p-sale', L_SALE) },
  { id: 'p-rent', subtype: 'apartment', typology: 'T2', area_sqm: 48, zones_lite: EVIAN, representations: rep('p-rent', L_RENT) },
  { id: 'p-ok', subtype: 'villa', typology: '5 pièces', area_sqm: 160, zones_lite: EVIAN, representations: rep('p-ok', { id: 'l-ok', status: 'ready' }) },
  { id: 'p-wait', subtype: 'apartment', typology: 'T4', area_sqm: 92, zones_lite: EVIAN, representations: rep('p-wait', { id: 'l-wait', status: 'draft' }) },
  { id: 'p-be', subtype: 'apartment', typology: 'T2', area_sqm: 55, zones_lite: { name: 'Ixelles', city: 'Bruxelles', country_iso: 'BE' }, representations: rep('p-be', { id: 'l-be', status: 'draft' }) }
];
const DETAIL = {
  'p-sale': Object.assign({}, PROPS[0], { floor: 2, energy_rating: 'C', energy_certificate_number: '2374E0123456X', gross_private_area_sqm: 64.5, condo_fee_monthly: 150 }),
  'p-rent': Object.assign({}, PROPS[1], { floor: 1, energy_rating: null, gross_private_area_sqm: 48 })
};
const STATUSES = [
  { listing_id: 'l-sale', jurisdiction_iso: 'FR', profile: 'fr_residential_sale_v1', review_status: 'unreviewed', review_note: null, facts_valid: false },
  { listing_id: 'l-rent', jurisdiction_iso: 'FR', profile: 'fr_residential_rent_v1', review_status: 'rejected', review_note: 'Le montant du dépôt de garantie dépasse un mois de loyer hors charges', facts_valid: true },
  { listing_id: 'l-ok', jurisdiction_iso: 'FR', profile: 'fr_residential_sale_v1', review_status: 'approved', review_note: null, facts_valid: true },
  { listing_id: 'l-wait', jurisdiction_iso: 'FR', profile: 'fr_residential_sale_v1', review_status: 'pending', review_note: null, facts_valid: true },
  { listing_id: 'l-be', jurisdiction_iso: 'BE', profile: null, review_status: 'unreviewed', review_note: null, facts_valid: false }
];
const RENT_FACTS = { dpe_status: 'available', dpe_energy_class: 'D', ghg_class: 'D', energy_cost_min: 610, energy_cost_max: 870, energy_cost_reference_year: '2023', fees_payer: 'shared',
  agency_fees_amount: 960, surface_habitable_sqm: 48, monthly_rent_excl_charges: 1250, monthly_charges: 100, charges_recovery_method: 'provision', deposit_amount: 2500,
  tenant_fees_amount: 480, inventory_fees_amount: 144, furnished: false, rent_control_status: 'not_applicable', georisques_disclosure: true };
const payload = (listingId, profile, extra) => Object.assign({ listing_id: listingId, facts: {}, source_evidence: {}, review_status: 'unreviewed', review_note: null, reviewed_at: null,
  jurisdiction_iso: 'FR', profile, validation: { facts_valid: false, missing: ['compliance_record'] }, assessment: { compliant: false } }, extra || {});

(async () => {
  console.log('\n=== Z FIND PARTNER — MENTIONS OBLIGATOIRES ===');
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  let saved = null, statusArgs = null;
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/rest/v1/**', r => r.fulfill(json([])));
  await page.route('**/auth/v1/token**', r => r.fulfill(json({ access_token: 't', token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: USER })));
  await page.route('**/rest/v1/profiles**', r => r.fulfill(json({ id: 'u1', partner_id: 'p1', role: 'partner_user' })));
  await page.route('**/rest/v1/partners**', r => r.fulfill(json({ id: 'p1', name: 'Agence du Lac' })));
  await page.route('**/rest/v1/zfind_partner_signups**', r => r.fulfill(json({ status: 'verified', plan: 'founder', founder_wave: 1, role: 'agency', country: 'FR' })));
  await page.route('**/rest/v1/properties**', r => {
    const id = (new URL(r.request().url()).searchParams.get('id') || '').replace('eq.', '');
    return r.fulfill(json(id ? DETAIL[id] : PROPS));
  });
  await page.route('**/rest/v1/rpc/zfind_partner_get_listing_for_asset**', r => {
    const a = r.request().postDataJSON();
    return r.fulfill(json(a.p_asset_id === 'p-rent' ? L_RENT : L_SALE));
  });
  await page.route('**/rest/v1/rpc/zfind_partner_enabled_languages**', r => r.fulfill(json([{ code: 'fr', native_name: 'Français' }])));
  await page.route('**/rest/v1/rpc/zfind_list_listing_compliance_status**', r => { statusArgs = r.request().postDataJSON(); return r.fulfill(json(STATUSES)); });
  await page.route('**/rest/v1/rpc/zfind_get_listing_compliance**', r => {
    const a = r.request().postDataJSON();
    if (a.p_listing_id === 'l-rent') return r.fulfill(json(payload('l-rent', 'fr_residential_rent_v1', { facts: RENT_FACTS, review_status: 'rejected', review_note: STATUSES[1].review_note, reviewed_at: '2026-10-08T15:20:00Z', validation: { facts_valid: true, missing: [] } })));
    return r.fulfill(json(payload('l-sale', 'fr_residential_sale_v1')));
  });
  await page.route('**/rest/v1/rpc/zfind_save_listing_compliance**', r => {
    saved = r.request().postDataJSON();
    return r.fulfill(json(payload(saved.p_listing_id, 'fr_residential_sale_v1', { facts: saved.p_facts, review_status: 'pending', validation: { facts_valid: true, missing: [] } })));
  });

  await page.goto(FILE_URL);
  await page.fill('#login-email', 'agence@test.fr');
  await page.fill('#login-password', 'MotDePasse-2026');
  await page.click('#login-btn');
  await page.waitForSelector('.compliance-badge');
  const list = await page.textContent('#portfolio-list');
  check('status RPC asked once for every listing of the portfolio', statusArgs && statusArgs.p_listing_ids.join(',') === 'l-sale,l-rent,l-ok,l-wait,l-be');
  check('portfolio badges in French', list.includes('Mentions : À compléter') && list.includes('Mentions : Refusé') && list.includes('Mentions : Validé') && list.includes('Mentions : En attente de validation Z Find'));
  check('no badge for the Belgian listing', (await page.$$('.compliance-badge')).length === 4);
  check('refusal reason in the badge tooltip', (await page.getAttribute('.compliance-badge.tone-bad', 'title')).startsWith('Motif : Le montant du dépôt'));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'partner-portfolio-badges.png'), fullPage: true });

  /* ---------- sale ---------- */
  await page.click('.portfolio-row >> nth=0');
  await page.waitForSelector('#compliance-form');
  const section = page.locator('#partner-compliance-section');
  check('section « Mentions obligatoires (France) » for a French sale', (await section.textContent()).includes('Mentions obligatoires (France)') && (await section.textContent()).includes('Vente d’un logement'));
  check('status « À compléter »', (await page.textContent('#compliance-status')).includes('À compléter'));
  check('prefilled from the property: DPE class C, ADEME number, annual charges', await page.isChecked('input[name="cf-dpe_status"][value="available"]')
    && (await page.inputValue('#cf-dpe_energy_class')) === 'C' && (await page.inputValue('#cf-dpe_ademe_number')) === '2374E0123456X');
  check('copropriété details hidden until « Oui »', !(await page.isVisible('#cf-condominium_lots_count')));
  check('no rental field in the sale form', !(await page.$('#cf-deposit_amount')) && !(await page.$('#cf-monthly_charges')));
  await page.click('#compliance-save');
  await page.waitForSelector('.cf-field.has-error');
  const errText = await section.textContent();
  check('client validation: French message per field, nothing sent', saved === null && errText.includes('Choisissez la classe climat GES (A à G).')
    && errText.includes('Cochez la mention Géorisques') && errText.includes('Indiquez si le prix affiché inclut les honoraires.') && errText.includes('point'));
  if (SHOTS) await section.screenshot({ path: path.join(SHOTS, 'partner-sale-errors.png') });

  await page.selectOption('#cf-ghg_class', 'E');
  await page.fill('#cf-energy_cost_min', '1 200');
  await page.fill('#cf-energy_cost_max', '1 100');
  await page.fill('#cf-energy_cost_reference_year', '2023');
  await page.check('input[name="cf-fees_payer"][value="buyer"]');
  await page.fill('#cf-agency_fees_amount', '15 000');
  await page.check('input[name="cf-price_includes_agency_fees"][value="true"]');
  await page.check('input[name="cf-is_condominium"][value="true"]');
  check('« Oui » shows the copropriété fields, charges prefilled (150 € × 12)', await page.isVisible('#cf-condominium_lots_count') && (await page.inputValue('#cf-annual_condominium_charges')) === '1800');
  await page.fill('#cf-condominium_lots_count', '24');
  await page.check('input[name="cf-condominium_procedure_choice"][value="ongoing"]');
  check('« Procédure en cours » asks for its nature', await page.isVisible('#cf-condominium_procedure_detail'));
  await page.check('#cf-georisques_disclosure');
  await page.click('#compliance-save');
  await page.waitForTimeout(200);
  check('range and procedure errors still block the save', saved === null && (await page.textContent('#cf-err-energy_cost_max')).includes('supérieur ou égal') && (await page.textContent('#cf-err-condominium_procedure_detail')).includes('Précisez'));
  await page.fill('#cf-energy_cost_max', '1 700,50');
  await page.fill('#cf-condominium_procedure_detail', 'mandat ad hoc');
  await page.fill('#cf-surface_carrez_sqm', '64,2');
  await page.click('#compliance-save');
  await page.waitForFunction(() => document.getElementById('compliance-status').textContent.includes('En attente'));
  const f = saved && saved.p_facts;
  check('save RPC: listing id, JSON numbers and booleans, French procedure text, evidence object',
    saved.p_listing_id === 'l-sale' && f.energy_cost_min === 1200 && f.energy_cost_max === 1700.5 && f.agency_fees_amount === 15000 && f.price_includes_agency_fees === true
    && f.is_condominium === true && f.condominium_lots_count === 24 && f.annual_condominium_charges === 1800 && f.condominium_procedure_status === 'Procédure en cours : mandat ad hoc'
    && f.georisques_disclosure === true && f.dpe_energy_class === 'C' && f.ghg_class === 'E' && f.surface_carrez_sqm === 64.2 && saved.p_source_evidence.channel === 'partner_panel');
  check('only the keys that apply are sent', !('dpe_exemption_reason' in f) && !('deposit_amount' in f) && !('agency_fees_percent' in f));
  check('status becomes « En attente de validation Z Find »', (await section.textContent()).includes('Vos mentions ont été transmises'));
  if (SHOTS) await section.screenshot({ path: path.join(SHOTS, 'partner-sale-submitted.png') });

  /* ---------- rent, refused ---------- */
  await page.click('.detail-back');
  await page.waitForSelector('.compliance-badge');
  await page.click('.portfolio-row >> nth=1');
  await page.waitForFunction(() => { const s = document.getElementById('compliance-status'); return s && s.textContent.includes('Refusé'); });
  const rentText = await section.textContent();
  check('rent form: « Location d’un logement », refusal reason shown', rentText.includes('Location d’un logement') && rentText.includes('Motif : Le montant du dépôt de garantie dépasse un mois de loyer hors charges'));
  check('rent form: stored facts loaded (deposit, charges method, meublé)', (await page.inputValue('#cf-deposit_amount')) === '2500' && await page.isChecked('input[name="cf-charges_recovery_method"][value="provision"]') && await page.isChecked('input[name="cf-furnished"][value="false"]'));
  check('no sale-only field in the rent form', !(await page.$('#cf-is_condominium')) && !(await page.$('#cf-price_includes_agency_fees')));
  await page.check('input[name="cf-rent_control_status"][value="applicable"]');
  check('encadrement « Oui » shows the reference rents', await page.isVisible('#cf-reference_rent') && await page.isVisible('#cf-rent_supplement_amount'));
  await page.check('input[name="cf-dpe_status"][value="exempt"]');
  check('DPE exemption swaps the DPE fields for the reason', await page.isVisible('#cf-dpe_exemption_reason') && !(await page.isVisible('#cf-dpe_energy_class')));
  await page.fill('#cf-deposit_amount', 'deux mois');
  saved = null;
  await page.click('#compliance-save');
  await page.waitForSelector('.cf-field.has-error');
  const rentErr = await section.textContent();
  check('rent validation in French', saved === null && rentErr.includes('Indiquez le montant du dépôt de garantie') && rentErr.includes('Indiquez le loyer de référence') && rentErr.includes('Précisez le motif de l’exemption de DPE.'));
  if (SHOTS) await section.screenshot({ path: path.join(SHOTS, 'partner-rent-errors.png') });

  const visible = await page.evaluate(() => document.getElementById('view-detail').innerText);
  check('everything visible in the section is French', !NOT_FRENCH.test(await section.innerText()));
  check('no console or script error', errors.length === 0 || (console.log(errors), false));
  if (SHOTS && visible) await page.screenshot({ path: path.join(SHOTS, 'partner-rent-page.png'), fullPage: true });

  /* ---------- phone width ---------- */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (SHOTS) await section.screenshot({ path: path.join(SHOTS, 'partner-rent-mobile.png') });
  check('section fits a phone screen (no horizontal scroll caused by the form)', await section.evaluate(el => el.scrollWidth <= el.clientWidth + 1) && overflow >= 0);

  await browser.close();
  console.log(`\nPARTNER MENTIONS OBLIGATOIRES: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
