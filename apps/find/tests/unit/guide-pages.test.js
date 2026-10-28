/* Z FIND — guides juridiques v2 (scripts/guide-pages.js). Sans réseau. */
'use strict';
const path = require('path');
const fs = require('fs');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const G = require(path.join(WEB, 'scripts', 'guide-pages.js'));
const BASE = 'https://zfind.online';

let pass = 0, fail = 0;
function check(label, cond) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }

const pages = G.buildGuidePages(BASE);
const by = Object.fromEntries(pages.map(p => [p.path, p]));
const FR = '/fr/guides/immobilier-france';

console.log('\n=== 1. pages ===');
check('sommaire, 4 guides et 7 chapitres du guide France', pages.length === 12 &&
  ['/fr/guides', FR, '/fr/guides/location-touristique-france', '/fr/guides/immobilier-belgique', '/fr/guides/location-touristique-belgique'].every(p => by[p]) &&
  G.FR_CHAPTERS.every(c => by[`${FR}/${c.slug}`]));
for (const p of pages) {
  const h1s = (p.html.match(/<h1>/g) || []).length;
  const title = (p.html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const desc = (p.html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  check(`${p.path} : canonical, indexable, un H1, titre ≤ 90, description ≤ 160`,
    p.html.includes(`<link rel="canonical" href="${BASE}${p.path}">`) && p.html.includes('content="index,follow"') && h1s === 1 && title.length <= 90 && desc.length <= 160);
  check(`${p.path} : ni navigation d’application, ni mention interne, ni « undefined »`,
    !/onclick=|navigate\(|LEGAL_STATUS|DRAFT|Niveau : NATIONAL|MODULE SÉPARÉ|Juridiction :|undefined|NaN/.test(p.html));
}

console.log('\n=== 2. guide France ===');
const fr = by[FR];
check('entrée du guide : 7 chapitres en cartes et FAQ (FAQPage, au moins 10 questions)',
  G.FR_CHAPTERS.every(c => fr.html.includes(`href="${BASE}${FR}/${c.slug}"`)) && fr.faqCount >= 10 && fr.html.includes('"FAQPage"') && fr.html.includes('<details>'));
const buy = by[`${FR}/acheter`];
check('chapitre « Acheter » : H1, « Dans ce chapitre », chapitre suivant, outils, termes du lexique liés',
  buy.html.includes('<h1>Acheter un bien immobilier en France</h1>') && buy.html.includes('Dans ce chapitre') &&
  buy.html.includes(`href="${BASE}${FR}/vendre"`) && buy.html.includes(`${BASE}/fr/frais-de-notaire`) &&
  buy.html.includes('class="zg-term" href="https://zfind.online/fr/lexique-immobilier/compromis-de-vente"'));
check('chaque terme du lexique n’est lié qu’une fois par page', pages.every(p => {
  const hrefs = [...p.html.matchAll(/class="zg-term" href="([^"]+)"/g)].map(m => m[1]);
  return hrefs.length === new Set(hrefs).size;
}));
check('renvois internes « voir section X » remplacés par des liens de chapitre', !pages.some(p => /voir section [A-I]\b/.test(p.html)) &&
  /[Vv]oir le chapitre <a href="https:\/\/zfind\.online\/fr\/guides\/immobilier-france\/acheter">Acheter<\/a>/.test(by[`${FR}/impots`].html));
check('glossaire de l’application remplacé par le lexique', !pages.some(p => p.html.includes('id="fr-lg-i"')) && fr.html.includes(`${BASE}/fr/lexique-immobilier`));
check('titres en minuscules (plus de titres en capitales)', !pages.some(p => /<h[1-3][^>]*>[^<a-z]{12,}<\/h[1-3]>/.test(p.html)));
check('taux d’endettement HCSF à 35 %', buy.html.includes('35 % assurance comprise') && !/endettement maximal de 33 %/.test(buy.html));

console.log('\n=== 3. autres guides et outils ===');
check('Belgique : sections en intertitres, outils belges', by['/fr/guides/immobilier-belgique'].html.includes('<h2 id="be-duties">') && by['/fr/guides/immobilier-belgique'].html.includes(`${BASE}/fr/frais-achat-immobilier-belgique`));
check('location touristique : plus de « Module séparé »', by['/fr/guides/location-touristique-france'].html.includes('Le régime du meublé de tourisme'));
check('pas de guide hors lancement (Espagne, Portugal…)', !pages.some(p => /espagne|portugal|legal-es|al-manual/.test(p.path)));
check('outils Z Find liés depuis chaque guide', pages.filter(p => p.view).every(p => p.html.includes('Outils gratuits')));
check('faqOf lit « Questions fréquentes »', G.faqOf('<div class="legal-section" id="x"><h2>QUESTIONS FRÉQUENTES</h2><ol><li><strong>Peut-on ?</strong> Oui, sous conditions.</li></ol></div>').length === 1);
check('staticLinks : boutons et liens deviennent des <a href>, cibles inconnues retirées',
  G.staticLinks(`<button class="btn" onclick="navigate('legal-fr')">FR</button><button onclick="navigate('zzz')">X</button><a href="#" onclick="navigate('legal-fr');return false;">G</a>`, BASE, { 'legal-fr': FR })
    === `<a class="btn" href="${BASE}${FR}">FR</a><a href="${BASE}${FR}">G</a>`);
check('sentenceCase', G.sentenceCase('ACHETER UN BIEN IMMOBILIER') === 'Acheter un bien immobilier' && G.sentenceCase('Bail résidentiel') === 'Bail résidentiel');

const gen = require(path.join(WEB, 'scripts', 'generate-seo-pages.js'));
const frMarket = gen.buildMarketSeoEntries(BASE).find(e => e.canonicalUrl.endsWith('/fr/marches/france'));
check('page marché France → guide statique', frMarket && frMarket.html.includes(`${BASE}${FR}`));
const src = fs.readFileSync(path.join(WEB, 'scripts', 'generate-seo-pages.js'), 'utf8');
check('guides écrits au build et ajoutés au sitemap', src.includes('guidePages.buildGuidePages(baseUrl)'));
check('pied de page : liens vers les guides', fs.readFileSync(path.join(WEB, 'src', 'body.html'), 'utf8').includes('<a href="/fr/guides/immobilier-france/acheter"'));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
