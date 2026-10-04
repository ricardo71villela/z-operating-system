/* ============================================================
   Z FIND PARTNER — SELF SIGN-UP (inscription autonome) + French UI
   Mocks Auth + REST only; exercises signup.js and app.js as built.
   ============================================================ */
'use strict';

const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-partner', 'dist', 'z-find-partner.html');
const SHOTS = process.env.ZFIND_SHOTS_DIR || '';
const USER = { id: 'u-new', aud: 'authenticated', role: 'authenticated', email: 'contact@lac-immo.fr', app_metadata: {}, user_metadata: {}, identities: [{ id: 'i1' }], created_at: '2026-10-04T00:00:00Z', updated_at: '2026-10-04T00:00:00Z' };
const SIREN = '123456782';
const ROWS = [
  { agencia_id: 'ag-1', establishment_id: '12345678200010', company_id: SIREN, name: 'LAC IMMOBILIER SARL', trade_name: 'LAC IMMO', legal_form: '5499', is_head_office: true, is_natural_person: false, address: '4 PLACE DU MARCHE 06400 CANNES', postcode: '06400', city: 'CANNES', network: null, already_registered: false },
  { agencia_id: 'ag-2', establishment_id: '12345678200200', company_id: SIREN, name: 'LAC IMMOBILIER SARL', trade_name: null, legal_form: '5499', is_head_office: false, is_natural_person: false, address: '1 RUE D ANTIBES 06400 CANNES', postcode: '06400', city: 'CANNES', network: null, already_registered: true }
];

let passed = 0;
function check(label, value) {
  if (!value) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS:', label);
}
const json = (body, status) => ({ status: status || 200, contentType: 'application/json', body: JSON.stringify(body) });

