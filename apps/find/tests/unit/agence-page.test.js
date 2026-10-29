/* Z FIND — page publique d'une agence partenaire (/fr/agence/{slug}) et « Ma page agence ». Sans réseau. */
'use strict';
const path = require('path');
const fs = require('fs');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const PARTNER = path.join(__dirname, '..', '..', 'apps', 'zfind-partner');
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const AP = require(path.join(WEB, 'api', '_lib', 'agence-page.js'));
const A = require(path.join(WEB, 'api', '_lib', 'annonce-pages.js'));
const vercel = require(path.join(WEB, 'vercel.json'));

let pass = 0, fail = 0;
function check(label, cond, extra) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } }

const PID = '11111111-2222-4333-8444-555555555555';
const PROFILE = { partner_id: PID, slug: 'agence-du-lac-thonon-les-bains', description: 'Agence familiale installée à Thonon-les-Bains depuis 1998 : vente, location et gestion sur tout le Chablais, du lac aux stations.\n\nNous estimons gratuitement votre bien.', phone: '04 50 00 00 00', email: 'contact@agence-du-lac.fr', website: 'https://www.agence-du-lac.fr', address: '1 place du Marché', postcode: '74200', city: 'Thonon-les-Bains', country: 'FR', opening_hours: 'Du lundi au samedi, 9 h – 12 h et 14 h – 19 h', public_page: true, updated_at: '2026-10-29T10:00:00Z' };
const LISTING_ROW = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', subtype: 'apartment', typology: 'T3', area_sqm: 68, postal_code: '74200', removed_at: null,
  zones_lite: { name: 'Thonon-les-Bains', city: 'Thonon-les-Bains', commune_code: '74281', country_iso: 'FR' },
  representations: [{ target_type: 'property', status: 'active', partners: { id: PID, name: 'Agence du Lac', status: 'active', zfind_partner_profiles: { slug: PROFILE.slug, public_page: true } },
    listings: [{ id: 'l1', transaction_type: 'sale', price_current: 320000, currency_iso: 'EUR', status: 'published', created_at: '2026-10-20T10:00:00Z',
      listing_content: [{ locale: 'fr', title: 'Appartement T3 vue lac', description: 'Bel appartement lumineux avec balcon et vue sur le lac Léman, proche du centre et des écoles, cave et parking.' }],
      listing_media: [{ position: 0, is_cover: true, media_assets: { original_storage_path: 'listings/l1/photo.jpg' } }] }] }]
};

let dbCalls = [];
function fakeFetch(dbReply) {
  dbCalls = [];
  global.fetch = async (url, opts) => {
    const u = String(url);
    dbCalls.push(u);
    if (u.includes('/storage/v1/object/sign/')) {
      const body = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => body.paths.map(p => ({ path: p, signedURL: `/object/sign/listing-media/${p}?token=t` })), text: async () => '' };
    }
    const reply = dbReply(u);
    return { ok: reply.status ? reply.status < 400 : true, status: reply.status || 200, text: async () => JSON.stringify(reply.body !== undefined ? reply.body : reply), json: async () => reply };
  };
}
function run(handler, query) {
  return new Promise(resolve => {
    const res = { headers: {}, statusCode: 0, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ status: this.statusCode, headers: this.headers, body: b || '' }); } };
    handler({ method: 'GET', query, headers: {} }, res);
  });
}

