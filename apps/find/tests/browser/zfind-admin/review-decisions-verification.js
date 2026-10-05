/* ============================================================
   Z FIND ADMIN — Fila « À vérifier » : decisões em lote, motivo de recusa, histórico
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
  console.log('\n=== Z FIND ADMIN — DÉCISIONS EN LOT ===');
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const calls = []; const nudges = [];
  let decided = false;
  await page.route('**/auth/v1/token**', r => r.fulfill(json({ access_token: 't', token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: USER })));
  await page.route('**/rest/v1/profiles**', r => r.fulfill(json({ id: USER.id, partner_id: null, role: 'admin' })));
  for (const t of ['developments', 'partners', 'leads']) await page.route(`**/rest/v1/${t}**`, r => r.fulfill(json([])));
  // After a decision the server no longer returns the decided listings as pending.
  await page.route('**/rest/v1/properties**', r => r.fulfill(json(decided ? PROPS.map(p => (['a5', 'a3'].includes(p.id) ? prop(p.id, lac, p.id === 'a5' ? 'ready' : 'incomplete', [{ locale: 'fr', title: 'x' }]) : p)) : PROPS)));
  await page.route('**/rest/v1/rpc/zfind_admin_operations_overview**', r => r.fulfill(json(OVERVIEW)));
  await page.route('**/rest/v1/rpc/zfind_admin_review_listings**', r => {
    const b = r.request().postDataJSON(); calls.push(b); decided = true;
    return r.fulfill(json(b.p_listing_ids.map((id, i) => (i === 1 && b.p_decision === 'approve' ? { listing_id: id, ok: false, error: 'not_pending_review' } : { listing_id: id, ok: true, status: b.p_decision === 'approve' ? 'ready' : 'incomplete' }))));
  });
  await page.route('**/rest/v1/rpc/zfind_admin_review_history**', r => r.fulfill(json([
    { id: 'h1', decided_at: '2026-10-05T09:00:00Z', decision: 'reject', reason: 'Photos insuffisantes', listing_id: 'l-a3', listing_title: 'T2 centre', partner_id: 'p-lac', partner_name: 'LAC IMMO', notified_at: null },
    { id: 'h2', decided_at: '2026-10-04T09:00:00Z', decision: 'approve', reason: null, listing_id: 'l-a5', listing_title: 'T3 vue lac', partner_id: 'p-lac', partner_name: 'LAC IMMO', notified_at: '2026-10-04T09:01:00Z' }])));
  await page.route('https://zfind.online/api/**', r => { nudges.push(r.request().url()); return r.fulfill({ status: 200, body: '{}' }); });

  await page.goto(FILE_URL);
  await page.fill('#login-email', 'admin@zfind.test');
  await page.fill('#login-password', 'x');
  await page.click('#login-btn');
  await page.waitForSelector('#card-review');
  await page.click('#card-review');
  await page.waitForSelector('#props-tbody tr[data-prop]');
  check('review queue shows a checkbox per listing and a disabled batch bar', (await page.$$('.rv-pick')).length === 3 && await page.$eval('#rv-approve', b => b.disabled) && await page.$eval('#rv-reject', b => b.disabled));
  await page.click('#prop-chips [data-status="draft"]');
  check('outside the review queue there is no selection bar', (await page.$$('.rv-pick')).length === 0 && (await page.textContent('#review-bar')).trim() === '');
  await page.click('#prop-chips [data-status="pending_review"]');
  await page.waitForSelector('.rv-pick');

  // Clicking a checkbox selects without opening the property.
  await page.click('.rv-pick[data-listing="l-a5"]');
  check('ticking a row selects it (no navigation), counter and buttons follow', (await page.textContent('#rv-count')).includes('1 sélectionnée') && !(await page.$eval('#rv-approve', b => b.disabled)) && (await page.$('#props-tbody')) !== null);
  await page.click('#rv-all');
  check('select all ticks every visible listing', (await page.$$('.rv-pick:checked')).length === 3 && (await page.textContent('#rv-count')).includes('3 sélectionnées'));
  // Filtering to one agency drops the selection of listings no longer visible.
  await page.selectOption('#prop-partner', 'p-alp');
  check('changing the agency filter keeps only visible selections', (await page.$$('.rv-pick')).length === 1 && (await page.$$('.rv-pick:checked')).length === 1);
  await page.selectOption('#prop-partner', '');
  await page.click('#rv-all');
  check('select all again after the filter is lifted', (await page.$$('.rv-pick:checked')).length === 3);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-review-batch.png'), fullPage: true });

  // Refusal needs a reason.
  await page.uncheck('.rv-pick[data-listing="l-a4"]');
  await page.click('#rv-reject');
  await page.waitForSelector('#reason-text');
  check('refusal dialog: OK disabled until a reason is written', await page.$eval('#confirm-ok', b => b.disabled) && (await page.textContent('#confirm-overlay')).includes('Refuser 2 annonces'));
  await page.click('.quick-reasons [data-q="2"]');
  check('quick reason fills the text and enables the button', (await page.inputValue('#reason-text')) === 'Classe DPE manquante' && !(await page.$eval('#confirm-ok', b => b.disabled)));
  await page.fill('#reason-text', 'Classe DPE manquante\nPhotos floues');
  await page.click('#confirm-ok');
  await page.waitForFunction(() => document.getElementById('status-message') ? /refusée/.test(document.getElementById('status-message').textContent) : /refusée/.test(document.body.textContent));
  check('refusal sent in one call with the selected listings and the reason', calls.length === 1 && calls[0].p_decision === 'reject' && calls[0].p_listing_ids.length === 2 && calls[0].p_listing_ids.includes('l-a5') && calls[0].p_listing_ids.includes('l-a3') && calls[0].p_reason === 'Classe DPE manquante\nPhotos floues');
  for (let i = 0; i < 40 && !nudges.length; i++) await new Promise(r => setTimeout(r, 50)); // the nudge is fire-and-forget
  check('the agencies are told right away (server nudge)', nudges.some(u => u.endsWith('/api/lead-notify')));
  await page.waitForFunction(() => document.querySelectorAll('.rv-pick').length === 1);
  check('decided listings leave the queue and the selection is cleared', (await page.textContent('#rv-count')).includes('Aucune sélection'));

  // Approval: confirmation, partial failure reported.
  decided = false;
  await page.reload();
  await page.waitForSelector('#card-review'); await page.click('#card-review'); await page.waitForSelector('.rv-pick');
  await page.click('#rv-all');
  await page.click('#rv-approve');
  await page.waitForSelector('#confirm-ok');
  check('approval confirmation says nothing is published', (await page.textContent('#confirm-overlay')).includes('Approuver 3 annonces') && (await page.textContent('#confirm-overlay')).includes('Rien n’est publié'));
  await page.click('#confirm-ok');
  // Toasts disappear after a few seconds: read the text at the moment it shows.
  const toast = await (await page.waitForFunction(() => { const t = (document.getElementById('toast-host') || {}).textContent || ''; return /non traitée/.test(t) ? t : false; })).jsonValue();
  check('approve call: no reason, one listing refused by the server is reported', calls[1].p_decision === 'approve' && calls[1].p_reason === null && toast.includes('2 annonces approuvées') && toast.includes('1 non traitée (not_pending_review)'));

  // History.
  await page.click('#rv-history-btn');
  await page.waitForSelector('#review-history-panel tbody tr');
  const hist = await page.textContent('#review-history-panel');
  check('history lists decisions with agency, reason and whether the agency was told', hist.includes('T2 centre') && hist.includes('LAC IMMO') && hist.includes('Refusée') && hist.includes('Photos insuffisantes') && hist.includes('en attente') && hist.includes('Approuvée') && hist.includes('Envoyé'));
  await page.click('#rv-history-btn');
  check('history can be hidden', (await page.textContent('#review-history')).trim() === '');
  check('no script error', errors.length === 0);
  await browser.close();
  console.log(`\nADMIN REVIEW DECISIONS: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
