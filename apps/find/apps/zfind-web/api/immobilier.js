/* ============================================================
   Z FIND — GET /fr/immobilier/... (réécrit vers /api/immobilier?p=...)
   et GET /sitemap-immobilier.xml (réécrit vers /api/immobilier?sitemap=1)

   Pages « Immobilier à {commune} » : annonces publiées de la commune,
   prix médians DVF, simulateurs au taux du département, agences.
   Rendu par _lib/immobilier-pages.js. Mises en cache par le CDN (1 heure,
   puis révalidation) : une nouvelle annonce apparaît dans l'heure.

   Les annonces viennent de la base avec la clé serveur ; sans clé ou en
   cas d'erreur, la page s'affiche sans annonces (jamais d'erreur 500).
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const S = require('./_lib/server');
const P = require('./_lib/prix-pages');
const H = require('./_lib/immobilier-pages');

let listingQuality = null;
try { listingQuality = require('../src/services/listing-quality.js'); } catch (_) { listingQuality = null; }

const DATA_DIR = path.join(__dirname, '..', 'public', 'market-data', 'fr');
const cache = { index: null, deps: new Map(), agencies: new Map() };
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

/* Code commune → filtre zones_lite (ville à arrondissements : tous ses arrondissements). */
function communeFilter(code) {
  const prefix = P.BIG_CITY_PREFIX[code];
  return prefix ? `commune_code=like.${prefix}*` : `commune_code=eq.${code}`;
}

async function agencyCount(code) {
  if (!S.configured(['db'])) return 0;
  if (cache.agencies.has(code)) return cache.agencies.get(code);
  let n = 0;
  try {
    const rows = await withTimeout(S.db(`zfind_agencias?select=id&${communeFilter(code)}&active=is.true&type=in.(agency,network_agency)&limit=3000`), 2500);
    n = Array.isArray(rows) ? rows.length : 0;
  } catch (_) { n = 0; }
  cache.agencies.set(code, n);
  return n;
}

/* Codes postaux d'un arrondissement de Paris, Lyon ou Marseille, sinon null.
   Paris 75116 → 75016 et 75116 ; Lyon 69386 → 69006 ; Marseille 13208 → 13008. */
function arrondissementPostcodes(code) {
  const c = String(code);
  if (/^751(0[1-9]|1\d|20)$/.test(c)) return c === '75116' ? ['75016', '75116'] : [`750${c.slice(3)}`];
  if (/^6938[1-9]$/.test(c)) return [`6900${c.slice(4)}`];
  if (/^132(0[1-9]|1[0-6])$/.test(c)) return [`130${c.slice(3)}`];
  return null;
}

/* Annonces publiées (biens) de la commune, normalisées pour le rendu. */
async function listingsFor(code) {
  if (!S.configured(['db'])) return [];
  const select = 'id,subtype,typology,area_sqm,bedrooms,zones_lite!inner(name,city,commune_code,country_iso),'
    + 'representations!inner(target_type,status,listings!inner(id,transaction_type,rental_period,price_current,currency_iso,status,listing_content(locale,title)))';
  // Les zones Z Find sont au niveau de la ville (Lyon = 69123) : un
  // arrondissement se reconnaît au code postal du bien (Lyon 6e = 69006).
  const cps = arrondissementPostcodes(code);
  const prefix = P.BIG_CITY_PREFIX[code];
  const zoneFilter = cps
    ? `postal_code=in.(${cps.join(',')})`
    : prefix ? `zones_lite.or=(${encodeURIComponent(`commune_code.eq.${code},commune_code.like.${prefix}*`)})` : `zones_lite.commune_code=eq.${code}`;
  try {
    const rows = await withTimeout(S.db(`properties?select=${encodeURIComponent(select)}&representations.target_type=eq.property&representations.listings.status=eq.published&${zoneFilter}&limit=500`), 3000);
    const publicRows = listingQuality && listingQuality.filterPublicRows ? listingQuality.filterPublicRows(rows || [], iso => ['FR', 'BE', 'LU'].includes(String(iso || '').toUpperCase())) : (rows || []);
    const out = [];
    for (const row of publicRows) {
      for (const rep of row.representations || []) {
        for (const l of rep.listings || []) {
          if (l.status !== 'published' || !(Number(l.price_current) > 0)) continue;
          const fr = (l.listing_content || []).find(c => c.locale === 'fr') || (l.listing_content || [])[0];
          if (!fr || !String(fr.title || '').trim()) continue;
          out.push({
            id: row.id, title: fr.title, price: Number(l.price_current), currency: l.currency_iso || 'EUR',
            transaction: l.transaction_type, rentalPeriod: l.rental_period, subtype: row.subtype,
            typology: row.typology, area: row.area_sqm ? Number(row.area_sqm) : null, bedrooms: row.bedrooms
          });
        }
      }
    }
    return out;
  } catch (_) {
    return [];
  }
}

