/* Contract: official market prices on the France, Belgique and Luxembourg market pages. */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const DATA = path.join(WEB, 'public', 'market-data');
const prices = require(path.join(WEB, 'src', 'services', 'market-prices.js'));

let passed = 0;
function check(label, value) {
  assert(value, label);
  passed += 1;
  console.log('PASS:', label);
}
const readJson = rel => JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf8'));

console.log('\n=== Z FIND MARKET PRICES ===');

check('service covers exactly the launch markets', JSON.stringify(prices.SUPPORTED) === JSON.stringify(['FR', 'BE', 'LU']));
check('copy exists in fr and en', !!prices.COPY.fr && !!prices.COPY.en && prices.COPY.fr.title && prices.COPY.en.title);
check('names are HTML-escaped', prices._internals.esc('<b>"x"</b>') === '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');

const fr = readJson('fr/index.json');
check('France: DVF source, €/m², 101 departments', fr.unit === 'eur_m2' && /DVF/.test(fr.source) && Object.keys(fr.departments).length === 101);
check('France: national medians for houses and apartments in the latest year',
  fr.national.A[fr.latest][2] > 1000 && fr.national.M[fr.latest][2] > 1000);
const hs = readJson('fr/dep/74.json');
const evian = hs.communes.find(c => c.c === '74119');
check('France: commune file per department (Évian-les-Bains in 74)',
  evian && evian.n === 'Évian-les-Bains' && evian.A[fr.latest][0] >= 5);
const paris = readJson('fr/dep/75.json').communes;
check('France: Paris and its 20 arrondissements', paris.some(c => c.c === '75056') && paris.filter(c => c.k === 'arm').length === 20);
check('France: every department with sales has a commune file',
  Object.keys(fr.departments).filter(d => !fr.notUnderDvf.includes(d)).every(d => fs.existsSync(path.join(DATA, 'fr', 'dep', d + '.json'))));
check('France: no individual sale (every figure aggregates ≥ 5 sales)',
  fs.readdirSync(path.join(DATA, 'fr', 'dep')).every(f => readJson('fr/dep/' + f).communes.every(c =>
    ['A', 'M'].every(t => Object.values(c[t]).every(v => v[0] >= 5)))));

const be = readJson('be/index.json');
check('Belgium: Statbel levels down to 565 communes',
  /Statbel/.test(be.source) && be.levels.commune.length >= 560 && be.levels.province.length === 10 && be.levels.region.length === 3);
check('Belgium: 2025 fusions visible (Tessenderlo-Ham)', be.levels.commune.some(c => c.c === '71071'));
check('Belgium: latest year and half-year present', /^\d{4}$/.test(be.latestYear) && /^\d{4}-S[12]$/.test(be.latestSemester));

const lu = readJson('lu/index.json');
check('Luxembourg: Observatoire de l’Habitat, communes with registered apartment prices',
  /Observatoire/.test(lu.source) && Object.keys(lu.communes).length >= 90 && lu.communes['LU-LUXEMBOURG'].reg.A);
check('Luxembourg: national registered averages and Luxembourg-City districts',
  lu.national.LU.reg.A && Object.keys(lu.districts).length >= 20);

const app = fs.readFileSync(path.join(WEB, 'src', 'app.js'), 'utf8');
const build = fs.readFileSync(path.join(WEB, 'scripts', 'build.js'), 'utf8');
check('market page renders the prices section', app.includes('id="market-prices-root"') && app.includes('renderMarketPrices(market);'));
check('build injects the service and its CSS', build.includes("read('services/market-prices.js')") && build.includes("read('market-prices.css')"));
check('data files are published through public/ (copied to the Vercel root)',
  fs.readFileSync(path.join(WEB, 'scripts', 'prepare-vercel-output.js'), 'utf8').includes("copyRecursive(path.join(ROOT, 'public'), OUT)"));

console.log(`\nMARKET PRICES: ${passed}/${passed} PASSED`);
