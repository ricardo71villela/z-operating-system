/* ============================================================
   Z FIND ADMIN — operations dashboard + Agências (prospection base)
   Mocks Auth + REST only; exercises app.js and src/prospection.js.
   ============================================================ */
'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-admin', 'dist', 'z-find-admin.html');
const SHOTS = process.env.ZFIND_SHOTS_DIR || '';
const USER = { id: 'admin-1', aud: 'authenticated', role: 'authenticated', email: 'admin@zfind.test', app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };

let passed = 0;
function check(label, value) {
  if (!value) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS:', label);
}

const OVERVIEW = {
  agencias: { total: 120000, active: 118500, with_email: 21000, outreach_allowed: 19800, do_not_contact: 3, last_ingest: '2026-10-03T19:45:54Z' },
  agencias_by_country_type: [
    { country: 'FR', type: 'agency', n: 52000, with_email: 14000, outreach: 13990 },
    { country: 'FR', type: 'independent', n: 61000, with_email: 5000, outreach: 4998 },
    { country: 'LU', type: 'agency', n: 420, with_email: 300, outreach: 300 }
  ],
  networks: [{ network: 'century-21', n: 900 }],
  reviews: { pending: 2, published: 5, invited: 9 },
  alerts: { active: 14, pending: 3, search: 10, value: 4 },
  leads: { total: 40, last_7_days: 6, new: 3 }
};
const ROWS = [
  { id: 'a1', country: 'FR', name: 'LAC ET CHABLAIS', trade_name: 'CENTURY 21 CHABLAIS - LEMAN', type: 'network_agency', network: 'century-21', is_natural_person: false, postcode: '74200', city: 'THONON-LES-BAINS', email: 'thonon@century21.fr', phone: '+33450000000', website: null, email_outreach_allowed: true, do_not_contact: false, active: true },
  { id: 'a2', country: 'BE', name: 'BCE 0987.654.321', trade_name: null, type: 'independent', network: null, is_natural_person: true, postcode: '4000', city: 'Liège', email: 'agent@exemple.be', phone: null, website: null, email_outreach_allowed: false, do_not_contact: false, active: true }
];
const DETAIL = Object.assign({}, ROWS[0], { address: '4 PLACE DU MARCHE 74200 THONON-LES-BAINS', email_source: 'website', phone_source: 'osm', website_source: null, source: 'sirene', source_id: '12345678900011', company_id: '123456789', last_seen_at: '2026-10-03T19:45:54Z', do_not_contact_at: null, enriched_at: '2026-10-03T21:00:00Z', enrich_status: 'ok' });

