/* Contract: "Explore by region" on the France, Belgique and Luxembourg market pages. */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const GEO = path.join(WEB, 'public', 'geo');
const divisions = require(path.join(WEB, 'src', 'services', 'market-divisions.js'));

let passed = 0;
function check(label, value) {
  assert(value, label);
  passed += 1;
  console.log('PASS:', label);
}
const readJson = rel => JSON.parse(fs.readFileSync(path.join(GEO, rel), 'utf8'));

console.log('\n=== Z FIND MARKET DIVISIONS ===');

check('service covers exactly the launch markets', JSON.stringify(divisions.SUPPORTED) === JSON.stringify(['FR', 'BE', 'LU']));
check('copy exists in fr and en', !!divisions.COPY.fr && !!divisions.COPY.en &&
  Object.keys(divisions.COPY.fr).join() === Object.keys(divisions.COPY.en).join());

// France: 18 regions, 101 departments, every commune, prices joined by INSEE code.
const fr = readJson('fr/index.json');
const deps = fr.regions.flatMap(r => r.deps);
check('France: 13 metropolitan + 5 overseas regions', fr.regions.filter(r => !r.overseas).length === 13 && fr.regions.filter(r => r.overseas).length === 5);
check('France: 101 departments, one commune file each', deps.length === 101 &&
  deps.every(d => fs.existsSync(path.join(GEO, 'fr', 'dep', `${d.c}.json`))));
const communeCount = deps.reduce((s, d) => s + readJson(`fr/dep/${d.c}.json`).communes.length, 0);
check('France: every current commune (≥ 34 800)', communeCount >= 34800 && communeCount === deps.reduce((s, d) => s + d.count, 0));
const hs = readJson('fr/dep/74.json').communes;
const evian = hs.find(x => x.c === '74119');
check('France: Évian-les-Bains in Haute-Savoie with postcode and DVF price', evian && evian.cp.includes('74500') && evian.pa > 0);
const paris = readJson('fr/dep/75.json').communes.find(x => x.c === '75056');
check('France: Paris lists its 20 arrondissements', paris && paris.arr.length === 20);

// Belgium: 3 regions, 10 provinces, 565 communes (REFNIS 2025).
const be = readJson('be.json');
const beCommunes = be.regions.flatMap(r => r.provinces.flatMap(p => p.arrondissements.flatMap(a => a.communes)));
check('Belgium: 3 regions, 10 provinces, 565 communes', be.regions.length === 3 &&
  be.regions.flatMap(r => r.provinces).filter(p => p.c).length === 10 && beCommunes.length === 565);
check('Belgium: Brussels-Capital has no province and 19 communes',
  (r => r.provinces.length === 1 && !r.provinces[0].c && r.provinces[0].arrondissements[0].communes.length === 19)(be.regions.find(r => r.c === '4000')));
check('Belgium: 2025 fusions (Tessenderlo-Ham) and Statbel prices', beCommunes.some(x => x.n === 'Tessenderlo-Ham') && beCommunes.filter(x => x.pm).length > 500);

// Luxembourg: 12 cantons, 100 communes, Luxembourg-City districts.
const lu = readJson('lu.json');
check('Luxembourg: 12 cantons, 100 communes', lu.cantons.length === 12 && lu.cantons.reduce((s, k) => s + k.communes.length, 0) === 100);
check('Luxembourg: city districts available for the capital', lu.districts.includes('Kirchberg'));

// Behaviour.
const { matches, searchHref, fold } = divisions._internals;
check('filter matches name without accents, postcode prefix, Dutch name and localities',
  matches({ n: 'Évian-les-Bains', cp: ['74500'] }, fold('evian')) && matches({ n: 'Évian-les-Bains', cp: ['74500'] }, '745') &&
  matches({ n: 'Ixelles', nl: 'Elsene', cp: ['1050'] }, 'elsene') && matches({ n: 'Luxembourg', cp: [], loc: ['Kirchberg'] }, 'kirchberg') &&
  !matches({ n: 'Thonon-les-Bains', cp: ['74200'] }, 'evian'));
check('commune links open the market search scoped to the commune',
  searchHref('fr', 'FR', 'Évian-les-Bains') === '#/fr/search?market=FR&transactionType=sale&q=%C3%89vian-les-Bains');

const app = fs.readFileSync(path.join(WEB, 'src', 'app.js'), 'utf8');
const build = fs.readFileSync(path.join(WEB, 'scripts', 'build.js'), 'utf8');
check('market page renders the divisions section before the prices', app.includes('id="market-divisions-root"') &&
  app.indexOf('id="market-divisions-root"') < app.indexOf('id="market-prices-root"') && app.includes('renderMarketDivisions(market);'));
check('build injects the service and its CSS', build.includes("read('services/market-divisions.js')") && build.includes("read('market-divisions.css')"));

console.log(`\nMARKET DIVISIONS: ${passed}/${passed} PASSED`);
