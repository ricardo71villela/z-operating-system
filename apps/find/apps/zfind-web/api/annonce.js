/* ============================================================
   Z FIND — GET /fr/annonce/{titre}-{uuid}  (réécrit vers /api/annonce?p=...)
            GET /fr/property/{uuid}         (ancienne adresse → 301)
            GET /sitemap-annonces.xml       (réécrit vers /api/annonce?sitemap=1)

   Page publique d'une annonce, rendue par _lib/annonce-pages.js.
   Mise en cache par le CDN (1 heure, puis révalidation).
     - annonce publiée : 200 (indexée si elle passe le contrôle qualité) ;
     - annonce retirée, en brouillon ou de test : 410, noindex ;
     - identifiant inconnu : 404, noindex.
   Les photos (bucket privé) sont servies par URL signée valable 7 jours,
   bien plus longtemps que le cache de la page.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const S = require('./_lib/server');
const P = require('./_lib/prix-pages');
const A = require('./_lib/annonce-pages');
const immobilier = require('./immobilier.js');

let listingQuality = null;
try { listingQuality = require('../src/services/listing-quality.js'); } catch (_) { listingQuality = null; }

const DATA_DIR = path.join(__dirname, '..', 'public', 'market-data', 'fr');
const LAUNCH = ['FR', 'BE', 'LU'];
const SIGN_SECONDS = 7 * 24 * 3600;
const cache = { index: null, deps: new Map() };
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

const SELECT = 'id,subtype,typology,area_sqm,plot_area_sqm,floor,bedrooms,bathrooms,year_built,condition,energy_rating,condo_fee_monthly,agency_reference,postal_code,removed_at,'
  + 'zones_lite(name,city,commune_code,country_iso),'
  + 'representations(target_type,status,partners(name,status),'
  + 'listings(id,transaction_type,rental_period,price_current,currency_iso,price_is_from,status,created_at,listing_content(locale,title,description),listing_media(position,is_cover,media_assets(original_storage_path))))';

async function fetchProperty(id) {
  const rows = await withTimeout(S.db(`properties?id=eq.${id}&select=${encodeURIComponent(SELECT)}&limit=1`), 3000);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/* Photos du bucket privé « listing-media » → URL signées (une requête). */
