/* ============================================================
   Z FIND — GET /fr/prix-immobilier/... (réécrit vers /api/prix-immobilier?p=...)

   Pages publiques et indexables « Prix de l'immobilier » (France) :
   pays, département, commune. Rendu par _lib/prix-pages.js à partir des
   médianes DVF de public/market-data/fr (fichiers inclus dans la
   fonction). Mises en cache par le CDN (1 jour, puis révalidation).

   Le nombre d'agences de la commune vient de zfind_agencias (clé serveur) ;
   sans clé ou en cas d'erreur, la page s'affiche sans ce chiffre.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const S = require('./_lib/server');
const P = require('./_lib/prix-pages');
const BL = require('./_lib/prix-pages-be-lu');

const DATA_ROOT = path.join(__dirname, '..', 'public', 'market-data');
const DATA_DIR = path.join(DATA_ROOT, 'fr');
const cache = { index: null, deps: new Map(), agencies: new Map(), be: null, lu: null };
function countryData(cc) {
  if (!cache[cc]) cache[cc] = JSON.parse(fs.readFileSync(path.join(DATA_ROOT, cc, 'index.json'), 'utf8'));
  return cache[cc];
}

function readJson(file) { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); }
function index() { if (!cache.index) cache.index = readJson('index.json'); return cache.index; }
function depFile(code) {
  if (!/^(2A|2B|\d{2}|97[1-6])$/.test(code)) return null;
  if (!cache.deps.has(code)) {
    let data = null;
    try { data = readJson(`dep/${code}.json`); } catch (_) { data = null; }
    cache.deps.set(code, data);
  }
  return cache.deps.get(code);
}

async function agencyCount(code) {
  if (!S.configured(['db'])) return 0;
  if (cache.agencies.has(code)) return cache.agencies.get(code);
  const prefix = P.BIG_CITY_PREFIX[code];
  const where = prefix ? `commune_code=like.${prefix}*` : `commune_code=eq.${code}`;
  let n = 0;
  try {
    const rows = await Promise.race([
      S.db(`zfind_agencias?select=id&${where}&active=is.true&type=in.(agency,network_agency)&limit=3000`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500))
    ]);
    n = Array.isArray(rows) ? rows.length : 0;
  } catch (_) { n = 0; }
  cache.agencies.set(code, n);
  return n;
}

function send(res, status, html, cacheable) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cacheable ? 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800' : 'no-store');
  res.end(html);
}
function redirect(res, location) {
  res.statusCode = 301;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'public, s-maxage=86400');
  res.end();
}
function notFound(res, base) {
  res.setHeader('X-Robots-Tag', 'noindex');
  send(res, 404, `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page introuvable — Z Find</title></head><body style="font-family:system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:0 24px"><h1>Page introuvable</h1><p>Cette page de prix n’existe pas.</p><p><a href="${base}${P.ROOT_PATH}">Prix de l’immobilier en France →</a></p></body></html>`, false);
}

async function handler(req, res) {
  const base = S.siteUrl();
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); return res.end(); }
  const q = S.queryOf(req);
  const parts = String(q.p || '').toLowerCase().split('/').filter(Boolean);
  if (parts[0] === 'belgique' || parts[0] === 'luxembourg') {
    const out = BL.route(parts, { base, be: parts[0] === 'belgique' ? countryData('be') : null, lu: parts[0] === 'luxembourg' ? countryData('lu') : null, today: new Date() });
    if (!out) return notFound(res, base);
    if (out.redirect) return redirect(res, base + out.redirect);
    return send(res, 200, out.html, true);
  }
  const route = P.parsePath(q.p);
  const idx = index();
  if (route.kind === 'root') return redirect(res, base + P.ROOT_PATH);
  if (route.kind === 'country') return send(res, 200, P.renderCountry({ base, index: idx }), true);
  if (route.kind === 'department') {
    const d = idx.departments[route.code];
    const file = d && depFile(route.code);
    if (!file) return notFound(res, base);
    const canonical = P.depPath(route.code, d.name);
    if (`${P.ROOT_PATH}/${String(q.p).toLowerCase().split('/').filter(Boolean).pop()}` !== canonical) return redirect(res, base + canonical);
    return send(res, 200, P.renderDepartment({ base, department: Object.assign({ code: route.code }, d), communes: file.communes || [], national: idx.national }), true);
  }
  if (route.kind === 'commune') {
    const depCode = P.depOfCommune(route.code);
    const d = idx.departments[depCode];
    const file = d && depFile(depCode);
    const commune = file && (file.communes || []).find(c => c.c === route.code);
    if (!commune) return notFound(res, base);
    const canonical = P.communePath(commune);
    if (`${P.ROOT_PATH}/${String(q.p).toLowerCase().split('/').filter(Boolean).pop()}` !== canonical) return redirect(res, base + canonical);
    const agencies = await agencyCount(commune.c);
    return send(res, 200, P.renderCommune({
      base, commune, department: Object.assign({ code: depCode }, d), national: idx.national,
      neighbours: P.neighboursOf(commune, file.communes || [], 15), agencies, today: new Date()
    }), true);
  }
  return notFound(res, base);
}

module.exports = handler;
module.exports._internals = { agencyCount, depFile, index };