/* Communes avec au moins MIN_LISTINGS annonces publiées (sitemap). */
async function communesWithListings() {
  if (!S.configured(['db'])) return new Map();
  try {
    const rows = await withTimeout(S.db(`properties?select=${encodeURIComponent('id,zones_lite!inner(commune_code),representations!inner(target_type,listings!inner(status))')}&representations.target_type=eq.property&representations.listings.status=eq.published&limit=50000`), 5000);
    const counts = new Map();
    for (const r of rows || []) {
      const c = r.zones_lite && r.zones_lite.commune_code;
      if (c) counts.set(c, (counts.get(c) || 0) + 1);
    }
    return counts;
  } catch (_) {
    return new Map();
  }
}

function send(res, status, body, type, cacheable) {
  res.statusCode = status;
  res.setHeader('Content-Type', type || 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cacheable ? 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400' : 'no-store');
  res.end(body);
}
function redirect(res, location) {
  res.statusCode = 301;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'public, s-maxage=86400');
  res.end();
}
function notFound(res, base) {
  res.setHeader('X-Robots-Tag', 'noindex');
  send(res, 404, `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page introuvable — Z Find</title></head><body style="font-family:system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:0 24px"><h1>Page introuvable</h1><p>Cette commune n’existe pas dans nos données.</p><p><a href="${base}${P.ROOT_PATH}">Prix de l’immobilier en France →</a></p></body></html>`, null, false);
}

async function sitemap(res, base) {
  const idx = index();
  const files = {};
  for (const code of Object.keys(idx.departments)) files[code] = depFile(code);
  const byCode = new Map();
  for (const c of H.tier1Communes(files)) byCode.set(c.c, c);
  const counts = await communesWithListings();
  for (const [code, n] of counts) {
    const city = Object.keys(P.BIG_CITY_PREFIX).find(k => code.startsWith(P.BIG_CITY_PREFIX[k]));
    for (const target of [code].concat(city ? [city] : [])) {
      if (byCode.has(target)) continue;
      const total = target === code ? n : [...counts].filter(([k]) => k.startsWith(P.BIG_CITY_PREFIX[target])).reduce((s, [, v]) => s + v, 0);
      if (total < H.MIN_LISTINGS) continue;
      const f = files[P.depOfCommune(target)];
      const c = f && (f.communes || []).find(x => x.c === target);
      if (c) byCode.set(target, c);
    }
  }
  const urls = [...byCode.values()].map(c => `  <url><loc>${P.esc(base + H.hubPath(c))}</loc></url>`);
  return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`, 'application/xml; charset=utf-8', true);
}

async function handler(req, res) {
  const base = S.siteUrl();
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); return res.end(); }
  const q = S.queryOf(req);
  if (q.sitemap) return sitemap(res, base);
  const route = H.parsePath(q.p);
  if (!route) return notFound(res, base);
  const idx = index();
  const depCode = P.depOfCommune(route.code);
  const d = idx.departments[depCode];
  const file = d && depFile(depCode);
  const commune = file && (file.communes || []).find(c => c.c === route.code);
  if (!commune) return notFound(res, base);
  const canonical = route.type ? H.typePath(commune, route.type) : H.hubPath(commune);
  const asked = '/fr/immobilier/' + String(q.p).toLowerCase().split('/').filter(Boolean).filter(x => x !== 'fr' && x !== 'immobilier').join('/');
  if (asked !== canonical) return redirect(res, base + canonical);

  const department = Object.assign({ code: depCode }, d);
  const cityCode = P.cityOfArrondissement(commune.c);
  const city = cityCode ? (file.communes || []).find(c => c.c === cityCode) || null : null;
  const parentCode = cityCode || (P.BIG_CITY_PREFIX[commune.c] ? commune.c : null);
  const arrondissements = parentCode
    ? (file.communes || []).filter(c => c.c !== parentCode && c.c.startsWith(P.BIG_CITY_PREFIX[parentCode])).sort((x, y) => x.c.localeCompare(y.c))
    : [];
  const neighbours = P.neighboursOf(commune, (file.communes || []).filter(c => !(parentCode && c.c.startsWith(P.BIG_CITY_PREFIX[parentCode]))), 12);
  const [listings, agencies] = await Promise.all([listingsFor(commune.c), agencyCount(commune.c)]);
  const out = H.render({
    base, commune, department, region: P.regionOfDepartment(idx, depCode), city, arrondissements, neighbours,
    listings, agencies, type: route.type, today: new Date()
  });
  return send(res, 200, out.html, null, true);
}

module.exports = handler;
module.exports._internals = { arrondissementPostcodes };
