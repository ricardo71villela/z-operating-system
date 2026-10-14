/* ============================================================
   Z FIND PARTNER — « Mentions obligatoires » for every profile of
   migration 20261014120000: France (local commercial, terrain,
   programme neuf), Belgium (Wallonie, Flandre) and Luxembourg; plus the
   property form offering energy class G.
   Mocks Auth + REST only (the profile comes from zfind_get_listing_compliance,
   as in production). Screenshots when ZFIND_SHOTS_DIR is set.
   ============================================================ */
'use strict';

const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-partner', 'dist', 'z-find-partner.html');
const SHOTS = process.env.ZFIND_SHOTS_DIR || '';
const USER = { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'agence@test.fr', app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-10-04T00:00:00Z', updated_at: '2026-10-04T00:00:00Z' };
let passed = 0;
function check(label, value, extra) { if (!value) throw new Error('FAIL: ' + label + (extra === undefined ? '' : ' ' + JSON.stringify(extra))); passed += 1; console.log('PASS:', label); }
const json = (b, s) => ({ status: s || 200, contentType: 'application/json', body: JSON.stringify(b), headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/0' } });
const NOT_FRENCH = /\b(the|and|save|submit|pending|approved|rejected|loading|error|undefined|null|NaN|guardar|anúncio|aprovar)\b/i;

const Z = {
  FR: { name: 'Thonon-les-Bains', city: 'Thonon-les-Bains', country_iso: 'FR' },
  WAL: { name: 'Namur', city: 'Namur', country_iso: 'BE' },
  VLA: { name: 'Gent', city: 'Gent', country_iso: 'BE' },
  LU: { name: 'Luxembourg', city: 'Luxembourg', country_iso: 'LU' }
};
const CASES = [
  { id: 'com', subtype: 'office', zone: Z.FR, tx: 'sale', profile: 'fr_commercial_sale_v1', country: 'FR', energy: 'G', heading: 'Mentions obligatoires — France', label: 'Vente de bureaux, commerce ou local d’activité', shot: 'partner-mentions-fr-commerce' },
  { id: 'land', subtype: 'land', zone: Z.FR, tx: 'sale', profile: 'fr_land_sale_v1', country: 'FR', heading: 'Mentions obligatoires — France', label: 'Vente d’un terrain', shot: 'partner-mentions-fr-terrain' },
  { id: 'dev', subtype: 'apartment', zone: Z.FR, tx: 'sale', profile: 'fr_new_development_sale_v1', country: 'FR', heading: 'Mentions obligatoires — France', label: 'Programme neuf — vente en l’état futur d’achèvement (VEFA)', shot: 'partner-mentions-fr-programme-neuf' },
  { id: 'wal', subtype: 'villa', zone: Z.WAL, tx: 'sale', profile: 'be_wal_sale_v1', country: 'BE', energy: 'D', heading: 'Mentions obligatoires — Belgique — Wallonie', label: 'Vente en Wallonie', shot: 'partner-mentions-be-wallonie' },
  { id: 'vla', subtype: 'apartment', zone: Z.VLA, tx: 'sale', profile: 'be_vla_sale_v1', country: 'BE', heading: 'Mentions obligatoires — Belgique — Flandre (Vlaanderen)', label: 'Vente en Flandre (Vlaanderen)', shot: 'partner-mentions-be-flandre' },
  { id: 'lu', subtype: 'apartment', zone: Z.LU, tx: 'rent', profile: 'lu_rent_v1', country: 'LU', energy: 'C', heading: 'Mentions obligatoires — Luxembourg', label: 'Location au Luxembourg', shot: 'partner-mentions-lu' }
];
const listingOf = c => ({ id: 'l-' + c.id, transaction_type: c.tx, rental_period: c.tx === 'rent' ? 'monthly' : null, price_current: c.tx === 'rent' ? 1900 : 395000, currency_iso: 'EUR', price_is_from: false, status: 'draft' });
const PROPS = CASES.map(c => ({ id: 'p-' + c.id, subtype: c.subtype, typology: c.subtype === 'apartment' ? 'T3' : null, area_sqm: 80, zones_lite: c.zone,
  representations: [{ id: 'r-' + c.id, status: 'active', partner_id: 'p1', listings: [listingOf(c)] }] }));
const DETAIL = Object.fromEntries(CASES.map((c, i) => [PROPS[i].id, Object.assign({}, PROPS[i], { energy_rating: c.energy || null, energy_certificate_number: c.id === 'wal' ? '20240512012345' : null, gross_private_area_sqm: 80 })]));
const STATUSES = CASES.map(c => ({ listing_id: 'l-' + c.id, jurisdiction_iso: c.country, profile: c.profile, review_status: 'unreviewed', review_note: null, facts_valid: false, missing: ['compliance_record'] }));
const payload = (c, extra) => Object.assign({ listing_id: 'l-' + c.id, facts: {}, source_evidence: {}, review_status: 'unreviewed', review_note: null, reviewed_at: null,
  jurisdiction_iso: c.country, profile: c.profile, validation: { facts_valid: false, missing: ['compliance_record'] }, assessment: { compliant: false } }, extra || {});

(async () => {
  console.log('\n=== Z FIND PARTNER — MENTIONS OBLIGATOIRES : NOUVEAUX PROFILS ===');
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  let saved = null;
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
    const c = CASES.find(x => 'p-' + x.id === a.p_asset_id) || CASES[0];
    return r.fulfill(json(listingOf(c)));
  });
  await page.route('**/rest/v1/rpc/zfind_partner_enabled_languages**', r => r.fulfill(json([{ code: 'fr', native_name: 'Français' }])));
  await page.route('**/rest/v1/rpc/zfind_list_listing_compliance_status**', r => r.fulfill(json(STATUSES)));
  await page.route('**/rest/v1/rpc/zfind_get_listing_compliance**', r => {
    const a = r.request().postDataJSON();
    return r.fulfill(json(payload(CASES.find(x => 'l-' + x.id === a.p_listing_id))));
  });
  await page.route('**/rest/v1/rpc/zfind_save_listing_compliance**', r => {
    saved = r.request().postDataJSON();
    const c = CASES.find(x => 'l-' + x.id === saved.p_listing_id);
    return r.fulfill(json(payload(c, { facts: saved.p_facts, review_status: 'pending', validation: { facts_valid: true, missing: [] } })));
  });

  await page.goto(FILE_URL);
  await page.fill('#login-email', 'agence@test.fr');
  await page.fill('#login-password', 'MotDePasse-2026');
  await page.click('#login-btn');
  await page.waitForSelector('.compliance-badge');
  check('a badge for every listing (FR, BE, LU)', (await page.$$('.compliance-badge')).length === CASES.length);
  const section = page.locator('#partner-compliance-section');

  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    await page.click(`.portfolio-row >> nth=${i}`);
    await page.waitForSelector('#compliance-form');
    await page.waitForTimeout(150);
    const text = await section.innerText();
    check(`${c.id}: « ${c.heading} » — ${c.label}`, text.includes(c.heading) && text.includes(c.label), text.slice(0, 200));
    check(`${c.id}: everything visible in the section is French`, !NOT_FRENCH.test(text), (text.match(NOT_FRENCH) || [])[0]);

    if (c.id === 'com') {
      check('commerce: DPE classes up to I, no energy costs, copropriété asked, Géorisques',
        (await page.$$eval('#cf-dpe_energy_class option', o => o.map(x => x.value))).join('') === 'ABCDEFGHI' && !(await page.$('#cf-energy_cost_min'))
        && !!(await page.$('input[name="cf-is_condominium"]')) && !!(await page.$('#cf-georisques_disclosure')));
      check('commerce: class G of the property prefilled', await page.isChecked('input[name="cf-dpe_status"][value="available"]') && (await page.inputValue('#cf-dpe_energy_class')) === 'G');
      // Property form: energy class G offered and selected.
      const opts = await page.$$eval('#attr-energy-rating option', o => o.map(x => x.value));
      check('property form: energy class G offered (A to G) and the stored G selected', opts.includes('G') && (await page.inputValue('#attr-energy-rating')) === 'G', opts);
      if (SHOTS) {
        const panel = page.locator('#attr-energy-rating').locator('xpath=ancestor::div[contains(@class,"detail-panel")]');
        await panel.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(SHOTS, 'partner-property-form-class-g.png'), clip: await panel.boundingBox().then(b => ({ x: 0, y: Math.max(0, b.y - 70), width: 1366, height: b.height + 90 })) });
      }
    }
    if (c.id === 'land') {
      check('terrain: no DPE, no copropriété; fees, Géorisques, viabilisation (optional)',
        !(await page.$('input[name="cf-dpe_status"]')) && !(await page.$('input[name="cf-is_condominium"]')) && !!(await page.$('input[name="cf-fees_payer"]')) && !!(await page.$('input[name="cf-land_serviced"]')));
    }
    if (c.id === 'dev') {
      await page.check('input[name="cf-dpe_status"][value="pending_completion"]');
      check('programme neuf: « DPE établi à l’achèvement » hides the DPE classes and asks nothing more (RE2020 optional)',
        !(await page.isVisible('#cf-dpe_energy_class')) && await page.isVisible('#cf-energy_standard'));
    }
    if (c.id === 'wal') {
      check('Wallonie: PEB class (A++ … G) prefilled D, kWh/m².an, kWh/an and unique code prefilled from the property',
        (await page.inputValue('#cf-peb_class')) === 'D' && (await page.$$eval('#cf-peb_class option', o => o.map(x => x.value))).includes('A++')
        && !!(await page.$('#cf-peb_specific_consumption_kwh_m2')) && !!(await page.$('#cf-peb_total_consumption_kwh')) && (await page.inputValue('#cf-peb_certificate_code')) === '20240512012345');
      check('Wallonie: no French-only mention (Géorisques, DPE)', !(await page.$('#cf-georisques_disclosure')) && !(await page.$('input[name="cf-dpe_status"]')));
    }
    if (c.id === 'vla') {
      await page.click('#compliance-save');
      await page.waitForSelector('.cf-field.has-error');
      const err = await section.innerText();
      check('Flandre: French messages for EPC, P-score and urbanism', saved === null && err.includes('Indiquez si le bien dispose d’un EPC.') && err.includes('Choisissez le P-score de la parcelle (A à D).') && err.includes('Indiquez si un droit de préemption s’applique.'));
      await page.check('input[name="cf-epc_status"][value="available"]');
      await page.fill('#cf-epc_score_kwh_m2', '245');
      await page.selectOption('#cf-epc_label', 'C');
      await page.fill('#cf-epc_unique_code', '20230101-0001234-00000001');
      await page.check('input[name="cf-renovation_obligation"][value="false"]');
      await page.check('input[name="cf-flood_p_score"][value="A"]');
      await page.check('input[name="cf-plot_is_built"][value="true"]');
      check('Flandre: « parcelle bâtie » shows the G-score', await page.isVisible('input[name="cf-flood_g_score"][value="B"]'));
      await page.check('input[name="cf-flood_g_score"][value="B"]');
      await page.check('input[name="cf-urban_permit_issued"][value="true"]');
      await page.fill('#cf-urban_zoning_designation', 'woongebied');
      await page.check('input[name="cf-urban_summons"][value="false"]');
      await page.check('input[name="cf-urban_preemption_right"][value="false"]');
      await page.check('input[name="cf-urban_subdivision_permit"][value="false"]');
      await page.click('#compliance-save');
      await page.waitForFunction(() => document.getElementById('compliance-status').textContent.includes('En attente'));
      const f = saved.p_facts;
      check('Flandre: save RPC with JSON numbers / booleans and the Flemish keys only', saved.p_listing_id === 'l-vla' && f.epc_score_kwh_m2 === 245 && f.epc_label === 'C' && f.plot_is_built === true
        && f.flood_g_score === 'B' && f.urban_preemption_right === false && f.urban_zoning_designation === 'woongebied' && !('georisques_disclosure' in f) && saved.p_source_evidence.form === 'be_vla_sale_v1', f);
      await page.locator('#compliance-status').scrollIntoViewIfNeeded();
    }
    if (c.id === 'lu') {
      check('Luxembourg: energy and thermal-insulation classes (A+ … I), class C prefilled, commission optional',
        (await page.inputValue('#cf-cpe_energy_class')) === 'C' && (await page.$$eval('#cf-cpe_insulation_class option', o => o.map(x => x.value))).includes('I')
        && !(await page.$eval('[data-key="fees_payer"] label', l => l.textContent)).includes('*'));
    }
    if (SHOTS) await section.screenshot({ path: path.join(SHOTS, c.shot + '.png') });
    await page.click('.detail-back');
    await page.waitForSelector('.compliance-badge');
  }

  check('no console or script error', errors.length === 0, errors);
  await browser.close();
  console.log(`\nPARTNER MENTIONS OBLIGATOIRES (FR / BE / LU): ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