async function signImages(paths) {
  const list = paths.filter(p => p && !/^https?:\/\//i.test(p));
  const absolute = paths.filter(p => /^https?:\/\//i.test(p || ''));
  if (!list.length) return absolute;
  const key = String(S.env('ZFIND_SUPABASE_SERVICE_KEY', '')).trim();
  const base = S.env('SUPABASE_URL', 'https://dcdggqyazdddrfuzwavw.supabase.co').replace(/\/+$/, '');
  const auth = /^eyJ/.test(key) ? { Authorization: `Bearer ${key}` } : {};
  try {
    const r = await withTimeout(fetch(`${base}/storage/v1/object/sign/listing-media`, {
      method: 'POST', headers: Object.assign({ apikey: key, 'Content-Type': 'application/json' }, auth),
      body: JSON.stringify({ expiresIn: SIGN_SECONDS, paths: list })
    }), 2500);
    if (!r.ok) return absolute;
    const out = await r.json();
    const byPath = new Map((out || []).filter(x => x && x.signedURL && !x.error).map(x => [x.path, `${base}/storage/v1${x.signedURL}`]));
    return paths.map(p => (/^https?:\/\//i.test(p || '') ? p : byPath.get(p))).filter(Boolean);
  } catch (_) {
    return absolute;
  }
}

/* Ligne PostgREST → annonce normalisée, ou { gone: true } si non publiée. */
function normalize(row) {
  const rep = (row.representations || []).find(r => r.target_type === 'property' && (r.listings || []).some(l => l.status === 'published'));
  const listing = rep && rep.listings.find(l => l.status === 'published');
  const zone = row.zones_lite || {};
  if (!listing || row.removed_at) return { gone: true, zone, postalCode: row.postal_code };
  const shaped = Object.assign({}, row, { representations: [Object.assign({}, rep, { listings: [listing] })] });
  const isLaunch = iso => LAUNCH.includes(String(iso || '').toUpperCase());
  if (listingQuality && !listingQuality.isPublicRow(shaped, isLaunch)) return { gone: true, zone, postalCode: row.postal_code };
  const contents = listing.listing_content || [];
  const fr = contents.find(c => c.locale === 'fr' && String(c.title || '').trim()) || contents.find(c => String(c.title || '').trim());
  if (!fr) return { gone: true, zone, postalCode: row.postal_code };
  const media = (listing.listing_media || []).slice().sort((a, b) => (Number(b.is_cover) - Number(a.is_cover)) || ((a.position || 0) - (b.position || 0)));
  const num = v => (v == null || v === '' ? null : Number(v));
  return {
    id: row.id, title: String(fr.title).trim(), description: fr.description || '',
    price: Number(listing.price_current), currency: listing.currency_iso || 'EUR', priceIsFrom: !!listing.price_is_from,
    transaction: listing.transaction_type, rentalPeriod: listing.rental_period,
    subtype: row.subtype, typology: row.typology, area: num(row.area_sqm), plotArea: num(row.plot_area_sqm),
    bedrooms: row.bedrooms, bathrooms: row.bathrooms, floor: row.floor, yearBuilt: row.year_built, condition: row.condition,
    energy: row.energy_rating, condoFee: num(row.condo_fee_monthly), reference: row.agency_reference,
    postalCode: row.postal_code, locality: zone.city || zone.name || null, country: zone.country_iso,
    createdAt: listing.created_at, published: true,
    agency: rep.partners && rep.partners.status !== 'suspended' ? { name: rep.partners.name } : null,
    zoneCommune: zone.commune_code || null,
    mediaPaths: media.map(m => m.media_assets && m.media_assets.original_storage_path).filter(Boolean).slice(0, 12)
  };
}

/* Commune DVF de l'annonce (arrondissement si le code postal le donne). */
function placeOf(communeCode, postalCode) {
  if (!communeCode) return {};
  const code = A.arrondissementCode(communeCode, postalCode) || communeCode;
  const depCode = P.depOfCommune(code);
  const idx = index();
  const d = idx.departments[depCode];
  const file = d && depFile(depCode);
  const commune = file && (file.communes || []).find(c => c.c === code);
  if (!commune) return {};
  const cityCode = P.cityOfArrondissement(commune.c);
  const city = cityCode ? (file.communes || []).find(c => c.c === cityCode) || null : null;
  return { commune, city, department: Object.assign({ code: depCode }, d), region: P.regionOfDepartment(idx, depCode) };
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
  res.setHeader('Cache-Control', 'public, s-maxage=3600');
  res.end();
}
function notFound(res, base) {
  res.setHeader('X-Robots-Tag', 'noindex');
  send(res, 404, `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Annonce introuvable — Z Find</title></head><body style="font-family:system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:0 24px"><h1>Annonce introuvable</h1><p>Cette adresse ne correspond à aucune annonce.</p><p><a href="${base}/#/fr/search">Rechercher un bien →</a></p></body></html>`, null, false);
}

async function sitemap(res, base) {
  let rows = [];
  if (S.configured(['db'])) {
    try {
      const sel = 'id,removed_at,zones_lite!inner(country_iso),representations!inner(target_type,listings!inner(status,price_current,created_at,listing_content(locale,title,description)))';
      rows = await withTimeout(S.db(`properties?select=${encodeURIComponent(sel)}&representations.target_type=eq.property&representations.listings.status=eq.published&removed_at=is.null&limit=50000`), 6000) || [];
    } catch (_) { rows = []; }
  }
  const urls = [];
  for (const row of rows) {
    const l = normalize(Object.assign({ representations: [] }, row, { representations: (row.representations || []).map(r => Object.assign({ partners: null }, r)) }));
    if (l.gone || !A.isIndexable(l)) continue;
    urls.push(`  <url><loc>${P.esc(base + A.listingPath(l))}</loc>${l.createdAt ? `<lastmod>${String(l.createdAt).slice(0, 10)}</lastmod>` : ''}</url>`);
  }
  return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}${urls.length ? '\n' : ''}</urlset>\n`, 'application/xml; charset=utf-8', true);
}

async function handler(req, res) {
  const base = S.siteUrl();
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); return res.end(); }
  const q = S.queryOf(req);
  if (q.sitemap) return sitemap(res, base);
  const id = A.idFromPath(q.p);
  if (!id) return notFound(res, base);
  let row = null;
  if (S.configured(['db'])) {
    try { row = await fetchProperty(id); } catch (_) {
      // Base indisponible : jamais de 404/410 à tort (Google retirerait la page).
      res.setHeader('Retry-After', '120');
      return send(res, 503, '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Z Find</title><p>Service momentanément indisponible.</p>', null, false);
    }
  }
  if (!row) return notFound(res, base);
  const l = normalize(row);
  if (l.gone) {
    const place = placeOf(l.zone && l.zone.commune_code, l.postalCode);
    res.setHeader('X-Robots-Tag', 'noindex');
    return send(res, 410, A.renderGone(base, place.commune || null), null, true);
  }
  const canonical = A.listingPath(l);
  const asked = '/fr/annonce/' + String(q.p).toLowerCase().split('/').filter(Boolean).filter(x => x !== 'fr' && x !== 'annonce').join('/');
  if (asked !== canonical) return redirect(res, base + canonical);

  const place = placeOf(l.zoneCommune, l.postalCode);
  const lookup = immobilier._internals && immobilier._internals.listingsFor;
  const [images, similar] = await Promise.all([
    signImages(l.mediaPaths),
    place.commune && lookup ? lookup(place.commune.c).catch(() => []) : Promise.resolve([])
  ]);
  l.images = images;
  const out = A.render({ base, listing: l, commune: place.commune || null, city: place.city || null, department: place.department || null, region: place.region || null, similar, today: new Date() });
  if (!out.indexable) res.setHeader('X-Robots-Tag', 'noindex');
  return send(res, 200, out.html, null, true);
}

module.exports = handler;
module.exports._internals = { normalize, placeOf };
