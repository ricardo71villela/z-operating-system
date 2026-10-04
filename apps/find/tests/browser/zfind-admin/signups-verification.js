/* ============================================================
   Z FIND ADMIN — Inscrições (self sign-ups) + Founder seats
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
  agencias: { total: 10, active: 10, with_email: 2, outreach_allowed: 2, do_not_contact: 0, last_ingest: null }, agencias_by_country_type: [], networks: [],
  reviews: { pending: 0, published: 0, invited: 0 }, alerts: { active: 0, pending: 0 }, leads: { total: 0, last_7_days: 0, new: 0 },
  signups: { pending: 2, verified: 1, founder_seats: { FR: 3, BE: 0, LU: 1, developers: 1 } }
};
const SIGNUPS = [
  { id: 's1', created_at: '2026-10-04T10:00:00Z', role: 'agency', country: 'FR', company_id: '123456782', establishment_id: '12345678200010', legal_name: 'LAC IMMOBILIER SARL', trade_name: 'LAC IMMO', address: '4 place du Marché', postcode: '06400', city: 'Cannes', phone: '0493000000', email: 'contact@lac-immo.fr', website: null, card_number: 'CPI 0605 2018 000 012 345', card_authority: 'CCI Nice Côte d’Azur', plan: 'founder', founder_wave: 1, status: 'pending', review_note: null, partner_id: 'p1', agencia_id: 'ag-1' },
  { id: 's2', created_at: '2026-10-04T11:00:00Z', role: 'promoter', country: 'LU', company_id: 'B123456', establishment_id: null, legal_name: 'BATI LUX SA', trade_name: null, address: null, postcode: '1611', city: 'Luxembourg', phone: null, email: 'info@batilux.lu', website: null, card_number: 'AE 10012345', card_authority: null, plan: 'founder_developer', founder_wave: null, status: 'pending', review_note: null, partner_id: 'p2', agencia_id: null }
];

(async () => {
  console.log('\n=== Z FIND ADMIN — INSCRIÇÕES ===');
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const seen = { lists: [], reviews: [] };
  await page.route('**/auth/v1/token**', r => r.fulfill(json({ access_token: 't', token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: USER })));
  await page.route('**/rest/v1/profiles**', r => r.fulfill(json({ id: USER.id, partner_id: null, role: 'admin' })));
  for (const t of ['properties', 'developments', 'partners', 'leads']) await page.route(`**/rest/v1/${t}**`, r => r.fulfill(json([])));
  await page.route('**/rest/v1/rpc/zfind_admin_operations_overview**', r => r.fulfill(json(OVERVIEW)));
  await page.route('**/rest/v1/zfind_partner_signups**', r => { seen.lists.push(decodeURIComponent(r.request().url())); return r.fulfill(json(SIGNUPS)); });
  await page.route('**/rest/v1/rpc/zfind_admin_review_signup**', r => { seen.reviews.push(r.request().postDataJSON()); return r.fulfill(json({ id: 's1', status: 'verified' })); });

  await page.goto(FILE_URL);
  await page.fill('#login-email', 'admin@zfind.test');
  await page.fill('#login-password', 'x');
  await page.click('#login-btn');
  await page.waitForSelector('#ops-cards .card');
  const ops = await page.textContent('#ops-cards');
  check('dashboard: sign-ups to check and Founder seats per country (from the public price list)', ops.includes('Inscrições por verificar') && ops.includes('FR 3/50') && ops.includes('LU 1/50') && ops.includes('promotores 1/10'));
  check('daily routine includes checking new sign-ups', (await page.textContent('#main')).includes('Inscrições novas'));
  await page.click('#sidebar a[data-view="inscricoes"]');
  await page.waitForSelector('#sg-tbody tr[data-signup]');
  check('list loads pending sign-ups by default', seen.lists[0].includes('status=eq.pending'));
  const t = await page.textContent('#sg-tbody');
  check('row shows who, registry, card, offer and status', t.includes('LAC IMMO') && t.includes('12345678200010') && t.includes('CPI 0605') && t.includes('Fundador · 1.ª vaga') && t.includes('Por verificar') && t.includes('Promotor fundador'));
  check('SIRET links to the public company directory', !!(await page.$('a[href="https://annuaire-entreprises.data.gouv.fr/etablissement/12345678200010"]')));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-inscricoes.png'), fullPage: true });
  await page.fill('#sg-note-s1', 'Carte vérifiée CCI');
  await page.click('tr[data-signup="s1"] button.btn-primary');
  await page.waitForTimeout(400);
  check('validate calls the admin RPC with the note', seen.reviews[0] && seen.reviews[0].p_signup_id === 's1' && seen.reviews[0].p_decision === 'verified' && seen.reviews[0].p_note === 'Carte vérifiée CCI');
  await page.click('tr[data-signup="s2"] button.btn-danger');
  await page.waitForSelector('#confirm-ok');
  await page.click('#confirm-ok');
  await page.waitForTimeout(400);
  check('reject asks for confirmation, then calls the RPC', seen.reviews[1] && seen.reviews[1].p_decision === 'rejected' && seen.reviews[1].p_signup_id === 's2');
  await page.selectOption('#sg-status', '');
  await page.waitForTimeout(300);
  check('"Todas" lists without a status filter', !seen.lists[seen.lists.length - 1].includes('status=eq.'));
  check('no script error', errors.length === 0);
  await browser.close();
  console.log(`\nADMIN INSCRIÇÕES: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
