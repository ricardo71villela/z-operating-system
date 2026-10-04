/* ============================================================
   Z FIND PARTNER — « Demandes »: Répondue / Clôturer, 24 h waiting flag
   (migration 20261004200000). Mocks Auth + REST only.
   ============================================================ */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-partner', 'dist', 'z-find-partner.html');
const USER = { id: 'partner-user-1', aud: 'authenticated', role: 'authenticated', email: 'partner@zfind.test', app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
let passed = 0;
function check(label, value) { if (!value) throw new Error('FAIL: ' + label); passed += 1; console.log('PASS:', label); }
const json = b => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const ago = h => new Date(Date.now() - h * 3600000).toISOString();

(async () => {
  console.log('\n=== Z FIND PARTNER — DEMANDES ===');
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const marks = [];
  const LEADS = [
    { id: 'l1', listing_id: 'x', contact_type: 'direct', name: 'Marie', email: 'marie@example.com', phone: null, message: 'Visite ?', status: 'new', created_at: ago(30) },
    { id: 'l2', listing_id: 'x', contact_type: 'direct', name: 'Paul', email: 'paul@example.com', status: 'new', created_at: ago(2) },
    { id: 'l3', listing_id: 'x', contact_type: 'direct', name: 'Anne', email: 'anne@example.com', status: 'contacted', created_at: ago(80) },
    { id: 'l4', listing_id: 'x', contact_type: 'direct', name: 'Luc', email: 'luc@example.com', status: 'closed', created_at: ago(200) }
  ];
  await page.route('**/auth/v1/token**', r => r.fulfill(json({ access_token: 't', token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: USER })));
  await page.route('**/rest/v1/profiles**', r => r.fulfill(json({ id: USER.id, partner_id: 'partner-1', role: 'partner_user' })));
  await page.route('**/rest/v1/partners**', r => r.fulfill(json({ id: 'partner-1', name: 'LAC IMMO' })));
  await page.route('**/rest/v1/leads**', r => r.fulfill(json(LEADS)));
  await page.route('**/rest/v1/rpc/zfind_partner_set_lead_status**', r => { const b = r.request().postDataJSON(); marks.push(b); const l = LEADS.find(x => x.id === b.p_lead_id); l.status = b.p_status; return r.fulfill(json({ id: l.id, status: l.status })); });
  await page.goto(FILE_URL);
  await page.fill('#login-email', 'partner@zfind.test');
  await page.fill('#login-password', 'password123');
  await page.click('#login-btn');
  await page.waitForTimeout(500);
  await page.click('.dash-nav a:has-text("Demandes")');
  await page.waitForSelector('#leads-list .lead-row');
  const text = await page.textContent('#leads-list');
  check('French statuses', text.includes('À répondre') && text.includes('Répondue') && text.includes('Clôturée'));
  check('waiting more than 24 h flagged, recent one not', text.includes('en attente depuis 30 h') && (await page.$$('.lead-late')).length === 1);
  check('buttons: answer + close on new ones, close only once answered, none when closed',
    (await page.$$('[data-lead-action="contacted"]')).length === 2 && (await page.$$('[data-lead-action="closed"]')).length === 3);
  await page.click('.lead-row:has-text("Marie") [data-lead-action="contacted"]');
  await page.waitForTimeout(400);
  check('« Marquer comme répondue » calls the agency function', marks[0].p_lead_id === 'l1' && marks[0].p_status === 'contacted');
  check('list refreshed: Marie no longer waiting', !(await page.textContent('#leads-list')).includes('en attente depuis'));
  await page.click('.lead-row:has-text("Anne") [data-lead-action="closed"]');
  await page.waitForTimeout(400);
  check('« Clôturer »', marks[1].p_lead_id === 'l3' && marks[1].p_status === 'closed');
  check('no script error', errors.length === 0);
  await browser.close();
  console.log(`\nPARTNER DEMANDES: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