(async () => {
  console.log('\n=== Z FIND ADMIN — OPERATIONS / AGÊNCIAS ===');
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const requests = { list: [], patch: [] };
  const json = (body, headers) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: Object.assign({ 'access-control-expose-headers': 'content-range' }, headers || {}) });

  await page.route('**/auth/v1/token**', r => r.fulfill(json({ access_token: 't', token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: USER })));
  await page.route('**/rest/v1/profiles**', r => r.fulfill(json({ id: USER.id, partner_id: null, role: 'admin' })));
  for (const t of ['properties', 'developments', 'partners', 'leads']) {
    await page.route(`**/rest/v1/${t}**`, r => r.fulfill(json([], { 'content-range': '0-0/4' })));
  }
  await page.route('**/rest/v1/rpc/zfind_admin_operations_overview**', r => r.fulfill(json(OVERVIEW)));
  await page.route('**/rest/v1/zfind_agencias**', r => {
    const req = r.request();
    const url = decodeURIComponent(req.url());
    if (req.method() === 'PATCH') { requests.patch.push({ url, body: JSON.parse(req.postData() || '{}') }); return r.fulfill(json([{ id: 'a1' }])); }
    if (url.includes('id=eq.a1')) return r.fulfill(json(DETAIL));
    requests.list.push(url);
    return r.fulfill(json(ROWS, { 'content-range': '0-1/1234' }));
  });

  await page.goto(FILE_URL);
  await page.fill('#login-email', 'admin@zfind.test');
  await page.fill('#login-password', 'x');
  await page.click('#login-btn');
  await page.waitForSelector('#ops-cards .card', { timeout: 10000 });
  const ops = await page.textContent('#ops-cards');
  check('dashboard: operations tiles (leads to handle, reviews to moderate, alerts, agencies, e-mails, outreach)',
    ops.includes('Leads por tratar') && ops.includes('Avaliações por moderar') && ops.includes('Alertas ativos') && ops.includes('118') && ops.includes('19'));
  const dash = await page.textContent('#main');
  check('dashboard: daily / weekly / monthly routine and tool links', dash.includes('Todos os dias') && dash.includes('Todas as semanas') && dash.includes('Todos os meses')
    && await page.$('a[href*="supabase.com/dashboard/project/dcdggqyazdddrfuzwavw"]') && await page.$('a[href*="github.com/ricardo71villela/z-operating-system/actions"]'));
  check('dashboard: base by country and type', (await page.textContent('#ops-agencias')).includes('Mandatário / independente'));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-dashboard.png'), fullPage: true });

  await page.click('#sidebar a[data-view="agencias"]');
  await page.waitForSelector('#ag-tbody tr td strong');
  check('agências: list with count, type labels, network tag', (await page.textContent('#ag-count')).includes('1') && (await page.textContent('#ag-tbody')).includes('CENTURY 21 CHABLAIS - LEMAN')
    && (await page.textContent('#ag-tbody')).includes('Agência de rede'));
  check('agências: BE natural person flagged "e-mail não permitido"', (await page.textContent('#ag-tbody')).includes('e-mail não permitido'));
  check('agências: pagination shows pages of 50', (await page.textContent('#ag-page')).includes('de 25'));

  await page.selectOption('#ag-country', 'FR');
  await page.fill('#ag-postcode', '74');
  await page.check('#ag-outreach');
  await page.click('.toolbar button.btn-primary');
  await page.waitForTimeout(400);
  const last = requests.list[requests.list.length - 1];
  check('agências: filters reach the query (country, postcode prefix, outreach, active only)',
    last.includes('country=eq.FR') && last.includes('postcode=like.74') && last.includes('email_outreach_allowed=eq.true') && last.includes('active=eq.true'));

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#ag-export')]);
  const csv = fs.readFileSync(await download.path(), 'utf8');
  check('agências: CSV export with BOM, semicolons, header and rows', csv.charCodeAt(0) === 0xfeff && csv.split('\r\n')[0].startsWith('﻿country;type;network;name') && csv.includes('thonon@century21.fr'));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-agencias.png'), fullPage: true });

  await page.click('#ag-tbody tr');
  await page.waitForSelector('#ag-detail .detail-panel');
  const det = await page.textContent('#ag-detail');
  check('detail: sources of each contact, registry source, outreach rule', det.includes('(website)') && det.includes('(osm)') && det.includes('sirene · 12345678900011') && det.includes('permitida'));
  page.once('dialog', d => d.dismiss());
  await page.click('button.btn-danger');
  await page.waitForSelector('#confirm-ok');
  await page.click('#confirm-ok');
  await page.waitForTimeout(400);
  const dnc = requests.patch.find(p => 'do_not_contact' in p.body);
  check('detail: "não contactar" sends do_not_contact = true with a date', dnc && dnc.body.do_not_contact === true && !!dnc.body.do_not_contact_at && dnc.url.includes('id=eq.a1'));
  await page.fill('#agd-email', 'contact@c21-thonon.fr');
  await page.click('button.btn-primary');
  await page.waitForTimeout(400);
  const fix = requests.patch.find(p => p.body.email === 'contact@c21-thonon.fr');
  check('detail: manual contact correction stored with source "manual"', fix && fix.body.email_source === 'manual');
  check('no script error', errors.length === 0);
  await browser.close();
  console.log(`\nADMIN OPERATIONS / AGÊNCIAS: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
