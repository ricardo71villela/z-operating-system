/* Z FIND — annuaire « Agences immobilières à {commune} » (api/agences.js, api/_lib/agences-pages.js). Sans réseau. */
'use strict';
const path = require('path');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const AG = require(path.join(WEB, 'api', '_lib', 'agences-pages.js'));
const H = require(path.join(WEB, 'api', '_lib', 'immobilier-pages.js'));
const P = require(path.join(WEB, 'api', '_lib', 'prix-pages.js'));
const S = require(path.join(WEB, 'api', '_lib', 'server.js'));
const handler = require(path.join(WEB, 'api', 'agences.js'));
const gen = require(path.join(WEB, 'scripts', 'generate-seo-pages.js'));
const vercel = require(path.join(WEB, 'vercel.json'));

let pass = 0, fail = 0;
function check(label, cond, extra) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } }
function run(query) {
  return new Promise(resolve => {
    const res = { headers: {}, statusCode: 0, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ status: this.statusCode, headers: this.headers, body: b || '' }); } };
    handler({ method: 'GET', query, headers: {} }, res);
  });
}

const EVIAN = [
  { id: '1', commune_code: '74119', postcode: '74500', city: 'EVIAN-LES-BAINS', display_name: 'BARNES LEMAN', legal_name: 'INSPIRATION', type: 'network_agency', network: 'barnes', address: '1 PLACE DU PORT 74500 EVIAN-LES-BAINS', registry_created: '2018-03-05' },
  { id: '2', commune_code: '74119', postcode: '74500', city: 'EVIAN-LES-BAINS', display_name: 'CENTURY 21 CHABLAIS - LEMAN', legal_name: 'LAC ET BEAU SITE', type: 'network_agency', network: 'century-21', address: 'LE BEAU SITE 9 QUAI BARON DE BLONAY 74500 EVIAN-LES-BAINS', registry_created: '2010-11-29' },
  { id: '3', commune_code: '74119', postcode: '74500', city: 'EVIAN-LES-BAINS', display_name: 'AGENCE DU LAC SARL', legal_name: 'AGENCE DU LAC SARL', type: 'agency', network: null, address: '31 RUE NATIONALE 74500 EVIAN-LES-BAINS', registry_created: '2014-08-01' },
  { id: '4', commune_code: '74119', postcode: '74500', city: 'EVIAN-LES-BAINS', display_name: 'L’IMMOBILIERE D’EVIAN', legal_name: 'L’IMMOBILIERE D’EVIAN', type: 'agency', network: null, address: '6 AVENUE JEAN LEGER 74500 EVIAN-LES-BAINS', registry_created: null }
];

