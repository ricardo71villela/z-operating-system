/* ============================================================
   Z FIND ADMIN — Bens e anúncios: review queue, filters, French titles
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
const lac = { id: 'p-lac', name: 'LAC IMMO' }; const alp = { id: 'p-alp', name: 'ALPES HABITAT' };
const prop = (id, partner, status, content, extra) => Object.assign({
  id, subtype: 'apartment', typology: 'T3', area_sqm: 81, zone_lite_id: 'z', zones_lite: { name: 'Évian-les-Bains', city: 'Évian-les-Bains' },
  representations: [{ id: 'r-' + id, status: 'active', partner_id: partner.id, partners: { name: partner.name },
    listings: status ? [{ id: 'l-' + id, transaction_type: 'sale', rental_period: null, price_current: 420000, currency_iso: 'EUR', price_is_from: false, status, listing_content: content }] : [] }]
}, extra || {});
// Newest first, as the service orders them.
const PROPS = [
  prop('a5', lac, 'pending_review', [{ locale: 'fr', title: 'T3 vue lac — sent last' }]),
  prop('a4', alp, 'pending_review', [{ locale: 'fr', title: 'Chalet Morzine' }], { subtype: 'villa', typology: '5 pièces' }),
  prop('a3', lac, 'pending_review', [{ locale: 'en', title: 'Old english' }, { locale: 'fr', title: 'T2 centre — sent first' }]),
  prop('a2', lac, 'draft', [{ locale: 'fr', title: 'Import brouillon' }], { zones_lite: null }),
  prop('a1', alp, 'published', [{ locale: 'en', title: 'English only' }]),
  prop('a0', lac, 'ready', [])
];

(async () => {
  console.log('\n=== Z FIND ADMIN — POR REVER ===');
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/auth/v1/token**', r => r.fulfill(json({ access_token: 't', token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: USER })));
  await page.route('**/rest/v1/profiles**', r => r.fulfill(json({ id: USER.id, partner_id: null, role: 'admin' })));
  for (const t of ['developments', 'partners', 'leads']) await page.route(`**/rest/v1/${t}**`, r => r.fulfill(json([])));
  await page.route('**/rest/v1/properties**', r => r.fulfill(json(PROPS)));
  await page.route('**/rest/v1/rpc/zfind_admin_operations_overview**', r => r.fulfill(json(OVERVIEW)));

  await page.goto(FILE_URL);
  await page.fill('#login-email', 'admin@zfind.test');
  await page.fill('#login-password', 'x');
  await page.click('#login-btn');
  await page.waitForSelector('#card-review');
  const card = await page.textContent('#card-review');
  check('dashboard card: listings to review and ready to publish', card.includes('3') && card.includes('Anúncios por rever') && card.includes('1 prontos a publicar'));
  check('card is highlighted when something waits', await page.$eval('#card-review', e => e.classList.contains('card-warn')));
  check('daily routine includes the review queue', (await page.textContent('#main')).includes('Anúncios por rever (enviados pelas agências)'));

  await page.click('#card-review');
  await page.waitForSelector('#props-tbody tr[data-prop]');
  let ids = await page.$$eval('#props-tbody tr[data-prop]', t => t.map(x => x.dataset.prop));
  check('card opens the queue: only "por rever", oldest first', ids.join(',') === 'a3,a4,a5');
  check('status select shows the queue filter', (await page.$eval('#prop-status', s => s.value)) === 'pending_review');
  const body = await page.textContent('#props-tbody');
  check('French title preferred over English', body.includes('T2 centre — sent first') && !body.includes('Old english'));
  check('Portuguese labels: type, agency, price, status', body.includes('Moradia · 5 pièces') && body.includes('ALPES HABITAT') && body.includes('Por rever') && /420\s?000 €/.test(body.replace(/[  ]/g, ' ')));
  const chips = await page.textContent('#prop-chips');
  check('status chips with counts', chips.includes('Por rever 3') && chips.includes('Rascunhos 1') && chips.includes('Publicados 1') && chips.includes('Prontos a publicar 1'));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-por-rever.png'), fullPage: true });

  await page.selectOption('#prop-partner', 'p-lac');
  ids = await page.$$eval('#props-tbody tr[data-prop]', t => t.map(x => x.dataset.prop));
  check('agency filter combines with status', ids.join(',') === 'a3,a5');
  check('chips count within the agency', (await page.textContent('#prop-chips')).includes('Por rever 2'));
  await page.click('#prop-chips button[data-status="draft"]');
  ids = await page.$$eval('#props-tbody tr[data-prop]', t => t.map(x => x.dataset.prop));
  check('chip switches to drafts (imported listings of the agency)', ids.join(',') === 'a2' && (await page.$eval('#prop-status', s => s.value)) === 'draft');
  check('draft without commune says "a definir"', (await page.textContent('#props-tbody')).includes('a definir'));
  await page.selectOption('#prop-partner', '');
  await page.selectOption('#prop-status', '');
  ids = await page.$$eval('#props-tbody tr[data-prop]', t => t.map(x => x.dataset.prop));
  check('"Todos" lists everything, newest first', ids.join(',') === 'a5,a4,a3,a2,a1,a0');
  const all = await page.textContent('#props-tbody');
  check('English-only title still shown; listing without title says so', all.includes('English only') && all.includes('(sem título)'));
  await page.fill('#prop-search', 'morzine');
  ids = await page.$$eval('#props-tbody tr[data-prop]', t => t.map(x => x.dataset.prop));
  check('search by title', ids.join(',') === 'a4');
  await page.fill('#prop-search', '');
  await page.click('#sidebar a.sub');
  await page.waitForSelector('#props-tbody tr[data-prop]');
  ids = await page.$$eval('#props-tbody tr[data-prop]', t => t.map(x => x.dataset.prop));
  check('sidebar "Por rever" opens the queue', ids.join(',') === 'a3,a4,a5');
  await page.click('#sidebar a[data-view="properties"]');
  await page.waitForSelector('#props-tbody tr[data-prop]');
  check('sidebar "Bens e anúncios" shows all', (await page.$$('#props-tbody tr[data-prop]')).length === 6);
  check('no script error', errors.length === 0);
  await browser.close();
  console.log(`\nADMIN POR REVER: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
