/* Contract: /api/prospection-optout — the "stop receiving" link of the ZOS
   prospecting e-mails. No network: Supabase REST is replaced by a fake. */
'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { EventEmitter } = require('events');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const ROOT = path.join(__dirname, '..', '..', '..', '..');

let passed = 0;
function check(label, value) {
  assert(value, label);
  passed += 1;
  console.log('PASS:', label);
}

const calls = [];
let rpcReply = { ok: true, already: false };
global.fetch = async (url, opts) => {
  const o = opts || {};
  calls.push({ method: o.method || 'GET', url: String(url), body: o.body ? JSON.parse(o.body) : null, headers: o.headers || {} });
  return { ok: true, status: 200, text: async () => JSON.stringify(rpcReply), json: async () => rpcReply };
};

function req(method, { body, query, headers } = {}) {
  const r = new EventEmitter();
  r.method = method;
  r.headers = Object.assign({ 'x-forwarded-for': `10.2.0.${Math.floor(Math.random() * 250)}` }, headers || {});
  r.body = body;
  r.query = query || {};
  r.url = '/api/prospection-optout';
  return r;
}
function res() {
  return { statusCode: 0, headers: {}, raw: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.raw = b || ''; } };
}

const TOKEN = '11111111-2222-4333-8444-555555555555';

(async () => {
  console.log('\n=== Z FIND PROSPECTION OPT-OUT ===');

  delete process.env.ZFIND_SUPABASE_SERVICE_KEY;
  const handler = require(path.join(WEB, 'api', 'prospection-optout.js'));
  let r = res();
  await handler(req('GET', { query: { t: TOKEN } }), r);
  check('sans clé serveur : page 503, rien n’est appelé', r.statusCode === 503 && calls.length === 0);

  process.env.ZFIND_SUPABASE_SERVICE_KEY = 'sb_secret_test';
  process.env.SITE_BASE_URL = 'https://zfind.online';

  r = res();
  await handler(req('GET', { query: { t: TOKEN } }), r);
  check('GET : page avec bouton, aucune écriture (les antivirus ouvrent les liens)',
    r.statusCode === 200 && /Ne plus recevoir/.test(r.raw) && /<form method="post"/.test(r.raw) && calls.length === 0);
  check('page non indexée et non mise en cache', r.headers['x-robots-tag'] === 'noindex' && r.headers['cache-control'] === 'no-store');

  r = res();
  await handler(req('GET', { query: { t: 'pas-un-jeton' } }), r);
  check('jeton invalide : 404, rien n’est appelé', r.statusCode === 404 && calls.length === 0);

  r = res();
  await handler(req('GET', { query: { t: '<script>' } }), r);
  check('aucune injection dans la page', !/<script>/.test(r.raw));

  r = res();
  await handler(req('POST', { query: { t: TOKEN }, body: 'List-Unsubscribe=One-Click', headers: { 'content-type': 'application/x-www-form-urlencoded' } }), r);
  const rpc = calls.find(c => /rest\/v1\/rpc\/zos_outreach_opt_out$/.test(c.url));
  check('POST one-click (RFC 8058) : appelle zos_outreach_opt_out avec le jeton', r.statusCode === 200 && rpc && rpc.method === 'POST' && rpc.body.p_token === TOKEN);
  check('clé secrète envoyée seulement dans apikey (pas de Bearer pour sb_secret_)', rpc.headers.apikey === 'sb_secret_test' && !rpc.headers.Authorization);
  check('page de confirmation', /C’est fait/.test(r.raw));

  calls.length = 0;
  r = res();
  await handler(req('POST', { body: `t=${TOKEN}`, headers: { 'content-type': 'application/x-www-form-urlencoded' } }), r);
  check('POST du formulaire (jeton dans le corps) : désinscrit', r.statusCode === 200 && calls.length === 1 && calls[0].body.p_token === TOKEN);

  rpcReply = { ok: false, error: 'not_found' };
  r = res();
  await handler(req('POST', { query: { t: TOKEN }, body: {} }), r);
  check('jeton inconnu en base : 404 avec la solution « répondez STOP »', r.statusCode === 404 && /STOP/.test(r.raw));

  r = res();
  await handler(req('DELETE', { query: { t: TOKEN } }), r);
  check('autres méthodes refusées', r.statusCode === 405);

  const vercel = JSON.parse(fs.readFileSync(path.join(WEB, 'vercel.json'), 'utf8'));
  check('route déclarée dans vercel.json', vercel.rewrites.some(x => x.source === '/api/prospection-optout'));

  const migration = fs.readFileSync(path.join(ROOT, 'infrastructure', 'supabase', 'migrations', '20261024100000_zos_prospection_outreach_v1.sql'), 'utf8');
  check('la fonction n’est exécutable que par le rôle serveur',
    /revoke all on function public\.zos_outreach_opt_out\(uuid\) from public, anon, authenticated/.test(migration)
    && /grant execute on function public\.zos_outreach_opt_out\(uuid\) to service_role/.test(migration));

  console.log(`\nPROSPECTION OPT-OUT: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
