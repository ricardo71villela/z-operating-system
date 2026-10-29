/* ============================================================
   Z FIND — GET /fr/agences-immobilieres/{slug}-{insee}  (→ /api/agences?p=...)
            GET /sitemap-agences.xml                     (→ /api/agences?sitemap=1)

   Annuaire des agences immobilières d'une commune, rendu par
   _lib/agences-pages.js. Lit les vues serveur zfind_agency_directory et
   zfind_agency_commune_counts (migration 20261029120000) ; tant qu'elles
   n'existent pas, la table zfind_agencias avec les mêmes filtres.
   Mise en cache par le CDN (1 jour, puis révalidation).
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const S = require('./_lib/server');
const P = require('./_lib/prix-pages');
const H = require('./_lib/immobilier-pages');
const AG = require('./_lib/agences-pages');

const DATA_DIR = path.join(__dirname, '..', 'public', 'market-data', 'fr');
const cache = { index: null, deps: new Map(), counts: null, countsAt: 0 };
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
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

const COLS = 'id,commune_code,postcode,city,display_name,legal_name,type,network,address,registry_created';
const TABLE_FILTER = 'active=is.true&or=(is_natural_person.is.null,is_natural_person.is.false)&do_not_contact=not.is.true&type=in.(agency,network_agency)&activity_code=eq.68.31Z';

/* Nombre d'agences par commune (vue serveur), en mémoire 1 heure. null si indisponible. */
async function counts() {
  if (!S.configured(['db'])) return null;
  if (cache.counts && Date.now() - cache.countsAt < 3600e3) return cache.counts;
  try {
    // PostgREST renvoie au plus 1 000 lignes par requête : on pagine.
    const all = [];
    for (let offset = 0; offset < 20000; offset += 1000) {
      const rows = await withTimeout(S.db(`zfind_agency_commune_counts?select=commune_code,n&order=commune_code&limit=1000&offset=${offset}`), 4000) || [];
      all.push(...rows);
      if (rows.length < 1000) break;
    }
    cache.counts = new Map(all.map(r => [r.commune_code, Number(r.n) || 0]));
    cache.countsAt = Date.now();
    return cache.counts;
  } catch (_) { return null; }
}

async function agenciesOf(code) {
  if (!S.configured(['db'])) return [];
  try {
    return await withTimeout(S.db(`zfind_agency_directory?commune_code=eq.${code}&select=${COLS}&limit=1000`), 3000) || [];
  } catch (e) {
    if (!(e && e.status >= 400 && e.status < 500)) return [];
    try {
      const rows = await withTimeout(S.db(`zfind_agencias?commune_code=eq.${code}&${TABLE_FILTER}&select=id,commune_code,postcode,city,name,trade_name,type,network,address,registry_created&limit=1000`), 3000) || [];
      return rows.map(r => Object.assign({}, r, { display_name: (r.trade_name && String(r.trade_name).trim()) || r.name, legal_name: r.name }));
    } catch (_) { return []; }
  }
}

function send(res, status, body, type, cacheable) {
  res.statusCode = status;
  res.setHeader('Content-Type', type || 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cacheable ? 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800' : 'no-store');
  res.end(body);
}
function redirect(res, location) { res.statusCode = 301; res.setHeader('Location', location); res.setHeader('Cache-Control', 'public, s-maxage=86400'); res.end(); }
function notFound(res, base) {
  res.setHeader('X-Robots-Tag', 'noindex');
  send(res, 404, `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page introuvable — Z Find</title></head><body style="font-family:system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:0 24px"><h1>Page introuvable</h1><p>Cette commune n’existe pas dans nos données.</p><p><a href="${base}${P.ROOT_PATH}">Prix de l’immobilier en France →</a></p></body></html>`, null, false);
}

function allCommunes() {
  const out = new Map();
  for (const code of Object.keys(index().departments)) {
    const f = depFile(code);
    for (const c of (f && f.communes) || []) out.set(c.c, c);
  }
  return out;
}

async function sitemap(res, base) {
  const byCode = allCommunes();
  const keep = new Map();
  for (const [code, c] of byCode) if (H.isTier1(code)) keep.set(code, c);
  const n = await counts();
  if (n) for (const [code, v] of n) if (v >= AG.MIN_AGENCIES && byCode.has(code)) keep.set(code, byCode.get(code));
  const urls = [...keep.values()].sort((x, y) => x.c.localeCompare(y.c)).map(c => `  <url><loc>${P.esc(base + AG.agencesPath(c))}</loc></url>`);
  return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`, 'application/xml; charset=utf-8', true);
}

async function handler(req, res) {
  const base = S.siteUrl();
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); return res.end(); }
  const q = S.queryOf(req);
  if (q.sitemap) return sitemap(res, base);
  const route = AG.parsePath(q.p);
  if (!route) return notFound(res, base);
  const idx = index();
  const depCode = P.depOfCommune(route.code);
  const d = idx.departments[depCode];
  const file = d && depFile(depCode);
  const commune = file && (file.communes || []).find(c => c.c === route.code);
  if (!commune) return notFound(res, base);
  const canonical = AG.agencesPath(commune);
  const asked = AG.ROOT + '/' + String(q.p).toLowerCase().split('/').filter(Boolean).filter(x => x !== 'fr' && x !== 'agences-immobilieres').join('/');
  if (asked !== canonical) return redirect(res, base + canonical);

  const department = Object.assign({ code: depCode }, d);
  const prefix = P.BIG_CITY_PREFIX[commune.c];
  const cityCode = P.cityOfArrondissement(commune.c);
  const city = cityCode ? (file.communes || []).find(c => c.c === cityCode) || null : null;
  const n = await counts();
  let agencies = [];
  let arrondissements = null;
  let total = null;
  if (prefix) {
    arrondissements = (file.communes || []).filter(c => c.c !== commune.c && c.c.startsWith(prefix)).sort((x, y) => x.c.localeCompare(y.c))
      .map(c => ({ commune: c, n: n ? (n.get(c.c) || 0) : null }));
    if (n) total = arrondissements.reduce((s, a) => s + a.n, 0) + (n.get(commune.c) || 0);
  } else {
    agencies = await agenciesOf(commune.c);
    total = n && n.get(commune.c) > agencies.length ? n.get(commune.c) : agencies.length;
  }
  const pool = (file.communes || []).filter(c => !(P.BIG_CITY_PREFIX[c.c]) && !(cityCode && c.c.startsWith(P.BIG_CITY_PREFIX[cityCode])));
  let neighbours = P.neighboursOf(commune, pool, 40);
  if (n) neighbours = neighbours.filter(c => (n.get(c.c) || 0) >= AG.MIN_AGENCIES);
  const out = AG.render({ base, commune, department, region: P.regionOfDepartment(idx, depCode), city, agencies, total, arrondissements, neighbours: neighbours.slice(0, 12), today: new Date() });
  if (!out.indexable) res.setHeader('X-Robots-Tag', 'noindex');
  return send(res, 200, out.html, null, true);
}

module.exports = handler;
module.exports._internals = { counts, agenciesOf };
