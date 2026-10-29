/* Contract: statistiques des agences — vues des annonces (site), espace Partner
   « Statistiques », bilan mensuel par e-mail (cron-daily). Sans réseau. */
'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const PARTNER = path.join(__dirname, '..', '..', 'apps', 'zfind-partner');
const ROOT = path.join(__dirname, '..', '..', '..', '..');

let passed = 0;
function check(label, value) { assert(value, label); passed += 1; console.log('PASS:', label); }

const calls = [];
global.fetch = async (url, opts) => {
  const o = opts || {};
  const u = String(url);
  const body = o.body ? JSON.parse(o.body) : null;
  calls.push({ url: u, method: o.method || 'GET', body });
  const reply = (status, data) => ({ ok: status < 400, status, text: async () => JSON.stringify(data), json: async () => data });
  if (u.endsWith('/rpc/zfind_pending_monthly_stats')) return reply(200, [{ partner_id: '11111111-2222-4333-8444-555555555555', partner_name: 'Agence du Lac', stats: { months: [{ month: '2026-10-01', views: 515, contacts: 9, visits: 4 }], listings: [{ title: 'T3 vue lac', views: 300, contacts: 5, visits: 2 }, { title: 'Studio sans visite', views: 0, contacts: 0, visits: 0 }] } }]);
  if (u.endsWith('/rpc/zfind_partner_recipients')) return reply(200, ['agence@example.fr']);
  if (u.includes('/zfind_partner_stats_reports')) return reply(201, null);
  if (u === 'https://api.resend.com/emails') return reply(200, { id: 'em_1' });
  return reply(404, {});
};

(async () => {
  console.log('\n=== Z FIND PARTNER STATS ===');
  process.env.SUPABASE_ANON_KEY = 'sb_publishable_test';
  process.env.ZFIND_SUPABASE_SERVICE_KEY = 'sb_secret_test';
  process.env.RESEND_API_KEY = 're_test'; process.env.ZFIND_EMAIL_FROM = 'Z Find <hello@zfind.online>';
  const annonce = require(path.join(WEB, 'api', 'annonce.js'))._internals;
  const id = '44444444-4444-4444-4444-444444444444';
  const html = annonce.withViewBeacon('<html><body><main>x</main></body></html>', id);
  check('page d’annonce : une vue comptée par le navigateur (clé publique, RPC zfind_record_listing_view)', html.includes('/rest/v1/rpc/zfind_record_listing_view') && html.includes('sb_publishable_test') && html.includes(`p_listing_id:'${id}'`));
  check('une seule vue par annonce et par onglet, robots exclus', html.includes(`zf-view-${id}`) && html.includes('navigator.webdriver'));
  check('aucune clé serveur dans la page', !html.includes('sb_secret_test'));
  check('identifiant invalide : page inchangée', annonce.withViewBeacon('<body></body>', 'x') === '<body></body>');
  check('l’annonce normalisée porte l’id de l’annonce', /listingId: listing\.id/.test(fs.readFileSync(path.join(WEB, 'api', 'annonce.js'), 'utf8')));
  const app = fs.readFileSync(path.join(WEB, 'src', 'app.js'), 'utf8');
  check('site : vue comptée sur les fiches bien et programme', (app.match(/recordListingView\(vm\.listing\.id\)/g) || []).length === 2 && app.includes("rpc('zfind_record_listing_view'"));

  const cron = require(path.join(WEB, 'api', 'cron-daily.js'))._internals;
  check('mois précédent : le 1er novembre → octobre', cron.previousMonth(Date.UTC(2026, 10, 1, 6)) === '2026-10-01' && cron.previousMonth(Date.UTC(2027, 0, 1)) === '2026-12-01');
  const report = await cron.sendMonthlyStats(Date.UTC(2026, 10, 1, 6));
  const mail = calls.find(c => c.url === 'https://api.resend.com/emails');
  check('bilan mensuel envoyé à l’agence', report.sent === 1 && mail && mail.body.to[0] === 'agence@example.fr');
  check('bilan : mois, vues, contacts, visites et annonces vues', /octobre 2026/.test(mail.body.subject) && /515/.test(mail.body.text) && /T3 vue lac/.test(mail.body.html) && !/Studio sans visite/.test(mail.body.html));
  check('bilan marqué envoyé (une fois par mois et par agence)', calls.some(c => c.url.includes('/zfind_partner_stats_reports') && c.method === 'POST' && c.body.month === '2026-10-01'));
  const cronSrc = fs.readFileSync(path.join(WEB, 'api', 'cron-daily.js'), 'utf8');
  check('cron : le 1er du mois (ou force=monthly)', /getUTCDate\(\) === 1 \|\| \(options && options\.force === 'monthly'\)/.test(cronSrc));

  const sql = fs.readFileSync(path.join(ROOT, 'infrastructure', 'supabase', 'migrations', '20261029180000_z_find_partner_stats_v1.sql'), 'utf8');
  check('migration : vues par jour sans donnée visiteur, illisibles côté client', /create table if not exists public\.zfind_listing_view_days/.test(sql) && /revoke all on public\.zfind_listing_view_days from public, anon, authenticated/.test(sql) && !/ip_address|user_agent/i.test(sql));
  check('migration : seules les annonces publiées sont comptées', /l\.status = 'published'\) then return/.test(sql));
  check('migration : statistiques de l’agence connectée seulement, bilan réservé au serveur',
    /grant execute on function public\.zfind_partner_stats\(integer\) to authenticated/.test(sql) && /role = 'partner_user'/.test(sql)
    && /revoke all on function public\.zfind_partner_stats_range\(uuid, date, date\) from public, anon, authenticated/.test(sql)
    && /revoke all on function public\.zfind_pending_monthly_stats\(date\) from public, anon, authenticated/.test(sql));

  const body = fs.readFileSync(path.join(PARTNER, 'src', 'body.html'), 'utf8');
  const build = fs.readFileSync(path.join(PARTNER, 'scripts', 'build.js'), 'utf8');
  check('espace Partner : onglet « Statistiques » dans chaque menu, vue dédiée, stats.js construit',
    (body.match(/showStatsView\(\)">Statistiques/g) || []).length >= 8 && body.includes('id="view-stats"') && build.includes("readPartner('stats.js')"));

  console.log(`\nPARTNER STATS: ${passed}/${passed} PASSED`);
})().catch(e => { console.error('FAIL:', e && e.message); process.exit(1); });
