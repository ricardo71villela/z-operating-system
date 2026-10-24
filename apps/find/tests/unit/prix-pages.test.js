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
  check('sitemap-prix : pas d’Alsace-Moselle', !urls.some(u => /-(57|67|68)\d{3}$|-(57|67|68)$/.test(u)));
  check('robots.txt annonce les deux sitemaps', gen.buildRobotsTxt('https://zfind.online').includes('Sitemap: https://zfind.online/sitemap-prix.xml'));

  console.log('\n=== 5. Vercel ===');
  const vercel = JSON.parse(fs.readFileSync(path.join(WEB, 'vercel.json'), 'utf8'));
  const idx = vercel.rewrites.findIndex(r => r.source === '/fr/prix-immobilier/:path*');
  const catchAll = vercel.rewrites.findIndex(r => r.source === '/(.*)');
  check('réécriture avant la route SPA', idx >= 0 && idx < catchAll && vercel.rewrites[idx].destination === '/api/prix-immobilier?p=:path*');
  check('fonction : données DVF et simulateurs inclus', /public\/market-data\/fr/.test(vercel.functions['api/prix-immobilier.js'].includeFiles) && /credit-simulator/.test(vercel.functions['api/prix-immobilier.js'].includeFiles));
  const body = fs.readFileSync(path.join(WEB, 'src', 'body.html'), 'utf8');
  check('pied de page : liens explorables (sans #) vers les prix', body.includes('<a href="/fr/prix-immobilier/france">'));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
