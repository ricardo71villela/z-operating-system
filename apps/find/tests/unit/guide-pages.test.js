/* Z FIND — guides juridiques en pages indexables (scripts/guide-pages.js). Sans réseau. */
'use strict';
const path = require('path');
const fs = require('fs');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const G = require(path.join(WEB, 'scripts', 'guide-pages.js'));
const gen = require(path.join(WEB, 'scripts', 'generate-seo-pages.js'));

let pass = 0, fail = 0;
function check(label, cond) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }

const BASE = 'https://zfind.online';
const pages = G.buildGuidePages(BASE);
const by = Object.fromEntries(pages.map(p => [p.path, p]));

console.log('\n=== 1. guides publiés ===');
check('sommaire + 4 guides des marchés de lancement (France, Belgique)', pages.length === 5 && ['/fr/guides', '/fr/guides/immobilier-france', '/fr/guides/location-touristique-france', '/fr/guides/immobilier-belgique', '/fr/guides/location-touristique-belgique'].every(p => by[p]));
for (const p of pages) {
  const visible = p.html.replace(/<script[\s\S]*?<\/script>/g, '');
  const title = (p.html.match(/<title>(.*?)<\/title>/) || [])[1] || '';
  const desc = (p.html.match(/<meta name="description" content="(.*?)">/) || [])[1] || '';
  check(`${p.path} : canonical, indexable, un H1, titre ≤ 80, description ≤ 160`,
    p.html.includes(`<link rel="canonical" href="${BASE}${p.path}">`) && p.html.includes('content="index,follow"') && (visible.match(/<h1>/g) || []).length === 1 && title.length <= 80 && desc.length <= 160);
  check(`${p.path} : aucune navigation d’application ni marqueur éditorial`, !/onclick=|navigate\(|LEGAL_STATUS|Master [A-Z]{2} ·|DRAFT/.test(p.html));
}

console.log('\n=== 2. contenu ===');
const fr = by['/fr/guides/immobilier-france'];
check('France : contenu complet du guide (sections et glossaire)', fr.html.includes('id="fr-lg-a"') && fr.html.includes('id="fr-lg-i"') && fr.html.length > 40000);
check('France : FAQ du guide en FAQPage (au moins 10 questions)', fr.faqCount >= 10 && fr.html.includes('"FAQPage"') && fr.html.includes('"Article"'));
check('France : liens vers les autres guides en vraies URL', fr.html.includes(`href="${BASE}/fr/guides/location-touristique-france"`) && fr.html.includes(`href="${BASE}/fr/guides/immobilier-belgique"`));
check('France : taux d’endettement HCSF à 35 %', fr.html.includes('35 % assurance comprise') && !/endettement maximal de 33 %/.test(fr.html));
check('pas de guide hors lancement (Espagne, Portugal…)', !pages.some(p => /espagne|portugal|legal-es|al-manual/.test(p.path)));
check('outils Z Find liés depuis chaque guide', pages.every(p => p.html.includes(`${BASE}/fr/frais-de-notaire`)));

console.log('\n=== 3. FAQ et liens ===');
check('faqOf lit « Questions fréquentes »', G.faqOf('<div class="legal-section" id="x"><h2>QUESTIONS FRÉQUENTES</h2><ol><li><strong>Peut-on ?</strong> Oui, sous conditions.</li></ol></div>').length === 1);
const linked = G.staticLinks(`<button class="btn btn-gold" onclick="navigate('search')">Rechercher</button><a href="#" onclick="navigate('legal-fr');return false;">Guide</a><button class="btn" onclick="navigate('legal-xx')">X</button>`, BASE, { 'legal-fr': '/fr/guides/immobilier-france' });
check('staticLinks : boutons et liens deviennent des <a href>, cibles inconnues retirées',
  linked.includes(`<a class="btn btn-gold" href="${BASE}/#/fr/search?market=FR">Rechercher</a>`) && linked.includes(`<a href="${BASE}/fr/guides/immobilier-france">Guide</a>`) && !linked.includes('legal-xx'));

console.log('\n=== 4. site ===');
const fr_market = gen.buildMarketSeoEntries(BASE).find(e => e.marketKey === 'FR' && e.locale === 'fr');
check('page marché France → guides statiques', fr_market.html.includes(`${BASE}/fr/guides/immobilier-france`));
const src = fs.readFileSync(path.join(WEB, 'scripts', 'generate-seo-pages.js'), 'utf8');
check('guides écrits au build et ajoutés au sitemap', src.includes('guidePages.buildGuidePages(baseUrl)'));
check('pied de page : lien vers les guides', fs.readFileSync(path.join(WEB, 'src', 'body.html'), 'utf8').includes('<a href="/fr/guides">'));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
