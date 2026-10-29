/* Z FIND — pages « Immobilier à {commune} » (api/immobilier.js, api/_lib/immobilier-pages.js). Sans réseau. */
'use strict';
const path = require('path');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const H = require(path.join(WEB, 'api', '_lib', 'immobilier-pages.js'));
const P = require(path.join(WEB, 'api', '_lib', 'prix-pages.js'));
const handler = require(path.join(WEB, 'api', 'immobilier.js'));
const gen = require(path.join(WEB, 'scripts', 'generate-seo-pages.js'));
const vercel = require(path.join(WEB, 'vercel.json'));

let pass = 0, fail = 0;
function check(label, cond, extra) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } }

function run(query) {
  return new Promise(resolve => {
    const res = { headers: {}, statusCode: 0, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ status: this.statusCode, headers: this.headers, body: b || '' }); } };
    handler({ method: 'GET', query, headers: {} }, res);
  });
}

(async () => {
  delete process.env.ZFIND_SUPABASE_SERVICE_KEY;
  process.env.SITE_BASE_URL = 'https://zfind.online';

  console.log('\n=== 1. routes et règles ===');
  check('route commune', JSON.stringify(H.parsePath('lyon-6e-69386')) === JSON.stringify({ code: '69386', slug: 'lyon-6e', type: null }));
  check('route type', H.parsePath('lyon-6e-69386/location').type === 'location' && H.parsePath('nice-06088/maisons-a-vendre').code === '06088');
  check('type inconnu, chemin trop long : refusés', H.parsePath('lyon-69123/bureaux') === null && H.parsePath('a/b/c') === null && H.parsePath('') === null);
  check('6 grandes villes et arrondissements = niveau 1', ['75056', '75116', '13055', '13208', '69123', '69386', '31555', '06088', '44109'].every(H.isTier1) && !H.isTier1('69266') && !H.isTier1('74119'));
  check('encadrement des loyers : Paris, Lyon (et arrondissements), Villeurbanne', !!H.rentControlFor('75111') && !!H.rentControlFor('69386') && !!H.rentControlFor('69266') && !H.rentControlFor('13055'));
  check('nom affiché sans « Arrondissement »', H.displayName('Lyon 6e Arrondissement') === 'Lyon 6e' && H.displayName('Villeurbanne') === 'Villeurbanne');

  console.log('\n=== 2. pages servies (sans base : aucune annonce) ===');
  const lyon6 = await run({ p: 'lyon-6e-69386' });
  check('Lyon 6e : 200, indexée (niveau 1), canonical', lyon6.status === 200 && lyon6.body.includes('content="index,follow"') && lyon6.body.includes('<link rel="canonical" href="https://zfind.online/fr/immobilier/lyon-6e-69386">'));
  check('Lyon 6e : H1, prix DVF, frais de notaire du Rhône, alerte', lyon6.body.includes('<h1>Immobilier à Lyon 6e</h1>') && /€\/m²/.test(lyon6.body) && lyon6.body.includes('/fr/frais-de-notaire/rhone-69') && lyon6.body.includes('Créer une alerte'));
  check('Lyon 6e : encadrement des loyers, arrondissements, fil d’Ariane jusqu’à Lyon', lyon6.body.includes('Encadrement des loyers') && lyon6.body.includes('/fr/immobilier/lyon-1er-69381') && lyon6.body.includes('Immobilier à Lyon') && lyon6.body.includes('"BreadcrumbList"'));
  check('Lyon 6e : liens vers les pages par type', ['appartements-a-vendre', 'maisons-a-vendre', 'location'].every(t => lyon6.body.includes(`/fr/immobilier/lyon-6e-69386/${t}`)));
  check('Lyon 6e : lien vers les prix au m²', lyon6.body.includes('/fr/prix-immobilier/france/lyon-6e-arrondissement-69386'));
  const nice = await run({ p: 'nice-06088' });
  check('Nice : frais de notaire au taux réduit des Alpes-Maritimes', nice.status === 200 && nice.body.includes('/fr/frais-de-notaire/alpes-maritimes-06'));
  const evian = await run({ p: 'evian-les-bains-74119' });
  check('Évian sans annonce : consultable mais noindex', evian.status === 200 && evian.body.includes('content="noindex,follow"'));
  const loc = await run({ p: 'lyon-6e-69386/location' });
  check('type sans annonce : noindex', loc.status === 200 && loc.body.includes('content="noindex,follow"') && loc.body.includes('<h1>Locations à Lyon 6e</h1>'));
  const wrong = await run({ p: 'ancien-nom-69386' });
  check('mauvais slug → 301 vers l’adresse canonique', wrong.status === 301 && wrong.headers.Location === 'https://zfind.online/fr/immobilier/lyon-6e-69386');
  const unknown = await run({ p: 'nulle-part-99999' });
  check('commune inconnue → 404 noindex', unknown.status === 404 && unknown.headers['X-Robots-Tag'] === 'noindex');
  check('pas de « undefined » ni « NaN »', ![lyon6, nice, evian, loc].some(r => /undefined|NaN/.test(r.body)));

  console.log('\n=== 3. avec des annonces ===');
  const idx = require(path.join(WEB, 'public', 'market-data', 'fr', 'index.json'));
  const dep = require(path.join(WEB, 'public', 'market-data', 'fr', 'dep', '74.json'));
  const commune = dep.communes.find(c => c.c === '74119');
  const listings = [1, 2, 3].map(i => ({ id: `00000000-0000-0000-0000-00000000000${i}`, title: `Appartement vue lac ${i}`, price: 300000 + i, currency: 'EUR', transaction: 'sale', subtype: 'apartment', typology: 'T3', area: 70, bedrooms: 2 }))
    .concat([{ id: '00000000-0000-0000-0000-000000000009', title: 'Studio meublé', price: 750, currency: 'EUR', transaction: 'rent', rentalPeriod: 'monthly', subtype: 'apartment', area: 25 }]);
  const ctx = { base: 'https://zfind.online', commune, department: Object.assign({ code: '74' }, idx.departments['74']), region: P.regionOfDepartment(idx, '74'), city: null, arrondissements: [], neighbours: [], listings, agencies: 12, today: new Date('2026-10-29') };
  const hub = H.render(ctx);
  check('3 annonces ou plus : la commune est indexée', hub.indexable && hub.html.includes('content="index,follow"'));
  check('cartes d’annonces : titre, surface, prix, lien', hub.html.includes('Appartement vue lac 1') && hub.html.includes('70 m²') && /300\s001\s€/.test(hub.html) && hub.html.includes('/fr/annonce/appartement-vue-lac-1-00000000-0000-0000-0000-000000000001'));
  check('compteurs par type et FAQ', hub.html.includes('Appartements à vendre (3)') && hub.html.includes('Locations (1)') && hub.html.includes('"FAQPage"'));
  check('agences de la commune', hub.html.includes('12 agences immobilières sont établies à Évian-les-Bains'));
  const apts = H.render(Object.assign({}, ctx, { type: 'appartements-a-vendre' }));
  check('type avec 3 annonces : indexé, seulement ce type', apts.indexable && apts.html.includes('Appartement vue lac 3') && !apts.html.includes('Studio meublé'));
  const rent = H.render(Object.assign({}, ctx, { type: 'location' }));
  check('type avec 1 annonce : noindex', !rent.indexable && /750\s€ \/ mois/.test(rent.html));

  console.log('\n=== 4. intégration ===');
  check('vercel.json : /fr/immobilier et /sitemap-immobilier.xml réécrits vers la fonction', vercel.rewrites.some(r => r.source === '/fr/immobilier/:path*' && r.destination === '/api/immobilier?p=:path*') && vercel.rewrites.some(r => r.source === '/sitemap-immobilier.xml'));
  check('vercel.json : avant la réécriture générale', vercel.rewrites.findIndex(r => r.source === '/fr/immobilier/:path*') < vercel.rewrites.findIndex(r => r.source === '/(.*)'));
  check('robots.txt annonce sitemap-immobilier.xml', gen.buildRobotsTxt('https://zfind.online').includes('Sitemap: https://zfind.online/sitemap-immobilier.xml'));
  const sm = await run({ sitemap: '1' });
  const locs = (sm.body.match(/<loc>/g) || []).length;
  check('sitemap : les 6 grandes villes et leurs arrondissements (≥ 50 URL)', sm.status === 200 && locs >= 50 && sm.body.includes('/fr/immobilier/lyon-69123') && sm.body.includes('/fr/immobilier/paris-16e-75116') && sm.body.includes('/fr/immobilier/nantes-44109'), locs);
  const prixLyon6 = await (new Promise(resolve => {
    const ph = require(path.join(WEB, 'api', 'prix-immobilier.js'));
    const res = { headers: {}, statusCode: 0, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve(b || ''); } };
    ph({ method: 'GET', query: { p: 'france/lyon-6e-arrondissement-69386' }, headers: {} }, res);
  }));
  check('page Prix Lyon 6e → page Immobilier à Lyon 6e', prixLyon6.includes('/fr/immobilier/lyon-6e-69386'));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