async function mockBackend(page, opts) {
  const o = Object.assign({ session: true, existing: false }, opts || {});
  const seen = { signup: null, lookups: [], completed: 0 };
  let profileCalls = 0;
  await page.route('**/rest/v1/rpc/zfind_registry_lookup**', r => { seen.lookups.push(r.request().postDataJSON()); return r.fulfill(json(ROWS)); });
  await page.route('**/auth/v1/signup**', r => {
    seen.signup = { body: r.request().postDataJSON(), url: decodeURIComponent(r.request().url()) };
    const user = Object.assign({}, USER, o.existing ? { identities: [] } : {});
    if (o.session && !o.existing) return r.fulfill(json({ access_token: 't', token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user }));
    return r.fulfill(json(user));
  });
  await page.route('**/rest/v1/profiles**', r => {
    profileCalls += 1;
    if (seen.completed === 0) return r.fulfill(json({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains 0 rows' }, 406));
    return r.fulfill(json({ id: USER.id, partner_id: 'p-new', role: 'partner_user' }));
  });
  await page.route('**/rest/v1/rpc/zfind_partner_complete_signup**', r => { seen.completed += 1; return r.fulfill(json({ status: 'created', partner_id: 'p-new', plan: 'founder', founder_wave: 1, review: 'pending' })); });
  await page.route('**/rest/v1/partners**', r => r.fulfill(json({ id: 'p-new', name: 'LAC IMMO' })));
  await page.route('**/rest/v1/zfind_partner_signups**', r => r.fulfill(json({ status: 'pending', plan: 'founder', founder_wave: 1, role: 'agency', country: 'FR', created_at: '2026-10-04T10:00:00Z' })));
  await page.route('**/rest/v1/properties**', r => r.fulfill(json([])));
  await page.route('**/rest/v1/developments**', r => r.fulfill(json([])));
  return seen;
}

async function fillToStep3(page) {
  await page.fill('#su-number', SIREN);
  await page.click('#su-lookup-btn');
  await page.waitForSelector('.su-result');
  await page.click('.su-result >> nth=0');
  await page.fill('#su-card', 'CPI 0605 2018 000 012 345');
  await page.fill('#su-card-authority', 'CCI Nice Côte d’Azur');
  await page.click('#su-pane-2 .btn-login');
}

(async () => {
  console.log('\n=== Z FIND PARTNER — SIGN-UP ===');
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  const errors = [];

  // 1. Full path with immediate session
  {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    page.on('pageerror', e => errors.push(e.message));
    const seen = await mockBackend(page, { session: true });
    await page.goto(FILE_URL);
    check('login screen in French, with the sign-up link', (await page.textContent('#view-login')).includes('Connexion') && (await page.textContent('#go-signup')).includes('Inscrire mon agence'));
    await page.click('#go-signup');
    const offer = await page.textContent('#view-signup .login-editorial');
    check('offer panel from the public price list: 3 months free, 99 € then 129 €, 12 months, 5-lead guarantee',
      offer.includes('3 mois gratuits') && offer.includes('99 € HT / mois, 12 mois') && offer.includes('129 € HT / mois') && offer.includes('Moins de 5 contacts'));
    await page.fill('#su-number', '123456789');
    await page.click('#su-lookup-btn');
    check('invalid SIREN (check digit) is refused before any request', (await page.textContent('#su-error-1')).includes('pas valide') && seen.lookups.length === 0);
    await page.fill('#su-number', SIREN);
    await page.click('#su-lookup-btn');
    await page.waitForSelector('.su-result');
    check('lookup sends the country and the digits only', seen.lookups[0].p_country === 'FR' && seen.lookups[0].p_number === SIREN);
    check('establishments listed, head office tagged, already-registered one disabled',
      (await page.locator('.su-result').count()) === 2 && (await page.textContent('.su-result >> nth=0')).includes('Siège') && (await page.locator('.su-result >> nth=1').isDisabled()));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'partner-signup-step1.png') });
    await page.click('.su-result >> nth=0');
    check('step 2 pre-filled from the registry (street without postcode/city)',
      (await page.inputValue('#su-legal')) === 'LAC IMMOBILIER SARL' && (await page.inputValue('#su-trade')) === 'LAC IMMO' && (await page.inputValue('#su-siret')) === '12345678200010' &&
      (await page.inputValue('#su-address')) === '4 PLACE DU MARCHE' && (await page.inputValue('#su-postcode')) === '06400' && (await page.inputValue('#su-city')) === 'CANNES');
    await page.click('#su-pane-2 .btn-login');
    check('professional card is required', (await page.textContent('#su-error-2')).includes('Carte professionnelle'));
    await page.fill('#su-card', 'CPI 0605 2018 000 012 345');
    await page.fill('#su-card-authority', 'CCI Nice Côte d’Azur');
    await page.fill('#su-phone', '04 93 00 00 00');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'partner-signup-step2.png'), fullPage: true });
    await page.click('#su-pane-2 .btn-login');
    check('step 3: offer box and both commitments', (await page.textContent('#su-offer-box')).includes('99 € HT') && (await page.textContent('#su-terms-text')).includes('répondre aux demandes sous 24 heures'));
    await page.fill('#su-email', 'contact@lac-immo.fr');
    await page.fill('#su-password', 'court');
    await page.fill('#su-password2', 'court');
    await page.click('#su-submit');
    check('password under 10 characters refused', (await page.textContent('#su-error-3')).includes('10 caractères'));
    await page.fill('#su-password', 'MotDePasse-Solide-2026');
    await page.fill('#su-password2', 'MotDePasse-Solide-2026');
    await page.click('#su-submit');
    check('both boxes must be ticked', (await page.textContent('#su-error-3')).includes('Cochez') && !seen.signup);
    await page.check('#su-certify');
    await page.check('#su-terms');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'partner-signup-step3.png'), fullPage: true });
    await page.click('#su-submit');
    await page.waitForSelector('#view-dashboard', { state: 'visible', timeout: 10000 });
    const app = seen.signup.body.data.zfind_signup;
    check('sign-up carries the application in the account metadata',
      seen.signup.body.email === 'contact@lac-immo.fr' && app.role === 'agency' && app.country === 'FR' && app.establishment_id === '12345678200010' &&
      app.company_id === SIREN && app.agencia_id === 'ag-1' && app.card_number.startsWith('CPI') && app.terms_accepted === true && app.phone === '04 93 00 00 00');
    check('confirmation link returns to the Partner app', /redirect_to=file:\/\//.test(seen.signup.url));
    check('first session completes the sign-up server-side, then enters the dashboard', seen.completed === 1 && (await page.textContent('#dash-partner-name')) === 'LAC IMMO');
    await page.waitForSelector('#signup-banner', { state: 'visible' });
    const banner = await page.textContent('#signup-banner');
    check('welcome banner: card being checked, listings prepared meanwhile, wave-1 price', banner.includes('carte professionnelle') && banner.includes('mises en ligne après') && banner.includes('1re vague') && banner.includes('99 € HT'));
    check('dashboard in French', (await page.textContent('#view-dashboard')).includes('Tout ce que vous') && (await page.textContent('#view-dashboard')).includes('Nouveau bien'));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'partner-dashboard-welcome.png') });
    await page.close();
  }

  // 2. E-mail confirmation required: no session
  {
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push(e.message));
    const seen = await mockBackend(page, { session: false });
    await page.goto(FILE_URL + '#inscription');
    check('#inscription opens the sign-up form directly', await page.locator('#view-signup').isVisible());
    await fillToStep3(page);
    await page.fill('#su-email', 'contact@lac-immo.fr');
    await page.fill('#su-password', 'MotDePasse-Solide-2026');
    await page.fill('#su-password2', 'MotDePasse-Solide-2026');
    await page.check('#su-certify'); await page.check('#su-terms');
    await page.click('#su-submit');
    await page.waitForSelector('#su-pane-done', { state: 'visible' });
    check('no session: "check your inbox" with the address, nothing completed yet',
      (await page.textContent('#su-done-text')).includes('contact@lac-immo.fr') && seen.completed === 0);
    await page.close();
  }

  // 3. E-mail already used
  {
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await mockBackend(page, { existing: true });
    await page.goto(FILE_URL + '#inscription');
    await fillToStep3(page);
    await page.fill('#su-email', 'contact@lac-immo.fr');
    await page.fill('#su-password', 'MotDePasse-Solide-2026');
    await page.fill('#su-password2', 'MotDePasse-Solide-2026');
    await page.check('#su-certify'); await page.check('#su-terms');
    await page.click('#su-submit');
    await page.waitForFunction(() => document.getElementById('su-error-3').textContent.length > 0);
    check('existing e-mail: clear message, stays on the form', (await page.textContent('#su-error-3')).includes('existe déjà'));
    await page.close();
  }

  // 4. Luxembourg + promoter labels, manual entry; mobile layout
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', e => errors.push(e.message));
    await mockBackend(page);
    await page.goto(FILE_URL + '#inscription');
    await page.selectOption('#su-country', 'LU');
    check('Luxembourg: no registry search, manual entry offered', !(await page.locator('#su-number-field').isVisible()) && (await page.textContent('#su-manual')) === 'Saisir mes informations');
    await page.click('#su-manual');
    check('Luxembourg: RCS number and establishment authorisation', (await page.textContent('#su-company-label')).includes('RCS') && (await page.textContent('#su-card-label')).includes('Autorisation d’établissement') && !(await page.locator('#su-siret-field').isVisible()));
    await page.click('#su-pane-2 .btn-login');
    check('manual entry still requires the legal name', (await page.textContent('#su-error-2')).includes('raison sociale'));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('mobile: no horizontal scroll on the sign-up form', overflow <= 0);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'partner-signup-mobile.png'), fullPage: true });
    await page.click('#su-pane-2 .su-actions a');
    await page.check('input[name="su-role"][value="promoter"]');
    check('promoter: founding-developer offer and RCS/authorisation card label', (await page.textContent('#su-offer-lead')).includes('10 promoteurs fondateurs') && (await page.textContent('#su-card-label')).includes('immatriculation'));
    await page.close();
  }

  // 5. Unconfirmed e-mail at login
  {
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/auth/v1/token**', r => r.fulfill(json({ code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' }, 400)));
    await page.goto(FILE_URL);
    await page.fill('#login-email', 'contact@lac-immo.fr');
    await page.fill('#login-password', 'MotDePasse-Solide-2026');
    await page.click('#login-btn');
    await page.waitForFunction(() => document.getElementById('login-error').textContent.length > 0);
    check('login before confirming: explains to click the e-mail link', (await page.textContent('#login-error')).includes('Confirmez'));
    await page.close();
  }

  check('no script error', errors.length === 0);
  await browser.close();
  console.log(`\nPARTNER SIGN-UP: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
