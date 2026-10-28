/* Z FIND — pages « Prix de l'immobilier » (api/prix-immobilier.js, api/_lib/prix-pages.js). Sans réseau. */
'use strict';
const path = require('path');
const fs = require('fs');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const P = require(path.join(WEB, 'api', '_lib', 'prix-pages.js'));
const handler = require(path.join(WEB, 'api', 'prix-immobilier.js'));
const gen = require(path.join(WEB, 'scripts', 'generate-seo-pages.js'));

let pass = 0, fail = 0;
function check(label, cond) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }

function run(p, method) {
  return new Promise(resolve => {
    const res = { headers: {}, statusCode: 0, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ status: this.statusCode, headers: this.headers, body: b || '' }); } };
    handler({ method: method || 'GET', query: p == null ? {} : { p }, headers: {} }, res);
  });
}

(async () => {
  delete process.env.ZFIND_SUPABASE_SERVICE_KEY;
  process.env.SITE_BASE_URL = 'https://zfind.online';

  console.log('\n=== 1. slugs, routes, français ===');
  check('slug sans accents ni apostrophes', P.slugify('Évian-les-Bains') === 'evian-les-bains' && P.slugify("L'Haÿ-les-Roses") === 'l-hay-les-roses');
  check('route commune', JSON.stringify(P.parsePath('france/evian-les-bains-74119')) === JSON.stringify({ kind: 'commune', code: '74119', slug: 'evian-les-bains' }));
  check('route département, Corse et outre-mer', P.parsePath('france/haute-savoie-74').kind === 'department' && P.parsePath('france/corse-du-sud-2a').code === '2A' && P.parsePath('france/guadeloupe-971').code === '971');
  check('route commune Corse et outre-mer', P.parsePath('france/ajaccio-2a004').code === '2A004' && P.parsePath('france/baie-mahault-97103').code === '97103');
  check('pays, racine, inconnu', P.parsePath('france').kind === 'country' && P.parsePath('').kind === 'root' && P.parsePath('belgique').kind === 'unknown');
  check('« à / au / aux »', P.aCommune('Annecy') === 'à Annecy' && P.aCommune('Le Havre') === 'au Havre' && P.aCommune('Les Gets') === 'aux Gets');
  check('« de / d’ / du »', P.deCommune('Évian-les-Bains') === 'd’Évian-les-Bains' && P.deCommune('Le Havre') === 'du Havre' && P.deCommune('Lyon') === 'de Lyon');

  console.log('\n=== 2. pages servies ===');
  const evian = await run('france/evian-les-bains-74119');
  check('commune : 200, en cache CDN', evian.status === 200 && /s-maxage=86400/.test(evian.headers['Cache-Control']));
  check('commune : canonical, indexable, H1', evian.body.includes('<link rel="canonical" href="https://zfind.online/fr/prix-immobilier/france/evian-les-bains-74119">') && evian.body.includes('content="index,follow"') && evian.body.includes('<h1>Prix de l’immobilier à Évian-les-Bains</h1>'));
  check('commune : JSON-LD fil d’Ariane et FAQ', evian.body.includes('"BreadcrumbList"') && evian.body.includes('"FAQPage"'));
  check('commune : simulateurs Z Find (crédit, capacité, rentabilité) et estimation',
    /#\/fr\/simulator\?market=FR&amp;mode=payment&amp;price=\d+/.test(evian.body) && evian.body.includes('mode=capacity') && /#\/fr\/yield\?market=FR&amp;mode=long&amp;price=\d+/.test(evian.body) && evian.body.includes('#/fr/estimation?market=FR&amp;mode=owner'));
  check('commune : frais de notaire et source DVF', evian.body.includes('Frais d’achat') && evian.body.includes('DVF'));
  check('commune : liens vers d’autres communes du département', (evian.body.match(/href="https:\/\/zfind\.online\/fr\/prix-immobilier\/france\/[a-z0-9-]+-74\d{3}"/g) || []).length >= 10);
  check('commune : aucun texte interne ni « undefined »', !/undefined|NaN|phase dédiée/.test(evian.body));
  const wrongSlug = await run('france/x-74119');
  check('mauvais slug → 301 vers l’URL canonique', wrongSlug.status === 301 && wrongSlug.headers.Location === 'https://zfind.online/fr/prix-immobilier/france/evian-les-bains-74119');
  const dep = await run('france/haute-savoie-74');
  check('département : 200 et tableau des communes', dep.status === 200 && dep.body.includes('Prix au m² par commune') && dep.body.includes('"CollectionPage"'));
  const depShort = await run('france/74');
  check('département sans slug → 301', depShort.status === 301 && /haute-savoie-74$/.test(depShort.headers.Location));
  const fr = await run('france');
  check('France : 200, départements liés, Alsace-Moselle « Hors DVF »', fr.status === 200 && fr.body.includes('/fr/prix-immobilier/france/haute-savoie-74') && fr.body.includes('Hors DVF'));
  const root = await run(null);
  check('/fr/prix-immobilier → 301 vers la France', root.status === 301 && /\/fr\/prix-immobilier\/france$/.test(root.headers.Location));
  const missing = await run('france/zzz-99999');
  check('commune inconnue → 404 noindex', missing.status === 404 && missing.body.includes('noindex'));
  const post = await run('france', 'POST');
  check('POST refusé', post.status === 405);

  console.log('\n=== 3. pages minces ===');
  const thin = { c: '74999', n: 'Testville', k: 'com', A: { '2024-2025': [2, 1000, 2000, 3000] }, M: { '2024-2025': [1, 1000, 2000, 3000] } };
  const html = P.renderCommune({ base: 'https://zfind.online', commune: thin, department: { code: '74', name: 'Haute-Savoie', A: {}, M: {} }, national: { A: {}, M: {} }, neighbours: [], agencies: 0, today: new Date('2026-10-24') });
  check('moins de 5 ventes : noindex, sans FAQ', !P.isIndexable(thin) && html.includes('content="noindex,follow"') && !html.includes('"FAQPage"'));

  console.log('\n=== 4. sitemap et robots ===');
  const urls = gen.priceSitemapUrls('https://zfind.online');
  check('sitemap-prix : plus de 20 000 pages, moins de 50 000', urls.length > 20000 && urls.length < 50000);
  check('sitemap-prix : hub France et URL canoniques', urls.includes('https://zfind.online/fr/prix-immobilier/france') && urls.includes('https://zfind.online/fr/prix-immobilier/france/evian-les-bains-74119'));
  check('sitemap-prix : pas d’Alsace-Moselle', !urls.filter(u => u.includes('/france/')).some(u => /-(57|67|68)\d{3}$|-(57|67|68)$/.test(u)));
  check('robots.txt annonce les deux sitemaps', gen.buildRobotsTxt('https://zfind.online').includes('Sitemap: https://zfind.online/sitemap-prix.xml'));

  console.log('\n=== 5. Vercel ===');
  const vercel = JSON.parse(fs.readFileSync(path.join(WEB, 'vercel.json'), 'utf8'));
  const idx = vercel.rewrites.findIndex(r => r.source === '/fr/prix-immobilier/:path*');
  const catchAll = vercel.rewrites.findIndex(r => r.source === '/(.*)');
  check('réécriture avant la route SPA', idx >= 0 && idx < catchAll && vercel.rewrites[idx].destination === '/api/prix-immobilier?p=:path*');
  check('fonction : données DVF et simulateurs inclus', /public\/market-data\/fr/.test(vercel.functions['api/prix-immobilier.js'].includeFiles) && /credit-simulator/.test(vercel.functions['api/prix-immobilier.js'].includeFiles));
  const body = fs.readFileSync(path.join(WEB, 'src', 'body.html'), 'utf8');
  check('pied de page : liens explorables (sans #) vers les prix', body.includes('<a href="/fr/prix-immobilier/france" data-i18n="footer.pricesFrance">'));

  console.log('\n=== 6. régions, villes à arrondissements ===');
  const frIdx = JSON.parse(fs.readFileSync(path.join(WEB, 'public', 'market-data', 'fr', 'index.json'), 'utf8'));
  const regions = P.regionsOf(frIdx);
  check('13 régions métropolitaines (DROM et Mayotte exclus)', regions.length === 13 && !regions.some(r => /Guadeloupe|Mayotte|Réunion/.test(r.name)));
  check('route région', JSON.stringify(P.parsePath('france/region-bretagne')) === JSON.stringify({ kind: 'region', slug: 'bretagne' }));
  check('« en / dans le / dans les »', P.enRegion('Bretagne') === 'en Bretagne' && P.enRegion('Grand Est') === 'dans le Grand Est' && P.enRegion('Hauts-de-France') === 'dans les Hauts-de-France');
  const ara = regions.find(r => r.name === 'Auvergne-Rhône-Alpes');
  const araA = P.regionLatest(ara, 'A');
  check('prix de référence régional : moyenne des médianes pondérée par les ventes, entre le min et le max des départements',
    araA && araA.n > 1000 && ara.departments.every(d => true) &&
    araA.med >= Math.min(...ara.departments.map(d => d.A['2024-2025'][2])) && araA.med <= Math.max(...ara.departments.map(d => d.A['2024-2025'][2])));
  const reg = await run('france/region-auvergne-rhone-alpes');
  check('page région : 200, H1, départements liés, FAQ, comparaison France', reg.status === 200 && reg.body.includes('<h1>Prix de l’immobilier en Auvergne-Rhône-Alpes</h1>') &&
    reg.body.includes('/fr/prix-immobilier/france/haute-savoie-74') && reg.body.includes('"FAQPage"') && reg.body.includes('comparée à la France') && !/undefined|NaN/.test(reg.body));
  const ge = await run('france/region-grand-est');
  check('Grand Est : Alsace-Moselle signalée hors DVF', ge.status === 200 && ge.body.includes('Hors DVF (Alsace-Moselle)'));
  check('région inconnue → 404', (await run('france/region-atlantide')).status === 404);
  const frPage = await run('france');
  check('page France : tableau par région lié', frPage.body.includes('Prix au m² par région') && frPage.body.includes('/fr/prix-immobilier/france/region-bretagne'));
  const ev = await run('france/evian-les-bains-74119');
  check('commune : comparaison commune / département / région / France sur 2024-2025, fil d’Ariane avec la région',
    ev.body.includes('comparés au département, à la région Auvergne-Rhône-Alpes et à la France') && ev.body.includes('region-auvergne-rhone-alpes') && ev.body.includes('"name":"Auvergne-Rhône-Alpes"'));
  const dep74 = await run('france/haute-savoie-74');
  check('département : comparaison avec la région et la France', dep74.body.includes('Prix dans le département comparés à la région Auvergne-Rhône-Alpes et à la France'));
  const lyon = await run('france/lyon-69123');
  check('ville : prix par arrondissement', lyon.body.includes('Prix au m² par arrondissement de Lyon') && lyon.body.includes('lyon-1er-arrondissement-69381'));
  const lyon3 = await run('france/lyon-3e-arrondissement-69383');
  check('arrondissement : comparé à la ville, fil d’Ariane par la ville', P.cityOfArrondissement('69383') === '69123' && P.cityOfArrondissement('69123') === null &&
    lyon3.body.includes('comparés à Lyon, au département') && lyon3.body.includes('"name":"Lyon","item":"https://zfind.online/fr/prix-immobilier/france/lyon-69123"'));
  check('sitemap-prix : les 13 régions', regions.every(r => urls.includes('https://zfind.online' + P.regionPath(r.name))));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
