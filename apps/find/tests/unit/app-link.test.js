/* Contract: ouvrir Z Desk et Z Studio depuis l'espace Partner, sans nouvelle
   connexion (/api/billing/app-link). Sans réseau : Supabase est simulé. */
'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { EventEmitter } = require('events');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const APPS = path.join(__dirname, '..', '..', 'apps');
const ROOT = path.join(__dirname, '..', '..', '..', '..');

let passed = 0;
function check(label, value) { assert(value, label); passed += 1; console.log('PASS:', label); }

const PARTNER = '11111111-2222-4333-8444-555555555555';
const USER = '99999999-8888-4777-8666-555555555555';
const HASH = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
const state = { partnerStatus: 'active', linkStatus: 200, role: 'partner_user' };
const calls = [];
function reply(status, body) { return { ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body }; }

global.fetch = async (url, opts) => {
  const o = opts || {};
  const u = String(url);
  calls.push({ url: u, method: o.method || 'GET', headers: o.headers || {}, body: o.body });
  if (u.endsWith('/auth/v1/user')) return /Bearer good/.test(o.headers.Authorization) ? reply(200, { id: USER, email: 'Claire@Agence.fr' }) : reply(401, {});
  if (u.endsWith('/auth/v1/admin/generate_link')) {
    return state.linkStatus === 200
      ? reply(200, { id: USER, email: 'claire@agence.fr', action_link: 'https://x/verify?token=secret', email_otp: '123456', hashed_token: HASH, verification_type: 'magiclink', redirect_to: 'https://zfind.online' })
      : reply(state.linkStatus, { msg: 'down' });
  }
  if (u.includes('/rest/v1/profiles')) return reply(200, [{ partner_id: PARTNER, role: state.role }]);
  if (u.includes('/rest/v1/partners')) return reply(200, [{ status: state.partnerStatus }]);
  return reply(404, {});
};

function req(method, route, { body, headers } = {}) {
  const r = new EventEmitter();
  r.method = method;
  r.headers = Object.assign({ 'x-forwarded-for': `10.7.0.${Math.floor(Math.random() * 250)}`, origin: 'https://partner.zfind.online' }, headers || {});
  r.query = { route };
  r.url = `/api/billing/${route}`;
  r.body = body;
  return r;
}
function res() { return { statusCode: 0, headers: {}, raw: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.raw = b || ''; }, get json() { return JSON.parse(this.raw || '{}'); } }; }
const AUTH = { authorization: 'Bearer good' };

