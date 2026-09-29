/* Contract: only real, priced listings of the launch markets reach the public site. */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const quality = require(path.join(WEB, 'src', 'services', 'listing-quality.js'));

let passed = 0;
function check(label, value) {
  assert(value, label);
  passed += 1;
  console.log('PASS:', label);
}

const row = (title, price, country, extra) => Object.assign({
  id: title, zones_lite: { name: 'Lyon 6e', city: 'Lyon', country_iso: country },
  representations: [{ listings: [{ price_current: price, listing_content: [{ locale: 'fr', title }] }] }]
}, extra || {});
const launch = iso => ['FR', 'BE', 'LU'].includes(iso);

console.log('\n=== Z FIND LISTING QUALITY GATE ===');
check('test titles are recognised ([TEST FR], [QA], Synthetic QA)',
  quality.isTestTitle('[TEST FR] Villa des Vignes — Bordeaux') && quality.isTestTitle('[ test ] x') &&
  quality.isTestTitle('[QA] Programme') && quality.isTestTitle('Synthetic QA data') &&
  !quality.isTestTitle('Appartement lumineux') && !quality.isTestTitle('Testament house'));
check('a development named as test is refused', quality.isTestRow({ name: '[TEST FR] Les Jardins de Lumière', representations: [] }));
check('real priced listing passes', quality.isPublicRow(row('T3 Rivage', 472000, 'FR'), launch));
check('test listing is refused', !quality.isPublicRow(row('[TEST FR] T2 avec terrasse', 289000, 'FR'), launch));
check('listing without a positive price is refused', !quality.isPublicRow(row('Sans prix', 0, 'FR'), launch) && !quality.isPublicRow(row('Nul', null, 'FR'), launch));
check('listing outside FR/BE/LU is refused when the launch filter is given',
  !quality.isPublicRow(row('Apartamento', 300000, 'PT'), launch) && quality.isPublicRow(row('Apartamento', 300000, 'PT')));
const result = quality.filterResult({ data: [row('A', 1, 'FR'), row('[TEST] B', 1, 'FR'), row('C', 0, 'BE')], error: null, count: 3 }, launch);
check('safeQuery results keep their shape, only public rows remain', result.data.length === 1 && result.data[0].id === 'A' && result.count === 1 && result.error === null);
check('errors pass through untouched', quality.filterResult({ data: null, error: { type: 'network_failure' } }).error.type === 'network_failure');

const read = rel => fs.readFileSync(path.join(WEB, rel), 'utf8');
const search = read('src/services/search.js');
const developments = read('src/services/developments.js');
const build = read('scripts/build.js');
const seo = read('scripts/generate-seo-pages.js');
const viewmodels = read('src/viewmodels.js');
check('search and developments route every public list through the gate',
  (search.match(/publicOnly\(await safeQuery/g) || []).length === 2 && developments.includes('publicOnly(await safeQuery'));
check('the gate is loaded before the data services in the page',
  build.indexOf("+ listingQualityService + '\\n'") > 0 && build.indexOf("+ listingQualityService + '\\n'") < build.indexOf("+ searchService + '\\n'"));
check('test listings never get a detail page', (viewmodels.match(/listingQuality\.isTestRow\(result\.data\)/g) || []).length === 2);
check('zone pages link only to listing pages that were generated',
  seo.includes('writtenListingPages.add(') && seo.includes('writtenListingPages.has('));
check('building the site and opening Home never log a search',
  seo.includes('searchService.listPublished()') && !/searchService\.search\(\{\}\)/.test(seo) && !/services\.search\.search\(\{\}\)/.test(viewmodels));
check('search markets are limited to the launch scope', viewmodels.includes("reason: 'outside_launch_scope'"));

console.log(`\nLISTING QUALITY: ${passed}/${passed} PASSED`);
