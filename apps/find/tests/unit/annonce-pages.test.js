/* Z FIND — page d'une annonce (api/annonce.js, api/_lib/annonce-pages.js). Sans réseau. */
'use strict';
const path = require('path');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const A = require(path.join(WEB, 'api', '_lib', 'annonce-pages.js'));
const H = require(path.join(WEB, 'api', '_lib', 'immobilier-pages.js'));
const handler = require(path.join(WEB, 'api', 'annonce.js'));
const gen = require(path.join(WEB, 'scripts', 'generate-seo-pages.js'));
const seo = require(path.join(WEB, 'src', 'services', 'seo-page-generator.js'));
const vercel = require(path.join(WEB, 'vercel.json'));

let pass = 0, fail = 0;
function check(label, cond, extra) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } }

function run(query) {
  return new Promise(resolve => {
    const res = { headers: {}, statusCode: 0, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ status: this.statusCode, headers: this.headers, body: b || '' }); } };
    handler({ method: 'GET', query, headers: {} }, res);
  });
}

const ID = '0f8e2c1a-3b4d-4e5f-8a9b-1c2d3e4f5a6b';
const DESC = 'Au cœur du 6e arrondissement, bel appartement traversant de trois pièces au deuxième étage d’un immeuble bourgeois.\n\nParquet, moulures, cave. Proche du parc de la Tête d’Or et du métro.';
function row(overrides) {
  return Object.assign({
    id: ID, subtype: 'apartment', typology: 'T3', area_sqm: 72, plot_area_sqm: null, floor: 2, bedrooms: 2, bathrooms: 1, year_built: 1905,
    condition: 'good', energy_rating: 'd', condo_fee_monthly: 180, agency_reference: 'LY-123', postal_code: '69006', removed_at: null,
    zones_lite: { name: 'Lyon', city: 'Lyon', commune_code: '69123', country_iso: 'FR' },
    representations: [{ target_type: 'property', status: 'active', partners: { name: 'Agence Démo Lyon', status: 'active' }, listings: [{
      id: 'l1', transaction_type: 'sale', rental_period: null, price_current: 450000, currency_iso: 'EUR', price_is_from: false, status: 'published', created_at: '2026-10-20T10:00:00Z',
      listing_content: [{ locale: 'fr', title: 'Appartement T3 Foch', description: DESC }],
      listing_media: [{ position: 2, is_cover: false, media_assets: { original_storage_path: 'listings/b.jpg' } }, { position: 1, is_cover: true, media_assets: { original_storage_path: 'listings/a.jpg' } }]
    }] }]
  }, overrides || {});
}