(async () => {
  console.log('\n=== Z FIND → Z DESK / Z STUDIO (app-link) ===');
  process.env.ZFIND_SUPABASE_SERVICE_KEY = 'sb_secret_test';
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.ZFIND_DESK_URL;
  delete process.env.ZFIND_STUDIO_URL;
  const handler = require(path.join(WEB, 'api', 'billing.js'));

  let r = res();
  await handler(req('POST', 'app-link', { headers: AUTH, body: { app: 'desk' } }), r);
  check('Z Desk : lien prêt sans clé Stripe', r.statusCode === 200 && r.json.ok === true);
  const desk = new URL(r.json.url);
  check('Z Desk : desk.zfind.online, écran de connexion, retour sur « Demandes »', desk.origin === 'https://desk.zfind.online' && desk.pathname === '/fr/login' && desk.searchParams.get('next') === '/fr/requests');
  check('le jeton est dans le fragment (#), jamais dans la requête', /^#zos_link=/.test(desk.hash) && !desk.search.includes(HASH) && desk.hash.includes(HASH));
  check('ni le lien e-mail ni le code ne sont renvoyés', !r.raw.includes('secret') && !r.raw.includes('123456'));
  const gen = calls.find(c => c.url.endsWith('/auth/v1/admin/generate_link'));
  const genBody = JSON.parse(gen.body);
  check('lien magique pour l’e-mail du compte connecté (minuscules), aucun e-mail envoyé', genBody.type === 'magiclink' && genBody.email === 'claire@agence.fr');
  check('clé sb_secret_ : en-tête apikey seulement', gen.headers.apikey === 'sb_secret_test' && !gen.headers.Authorization);

  r = res();
  await handler(req('POST', 'app-link', { headers: AUTH, body: { app: 'studio' } }), r);
  const studio = new URL(r.json.url);
  check('Z Studio : adresse actuelle, même fragment', studio.origin === 'https://z-studio-web.vercel.app' && /zos_link=/.test(studio.hash));
  process.env.ZFIND_STUDIO_URL = 'https://studio.zfind.online/';
  r = res();
  await handler(req('POST', 'app-link', { headers: AUTH, body: { app: 'studio' } }), r);
  check('Z Studio : adresse réglable (ZFIND_STUDIO_URL)', new URL(r.json.url).origin === 'https://studio.zfind.online');
  process.env.ZFIND_STUDIO_URL = 'javascript:alert(1)';
  r = res();
  await handler(req('POST', 'app-link', { headers: AUTH, body: { app: 'studio' } }), r);
  check('adresse invalide : repli sur l’adresse connue', new URL(r.json.url).origin === 'https://z-studio-web.vercel.app');
  delete process.env.ZFIND_STUDIO_URL;

  r = res();
  await handler(req('POST', 'app-link', { headers: AUTH, body: { app: 'autre' } }), r);
  check('app inconnue : 400', r.statusCode === 400);
  r = res();
  await handler(req('POST', 'app-link', { headers: { authorization: 'Bearer bad' }, body: { app: 'desk' } }), r);
  check('sans session valide : 401', r.statusCode === 401);
  r = res();
  await handler(req('GET', 'app-link', { headers: AUTH }), r);
  check('GET refusé : 405', r.statusCode === 405);
  state.partnerStatus = 'pending';
  r = res();
  await handler(req('POST', 'app-link', { headers: AUTH, body: { app: 'desk' } }), r);
  check('agence pas encore validée : 403 partner_not_active', r.statusCode === 403 && r.json.error === 'partner_not_active');
  state.partnerStatus = 'active';
  state.role = 'admin';
  r = res();
  await handler(req('POST', 'app-link', { headers: AUTH, body: { app: 'desk' } }), r);
  check('compte admin (pas agence) : 401', r.statusCode === 401);
  state.role = 'partner_user';
  state.linkStatus = 500;
  r = res();
  await handler(req('POST', 'app-link', { headers: AUTH, body: { app: 'desk' } }), r);
  check('Supabase indisponible : 502 sans détail', r.statusCode === 502 && r.json.error === 'server');
  state.linkStatus = 200;

  // ---------- les apps qui reçoivent le lien
  const deskLogin = fs.readFileSync(path.join(ROOT, 'apps', 'desk', 'src', 'app', '[locale]', 'login', 'login-client.tsx'), 'utf8');
  check('Z Desk : échange #zos_link contre sa propre session (verifyOtp token_hash)', /zos_link/.test(deskLogin) && /verifyOtp\(\{ token_hash: tokenHash, type \}\)/.test(deskLogin));
  check('Z Desk : fragment retiré de l’adresse avant l’échange', deskLogin.indexOf('replaceState') > -1 && deskLogin.indexOf('replaceState') < deskLogin.indexOf('verifyOtp({ token_hash'));
  const fr = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', 'desk', 'src', 'messages', 'fr.json'), 'utf8'));
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', 'desk', 'src', 'messages', 'en.json'), 'utf8'));
  check('Z Desk : textes FR et EN (ouverture, lien expiré)', fr.Login.opening && fr.Login.linkExpired && en.Login.opening && en.Login.linkExpired);
  const studioSrc = fs.readFileSync(path.join(ROOT, 'apps', 'studio', 'src', 'platform', 'auth.js'), 'utf8');
  const studioApp = fs.readFileSync(path.join(ROOT, 'apps', 'studio', 'app', 'my-studio.html'), 'utf8');
  check('Z Studio : source et app construite acceptent #zos_link', /zstudioReadHandoff/.test(studioSrc) && /zstudioReadHandoff/.test(studioApp) && /verifyOtp\(\{ token_hash: handoff\.tokenHash/.test(studioApp));

  // ---------- espace Partner
  const appsJs = fs.readFileSync(path.join(APPS, 'zfind-partner', 'src', 'apps.js'), 'utf8');
  const build = fs.readFileSync(path.join(APPS, 'zfind-partner', 'scripts', 'build.js'), 'utf8');
  const app = fs.readFileSync(path.join(APPS, 'zfind-partner', 'src', 'app.js'), 'utf8');
  check('Partner : boutons Z Desk et Z Studio, montés à l’entrée dans l’espace', /Z Desk/.test(appsJs) && /Z Studio/.test(appsJs) && /pappsMount\(\)/.test(app) && /appsJs \+/.test(build));
  check('Partner : onglet ouvert au clic (pas de blocage pop-up), sans opener', /window\.open\('', '_blank'\)/.test(appsJs) && /opener = null/.test(appsJs));
  check('vercel.json : toujours 12 fonctions au plus', fs.readdirSync(path.join(WEB, 'api')).filter(f => f.endsWith('.js')).length <= 12);

  console.log(`\n${passed} checks passed.`);
})().catch(err => { console.error('FAIL:', err.message); process.exit(1); });