(async () => {
  delete process.env.ZFIND_SUPABASE_SERVICE_KEY;
  process.env.SITE_BASE_URL = 'https://zfind.online';
  const idx = require(path.join(WEB, 'public', 'market-data', 'fr', 'index.json'));
  const dep74 = require(path.join(WEB, 'public', 'market-data', 'fr', 'dep', '74.json'));
  const evian = dep74.communes.find(c => c.c === '74119');
  const department = Object.assign({ code: '74' }, idx.departments['74']);

  console.log('\n=== 1. règles ===');
  check('adresse', AG.agencesPath(evian) === '/fr/agences-immobilieres/evian-les-bains-74119');
  check('route lue, invalide refusée', AG.parsePath('evian-les-bains-74119').code === '74119' && AG.parsePath('a/b') === null && AG.parsePath('evian') === null);
  check('noms du registre en casse lisible', AG.niceName('AGENCE DU LAC SARL') === 'Agence du Lac SARL' && AG.niceName('L’IMMOBILIERE D’EVIAN') === 'L’Immobiliere d’Evian' && AG.niceName('Barnes Léman') === 'Barnes Léman', [AG.niceName('AGENCE DU LAC SARL'), AG.niceName('L’IMMOBILIERE D’EVIAN')]);
  check('adresse sans code postal ni commune', AG.niceAddress(EVIAN[0], '74500') === '1 Place du Port', AG.niceAddress(EVIAN[0], '74500'));
  check('réseaux : nom affiché et décompte', AG.networkName('century-21') === 'Century 21' && AG.networksOf(EVIAN).length === 2);
  check('tri : réseaux d’abord, puis ordre alphabétique', AG.sortAgencies(EVIAN).map(a => a.id).join() === '1,2,3,4');

  console.log('\n=== 2. page commune ===');
  const out = AG.render({ base: 'https://zfind.online', commune: evian, department, region: P.regionOfDepartment(idx, '74'), city: null, agencies: EVIAN, total: 4, neighbours: [dep74.communes.find(c => c.c === '74281')].filter(Boolean) });
  const h = out.html;
  check('4 agences : indexée, canonical', out.indexable && h.includes('content="index,follow"') && h.includes('<link rel="canonical" href="https://zfind.online/fr/agences-immobilieres/evian-les-bains-74119">'));
  check('titre et H1', h.includes('<title>Agences immobilières à Évian-les-Bains (74) : 4 agences | Z Find</title>') && h.includes('<h1>Agences immobilières à Évian-les-Bains</h1>'), h.match(/<title>[^<]*<\/title>/));
  check('fiches : nom, adresse, société, année, réseau', h.includes('<strong>Barnes Leman</strong>') && h.includes('1 Place du Port, 74500 Évian-les-Bains') && h.includes('Société Inspiration · depuis 2018') && h.includes('<em>Barnes</em>'));
  check('aucun contact publié (ni téléphone ni e-mail ni site)', !/tel:|mailto:|https?:\/\/(?!zfind\.online|schema\.org|www\.service-public|fonts\.)/.test(h.replace(/<link[^>]*>/g, '')), (h.replace(/<link[^>]*>/g, '').match(/https?:\/\/(?!zfind\.online|schema\.org|fonts\.)[^"\s<]+/g) || []).slice(0, 5));
  check('réseaux présents, liens annonces / prix / notaire', h.includes('Réseaux présents') && h.includes('/fr/immobilier/evian-les-bains-74119') && h.includes('/fr/prix-immobilier/france/') && h.includes('/fr/frais-de-notaire/haute-savoie-74'));
  check('appel aux agences : espace pro', h.includes('Vous êtes une agence à Évian-les-Bains ?') && h.includes('/#/fr/pro'));
  const ld = JSON.parse(h.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"CollectionPage".*?)<\/script>/)[1]);
  check('JSON-LD : liste de RealEstateAgent avec adresse', ld.mainEntity.numberOfItems === 4 && ld.mainEntity.itemListElement[0].item['@type'] === 'RealEstateAgent' && ld.mainEntity.itemListElement[0].item.address.postalCode === '74500');
  check('FAQ et source SIRENE', h.includes('"FAQPage"') && h.includes('répertoire SIRENE'));
  check('pas de « undefined » ni « NaN »', !/undefined|NaN/.test(h));
  const thin = AG.render({ base: 'https://zfind.online', commune: evian, department, region: null, city: null, agencies: EVIAN.slice(0, 2), total: 2, neighbours: [] });
  check('2 agences : consultable mais noindex', !thin.indexable && thin.html.includes('content="noindex,follow"'));

  console.log('\n=== 3. ville à arrondissements ===');
  const dep69 = require(path.join(WEB, 'public', 'market-data', 'fr', 'dep', '69.json'));
  const lyon = dep69.communes.find(c => c.c === '69123');
  const arr = dep69.communes.filter(c => /^6938\d$/.test(c.c)).map((c, i) => ({ commune: c, n: 10 + i }));
  const city = AG.render({ base: 'https://zfind.online', commune: lyon, department: Object.assign({ code: '69' }, idx.departments['69']), region: null, city: null, agencies: [], arrondissements: arr, neighbours: [] });
  check('Lyon : indexée, total des arrondissements, lien vers chacun', city.indexable && city.html.includes(`${arr.reduce((s, a) => s + a.n, 0)} agences`) && city.html.includes('/fr/agences-immobilieres/lyon-6e-69386'));

  console.log('\n=== 4. fonction ===');
  const bad = await run({ p: 'nulle-part-99999' });
  check('commune inconnue → 404 noindex', bad.status === 404 && bad.headers['X-Robots-Tag'] === 'noindex');
  const wrong = await run({ p: 'evian-74119' });
  check('mauvais slug → 301', wrong.status === 301 && wrong.headers.Location === 'https://zfind.online/fr/agences-immobilieres/evian-les-bains-74119');
  const noDb = await run({ p: 'evian-les-bains-74119' });
  check('sans base : page servie, noindex, jamais 500', noDb.status === 200 && noDb.body.includes('content="noindex,follow"'));
  const sm0 = await run({ sitemap: '1' });
  check('sitemap sans base : les grandes villes et arrondissements', sm0.status === 200 && sm0.body.includes('/fr/agences-immobilieres/lyon-6e-69386') && sm0.body.includes('/fr/agences-immobilieres/paris-75056'));

  process.env.ZFIND_SUPABASE_SERVICE_KEY = 'test-key';
  const realDb = S.db; const calls = [];
  S.db = async q => {
    calls.push(q);
    if (q.startsWith('zfind_agency_commune_counts')) return [{ commune_code: '74119', n: 4 }, { commune_code: '74281', n: 7 }, { commune_code: '74010', n: 1 }];
    if (q.startsWith('zfind_agency_directory')) { const e = new Error('db 404'); e.status = 404; throw e; }
    if (q.startsWith('zfind_agencias')) return EVIAN.map(a => ({ id: a.id, commune_code: a.commune_code, postcode: a.postcode, city: a.city, name: a.legal_name, trade_name: a.display_name, type: a.type, network: a.network, address: a.address, registry_created: a.registry_created }));
    return [];
  };
  const page = await run({ p: 'evian-les-bains-74119' });
  check('vue absente : repli sur la table, page indexée avec les 4 agences', page.status === 200 && page.body.includes('content="index,follow"') && page.body.includes('Barnes Leman') && calls.some(c => c.startsWith('zfind_agencias') && c.includes('activity_code=eq.68.31Z') && c.includes('is_natural_person')), calls);
  const sm = await run({ sitemap: '1' });
  check('sitemap : communes avec 3 agences ou plus seulement', sm.body.includes('/fr/agences-immobilieres/evian-les-bains-74119') && sm.body.includes('-74281<') && !sm.body.includes('-74010<'));
  S.db = realDb; delete process.env.ZFIND_SUPABASE_SERVICE_KEY;

  console.log('\n=== 5. intégration ===');
  check('vercel.json : réécritures et fonction', vercel.rewrites.some(r => r.source === '/fr/agences-immobilieres/:path*' && r.destination === '/api/agences?p=:path*') && vercel.rewrites.some(r => r.source === '/sitemap-agences.xml') && !!vercel.functions['api/agences.js'] && vercel.rewrites.findIndex(r => r.source === '/fr/agences-immobilieres/:path*') < vercel.rewrites.findIndex(r => r.source === '/(.*)'));
  check('robots.txt annonce sitemap-agences.xml', gen.buildRobotsTxt('https://zfind.online').includes('Sitemap: https://zfind.online/sitemap-agences.xml'));
  const hub = H.render({ base: 'https://zfind.online', commune: evian, department, region: null, city: null, arrondissements: [], neighbours: [], listings: [], agencies: 12 });
  check('page « Immobilier à » : lien vers l’annuaire des agences', hub.html.includes('href="https://zfind.online/fr/agences-immobilieres/evian-les-bains-74119"'));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
