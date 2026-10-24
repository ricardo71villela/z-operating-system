/* Z FIND — pages « Prix de l'immobilier » Belgique et Luxembourg. Sans réseau. */
'use strict';
const path = require('path');
const fs = require('fs');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const BL = require(path.join(WEB, 'api', '_lib', 'prix-pages-be-lu.js'));
const handler = require(path.join(WEB, 'api', 'prix-immobilier.js'));
const gen = require(path.join(WEB, 'scripts', 'generate-seo-pages.js'));

let pass = 0, fail = 0;
function check(label, cond) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }
function run(p) {
  return new Promise(resolve => {
    const res = { headers: {}, statusCode: 0, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ status: this.statusCode, headers: this.headers, body: b || '' }); } };
    handler({ method: 'GET', query: { p }, headers: {} }, res);
  });
}
const visible = html => html.replace(/<script[\s\S]*?<\/script>/g, '');
const title = html => (html.match(/<title>(.*?)<\/title>/) || [])[1] || '';

(async () => {
  delete process.env.ZFIND_SUPABASE_SERVICE_KEY;
  process.env.SITE_BASE_URL = 'https://zfind.online';
  const BASE = 'https://zfind.online';

  console.log('\n=== 1. Belgique ===');
  const be = await run('belgique');
  check('pays : 200, provinces liées, autres pays', be.status === 200 && be.body.includes(`${BASE}/fr/prix-immobilier/belgique/province-de-namur-90000`) && be.body.includes(`${BASE}/fr/prix-immobilier/luxembourg`));
  const prov = await run('belgique/province-de-namur-90000');
  check('province : communes listées, CollectionPage', prov.status === 200 && prov.body.includes(`${BASE}/fr/prix-immobilier/belgique/namur-92094`) && prov.body.includes('"CollectionPage"'));
  const bxl = await run('belgique/bruxelles-capitale-4000');
  check('Bruxelles-Capitale traitée comme une province', bxl.status === 200 && bxl.body.includes('/fr/prix-immobilier/belgique/ixelles-21009'));
  const namur = await run('belgique/namur-92094');
  check('commune : canonical, indexable, prix total (pas au m²), FAQ', namur.status === 200 && namur.body.includes(`<link rel="canonical" href="${BASE}/fr/prix-immobilier/belgique/namur-92094">`) && namur.body.includes('content="index,follow"') && !/€\/m²/.test(visible(namur.body)) && namur.body.includes('"FAQPage"'));
  check('commune : frais d’achat wallons, simulateur et estimation Belgique', namur.body.includes('(Wallonie)') && namur.body.includes('#/fr/simulator?market=BE') && namur.body.includes('#/fr/estimation?market=BE'));
  check('commune : source Statbel', namur.body.includes('Statbel'));
  const wrong = await run('belgique/x-92094');
  check('mauvais slug → 301', wrong.status === 301 && wrong.headers.Location === `${BASE}/fr/prix-immobilier/belgique/namur-92094`);
  const anvers = await run('belgique/antwerpen-11002');
  check('exonyme français des grandes villes flamandes', title(anvers.body).includes('Anvers (Antwerpen)'));
  check('code inconnu → 404', (await run('belgique/zzz-99999')).status === 404);

  console.log('\n=== 2. Luxembourg ===');
  const lu = await run('luxembourg');
  check('pays : 200, communes liées', lu.status === 200 && lu.body.includes(`${BASE}/fr/prix-immobilier/luxembourg/esch-sur-alzette`));
  const city = await run('luxembourg/luxembourg');
  check('Luxembourg-Ville : quartiers, Bëllegen Akt, taux BCL daté', city.status === 200 && title(city.body).includes('Luxembourg-Ville') && city.body.includes('Kirchberg') && city.body.includes('Bëllegen Akt') && /Banque centrale du Luxembourg/.test(city.body));
  check('Luxembourg : prix au m² et source Observatoire de l’Habitat', city.body.includes('€/m²') && city.body.includes('Observatoire de l’Habitat'));
  check('commune inconnue → 404', (await run('luxembourg/zzz')).status === 404);
  check('période lisible', BL.luPeriodLabel('12 mois au 2026T2') === 'sur 12 mois, au 2e trimestre 2026' && BL.luPeriodLabel('12 mois (07/2025-06/2026)') === 'de 07/2025 à 06/2026');

  console.log('\n=== 3. qualité des pages ===');
  for (const p of ['belgique', 'belgique/province-de-namur-90000', 'belgique/namur-92094', 'belgique/antwerpen-11002', 'luxembourg', 'luxembourg/luxembourg', 'luxembourg/echternach']) {
    const r = await run(p);
    check(`${p} : titre ≤ 80, un H1, ni « undefined » ni « NaN »`, title(r.body).length <= 80 && (visible(r.body).match(/<h1>/g) || []).length === 1 && !/undefined|NaN/.test(visible(r.body)));
  }

  console.log('\n=== 4. sitemap et liens ===');
  const urls = gen.priceSitemapUrls(BASE);
  const beUrls = urls.filter(u => u.includes('/belgique')); const luUrls = urls.filter(u => u.includes('/luxembourg'));
  check('sitemap-prix : Belgique (pays, 11 provinces, ~565 communes)', beUrls.length > 500 && beUrls.includes(`${BASE}/fr/prix-immobilier/belgique/bruxelles-capitale-4000`));
  check('sitemap-prix : Luxembourg (pays et communes avec un prix)', luUrls.length > 50 && luUrls.includes(`${BASE}/fr/prix-immobilier/luxembourg/luxembourg`));
  check('sitemap-prix : sans doublon, moins de 50 000', new Set(urls).size === urls.length && urls.length < 50000);
  const vercel = JSON.parse(fs.readFileSync(path.join(WEB, 'vercel.json'), 'utf8'));
  check('fonction : données BE et LU incluses', /market-data\/be\/\*\*/.test(vercel.functions['api/prix-immobilier.js'].includeFiles) && /market-data\/lu\/\*\*/.test(vercel.functions['api/prix-immobilier.js'].includeFiles));
  const fr = await run('france');
  check('page France → Belgique et Luxembourg', fr.body.includes(`${BASE}/fr/prix-immobilier/belgique`) && fr.body.includes(`${BASE}/fr/prix-immobilier/luxembourg`));
  const market = gen.buildMarketSeoEntries(BASE).find(e => e.marketKey === 'BE' && e.locale === 'fr');
  check('page marché Belgique → prix', market.html.includes(`${BASE}/fr/prix-immobilier/belgique`));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
