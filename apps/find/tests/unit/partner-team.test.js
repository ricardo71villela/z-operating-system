/* Contract: équipe d'une agence — invitations par e-mail, acceptation, retrait.
   Sans réseau : Supabase REST et Resend sont simulés. */
'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const PARTNER = path.join(__dirname, '..', '..', 'apps', 'zfind-partner');
const ROOT = path.join(__dirname, '..', '..', '..', '..');

let passed = 0;
function check(label, value) { assert(value, label); passed += 1; console.log('PASS:', label); }

const TOKEN = '12345678-1234-4234-8234-123456789012';
const calls = [];
let mailFails = false;
global.fetch = async (url, opts) => {
  const o = opts || {};
  const u = String(url);
  const body = o.body ? JSON.parse(o.body) : null;
  calls.push({ url: u, body });
  const reply = (status, data) => ({ ok: status < 400, status, text: async () => JSON.stringify(data), json: async () => data });
  if (u.endsWith('/rpc/zfind_pending_team_invitations')) return reply(200, [{ id: 'inv-1', email: 'claire@agence.fr', token: TOKEN, partner_name: 'Agence du Lac', inviter_email: 'ricardo@agence.fr', expires_at: '2026-11-12T10:00:00Z' }]);
  if (u.endsWith('/rpc/zfind_mark_team_invitation')) return reply(204, null);
  if (u === 'https://api.resend.com/emails') return mailFails ? reply(500, { message: 'down' }) : reply(200, { id: 'em_1' });
  return reply(200, []);
};

(async () => {
  console.log('\n=== Z FIND PARTNER TEAM ===');
  process.env.ZFIND_SUPABASE_SERVICE_KEY = 'sb_secret_test';
  process.env.RESEND_API_KEY = 're_test'; process.env.ZFIND_EMAIL_FROM = 'Z Find <hello@zfind.online>';
  const notify = require(path.join(WEB, 'api', 'lead-notify.js'))._internals;

  const m = notify.teamInviteEmail({ email: 'claire@agence.fr', token: TOKEN, partner_name: 'Agence du Lac', inviter_email: 'ricardo@agence.fr', expires_at: '2026-11-12T10:00:00Z' });
  check('e-mail d’invitation : destinataire, agence, personne qui invite', m.to[0] === 'claire@agence.fr' && /Agence du Lac/.test(m.subject) && /ricardo@agence\.fr vous invite/.test(m.text));
  check('lien vers l’espace Partner avec le jeton', m.html.includes(`https://partner.zfind.online/#invitation=${TOKEN}`) && m.text.includes(`#invitation=${TOKEN}`));
  check('date de validité indiquée', /12 novembre 2026/.test(m.text));

  let r = await notify.processTeamInvitations(10);
  const mark = calls.filter(c => c.url.endsWith('/rpc/zfind_mark_team_invitation'));
  check('invitation envoyée et marquée envoyée', r.sent === 1 && mark.length === 1 && mark[0].body.p_sent === true && mark[0].body.p_id === 'inv-1');
  calls.length = 0; mailFails = true;
  r = await notify.processTeamInvitations(10);
  const mark2 = calls.filter(c => c.url.endsWith('/rpc/zfind_mark_team_invitation'));
  check('échec d’envoi : tentative comptée, renvoyée plus tard', r.sent === 0 && mark2.length === 1 && mark2[0].body.p_sent === false);

  const leadNotifySrc = fs.readFileSync(path.join(WEB, 'api', 'lead-notify.js'), 'utf8');
  const cronSrc = fs.readFileSync(path.join(WEB, 'api', 'cron-daily.js'), 'utf8');
  check('envoi immédiat (appel de l’espace Partner) et rattrapage quotidien', /processTeamInvitations\(10\)/.test(leadNotifySrc) && /processTeamInvitations\(100\)/.test(cronSrc));

  const sql = fs.readFileSync(path.join(ROOT, 'infrastructure', 'supabase', 'migrations', '20261029190000_z_find_partner_team_v1.sql'), 'utf8');
  check('migration : invitations illisibles côté navigateur', /revoke all on public\.zfind_partner_invitations from public, anon, authenticated/.test(sql));
  check('migration : seul le responsable invite, annule ou retire ; jamais lui-même', (sql.match(/not v_ctx\.is_owner/g) || []).length >= 3 && /Le responsable ne peut pas se retirer lui-même/.test(sql));
  check('migration : l’invitation n’est acceptée qu’avec la même adresse e-mail, jamais par un admin ni par une autre agence',
    /invitation_other_email/.test(sql) && /invitation_admin_account/.test(sql) && /invitation_other_agency/.test(sql) && /expires_at <= now\(\)/.test(sql));
  check('migration : envoi réservé au serveur', /revoke all on function public\.zfind_pending_team_invitations\(integer\) from public, anon, authenticated/.test(sql) && /grant execute on function public\.zfind_pending_team_invitations\(integer\) to service_role/.test(sql));
  check('migration : limites (50 membres, 20 invitations en attente, 14 jours)', />= 50/.test(sql) && />= 20/.test(sql) && /interval '14 days'/.test(sql));

  const app = fs.readFileSync(path.join(PARTNER, 'src', 'app.js'), 'utf8');
  const body = fs.readFileSync(path.join(PARTNER, 'src', 'body.html'), 'utf8');
  const build = fs.readFileSync(path.join(PARTNER, 'scripts', 'build.js'), 'utf8');
  check('espace Partner : invitation lue au démarrage et acceptée avant l’entrée', /pteamOnBoot\(\)/.test(app) && /await pteamAcceptPending\(\)/.test(app));
  check('espace Partner : onglet « Équipe » dans chaque menu, vue dédiée, team.js construit', (body.match(/showTeamView\(\)">Équipe/g) || []).length >= 9 && body.includes('id="view-team"') && build.includes("readPartner('team.js')"));
  const team = fs.readFileSync(path.join(PARTNER, 'src', 'team.js'), 'utf8');
  check('création de l’accès : le jeton suit le compte pendant la confirmation de l’e-mail', /zfind_team_invite: token/.test(team) && /emailRedirectTo: `\$\{window\.location\.origin\}\/#invitation=\$\{token\}`/.test(team));

  console.log(`\nPARTNER TEAM: ${passed}/${passed} PASSED`);
})().catch(e => { console.error('FAIL:', e && e.message); process.exit(1); });
