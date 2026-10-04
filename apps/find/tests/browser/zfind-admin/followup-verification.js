/* ============================================================
   Z FIND ADMIN — Estimações, Leads follow-up, Avaliações
   (migration 20261004200000). Mocks Auth + REST only.
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
const ago = h => new Date(Date.now() - h * 3600000).toISOString();

const OVERVIEW = {
  agencias: { total: 0, active: 0, with_email: 0, outreach_allowed: 0, do_not_contact: 0, last_ingest: null }, agencias_by_country_type: [], networks: [],
  reviews: { pending: 1, published: 0, invited: 0 }, alerts: { active: 0, pending: 0 }, leads: { total: 3, last_7_days: 3, new: 2 },
  signups: { pending: 0, verified: 0, founder_seats: { FR: 0, BE: 0, LU: 0, developers: 0 } }
};
const PARTNERS = [{ id: 'p-lac', name: 'LAC IMMO', role: 'agency', status: 'active' }, { id: 'p-old', name: 'OLD', role: 'agency', status: 'inactive' }, { id: 'p-alp', name: 'ALPES HABITAT', role: 'agency', status: 'active' }];
const ESTIMATIONS = [
  { id: 'e1', created_at: ago(3), mode: 'owner', lang: 'fr', place: 'Évian-les-Bains', name: 'Jean Dupont', email: 'jean@example.com', phone: '0600000000', project: 'sell_3m', alerts: true, agency_consent: true,
    property: { line: 'Appartement, 72 m² · Évian-les-Bains · bon état' }, estimate: { low: 380000, high: 440000, central: 410000, confidence: 'high' }, status: 'new', partner_id: null, partners: null, forwarded_at: null, admin_note: null },
  { id: 'e2', created_at: ago(5), mode: 'owner', place: 'Thonon', name: 'Sans accord', email: 'no@example.com', project: 'curious', agency_consent: false, property: { line: 'Maison, 140 m²' }, estimate: { central: 600000, low: 550000, high: 650000, confidence: 'medium' }, status: 'new' },
  { id: 'e3', created_at: ago(8), mode: 'buyer', place: 'Annecy', name: 'Acheteur', email: 'buyer@example.com', project: 'buy_3m', agency_consent: false, property: { line: 'Appartement, 60 m²' }, estimate: { central: 300000, askingPrice: 340000 }, status: 'new' }
];
const LEADS = [
  { id: 'l1', created_at: ago(30), contact_type: 'direct', name: 'Marie Late', email: 'marie@example.com', phone: null, message: 'Visite samedi ?', status: 'new', notified_at: ago(30), responded_at: null, reminder_sent_at: ago(5), listing_title: 'T3 vue lac', partner_name: 'LAC IMMO', overdue: true },
  { id: 'l2', created_at: ago(2), contact_type: 'qualified', name: 'Paul Fresh', email: 'paul@example.com', status: 'new', notified_at: ago(2), listing_title: 'Chalet', partner_name: 'ALPES HABITAT', overdue: false },
  { id: 'l3', created_at: ago(80), contact_type: 'direct', name: 'Anne Done', email: 'anne@example.com', status: 'contacted', notified_at: ago(80), responded_at: ago(70), listing_title: 'T2', partner_name: 'LAC IMMO', overdue: false }
];
const REVIEWS = [{ id: 'r1', partner_id: 'p-lac', partner_name: 'LAC IMMO', status: 'pending', rating: 4, comment: 'Très réactifs <b>', author_label: 'Marie D.', lang: 'fr', submitted_at: ago(20), created_at: ago(200), partner_reply: null }];

(async () => {
  console.log('\n=== Z FIND ADMIN — FOLLOW-UP ===');
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const seen = { est: [], assign: [], estStatus: [], leads: [], leadStatus: [], moderate: [], nudges: [] };
  await page.route('**/auth/v1/token**', r => r.fulfill(json({ access_token: 't', token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: USER })));
  await page.route('**/rest/v1/profiles**', r => r.fulfill(json({ id: USER.id, partner_id: null, role: 'admin' })));
  for (const t of ['properties', 'developments', 'leads']) await page.route(`**/rest/v1/${t}?**`, r => r.fulfill(json([])));
  await page.route('**/rest/v1/partners**', r => r.fulfill(json(PARTNERS)));
  await page.route('**/rest/v1/rpc/zfind_admin_operations_overview**', r => r.fulfill(json(OVERVIEW)));
  await page.route('**/rest/v1/zfind_estimation_requests**', r => { const u = decodeURIComponent(r.request().url()); seen.est.push(u); return r.fulfill(json(u.includes('status=in.(new,assigned)') ? ESTIMATIONS : ESTIMATIONS.filter(x => !u.includes('status=eq.') || u.includes('status=eq.' + x.status)))); });
  await page.route('**/rest/v1/rpc/zfind_admin_assign_estimation**', r => { const b = r.request().postDataJSON(); seen.assign.push(b); Object.assign(ESTIMATIONS[0], { partner_id: b.p_partner_id, status: 'assigned', partners: { name: 'ALPES HABITAT' } }); return r.fulfill(json(ESTIMATIONS[0])); });
  await page.route('**/rest/v1/rpc/zfind_admin_set_estimation_status**', r => { seen.estStatus.push(r.request().postDataJSON()); return r.fulfill(json({ id: 'e2' })); });
  await page.route('**/rest/v1/rpc/zfind_admin_leads**', r => { const b = r.request().postDataJSON(); seen.leads.push(b); return r.fulfill(json(b.p_status === 'overdue' ? LEADS.filter(l => l.overdue) : LEADS)); });
  await page.route('**/rest/v1/rpc/zfind_admin_set_lead_status**', r => { seen.leadStatus.push(r.request().postDataJSON()); return r.fulfill(json({ id: 'l1', status: 'contacted' })); });
  await page.route('**/rest/v1/rpc/zfind_admin_reviews**', r => r.fulfill(json(REVIEWS)));
  await page.route('**/rest/v1/rpc/zfind_admin_moderate_review**', r => { seen.moderate.push(r.request().postDataJSON()); return r.fulfill(json({ id: 'r1', status: 'published' })); });
  await page.route('https://zfind.online/api/**', r => { seen.nudges.push(r.request().url()); return r.fulfill({ status: 200, body: '{"ok":true}' }); });

  await page.goto(FILE_URL);
  await page.fill('#login-email', 'admin@zfind.test');
  await page.fill('#login-password', 'x');
  await page.click('#login-btn');
  await page.waitForSelector('#card-estimations');
  check('dashboard: estimations to handle, with owners to assign', (await page.textContent('#card-estimations')).includes('3') && (await page.textContent('#card-estimations')).includes('1 à confier à une agence'));
  check('dashboard: leads unanswered for 24 h', (await page.textContent('#card-leads-late')).includes('1') && await page.$eval('#card-leads-late', e => e.classList.contains('card-warn')));
  const routine = await page.textContent('#main');
  check('routine: estimations, 24 h leads, reviews in the Admin', routine.includes('Estimations : confier') && routine.includes('Demandes sans réponse depuis 24 h') && routine.includes('dans l’Admin ou depuis l’e-mail'));

  /* ---------- Estimações ---------- */
  await page.click('#card-estimations');
  await page.waitForSelector('#est-tbody tr[data-est]');
  check('opens on "por tratar" (new + assigned)', seen.est[seen.est.length - 1].includes('status=in.(new,assigned)'));
  const t = (await page.textContent('#est-tbody')).replace(/[  ]/g, ' ');
  check('row: person, property line, estimate range, project', t.includes('Jean Dupont') && t.includes('Appartement, 72 m²') && t.includes('380 000 € – 440 000 €') && t.includes('Vendre d’ici 3 mois') && t.includes('alertes de prix : oui'));
  check('assign only where the owner agreed; others explain why', !!(await page.$('#est-partner-e1')) && !(await page.$('#est-partner-e2')) && !(await page.$('#est-partner-e3'))
    && t.includes('Pas d’accord du propriétaire : ne pas transmettre') && t.includes('Acheteur : Z Find uniquement'));
  const opts = await page.$$eval('#est-partner-e1 option', o => o.map(x => x.textContent));
  check('only active agencies offered', opts.includes('LAC IMMO') && opts.includes('ALPES HABITAT') && !opts.includes('OLD'));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-estimacoes.png'), fullPage: true });
  await page.selectOption('#est-partner-e1', 'p-alp');
  await page.click('tr[data-est="e1"] .est-agency button');
  await page.waitForSelector('#confirm-ok');
  check('confirmation says one agency, with the owner\'s agreement', (await page.textContent('#confirm-overlay')).includes('ALPES HABITAT') && (await page.textContent('#confirm-overlay')).includes('À une seule agence'));
  await page.click('#confirm-ok');
  await page.waitForTimeout(600);
  check('assign RPC called, then the site is asked to send the e-mail', seen.assign[0].p_id === 'e1' && seen.assign[0].p_partner_id === 'p-alp' && seen.nudges.some(u => u.endsWith('/api/lead-notify')));
  check('row shows the agency and "a enviar…"', (await page.textContent('tr[data-est="e1"]')).includes('envoi en cours'));
  await page.fill('#est-note-e2', 'Rappelé, pas vendeur');
  await page.click('tr[data-est="e2"] button:has-text("Clôturée")');
  await page.waitForTimeout(300);
  check('status + note saved', seen.estStatus[0].p_id === 'e2' && seen.estStatus[0].p_status === 'closed' && seen.estStatus[0].p_note === 'Rappelé, pas vendeur');

  /* ---------- Leads ---------- */
  await page.click('#sidebar a[data-view="leads"]');
  await page.waitForSelector('#leads-tbody tr[data-lead]');
  const lt = await page.textContent('#leads-tbody');
  check('leads: listing, agency, status, waiting time, reminder', lt.includes('T3 vue lac') && lt.includes('LAC IMMO') && lt.includes('sans réponse depuis 30 h') && lt.includes('relance envoyée') && lt.includes('Répondue'));
  check('late lead highlighted', await page.$eval('tr[data-lead="l1"]', e => e.classList.contains('row-late')));
  await page.selectOption('#lead-filter', 'overdue');
  await page.waitForTimeout(300);
  check('filter "sem resposta há 24 h"', seen.leads[seen.leads.length - 1].p_status === 'overdue' && (await page.$$('#leads-tbody tr[data-lead]')).length === 1);
  await page.selectOption('tr[data-lead="l1"] select', 'contacted');
  await page.waitForTimeout(300);
  check('admin can mark a lead answered', seen.leadStatus[0].p_lead_id === 'l1' && seen.leadStatus[0].p_status === 'contacted');
  await page.fill('#lead-search', 'zzz');
  check('search filters the list', (await page.textContent('#leads-tbody')).includes('Aucune'));
  await page.fill('#lead-search', '');
  await page.click('tr[data-lead="l1"] a');
  await page.waitForSelector('#lead-detail-root .detail-panel');
  check('lead detail in French with status buttons', (await page.textContent('#lead-detail-root')).includes('Envoyée à l’agence') && (await page.$$('#lead-detail-root button')).length === 2);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-leads.png'), fullPage: true });

  /* ---------- Avaliações ---------- */
  await page.click('#sidebar a[data-view="avaliacoes"]');
  await page.waitForSelector('#rv-tbody tr[data-review]');
  const rv = await page.textContent('#rv-tbody');
  check('review: agency, stars, author, comment escaped', rv.includes('LAC IMMO') && rv.includes('★★★★☆') && rv.includes('Marie D.') && rv.includes('Très réactifs <b>') && !(await page.$('#rv-tbody b')));
  await page.click('tr[data-review="r1"] button.btn-primary');
  await page.waitForTimeout(300);
  check('publish from the Admin', seen.moderate[0].p_id === 'r1' && seen.moderate[0].p_decision === 'publish');
  await page.click('tr[data-review="r1"] button.btn-danger');
  await page.waitForSelector('#confirm-ok');
  await page.click('#confirm-ok');
  await page.waitForTimeout(300);
  check('reject asks for confirmation', seen.moderate[1].p_decision === 'reject');
  await page.click('#sidebar a[data-view="dashboard"]');
  await page.waitForSelector('#ops-cards .card');
  await page.click('#ops-cards .card:has-text("Avis à modérer")');
  await page.waitForSelector('#rv-tbody');
  check('dashboard reviews card opens the moderation list', (await page.textContent('#main')).includes('Avis sur les agences'));
  check('no script error', errors.length === 0);
  await browser.close();
  console.log(`\nADMIN FOLLOW-UP: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
