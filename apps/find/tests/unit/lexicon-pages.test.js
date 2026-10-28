/* Z FIND — lexique immobilier FR + glossaire EN (scripts/lexicon-pages.js)
   et langue par défaut du site (français). Sans réseau. */
'use strict';
const path = require('path');
const fs = require('fs');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const L = require(path.join(WEB, 'scripts', 'lexicon-pages.js'));
const gen = fs.readFileSync(path.join(WEB, 'scripts', 'generate-seo-pages.js'), 'utf8');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }

const BASE = 'https://zfind.online';
const terms = L.loadLexicon();
const pages = L.buildLexiconPages(BASE);
const byPath = new Map(pages.map(p => [p.path, p.html]));

console.log('\n=== 1. données ===');
check('CSV : guillemets, virgules et retours à la ligne', JSON.stringify(L.parseCsv('﻿a,b\n"x, ""y""","l1\nl2"\n')) === JSON.stringify([{ a: 'x, "y"', b: 'l1\nl2' }]));
check('79 termes, tous traduits en anglais', terms.length === 79 && terms.every(t => t.termEn && t.definitionEn && t.slugEn));
check('slugs FR et EN uniques', new Set(terms.map(t => t.slug)).size === terms.length && new Set(terms.map(t => t.slugEn)).size === terms.length);
check('catégories traduites', terms.every(t => L.CATEGORY_EN[t.category] === t.categoryEn));
check('termes liés : uniquement des termes existants, jamais lui-même', terms.every(t => t.related.every(r => terms.includes(r) && r !== t)));
check('termes liés : sigles et synonymes résolus (DPE, PLU, Prêt immobilier)',
  terms.find(t => t.slug === 'audit-energetique').related.some(r => r.slug === 'dpe') &&
  terms.find(t => t.slug === 'terrain-constructible').related.some(r => r.slug === 'plan-local-urbanisme') &&
  terms.find(t => t.slug === 'condition-suspensive').related.some(r => r.slug === 'credit-immobilier'));
check('chaque terme a au moins 2 termes liés', terms.every(t => t.related.length >= 2));
check('outils : seulement des clés connues', Object.values(L.TERM_TOOLS).every(keys => keys.every(k => ['frais', 'pret', 'capacite', 'rentabilite', 'estimation', 'prix', 'guide'].includes(k))) && Object.keys(L.TERM_TOOLS).every(s => terms.some(t => t.slug === s)));

console.log('\n=== 2. pages ===');
check('160 pages : 2 sommaires + 79 termes × 2 langues', pages.length === 160 && byPath.has('/fr/lexique-immobilier') && byPath.has('/en/real-estate-glossary'));
const fr = byPath.get('/fr/lexique-immobilier/dpe');
const en = byPath.get('/en/real-estate-glossary/energy-performance-certificate');
check('terme FR : lang, canonical, H1, indexable', fr.includes('<html lang="fr">') && fr.includes('<link rel="canonical" href="https://zfind.online/fr/lexique-immobilier/dpe">') && fr.includes('<h1>Diagnostic de performance énergétique (DPE)</h1>') && fr.includes('content="index,follow"'));
check('terme EN : lang, canonical, H1', en.includes('<html lang="en">') && en.includes('<link rel="canonical" href="https://zfind.online/en/real-estate-glossary/energy-performance-certificate">') && en.includes('<h1>Energy performance certificate (DPE)</h1>'));
check('hreflang croisés fr/en et x-default en français', [fr, en].every(h => h.includes('hreflang="fr" href="https://zfind.online/fr/lexique-immobilier/dpe"') && h.includes('hreflang="en" href="https://zfind.online/en/real-estate-glossary/energy-performance-certificate"') && h.includes('hreflang="x-default" href="https://zfind.online/fr/lexique-immobilier/dpe"')));
check('JSON-LD DefinedTerm + fil d’Ariane', fr.includes('"@type":"DefinedTerm"') && fr.includes('"inDefinedTermSet"') && fr.includes('"BreadcrumbList"'));
check('sommaires : DefinedTermSet de 79 termes', ['/fr/lexique-immobilier', '/en/real-estate-glossary'].every(p => { const m = byPath.get(p).match(/"hasDefinedTerm":\[(.*?)\]/); return m && (m[1].match(/"DefinedTerm"/g) || []).length === 79; }));
check('frais d’acquisition → simulateur de frais de notaire', byPath.get('/fr/lexique-immobilier/frais-acquisition').includes('href="https://zfind.online/fr/frais-de-notaire"'));
check('capacité d’emprunt → simulateur (FR) et outil anglais (EN)', byPath.get('/fr/lexique-immobilier/capacite-emprunt').includes('/fr/capacite-emprunt"') && byPath.get('/en/real-estate-glossary/borrowing-capacity').includes('/#/en/simulator?market=FR&amp;mode=capacity'));
check('page EN sans texte français d’interface', !/Termes liés|Outils gratuits|Aussi appelé|Catégorie/.test(en) && en.includes('Related terms') && en.includes('Also known as:'));
check('liens internes du lexique : tous vers une page générée', pages.every(p => [...p.html.matchAll(/href="https:\/\/zfind\.online(\/(?:fr\/lexique-immobilier|en\/real-estate-glossary)[^"#]*)"/g)].every(m => byPath.has(m[1]))));
check('aucun « undefined », « NaN » ni statut éditorial interne', pages.every(p => !/undefined|NaN|À vérifier/.test(p.html)));
check('avertissement « à titre informatif » sur chaque terme', pages.filter(p => p.slug).every(p => /à titre informatif|for information only/.test(p.html)));

console.log('\n=== 3. intégration ===');
check('build : pages écrites et ajoutées au sitemap', /lexiconPages\.buildLexiconPages\(baseUrl\)/.test(gen));
const body = fs.readFileSync(path.join(WEB, 'src', 'body.html'), 'utf8');
check('pied de page : liens vers le lexique FR et le glossaire EN', body.includes('<a href="/fr/lexique-immobilier">') && body.includes('href="/en/real-estate-glossary"'));

console.log('\n=== 4. langue par défaut : français ===');
const app = fs.readFileSync(path.join(WEB, 'src', 'app.js'), 'utf8');
const parse = app.slice(app.indexOf('function parseHash()'), app.indexOf('function parseHash()') + 1500);
check('sans langue dans l’URL : français, jamais la langue mémorisée', !parse.includes("localStorage.getItem('zfind_lang')") && /lang = DEFAULT_LANG;/.test(parse));
const welcome = fs.readFileSync(path.join(WEB, 'src', 'services', 'international-welcome.js'), 'utf8');
const resolve = welcome.slice(welcome.indexOf('function resolveInitialLocale()'), welcome.indexOf('function resolveInitialLocale()') + 400);
check('accueil international : URL puis français', !resolve.includes('safeStorageGet') && resolve.includes('publicLocales.DEFAULT_PUBLIC_LOCALE'));
const locales = require(path.join(WEB, 'src', 'services', 'public-locales.js'));
check('langue publique par défaut = fr', locales.DEFAULT_PUBLIC_LOCALE === 'fr');

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
