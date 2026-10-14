/* ============================================================
   Z FIND ADMIN — « Flux automatiques des agences »
   List (zfind_admin_list_feeds: status, last run, counts, failures —
   never the password), « Lancer maintenant » (zfind_admin_request_feed_run
   + /api/feed-sync nudged), « Désactiver » with confirmation and
   « Réactiver » (zfind_admin_set_feed_active).
   Mocks Auth + REST only. Screenshot when ZFIND_SHOTS_DIR is set.
   ============================================================ */
'use strict';

const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-admin', 'dist', 'z-find-admin.html');
const SHOTS = process.env.ZFIND_SHOTS_DIR || '';
const USER = { id: 'admin-1', aud: 'authenticated', role: 'authenticated', email: 'admin@zfind.test', app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
let passed = 0;
function check(label, value) { if (!value) throw new Error('FAIL: ' + label); passed += 1; console.log('PASS:', label); }
const json = b => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b), headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/0' } });
const NOT_FRENCH = /\b(the|and|pending|draft|ready|published|loading|error|undefined|null|NaN|true|false|flagged|partial)\b/i;
const OVERVIEW = {
  agencias: { total: 0, active: 0, with_email: 0, outreach_allowed: 0, do_not_contact: 0, last_ingest: null }, agencias_by_country_type: [], networks: [],
  reviews: { pending: 0, published: 0, invited: 0 }, alerts: { active: 0, pending: 0 }, leads: { total: 0, last_7_days: 0, new: 0 },
  signups: { pending: 0, verified: 0, founder_seats: { FR: 0, BE: 0, LU: 0, developers: 0 } }
};
let FEEDS = [
  { id: 'f-lac', partner_id: 'p-lac', partner_name: 'LAC IMMO', url: 'https://export.hektor.test/lacimmo/annonces.zip', auth_user: 'lacimmo', has_password: true, full_sync: true, active: true, disabled_by_admin: false,
    last_run_at: '2026-10-10T00:16:00Z', last_status: 'flagged', last_message: 'Le flux contient 0 annonce contre 42 lors de la dernière synchronisation : aucune annonce n’a été retirée. À vérifier.', last_counts: { file: 0, created: 0, updated: 0, archived: 0, errors: 0 }, consecutive_failures: 0, run_requested_at: null },
  { id: 'f-thon', partner_id: 'p-th', partner_name: 'THONON PATRIMOINE', url: 'https://ftp-export.apimo.test/feeds/thonon.csv', auth_user: null, has_password: false, full_sync: false, active: true, disabled_by_admin: false,
    last_run_at: '2026-10-10T00:17:00Z', last_status: 'error', last_message: 'Échec : accès refusé (HTTP 401) : vérifiez l’identifiant et le mot de passe', last_counts: {}, consecutive_failures: 2, run_requested_at: null },
  { id: 'f-evian', partner_id: 'p-ev', partner_name: 'ÉVIAN PRESTIGE', url: 'https://www.evian-prestige.test/export/annonces.csv', auth_user: null, has_password: false, full_sync: true, active: true, disabled_by_admin: false,
    last_run_at: '2026-10-10T00:15:30Z', last_status: 'ok', last_message: '3 créées, 5 mises à jour, 1 retirée, 0 erreur', last_counts: { file: 37, created: 3, updated: 5, archived: 1, errors: 0 }, consecutive_failures: 0, run_requested_at: null }
];

(async () => {
  console.log('\n=== Z FIND ADMIN — FLUX AUTOMATIQUES ===');
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const seen = { run: [], active: [], nudges: [] };
  await page.route('**/rest/v1/**', r => r.fulfill(json([])));
  await page.route('**/auth/v1/token**', r => r.fulfill(json({ access_token: 't', token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: USER })));
  await page.route('**/rest/v1/profiles**', r => r.fulfill(json({ id: USER.id, partner_id: null, role: 'admin' })));
  await page.route('**/rest/v1/rpc/zfind_admin_operations_overview**', r => r.fulfill(json(OVERVIEW)));
  await page.route('**/rest/v1/rpc/zfind_admin_list_feeds**', r => r.fulfill(json(FEEDS)));
  await page.route('**/rest/v1/rpc/zfind_admin_request_feed_run**', r => { const b = r.request().postDataJSON(); seen.run.push(b); FEEDS = FEEDS.map(f => (f.id === b.p_feed_id ? Object.assign({}, f, { run_requested_at: '2026-10-10T08:00:00Z' }) : f)); return r.fulfill(json(FEEDS.find(f => f.id === b.p_feed_id))); });
  await page.route('**/rest/v1/rpc/zfind_admin_set_feed_active**', r => { const b = r.request().postDataJSON(); seen.active.push(b); FEEDS = FEEDS.map(f => (f.id === b.p_feed_id ? Object.assign({}, f, { active: b.p_active, disabled_by_admin: !b.p_active }) : f)); return r.fulfill(json(FEEDS.find(f => f.id === b.p_feed_id))); });
  await page.route('https://zfind.online/api/**', r => { seen.nudges.push(r.request().url()); return r.fulfill({ status: 200, body: '{}' }); });

  await page.goto(FILE_URL);
  await page.fill('#login-email', 'admin@zfind.test');
  await page.fill('#login-password', 'x');
  await page.click('#login-btn');
  await page.waitForSelector('#sidebar a[data-view="flux"]');
  await page.click('#sidebar a[data-view="flux"]');
  await page.waitForSelector('#feeds-tbody tr[data-feed]');
  const rows = await page.$$eval('#feeds-tbody tr', t => t.map(x => x.innerText));
  check('3 feeds listed with agency, status, counts, failures', rows.length === 3 && rows[0].includes('LAC IMMO') && rows[0].includes('À vérifier') && rows[1].includes('En échec') && rows[1].includes('HTTP 401') && rows[2].includes('37 dans le flux') && rows[2].includes('Réussie'));
  check('the password is never shown (only the user name)', !(await page.content()).includes('has_password') && rows[0].includes('identifiant : lacimmo'));
  check('all French', !NOT_FRENCH.test(await page.innerText('#main')));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-feeds-list.png'), fullPage: true });
  await page.click('tr[data-feed="f-thon"] button[data-act="run"]');
  await page.waitForFunction(() => document.querySelector('tr[data-feed="f-thon"]').innerText.includes('lancement demandé'));
  check('« Lancer maintenant »: RPC + /api/feed-sync nudged', seen.run.length === 1 && seen.run[0].p_feed_id === 'f-thon' && seen.nudges.some(u => u.endsWith('/api/feed-sync')));
  await page.click('tr[data-feed="f-lac"] button[data-act="disable"]');
  await page.waitForSelector('#confirm-ok');
  check('disable asks for confirmation (French)', (await page.textContent('#confirm-overlay')).includes('Désactiver ce flux ?'));
  await page.click('#confirm-ok');
  await page.waitForSelector('tr[data-feed="f-lac"] button[data-act="enable"]');
  check('feed disabled: tag shown, « Lancer maintenant » off, « Réactiver » offered', seen.active[0].p_active === false && (await page.innerText('tr[data-feed="f-lac"]')).includes('Désactivé par Z Find') && await page.$eval('tr[data-feed="f-lac"] button[data-act="run"]', b => b.disabled));
  await page.click('tr[data-feed="f-lac"] button[data-act="enable"]');
  await page.waitForSelector('tr[data-feed="f-lac"] button[data-act="disable"]');
  check('feed re-enabled', seen.active[1].p_active === true);
  check('no script or console error', errors.length === 0 || (console.error(errors), false));
  await browser.close();
  console.log(`\nADMIN FEEDS: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