(async () => {
  process.env.SITE_BASE_URL = 'https://zfind.online';
  process.env.ZFIND_SUPABASE_SERVICE_KEY = 'sb_secret_test';
  const handler = require(path.join(WEB, 'api', 'agences.js'));
  const annonce = require(path.join(WEB, 'api', 'annonce.js'));

  console.log('\n=== 1. règles ===');
  check('adresse /fr/agence/{slug}', AP.agencyPath('agence-du-lac') === '/fr/agence/agence-du-lac');
  check('slug lu, invalide refusé', AP.slugFromQuery('agence-du-lac') === 'agence-du-lac' && AP.slugFromQuery('../x') === null && AP.slugFromQuery('Agence Du Lac') === null);
  check('réécriture /fr/agence/:slug déclarée', vercel.rewrites.some(r => r.source === '/fr/agence/:slug' && r.destination === '/api/agences?agence=:slug'));

  console.log('\n=== 2. page de l’agence ===');
  fakeFetch(u => {
    if (u.includes('/rest/v1/zfind_partner_profiles?slug=eq.agence-du-lac-thonon-les-bains')) return [Object.assign({}, PROFILE, { partners: { id: PID, name: 'Agence du Lac', status: 'active', logo_storage_path: `partners/${PID}/logo.png` } })];
    if (u.includes('/rest/v1/zfind_partner_profiles?slug=')) return [];
    if (u.includes('/rest/v1/properties?')) return [LISTING_ROW];
    return [];
  });
  let r = await run(handler, { agence: 'agence-du-lac-thonon-les-bains' });
  const h = r.body.replace(/[\u202f\u00a0]/g, ' ');
  check('200, indexable, canonical', r.status === 200 && h.includes('content="index,follow"') && h.includes('<link rel="canonical" href="https://zfind.online/fr/agence/agence-du-lac-thonon-les-bains">'), r.status);
  check('titre et H1', h.includes('<title>Agence du Lac — agence immobilière à Thonon-les-Bains : 1 annonce | Z Find</title>') && h.includes('<h1>Agence du Lac</h1>'), (h.match(/<title>[^<]*<\/title>/) || [])[0]);
  check('logo signé', h.includes(`/storage/v1/object/sign/listing-media/partners/${PID}/logo.png`));
  check('présentation en paragraphes', h.includes('<p>Agence familiale installée à Thonon-les-Bains') && h.includes('<p>Nous estimons gratuitement votre bien.</p>'));
  check('coordonnées : téléphone, e-mail, site, horaires, adresse', h.includes('href="tel:0450000000"') && h.includes('mailto:contact@agence-du-lac.fr') && h.includes('rel="noopener nofollow"') && h.includes('Du lundi au samedi') && h.includes('1 place du Marché'));
  check('annonce de l’agence avec photo et lien', h.includes('/fr/annonce/appartement-t3-vue-lac-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee') && h.includes('/storage/v1/object/sign/listing-media/listings/l1/photo.jpg') && h.includes('320 000 €'));
  check('pages locales de la commune des annonces', h.includes('/fr/immobilier/thonon-les-bains-74281') && h.includes('/fr/prix-immobilier/'));
  check('annonces cherchées pour cette agence seulement', dbCalls.some(u => u.includes('representations.partner_id=eq.' + PID) && u.includes('representations.listings.status=eq.published')));
  const ld = JSON.parse(h.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"RealEstateAgent".*?)<\/script>/)[1]);
  check('JSON-LD RealEstateAgent : adresse, téléphone, offres', ld.telephone === '04 50 00 00 00' && ld.address.postalCode === '74200' && ld.makesOffer.length === 1 && ld.sameAs[0] === 'https://www.agence-du-lac.fr');
  check('pas de « undefined » ni « NaN »', !/undefined|NaN/.test(h));
  check('cache CDN 1 h', /s-maxage=3600/.test(r.headers['Cache-Control']));

  r = await run(handler, { agence: 'inconnue' });
  check('slug inconnu : 404 noindex', r.status === 404 && r.headers['X-Robots-Tag'] === 'noindex');
  fakeFetch(u => (u.includes('zfind_partner_profiles?slug=') ? [Object.assign({}, PROFILE, { partners: { id: PID, name: 'Agence du Lac', status: 'inactive', logo_storage_path: null } })] : []));
  r = await run(handler, { agence: 'agence-du-lac-thonon-les-bains' });
  check('agence inactive : 404', r.status === 404);
  fakeFetch(u => (u.includes('zfind_partner_profiles?slug=') ? [Object.assign({}, PROFILE, { public_page: false, partners: { id: PID, name: 'Agence du Lac', status: 'active', logo_storage_path: null } })] : []));
  r = await run(handler, { agence: 'agence-du-lac-thonon-les-bains' });
  check('page masquée par l’agence : 404', r.status === 404);
  const thin = AP.render({ base: 'https://zfind.online', partner: { id: PID, name: 'Agence du Lac', status: 'active' }, profile: Object.assign({}, PROFILE, { description: 'Court.' }), listings: [] });
  check('sans présentation ni annonce : noindex', !thin.indexable && thin.html.includes('content="noindex,follow"') && thin.html.includes('pas d’annonce publiée'));

  console.log('\n=== 3. sitemap ===');
  fakeFetch(u => (u.includes('zfind_partner_profiles?public_page=is.true') ? [{ slug: PROFILE.slug, description: PROFILE.description, updated_at: PROFILE.updated_at }, { slug: 'vide', description: null }] : []));
  r = await run(handler, { sitemap: '1' });
  check('sitemap-agences : pages d’agence avec présentation', r.body.includes('<loc>https://zfind.online/fr/agence/agence-du-lac-thonon-les-bains</loc><lastmod>2026-10-29</lastmod>') && !r.body.includes('/fr/agence/vide'));

  console.log('\n=== 4. page d’annonce → page de l’agence ===');
  const l = annonce._internals.normalize(LISTING_ROW);
  check('annonce : adresse de la page de l’agence', l.agency && l.agency.slug === PROFILE.slug);
  check('annonce : sans fiche, pas de lien', annonce._internals.normalize(Object.assign({}, LISTING_ROW, { representations: [Object.assign({}, LISTING_ROW.representations[0], { partners: { name: 'X', status: 'active' } })] })).agency.slug === null);
  const page = A.render({ base: 'https://zfind.online', listing: Object.assign(l, { images: [] }), commune: null, city: null, department: null, region: null, similar: [], today: new Date('2026-10-29') });
  check('page d’annonce : lien « Voir la page de l’agence »', page.html.includes('href="https://zfind.online/fr/agence/agence-du-lac-thonon-les-bains">Voir la page de l’agence'));
  check('annonce : la requête retombe sans la fiche si la table manque', /SELECT_NO_PROFILE/.test(fs.readFileSync(path.join(WEB, 'api', 'annonce.js'), 'utf8')));

  console.log('\n=== 5. espace Partner et base ===');
  const body = fs.readFileSync(path.join(PARTNER, 'src', 'body.html'), 'utf8');
  const js = fs.readFileSync(path.join(PARTNER, 'src', 'profile.js'), 'utf8');
  check('onglet « Ma page agence » dans chaque vue', (body.match(/showProfileView\(\)/g) || []).length >= 7 && body.includes('id="view-profile"'));
  check('fiche : présentation, coordonnées, horaires, logo, page publique', ['pprof-description', 'pprof-phone', 'pprof-email', 'pprof-website', 'pprof-address', 'pprof-hours', 'pprof-logo', 'pprof-public'].every(id => js.includes(id)));
  check('logo : formats et taille limités, dossier de l’agence', js.includes("'image/png'") && js.includes('2 * 1024 * 1024') && js.includes('partners/${pprof.data.partner_id}/logo-'));
  check('build : profile.js inclus', fs.readFileSync(path.join(PARTNER, 'scripts', 'build.js'), 'utf8').includes("readPartner('profile.js')"));
  const sql = fs.readFileSync(path.join(ROOT, 'infrastructure', 'supabase', 'migrations', '20261029160000_z_find_agency_pages_v1.sql'), 'utf8');
  check('migration : RLS, écriture par fonctions, dossier logo limité à l’agence', /enable row level security/.test(sql) && /zfind_partner_save_profile\(p jsonb\)/.test(sql) && /p_path not like \('partners\/' \|\| v_partner::text/.test(sql) && /zfind_partner_can_manage_logo_path/.test(sql) && !/drop table/i.test(sql));

  console.log(`\nAGENCE PAGE: ${pass}/${pass + fail} PASSED`);
  if (fail) process.exit(1);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