(async () => {
  delete process.env.ZFIND_SUPABASE_SERVICE_KEY;
  process.env.SITE_BASE_URL = 'https://zfind.online';
  const { normalize, placeOf } = handler._internals;

  console.log('\n=== 1. adresses et règles ===');
  check('adresse : titre puis identifiant', A.listingPath({ id: ID, title: 'Appartement T3 Foch' }) === `/fr/annonce/appartement-t3-foch-${ID}`);
  check('identifiant lu depuis le slug, l’uuid seul, /fr/property', A.idFromPath(`appartement-t3-foch-${ID}`) === ID && A.idFromPath(ID) === ID && A.idFromPath(`fr/property/${ID}`) === ID);
  check('adresses invalides refusées', A.idFromPath('appartement') === null && A.idFromPath(`a/b-${ID}`) === null && A.idFromPath('') === null);
  check('arrondissement depuis le code postal (Lyon, Paris 16e, Marseille)', A.arrondissementCode('69123', '69006') === '69386' && A.arrondissementCode('75056', '75016') === '75116' && A.arrondissementCode('75056', '75011') === '75111' && A.arrondissementCode('13055', '13008') === '13208' && A.arrondissementCode('74119', '74500') === null);

  console.log('\n=== 2. lecture de la base ===');
  const l = normalize(row());
  check('annonce publiée normalisée : titre, prix, agence, photos couverture en premier', !l.gone && l.title === 'Appartement T3 Foch' && l.price === 450000 && l.agency.name === 'Agence Démo Lyon' && l.mediaPaths[0] === 'listings/a.jpg', l);
  check('annonce non publiée → retirée', normalize(row({ representations: [Object.assign({}, row().representations[0], { listings: [Object.assign({}, row().representations[0].listings[0], { status: 'draft' })] })] })).gone === true);
  check('bien supprimé → retiré', normalize(row({ removed_at: '2026-10-25T00:00:00Z' })).gone === true);
  check('donnée de test → retirée', normalize(row({ representations: [Object.assign({}, row().representations[0], { listings: [Object.assign({}, row().representations[0].listings[0], { listing_content: [{ locale: 'fr', title: '[TEST] Appartement', description: DESC }] })] })] })).gone === true);
  check('hors lancement (PT) → retirée', normalize(row({ zones_lite: { name: 'Porto', city: 'Porto', commune_code: null, country_iso: 'PT' } })).gone === true);
  const place = placeOf('69123', '69006');
  check('commune DVF : Lyon 6e, département du Rhône, ville Lyon', place.commune && place.commune.c === '69386' && place.department.code === '69' && place.city && place.city.c === '69123');

  console.log('\n=== 3. page rendue ===');
  l.images = ['https://img.example/a.jpg', 'https://img.example/b.jpg'];
  const similar = [{ id: '11111111-1111-4111-8111-111111111111', title: 'Studio Brotteaux', price: 190000, currency: 'EUR', transaction: 'sale', subtype: 'apartment', area: 28 }, { id: ID, title: 'Appartement T3 Foch', price: 450000, currency: 'EUR', transaction: 'sale' }];
  const out = A.render({ base: 'https://zfind.online', listing: l, commune: place.commune, city: place.city, department: place.department, region: place.region, similar, today: new Date('2026-10-29') });
  const html = out.html;
  check('indexée, canonical = adresse de l’annonce', out.indexable && html.includes('content="index,follow"') && html.includes(`<link rel="canonical" href="https://zfind.online/fr/annonce/appartement-t3-foch-${ID}">`));
  check('titre de page : type, surface, commune, code postal, prix', /<title>Appartement T3 72 m² à vendre à Lyon 6e \(69006\) — 450\s000 € \| Z Find<\/title>/.test(html), html.match(/<title>[^<]*<\/title>/));
  check('H1, prix, photos (première prioritaire, suivantes en lazy)', html.includes('<h1>Appartement T3 Foch</h1>') && /450\s000 €/.test(html) && html.includes('src="https://img.example/a.jpg"') && html.includes('fetchpriority="high"') && html.includes('loading="lazy"'));
  check('og:image et grande carte de partage', html.includes('<meta property="og:image" content="https://img.example/a.jpg">') && html.includes('summary_large_image'));
  check('caractéristiques : surface, chambres, étage, DPE, charges', ['72 m²', 'Chambres', '2e', '<dd>D</dd>', '180 € / mois', 'LY-123'].every(x => html.includes(x)));
  check('description en paragraphes', html.includes('<p>Parquet, moulures, cave.'));
  check('prix au m² comparé à la médiane DVF de Lyon 6e', /6\s250 €\/m²/.test(html) && /(au-dessus|en dessous|au niveau) de la médiane/.test(html) && html.includes('/fr/prix-immobilier/france/lyon-6e-arrondissement-69386'));
  check('budget : frais de notaire du Rhône et mensualité', html.includes('/fr/frais-de-notaire/rhone-69') && html.includes('Mensualité sur 20 ans'));
  check('contact : lien vers le formulaire de l’agence', html.includes(`href="https://zfind.online/#/fr/property/${ID}"`) && html.includes('Contacter l’agence'));
  check('autres annonces de la commune, sans l’annonce elle-même', html.includes('Studio Brotteaux') && html.includes('/fr/annonce/studio-brotteaux-11111111') && !html.includes('<strong>Appartement T3 Foch</strong>'));
  check('fil d’Ariane jusqu’à Lyon 6e, lien vers la page commune', html.includes('"BreadcrumbList"') && html.includes('/fr/immobilier/lyon-69123') && html.includes('/fr/immobilier/lyon-6e-69386'));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"RealEstateListing".*?)<\/script>/)[1]);
  check('JSON-LD RealEstateListing : prix, photos, surface, adresse sans rue, agence', ld.offers.price === 450000 && ld.offers.priceCurrency === 'EUR' && ld.image.length === 2 && ld.about['@type'] === 'Apartment' && ld.about.floorSize.value === 72 && ld.about.address.postalCode === '69006' && !ld.about.address.streetAddress && ld.offers.seller.name === 'Agence Démo Lyon' && ld.datePosted === '2026-10-20', ld);
  check('pas de « undefined » ni « NaN »', !/undefined|NaN/.test(html));

  const rent = Object.assign({}, l, { transaction: 'rent', rentalPeriod: 'monthly', price: 1350 });
  const rentHtml = A.render({ base: 'https://zfind.online', listing: rent, commune: place.commune, city: place.city, department: place.department, region: place.region, similar: [], today: new Date('2026-10-29') }).html;
  check('location à Lyon : loyer / mois, encadrement des loyers, sans budget d’achat', /1\s350 € \/ mois/.test(rentHtml) && rentHtml.includes('Encadrement des loyers') && !rentHtml.includes('Frais de notaire</span>'));
  const thin = A.render({ base: 'https://zfind.online', listing: Object.assign({}, l, { description: 'Bel appartement.' , images: [] }), commune: place.commune, city: null, department: place.department, region: null, similar: [] });
  check('description d’une ligne : consultable mais noindex, sans photo ni og:image', !thin.indexable && thin.html.includes('content="noindex,follow"') && !thin.html.includes('og:image'));
  const gone = A.renderGone('https://zfind.online', place.commune);
  check('page retirée : noindex et lien vers Immobilier à Lyon 6e', gone.includes('content="noindex,follow"') && gone.includes('/fr/immobilier/lyon-6e-69386'));

  console.log('\n=== 4. fonction (sans base) ===');
  const bad = await run({ p: 'pas-une-annonce' });
  check('adresse invalide → 404 noindex', bad.status === 404 && bad.headers['X-Robots-Tag'] === 'noindex');
  const unknown = await run({ p: `appartement-${ID}` });
  check('sans base : 404, jamais 500', unknown.status === 404);
  const sm = await run({ sitemap: '1' });
  check('sitemap valide même vide', sm.status === 200 && sm.body.includes('<urlset'));

  const S = require(path.join(WEB, 'api', '_lib', 'server.js'));
  const realDb = S.db; const calls = [];
  process.env.ZFIND_SUPABASE_SERVICE_KEY = 'test-key';
  S.db = async q => { calls.push(q); if (/listing_media/.test(decodeURIComponent(q))) { const e = new Error('db 403'); e.status = 403; throw e; } return [Object.assign(row(), { representations: [Object.assign({}, row().representations[0], { listings: [Object.assign({}, row().representations[0].listings[0], { listing_media: undefined })] })] })]; };
  const noMedia = await run({ p: `appartement-t3-foch-${ID}` });
  check('droit refusé sur les photos (403) : page servie sans photos, jamais 503', noMedia.status === 200 && calls.length >= 2 && noMedia.body.includes('<h1>Appartement T3 Foch</h1>'), { status: noMedia.status, calls: calls.length });
  S.db = async () => { const e = new Error('db 500'); e.status = 500; throw e; };
  const down = await run({ p: `appartement-t3-foch-${ID}` });
  check('base en panne (500) : 503 avec Retry-After', down.status === 503 && down.headers['Retry-After'] === '120');
  S.db = realDb; delete process.env.ZFIND_SUPABASE_SERVICE_KEY;

  console.log('\n=== 5. intégration ===');
  const rw = vercel.rewrites;
  check('vercel.json : /fr/annonce, /fr/property et sitemap-annonces réécrits vers la fonction', rw.some(r => r.source === '/fr/annonce/:path*' && r.destination === '/api/annonce?p=:path*') && rw.some(r => r.source === '/fr/property/:id' && r.destination === '/api/annonce?p=:id') && rw.some(r => r.source === '/sitemap-annonces.xml' && r.destination === '/api/annonce?sitemap=1'));
  check('vercel.json : avant la réécriture générale, fonction déclarée', rw.findIndex(r => r.source === '/fr/annonce/:path*') < rw.findIndex(r => r.source === '/(.*)') && !!vercel.functions['api/annonce.js'] && /market-data\/fr/.test(vercel.functions['api/annonce.js'].includeFiles));
  check('robots.txt annonce sitemap-annonces.xml', gen.buildRobotsTxt('https://zfind.online').includes('Sitemap: https://zfind.online/sitemap-annonces.xml'));
  const hub = H.render({ base: 'https://zfind.online', commune: place.commune, department: place.department, region: place.region, city: place.city, arrondissements: [], neighbours: [], listings: [{ id: ID, title: 'Appartement T3 Foch', price: 450000, currency: 'EUR', transaction: 'sale', subtype: 'apartment' }], agencies: 0 });
  check('page commune : la carte mène à la page de l’annonce', hub.html.includes(`/fr/annonce/appartement-t3-foch-${ID}`) && !hub.html.includes('#/fr/property/'));
  const en = seo.buildListingPage({ kind: 'property', baseUrl: 'https://zfind.online', locale: 'en', availableLocales: ['fr', 'en'], id: ID, title: 'Flat', description: 'x', priceValue: 1, currencyIso: 'EUR', localePaths: { fr: A.listingPath({ id: ID, title: 'Appartement T3 Foch' }) } });
  check('page anglaise statique : alternative française = page dynamique', en.includes(`hreflang="fr" href="https://zfind.online/fr/annonce/appartement-t3-foch-${ID}"`) && en.includes(`hreflang="en" href="https://zfind.online/en/property/${ID}"`));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
