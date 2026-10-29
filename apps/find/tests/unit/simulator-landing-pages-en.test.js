/* Z FIND — English property calculators (src/services/simulator-landing-pages-en.js). No network. */
'use strict';
const path = require('path');
const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const EN = require(path.join(WEB, 'src', 'services', 'simulator-landing-pages-en.js'));
const FR = require(path.join(WEB, 'src', 'services', 'simulator-landing-pages.js'));
const gen = require('fs').readFileSync(path.join(WEB, 'scripts', 'generate-seo-pages.js'), 'utf8');

let pass = 0, fail = 0;
function check(label, cond, extra) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } }

const BASE = 'https://zfind.online';
const pages = EN.buildSimulatorPagesEn(BASE, new Date('2026-10-24'));
const by = Object.fromEntries(pages.map(p => [p.path, p.html]));
const fr = Object.fromEntries(FR.buildSimulatorPages(BASE, new Date('2026-10-24')).map(p => [p.path, p.html]));

check('7 English pages under /en/', pages.length === 7 && pages.every(p => p.path.startsWith('/en/')));
check('every page: lang en, canonical, indexable, og:locale en_GB', pages.every(p => p.html.includes('<html lang="en">') && p.html.includes(`<link rel="canonical" href="${BASE}${p.path}">`) && p.html.includes('content="index,follow"') && p.html.includes('content="en_GB"')));
check('hreflang both ways with the French page', Object.entries(FR.EN_ALTERNATE).every(([f, e]) => by[e].includes(`hreflang="fr" href="${BASE}${f}"`) && by[e].includes(`hreflang="en" href="${BASE}${e}"`) && fr[f].includes(`hreflang="en" href="${BASE}${e}"`) && fr[f].includes(`hreflang="fr" href="${BASE}${f}"`)));
const notary = by['/en/french-notary-fees-calculator'];
check('notary page: English title, calculator, table in €', notary.includes('<title>French notary fees calculator 2026') && notary.includes('id="calc-notaire"') && /€250,000/.test(notary) && notary.includes('"FAQPage"'));
check('English number engine (commas as thousands)', notary.includes("new Intl.NumberFormat('en-GB'") && notary.includes('replace(/[\\s,€]/g'));
const loan = by['/en/france-mortgage-calculator'];
check('mortgage page: reference rate table when the rate is current', loan.includes('Monthly payments by loan amount') && loan.includes('years ('));
const stale = EN.buildSimulatorPagesEn(BASE, new Date('2027-06-01'));
check('no current rate: payment table left out', !stale.find(p => p.path === '/en/france-mortgage-calculator').html.includes('Monthly payments by loan amount'));
check('no French leftovers in headings', pages.every(p => !/Questions fréquentes|Calculer mes|Autres outils/.test(p.html)));
check('no undefined / NaN', pages.every(p => !/undefined|NaN/.test(p.html.replace(/<script[\s\S]*?<\/script>/g, ''))));
check('written at build with the French pages', gen.includes('simulatorPagesEn.buildSimulatorPagesEn(baseUrl)'));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
